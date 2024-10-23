import {
  BasePgStoreModule,
  PgSqlClient,
  batchIterate,
  logger,
  stopwatch,
} from '@hirosystems/api-toolkit';
import { StacksEvent, StacksPayload } from '@hirosystems/chainhook-client';
import { DbBlock, DbBlockSignerSignature, DbRewardSetSigner } from '../types';

// TODO: update chainhook-client types to get rid of this
type TodoStacksEvent = StacksEvent & {
  metadata: {
    tenure_height: number;
    block_time: number;
    signer_signature: string[] | null;
    cycle_number: number | null;
    reward_set: {
      pox_ustx_threshold: string;
      signers: {
        signing_key: string;
        weight: number;
        stacked_amt: string;
      }[] | null;
    } | null;
  }
};

export class ChainhookPgStore extends BasePgStoreModule {
  async processPayload(payload: StacksPayload): Promise<void> {
    await this.sqlWriteTransaction(async sql => {
      for (const block of payload.rollback) {
        logger.info(`ChainhookPgStore rollback block ${block.block_identifier.index}`);
        const time = stopwatch();
        await this.updateStacksBlock(sql, block, 'rollback');
        logger.info(
          `ChainhookPgStore rollback block ${
            block.block_identifier.index
          } finished in ${time.getElapsedSeconds()}s`
        );
      }
      if (payload.rollback.length) {
        const earliestRolledBack = Math.min(...payload.rollback.map(r => r.block_identifier.index));
        await this.updateChainTipBlockHeight(earliestRolledBack - 1);
      }
      for (const block of payload.apply) {
        if (block.block_identifier.index <= (await this.getLastIngestedBlockHeight())) {
          logger.info(
            `ChainhookPgStore skipping previously ingested block ${block.block_identifier.index}`
          );
          continue;
        }
        logger.info(`ChainhookPgStore apply block ${block.block_identifier.index}`);
        const time = stopwatch();
        await this.updateStacksBlock(sql, block, 'apply');
        await this.updateChainTipBlockHeight(block.block_identifier.index);
        logger.info(
          `ChainhookPgStore apply block ${
            block.block_identifier.index
          } finished in ${time.getElapsedSeconds()}s`
        );
      }
    });
  }


  async updateChainTipBlockHeight(blockHeight: number): Promise<void> {
    await this.sql`UPDATE chain_tip SET block_height = ${blockHeight}`;
  }

  private async getLastIngestedBlockHeight(): Promise<number> {
    const result = await this.sql<{ block_height: number }[]>`SELECT block_height FROM chain_tip`;
    return result[0].block_height;
  }

  private async updateStacksBlock(
    sql: PgSqlClient,
    block: StacksEvent,
    direction: 'apply' | 'rollback'
  ) {
    switch (direction) {
      case 'apply':
        await this.applyTransactions(sql, block as TodoStacksEvent);
        break;
      case 'rollback':
        await this.rollBackTransactions(sql, block);
        break;
    }
  }

  private async applyTransactions(sql: PgSqlClient, block: TodoStacksEvent) {
    const dbBlock: DbBlock = {
      block_height: block.block_identifier.index,
      block_hash: normalizeHexString(block.metadata.stacks_block_hash),
      index_block_hash: normalizeHexString(block.block_identifier.hash),
      burn_block_height: block.metadata.bitcoin_anchor_block_identifier.index,
      burn_block_hash: normalizeHexString(block.metadata.bitcoin_anchor_block_identifier.hash),
      tenure_height: block.metadata.tenure_height,
      block_time: unixTimeSecondsToISO(block.metadata.block_time),
    };
    await this.insertBlock(sql, dbBlock);

    const dbSignerSignatures = block.metadata.signer_signature?.map(sig => {
      const dbSig: DbBlockSignerSignature = {
        block_height: dbBlock.block_height,
        signer_signature: normalizeHexString(sig),
      };
      return dbSig;
    });
    if (dbSignerSignatures && dbSignerSignatures.length > 0) {
      await this.insertBlockSignerSignatures(sql, dbSignerSignatures);
    }

    if ((block.metadata.reward_set?.signers ?? []).length > 0 && !block.metadata.cycle_number) {
      throw new Error(`Missing cycle_number for block ${block.block_identifier.index} reward set`);
    }

    const dbRewardSetSigners = block.metadata.reward_set?.signers?.map(signer => {
      const dbSigner: DbRewardSetSigner = {
        cycle_number: block.metadata.cycle_number as number,
        burn_block_height: dbBlock.burn_block_height,
        block_height: dbBlock.block_height,
        signer_key: normalizeHexString(signer.signing_key),
        signer_weight: signer.weight,
        signer_stacked_amount: signer.stacked_amt,
      };
      return dbSigner;
    });
    if (dbRewardSetSigners && dbRewardSetSigners.length > 0) {
      await this.insertRewardSetSigners(sql, dbRewardSetSigners);
    }
  }

