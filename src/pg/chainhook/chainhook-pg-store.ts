import {
  BasePgStore,
  BasePgStoreModule,
  PgSqlClient,
  batchIterate,
  logger,
  stopwatch,
} from '@hirosystems/api-toolkit';
import { StacksEvent, StacksPayload } from '@hirosystems/chainhook-client';
import {
  DbBlock,
  DbBlockProposal,
  DbBlockResponse,
  DbBlockSignerSignature,
  DbMockBlock,
  DbMockBlockSignerSignature,
  DbMockProposal,
  DbMockSignature,
  DbRewardSetSigner,
} from '../types';
import { normalizeHexString, unixTimeMillisecondsToISO, unixTimeSecondsToISO } from '../../helpers';
import { EventEmitter } from 'node:events';

const RejectReasonValidationFailed = 'VALIDATION_FAILED';

type SignerMessage = Extract<
  StacksPayload['events'][number],
  { payload: { type: 'SignerMessage' } }
>;

type BlockProposalData = Extract<
  SignerMessage['payload']['data']['message'],
  { type: 'BlockProposal' }
>['data'];

type BlockResponseData = Extract<
  SignerMessage['payload']['data']['message'],
  { type: 'BlockResponse' }
>['data'];

type MockProposalData = Extract<
  SignerMessage['payload']['data']['message'],
  { type: 'MockProposal' }
>['data'];

type MockSignatureData = Extract<
  SignerMessage['payload']['data']['message'],
  { type: 'MockSignature' }
>['data'];

type MockBlockData = Extract<
  SignerMessage['payload']['data']['message'],
  { type: 'MockBlock' }
>['data'];

export class ChainhookPgStore extends BasePgStoreModule {
  readonly events = new EventEmitter<{ missingStackerSet: [{ cycleNumber: number }] }>();
  readonly isMainnet: boolean;

  constructor(db: BasePgStore, isMainnet: boolean) {
    super(db);
    this.isMainnet = isMainnet;
  }

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

