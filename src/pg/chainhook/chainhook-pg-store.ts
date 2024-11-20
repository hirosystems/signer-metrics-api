import {
  BasePgStore,
  BasePgStoreModule,
  PgSqlClient,
  batchIterate,
  logger as defaultLogger,
  stopwatch,
} from '@hirosystems/api-toolkit';
import { StacksEvent, StacksPayload } from '@hirosystems/chainhook-client';
import {
  DbBlock,
  DbBlockProposal,
  DbBlockPush,
  DbBlockResponse,
  DbBlockSignerSignature,
  DbMockBlock,
  DbMockBlockSignerSignature,
  DbMockProposal,
  DbMockSignature,
  DbRewardSetSigner,
  SignerMessagesEventPayload,
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

type BlockPushedData = Extract<
  SignerMessage['payload']['data']['message'],
  { type: 'BlockPushed' }
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

export type DbWriteEvents = EventEmitter<{
  missingStackerSet: [{ cycleNumber: number }];
  signerMessages: [SignerMessagesEventPayload];
}>;

export class ChainhookPgStore extends BasePgStoreModule {
  readonly events: DbWriteEvents = new EventEmitter();
  readonly logger = defaultLogger.child({ module: 'ChainhookPgStore' });

  constructor(db: BasePgStore) {
    super(db);
  }

  async processPayload(payload: StacksPayload): Promise<void> {
    const appliedSignerMessageResults: SignerMessagesEventPayload = [];

    await this.sqlWriteTransaction(async sql => {
      for (const block of payload.rollback) {
        this.logger.info(`ChainhookPgStore rollback block ${block.block_identifier.index}`);
        const time = stopwatch();
        await this.updateStacksBlock(sql, block, 'rollback');
        this.logger.info(
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
          this.logger.info(
            `ChainhookPgStore skipping previously ingested block ${block.block_identifier.index}`
          );
          continue;
        }
        this.logger.info(`ChainhookPgStore apply block ${block.block_identifier.index}`);
        const time = stopwatch();
        await this.updateStacksBlock(sql, block, 'apply');
        await this.updateChainTipBlockHeight(block.block_identifier.index);
        this.logger.info(
          `ChainhookPgStore apply block ${
            block.block_identifier.index
          } finished in ${time.getElapsedSeconds()}s`
        );
      }

      for (const event of payload.events) {
        if (event.payload.type === 'SignerMessage') {
          const applyResults = await this.applySignerMessageEvent(sql, event);
          appliedSignerMessageResults.push(...applyResults);
        } else {
          this.logger.error(`Unknown chainhook payload event type: ${event.payload.type}`);
        }
      }
    });

    // After the sql transaction is complete, emit events for the applied signer messages.
    // Use setTimeout to break out of the call stack so caller is not blocked by event listeners.
    if (appliedSignerMessageResults.length > 0) {
      setTimeout(() => {
        this.events.emit('signerMessages', appliedSignerMessageResults);
      });
    }
  }

  async updateChainTipBlockHeight(blockHeight: number): Promise<void> {
    await this.sql`UPDATE chain_tip SET block_height = ${blockHeight}`;
  }

  private async getLastIngestedBlockHeight(): Promise<number> {
    const result = await this.sql<{ block_height: number }[]>`SELECT block_height FROM chain_tip`;
    return result[0].block_height;
  }

  private async applySignerMessageEvent(
    sql: PgSqlClient,
    event: SignerMessage
  ): Promise<SignerMessagesEventPayload> {
    const appliedResults: SignerMessagesEventPayload = [];
    switch (event.payload.data.message.type) {
      case 'BlockProposal': {
        const res = await this.applyBlockProposal(
          sql,
          event.received_at_ms,
          event.payload.data.pubkey,
          event.payload.data.message.data
        );
        if (res.applied) {
          appliedResults.push({
            proposal: {
              receiptTimestamp: event.received_at_ms,
              blockHash: res.blockHash,
            },
          });
        }
        break;
      }
      case 'BlockResponse': {
        const res = await this.applyBlockResponse(
          sql,
          event.received_at_ms,
          event.payload.data.pubkey,
          event.payload.data.message.data
        );
        if (res.applied) {
          appliedResults.push({
            response: {
              receiptTimestamp: event.received_at_ms,
              blockHash: res.blockHash,
              signerKey: res.signerKey,
            },
          });
        }
        break;
      }
      case 'BlockPushed': {
        const res = await this.applyBlockPush(
          sql,
          event.received_at_ms,
          event.payload.data.pubkey,
          event.payload.data.message.data
        );
        if (res.applied) {
          appliedResults.push({
            push: {
              receiptTimestamp: event.received_at_ms,
              blockHash: res.blockHash,
            },
          });
        }
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
        this.logger.error(event.payload.data, `Unknown StackerDB event type`);
        break;
      }
    }
    return appliedResults;
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
    const mockBlockInsertResult = await sql`
      INSERT INTO mock_blocks ${sql(dbMockBlock)}
      ON CONFLICT ON CONSTRAINT mock_blocks_idb_unique DO NOTHING
    `;

    if (mockBlockInsertResult.count === 0) {
      this.logger.info(
        `Skipped inserting duplicate mock block height=${dbMockBlock.stacks_tip_height}, hash=${dbMockBlock.stacks_tip}`
      );
    } else {
      this.logger.info(
        `ChainhookPgStore apply mock_block height=${dbMockBlock.stacks_tip_height}, hash=${dbMockBlock.stacks_tip}`
      );

      let mockBlockSigInsertCount = 0;
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
        // TODO: add unique constraint here
        const sigInsertResult = await sql`
          INSERT INTO mock_block_signer_signatures ${sql(sigs)}
        `;
        mockBlockSigInsertCount += sigInsertResult.count;
      }
      if (mockBlockSigInsertCount === 0) {
        this.logger.info(
          `Skipped inserting duplicate mock block signer signatures for block ${dbMockBlock.stacks_tip_height}`
        );
      } else {
        this.logger.info(
          `ChainhookPgStore apply mock_block_signer_signatures, block=${dbMockBlock.stacks_tip_height}, count=${mockBlockSigInsertCount}`
        );
      }
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
      this.logger.info(
        `Skipped inserting duplicate mock signature height=${dbMockSignature.stacks_tip_height}, hash=${dbMockSignature.stacks_tip}, signer=${dbMockSignature.signer_key}`
      );
    } else {
      this.logger.info(
        `ChainhookPgStore apply mock_signature height=${dbMockSignature.stacks_tip_height}, hash=${dbMockSignature.stacks_tip}, signer=${dbMockSignature.signer_key}`
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
      this.logger.info(
        `Skipped inserting duplicate mock proposal height=${dbMockProposal.stacks_tip_height}, hash=${dbMockProposal.stacks_tip}`
      );
    } else {
      this.logger.info(
        `ChainhookPgStore apply mock_proposal height=${dbMockProposal.stacks_tip_height}, hash=${dbMockProposal.stacks_tip}`
      );
    }
  }

  private async applyBlockProposal(
    sql: PgSqlClient,
    receivedAt: number,
    minerPubkey: string,
    messageData: BlockProposalData
  ): Promise<{ applied: false } | { applied: true; blockHash: string }> {
    const blockHash = normalizeHexString(messageData.block.block_hash);
    const dbBlockProposal: DbBlockProposal = {
      received_at: unixTimeMillisecondsToISO(receivedAt),
      miner_key: normalizeHexString(minerPubkey),
      block_height: messageData.block.header.chain_length,
      block_time: unixTimeSecondsToISO(messageData.block.header.timestamp),
      block_hash: blockHash,
      index_block_hash: normalizeHexString(messageData.block.index_block_hash),
      reward_cycle: messageData.reward_cycle,
      burn_block_height: messageData.burn_height,
    };
    const result = await sql`
      INSERT INTO block_proposals ${sql(dbBlockProposal)}
      ON CONFLICT ON CONSTRAINT block_proposals_block_hash_unique DO NOTHING
    `;
    if (result.count === 0) {
      this.logger.info(
        `Skipped inserting duplicate block proposal height=${dbBlockProposal.block_height}, hash=${dbBlockProposal.block_hash}`
      );
      return { applied: false };
    }
    this.logger.info(
      `ChainhookPgStore apply block_proposal height=${dbBlockProposal.block_height}, hash=${dbBlockProposal.block_hash}`
    );
    return { applied: true, blockHash };
  }

  async deleteBlockProposal(sql: PgSqlClient, blockHash: string): Promise<DbBlockProposal> {
    const result = await sql<DbBlockProposal[]>`
      DELETE FROM block_proposals WHERE block_hash = ${blockHash} RETURNING *
    `;
    if (result.length === 0) {
      throw new Error(`Block proposal not found for hash ${blockHash}`);
    }
    // copy the result to a new object to remove the id field
    const proposal = { ...result[0], id: undefined };
    delete proposal.id;
    return proposal;
  }

  async deleteBlockPush(sql: PgSqlClient, blockHash: string): Promise<DbBlockPush> {
    const result = await sql<DbBlockProposal[]>`
      DELETE FROM block_pushes WHERE block_hash = ${blockHash} RETURNING *
    `;
    if (result.length === 0) {
      throw new Error(`Block push not found for hash ${blockHash}`);
    }
    // copy the result to a new object to remove the id field
    const blockPush = { ...result[0], id: undefined };
    delete blockPush.id;
    return blockPush;
  }

  async deleteBlockResponses(sql: PgSqlClient, blockHash: string): Promise<DbBlockResponse[]> {
    const result = await sql<DbBlockResponse[]>`
      DELETE FROM block_responses WHERE signer_sighash = ${blockHash} RETURNING *
    `;
    // copy the results to a new object to remove the id field
    return result.map(r => {
      const response = { ...r, id: undefined };
      delete response.id;
      return response;
    });
  }

  private async applyBlockPush(
    sql: PgSqlClient,
    receivedAt: number,
    minerPubkey: string,
    messageData: BlockPushedData
  ): Promise<{ applied: false } | { applied: true; blockHash: string }> {
    const blockHash = normalizeHexString(messageData.block.block_hash);
    const dbBlockPush: DbBlockPush = {
      received_at: unixTimeMillisecondsToISO(receivedAt),
      miner_key: normalizeHexString(minerPubkey),
      block_height: messageData.block.header.chain_length,
      block_time: unixTimeSecondsToISO(messageData.block.header.timestamp),
      block_hash: blockHash,
      index_block_hash: normalizeHexString(messageData.block.index_block_hash),
    };
    const result = await sql`
      INSERT INTO block_pushes ${sql(dbBlockPush)}
      ON CONFLICT ON CONSTRAINT block_pushes_block_hash_unique DO NOTHING
    `;

    if (result.count === 0) {
      this.logger.info(
        `Skipped inserting duplicate block push hash=${dbBlockPush.block_hash}, miner=${dbBlockPush.miner_key}`
      );
      return { applied: false };
    }
    this.logger.info(
      `ChainhookPgStore apply block_push hash=${dbBlockPush.block_hash}, miner=${dbBlockPush.miner_key}`
    );
    return { applied: true, blockHash };
  }

  private async applyBlockResponse(
    sql: PgSqlClient,
    receivedAt: number,
    signerPubkey: string,
    messageData: BlockResponseData
  ): Promise<{ applied: false } | { applied: true; blockHash: string; signerKey: string }> {
    if (messageData.type !== 'Accepted' && messageData.type !== 'Rejected') {
      this.logger.error(messageData, `Unexpected BlockResponse type`);
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
    const blockHash = normalizeHexString(messageData.data.signer_signature_hash);
    const signerKey = normalizeHexString(signerPubkey);
    const dbBlockResponse: DbBlockResponse = {
      received_at: unixTimeMillisecondsToISO(receivedAt),
      signer_key: signerKey,
      accepted: accepted,
      signer_sighash: blockHash,
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
      this.logger.info(
        `Skipped inserting duplicate block response signer=${dbBlockResponse.signer_key}, hash=${dbBlockResponse.signer_sighash}`
      );
      return { applied: false };
    }
    this.logger.info(
      `ChainhookPgStore apply block_response signer=${dbBlockResponse.signer_key}, hash=${dbBlockResponse.signer_sighash}`
    );
    return { applied: true, blockHash, signerKey };
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
    if (dbSignerSignatures) {
      await this.insertBlockSignerSignatures(sql, dbSignerSignatures);
    }

    if ((block.metadata.reward_set?.signers ?? []).length > 0 && !block.metadata.cycle_number) {
      throw new Error(`Missing cycle_number for block ${block.block_identifier.index} reward set`);
    }

    const dbRewardSetSigners = block.metadata.reward_set?.signers?.map((signer, index) => {
      const dbSigner: DbRewardSetSigner = {
        cycle_number: block.metadata.cycle_number ?? 0,
        signer_key: normalizeHexString(signer.signing_key),
        signer_weight: signer.weight,
        signer_stacked_amount: signer.stacked_amt,
        slot_index: index,
      };
      return dbSigner;
    });
    if (dbRewardSetSigners && dbRewardSetSigners.length > 0) {
      await this.insertRewardSetSigners(sql, dbRewardSetSigners);
    }
  }

  private async insertBlock(sql: PgSqlClient, dbBlock: DbBlock) {
    // Skip pre-nakamoto blocks
    if (!dbBlock.is_nakamoto_block) {
      this.logger.info(
        `ChainhookPgStore skipping apply for pre-nakamoto block ${dbBlock.block_height} ${dbBlock.block_hash}`
      );
    } else {
      // After the block is inserted, calculate the reward_cycle_number, then check if the reward_set_signers
      // table contains any rows for the calculated cycle_number.
      // TODO: add unique constraint here
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
        this.logger.warn(`Failed to calculate cycle number for block ${dbBlock.block_height}`);
      } else if (cycle_number !== null && !reward_set_exists) {
        this.logger.warn(
          `Missing reward set signers for cycle ${cycle_number} in block ${dbBlock.block_height}`
        );
        // Use setTimeout to ensure we break out of the current sql transaction within the async context
        setTimeout(() => this.events.emit('missingStackerSet', { cycleNumber: cycle_number }));
      }
      this.logger.info(
        `ChainhookPgStore apply block ${dbBlock.block_height} ${dbBlock.block_hash}`
      );
    }
  }

  private async insertBlockSignerSignatures(
    sql: PgSqlClient,
    signerSigs: DbBlockSignerSignature[]
  ) {
    if (signerSigs.length === 0) {
      // nothing to insert
      return;
    }
    let insertCount = 0;
    for (const batch of batchIterate(signerSigs, 500)) {
      // TODO: add unique constraint here
      const result = await sql`
        INSERT INTO block_signer_signatures ${sql(batch)}
      `;
      insertCount += result.count;
    }
    if (insertCount === 0) {
      this.logger.info(
        `Skipped inserting duplicate block signer signatures for block ${signerSigs[0].block_height}`
      );
    } else {
      this.logger.info(
        `ChainhookPgStore apply block_signer_signatures, block=${signerSigs[0].block_height}, count=${insertCount}`
      );
    }
  }

  async insertRewardSetSigners(
    sql: PgSqlClient,
    rewardSetSigners: DbRewardSetSigner[]
  ): Promise<{ rowsDeleted: number; rowsInserted: number }> {
    if (rewardSetSigners.length === 0) {
      return { rowsDeleted: 0, rowsInserted: 0 };
    }

    const cycleNumber = rewardSetSigners[0].cycle_number;
    const deleteRows = await sql`
        DELETE FROM reward_set_signers
        WHERE cycle_number = ${cycleNumber}
      `;
    if (deleteRows.count > 0) {
      this.logger.warn(
        `Deleted existing reward set signers for cycle ${cycleNumber} before inserting new rows, deleted ${deleteRows.count} rows`
      );
    }

    let insertCount = 0;
    for (const batch of batchIterate(rewardSetSigners, 500)) {
      const result = await sql`
        INSERT INTO reward_set_signers ${sql(batch)}
        ON CONFLICT ON CONSTRAINT reward_set_signers_cycle_unique DO NOTHING
      `;
      insertCount += result.count;
    }
    if (insertCount === 0) {
      this.logger.info(
        `Skipped inserting duplicate reward set signers for cycle ${rewardSetSigners[0].cycle_number}`
      );
    } else {
      this.logger.info(
        `ChainhookPgStore apply reward_set_signers, cycle=${rewardSetSigners[0].cycle_number}, count=${insertCount}`
      );
    }
    return { rowsDeleted: deleteRows.count, rowsInserted: insertCount };
  }

  private async rollBackTransactions(sql: PgSqlClient, block: StacksEvent) {
    const blockHeight = block.block_identifier.index;
    await this.rollBackBlock(sql, blockHeight);
    await this.rollBackBlockSignerSignatures(sql, blockHeight);
  }

  private async rollBackBlock(sql: PgSqlClient, blockHeight: number) {
    const res = await sql`
      DELETE FROM blocks WHERE block_height = ${blockHeight}
    `;
    this.logger.info(`ChainhookPgStore rollback block ${blockHeight}`);
    if (res.count !== 1) {
      this.logger.warn(
        `Unexpected number of rows deleted for block ${blockHeight}, ${res.count} rows`
      );
    }
  }

  private async rollBackBlockSignerSignatures(sql: PgSqlClient, blockHeight: number) {
    const res = await sql`
      DELETE FROM block_signer_signatures WHERE block_height = ${blockHeight}
    `;
    this.logger.info(
      `ChainhookPgStore rollback block signer signatures for block ${blockHeight}, deleted ${res.count} rows`
    );
  }
}