  private async insertBlock(sql: PgSqlClient, dbBlock: DbBlock) {
    await sql`
      INSERT INTO blocks ${sql(dbBlock)}
    `;
    logger.info(
      `ChainhookPgStore apply block ${dbBlock.block_height} ${dbBlock.block_hash}`
    );
  }

  private async insertBlockSignerSignatures(sql: PgSqlClient, signerSigs: DbBlockSignerSignature[]) {
    for await (const batch of batchIterate(signerSigs, 500)) {
      await sql`
        INSERT INTO block_signer_signatures ${sql(batch)}
      `;
    }
  }

  private async insertRewardSetSigners(sql: PgSqlClient, rewardSetSigners: DbRewardSetSigner[]) {
    for await (const batch of batchIterate(rewardSetSigners, 500)) {
      await sql`
        INSERT INTO reward_set_signers ${sql(batch)}
      `;
    }
  }

  private async rollBackTransactions(sql: PgSqlClient, block: StacksEvent) {
    const blockHeight = block.block_identifier.index;
    await this.rollBackBlock(sql, blockHeight);
    await this.rollBackBlockSignerSignatures(sql, blockHeight);
    await this.rollBackRewardSetSigners(sql, blockHeight);
  }

  private async rollBackBlock(sql: PgSqlClient, blockHeight: number) {
    const res = await sql`
      DELETE FROM blocks WHERE block_height = ${blockHeight}
    `;
    logger.info(
      `ChainhookPgStore rollback block ${blockHeight}`
    );
    if (res.count !== 1) {
      logger.warn(`Unexpected number of rows deleted for block ${blockHeight}, ${res.count} rows`);
    }
  }

  private async rollBackBlockSignerSignatures(sql: PgSqlClient, blockHeight: number) {
    const res = await sql`
      DELETE FROM block_signer_signatures WHERE block_height = ${blockHeight}
    `;
    logger.info(
      `ChainhookPgStore rollback block signer signatures for block ${blockHeight}, deleted ${res.count} rows`
    );
  }

  private async rollBackRewardSetSigners(sql: PgSqlClient, blockHeight: number) {
    const res = await sql`
      DELETE FROM reward_set_signers WHERE block_height = ${blockHeight}
    `;
    logger.info(
      `ChainhookPgStore rollback reward set signers for block ${blockHeight}, deleted ${res.count} rows`
    );
  }
}

/** Convert a unix timestamp in milliseconds to an ISO string */
function unixTimeMillisecondsToISO(timestampMilliseconds: number): string {
  return new Date(timestampMilliseconds).toISOString();
}

/** Convert a unix timestamp in seconds to an ISO string */
function unixTimeSecondsToISO(timestampSeconds: number): string {
  return unixTimeMillisecondsToISO(timestampSeconds * 1000);
}

/** Ensures a hex string has a `0x` prefix */
function normalizeHexString(hexString: string): string {
  return hexString.startsWith('0x') ? hexString : ('0x' + hexString);
}