      for (const event of payload.events) {
        if (event.payload.type === 'SignerMessage') {
          await this.applySignerMessageEvent(sql, event);
        } else {
          logger.error(`Unknown chainhook payload event type: ${event.payload.type}`);
        }
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

  private async applySignerMessageEvent(sql: PgSqlClient, event: SignerMessage) {
    switch (event.payload.data.message.type) {
      case 'BlockProposal': {
        await this.applyBlockProposal(
          sql,
          event.received_at_ms,
          event.payload.data.pubkey,
          event.payload.data.message.data
        );
        break;
      }
      case 'BlockResponse': {
        await this.applyBlockResponse(
          sql,
          event.received_at_ms,
          event.payload.data.pubkey,
          event.payload.data.message.data
        );
        break;
      }
      case 'BlockPushed': {
        logger.info(`Ignoring BlockPushed StackerDB event`);
        break;
      }
      case 'MockProposal': {
        await this.applyMockProposal(
          sql,
          event.received_at_ms,
          event.payload.data.pubkey,
          event.payload.data.message.data
        );
        break;
      }
      case 'MockSignature': {
        await this.applyMockSignature(
          sql,
          event.received_at_ms,
          event.payload.data.pubkey,
          event.payload.data.message.data
        );
        break;
      }
      case 'MockBlock': {
        await this.applyMockBlock(
          sql,
          event.received_at_ms,
          event.payload.data.pubkey,
          event.payload.data.sig,
          event.payload.data.message.data
        );
        break;
      }
      default: {
        logger.error(event.payload.data, `Unknown StackerDB event type`);
        break;
      }
    }
  }

  private async applyMockBlock(
    sql: PgSqlClient,
    receivedAt: number,
    minerPubkey: string,
    minerSignature: string,
    messageData: MockBlockData
  ) {
    const dbMockBlock: DbMockBlock = {
      received_at: unixTimeMillisecondsToISO(receivedAt),
      miner_key: normalizeHexString(minerPubkey),
      signature: normalizeHexString(minerSignature),

      // Mock proposal fields
      burn_block_height: messageData.mock_proposal.peer_info.burn_block_height,
      stacks_tip_consensus_hash: normalizeHexString(
        messageData.mock_proposal.peer_info.stacks_tip_consensus_hash
      ),
      stacks_tip: normalizeHexString(messageData.mock_proposal.peer_info.stacks_tip),
      stacks_tip_height: messageData.mock_proposal.peer_info.stacks_tip_height,
      server_version: messageData.mock_proposal.peer_info.server_version,
      pox_consensus_hash: normalizeHexString(messageData.mock_proposal.peer_info.pox_consensus),
      network_id: messageData.mock_proposal.peer_info.network_id,
      index_block_hash: normalizeHexString(messageData.mock_proposal.peer_info.index_block_hash),
    };
    const result = await sql`
      INSERT INTO mock_blocks ${sql(dbMockBlock)}
      ON CONFLICT ON CONSTRAINT mock_blocks_idb_unique DO NOTHING
    `;

    if (result.count === 0) {
      logger.info(
        `Skipped inserting duplicate mock block height=${dbMockBlock.stacks_tip_height}, hash=${dbMockBlock.stacks_tip}`
      );
      return;
    }

    for (const batch of batchIterate(messageData.mock_signatures, 500)) {
      const sigs = batch.map(sig => {
        const dbSig: DbMockBlockSignerSignature = {
          signer_key: normalizeHexString(sig.pubkey),
          signer_signature: normalizeHexString(sig.signature),
          stacks_tip: sig.mock_proposal.peer_info.stacks_tip,
          stacks_tip_height: sig.mock_proposal.peer_info.stacks_tip_height,
          index_block_hash: sig.mock_proposal.peer_info.index_block_hash,
        };
        return dbSig;
      });
      await sql`
        INSERT INTO mock_block_signer_signatures ${sql(sigs)}
      `;
    }
  }

  private async applyMockSignature(
    sql: PgSqlClient,
    receivedAt: number,
    signerPubkey: string,
    messageData: MockSignatureData
  ) {
    const dbMockSignature: DbMockSignature = {
      received_at: unixTimeMillisecondsToISO(receivedAt),
      signer_key: normalizeHexString(signerPubkey),
      signature: normalizeHexString(messageData.signature),

      // Mock proposal fields
      burn_block_height: messageData.mock_proposal.peer_info.burn_block_height,
      stacks_tip_consensus_hash: normalizeHexString(
        messageData.mock_proposal.peer_info.stacks_tip_consensus_hash
      ),
      stacks_tip: normalizeHexString(messageData.mock_proposal.peer_info.stacks_tip),
      stacks_tip_height: messageData.mock_proposal.peer_info.stacks_tip_height,
      server_version: messageData.mock_proposal.peer_info.server_version,
      pox_consensus_hash: normalizeHexString(messageData.mock_proposal.peer_info.pox_consensus),
      network_id: messageData.mock_proposal.peer_info.network_id,
      index_block_hash: normalizeHexString(messageData.mock_proposal.peer_info.index_block_hash),

      // Metadata fields
      metadata_server_version: messageData.metadata.server_version,
    };
    const result = await sql`
      INSERT INTO mock_signatures ${sql(dbMockSignature)}
      ON CONFLICT ON CONSTRAINT mock_signatures_signer_key_idb_unique DO NOTHING
    `;
    if (result.count === 0) {
      logger.info(
        `Skipped inserting duplicate mock signature height=${dbMockSignature.stacks_tip_height}, hash=${dbMockSignature.stacks_tip}, signer=${dbMockSignature.signer_key}`
      );
    }
  }

  private async applyMockProposal(
    sql: PgSqlClient,
    receivedAt: number,
    minerPubkey: string,
    messageData: MockProposalData
  ) {
    const dbMockProposal: DbMockProposal = {
      received_at: unixTimeMillisecondsToISO(receivedAt),
      miner_key: normalizeHexString(minerPubkey),
      burn_block_height: messageData.burn_block_height,
      stacks_tip_consensus_hash: normalizeHexString(messageData.stacks_tip_consensus_hash),
      stacks_tip: normalizeHexString(messageData.stacks_tip),
      stacks_tip_height: messageData.stacks_tip_height,
      server_version: messageData.server_version,
      pox_consensus_hash: normalizeHexString(messageData.pox_consensus),
      network_id: messageData.network_id,
      index_block_hash: normalizeHexString(messageData.index_block_hash),
    };
    const result = await sql`
      INSERT INTO mock_proposals ${sql(dbMockProposal)}
      ON CONFLICT ON CONSTRAINT mock_proposals_idb_unique DO NOTHING
    `;
    if (result.count === 0) {
      logger.info(
        `Skipped inserting duplicate mock proposal height=${dbMockProposal.stacks_tip_height}, hash=${dbMockProposal.stacks_tip}`
      );
    }
  }

  private async applyBlockProposal(
    sql: PgSqlClient,
    receivedAt: number,
    minerPubkey: string,
    messageData: BlockProposalData
  ) {
    const dbBlockProposal: DbBlockProposal = {
      received_at: unixTimeMillisecondsToISO(receivedAt),
      miner_key: normalizeHexString(minerPubkey),
      block_height: messageData.block.header.chain_length,
      block_time: unixTimeSecondsToISO(messageData.block.header.timestamp),
      block_hash: normalizeHexString(messageData.block.block_hash),
      index_block_hash: normalizeHexString(messageData.block.index_block_hash),
      reward_cycle: messageData.reward_cycle,
      burn_block_height: messageData.burn_height,
    };
    const result = await sql`
      INSERT INTO block_proposals ${sql(dbBlockProposal)}
      ON CONFLICT ON CONSTRAINT block_proposals_block_hash_unique DO NOTHING
    `;
    if (result.count === 0) {
      logger.info(
        `Skipped inserting duplicate block proposal height=${dbBlockProposal.block_height}, hash=${dbBlockProposal.block_hash}`
      );
    }
  }

  private async applyBlockResponse(
    sql: PgSqlClient,
    receivedAt: number,
    signerPubkey: string,
    messageData: BlockResponseData
  ) {
    if (messageData.type !== 'Accepted' && messageData.type !== 'Rejected') {
      logger.error(messageData, `Unexpected BlockResponse type`);
    }
    const accepted = messageData.type === 'Accepted';

    let rejectReasonCode: string | null = null;
    let rejectCode: string | null = null;
    if (!accepted) {
      const rejectReason = messageData.data.reason_code;
      if (typeof rejectReason === 'string') {
        rejectReasonCode = rejectReason;
      } else if (RejectReasonValidationFailed in rejectReason) {
        rejectReasonCode = RejectReasonValidationFailed;
        rejectCode = rejectReason[RejectReasonValidationFailed];
      }
    }

    const dbBlockResponse: DbBlockResponse = {
      received_at: unixTimeMillisecondsToISO(receivedAt),
      signer_key: normalizeHexString(signerPubkey),
      accepted: accepted,
      signer_sighash: normalizeHexString(messageData.data.signer_signature_hash),
      metadata_server_version: messageData.data.metadata.server_version,
      signature: messageData.data.signature,
      reason_string: accepted ? null : messageData.data.reason,
      reason_code: rejectReasonCode,
      reject_code: rejectCode,
      chain_id: accepted ? null : messageData.data.chain_id,
    };
    const result = await sql`
      INSERT INTO block_responses ${sql(dbBlockResponse)}
      ON CONFLICT ON CONSTRAINT block_responses_signer_key_sighash_unique DO NOTHING
    `;

    if (result.count === 0) {
      logger.info(
        `Skipped inserting duplicate block response signer=${dbBlockResponse.signer_key}, hash=${dbBlockResponse.signer_sighash}`
      );
    }
  }

  private async updateStacksBlock(
    sql: PgSqlClient,
    block: StacksEvent,
    direction: 'apply' | 'rollback'
  ) {
    switch (direction) {
      case 'apply':
        await this.applyTransactions(sql, block);
        break;
      case 'rollback':
        await this.rollBackTransactions(sql, block);
        break;
    }
  }

  private async applyTransactions(sql: PgSqlClient, block: StacksEvent) {
    const dbBlock: DbBlock = {
      block_height: block.block_identifier.index,
      block_hash: normalizeHexString(block.metadata.stacks_block_hash),
      index_block_hash: normalizeHexString(block.block_identifier.hash),
      burn_block_height: block.metadata.bitcoin_anchor_block_identifier.index,
      burn_block_hash: normalizeHexString(block.metadata.bitcoin_anchor_block_identifier.hash),
      tenure_height: block.metadata.tenure_height ?? 0,
      block_time: unixTimeSecondsToISO(block.metadata.block_time ?? 0),
      is_nakamoto_block: !!block.metadata.signer_bitvec,
    };
    await this.insertBlock(sql, dbBlock);

    const dbSignerSignatures = block.metadata.signer_signature?.map((sig, i) => {
      const dbSig: DbBlockSignerSignature = {
        block_height: dbBlock.block_height,
        signer_key: normalizeHexString(block.metadata.signer_public_keys?.[i] ?? '0x'),
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
    const skipRewardSetCheck = this.isMainnet && dbBlock.burn_block_height < 867867;
    if (skipRewardSetCheck) {
      await sql`
        INSERT INTO blocks ${sql(dbBlock)}
      `;
      return;
    } else {
      // After the block is inserted, calculate the reward_cycle_number, then check if the reward_set_signers
      // table contains any rows for the calculated cycle_number.
      const result = await sql<{ cycle_number: number | null; reward_set_exists: boolean }[]>`
        WITH inserted AS (
          INSERT INTO blocks ${sql(dbBlock)}
          RETURNING burn_block_height
        ),
        cycle_number AS (
          SELECT FLOOR((inserted.burn_block_height - ct.first_burnchain_block_height) / ct.reward_cycle_length) AS cycle_number
          FROM inserted, chain_tip AS ct
          LIMIT 1
        )
        SELECT 
          cn.cycle_number,
          EXISTS (
            SELECT 1 
            FROM reward_set_signers 
            WHERE cycle_number = cn.cycle_number
            LIMIT 1
          ) AS reward_set_exists
        FROM cycle_number AS cn
      `;
      const { cycle_number, reward_set_exists } = result[0];
      if (cycle_number === null) {
        logger.warn(`Failed to calculate cycle number for block ${dbBlock.block_height}`);
      } else if (cycle_number !== null && !reward_set_exists) {
        logger.warn(
          `Missing reward set signers for cycle ${cycle_number} in block ${dbBlock.block_height}`
        );
        // Use setImmediate to ensure we break out of the current sql transaction within the async context
        setImmediate(() => this.events.emit('missingStackerSet', { cycleNumber: cycle_number }));
      }
    }
    logger.info(`ChainhookPgStore apply block ${dbBlock.block_height} ${dbBlock.block_hash}`);
  }

  private async insertBlockSignerSignatures(
    sql: PgSqlClient,
    signerSigs: DbBlockSignerSignature[]
  ) {
    for await (const batch of batchIterate(signerSigs, 500)) {
      await sql`
        INSERT INTO block_signer_signatures ${sql(batch)}
      `;
    }
  }

  async insertRewardSetSigners(sql: PgSqlClient, rewardSetSigners: DbRewardSetSigner[]) {
    for await (const batch of batchIterate(rewardSetSigners, 500)) {
      const result = await sql`
        INSERT INTO reward_set_signers ${sql(batch)}
        ON CONFLICT ON CONSTRAINT reward_set_signers_cycle_unique DO NOTHING
      `;
      if (result.count === 0) {
        logger.warn(
          `Skipped inserting duplicate reward set signers for cycle ${rewardSetSigners[0].cycle_number}`
        );
      }
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
    logger.info(`ChainhookPgStore rollback block ${blockHeight}`);
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
