import { StacksEventStream, StacksEventStreamType } from '@hirosystems/salt-n-pepper-client';
import { PgStore } from '../pg/pg-store';
import {
  CoreNodeBlockMessage,
  CoreNodeBurnBlockMessage,
  CoreNodeNakamotoBlockMessage,
  StackerDbChunk,
} from './core-node-message';
import { logger as defaultLogger, stopwatch, WorkerThreadManager } from '@hirosystems/api-toolkit';
import { ENV } from '../env';
import { ParsedNakamotoBlock, ParsedStackerDbChunk } from './msg-parsing';
import { SignerMessagesEventPayload } from '../pg/types';
import { SERVER_VERSION } from '@hirosystems/api-toolkit';
import { EventEmitter } from 'node:events';
import * as msgParserWorkerBlocks from './threaded-parser-worker';

export class EventStreamHandler {
  db: PgStore;
  logger = defaultLogger.child({ name: 'EventStreamHandler' });
  eventStream: StacksEventStream;
  threadedParser = new WorkerThreadManager(msgParserWorkerBlocks);

  readonly events = new EventEmitter<{
    processedMessage: [{ msgId: string }];
  }>();

  constructor(opts: { db: PgStore; lastMessageId: string }) {
    this.db = opts.db;
    const appName = `signer-metrics-api ${SERVER_VERSION.tag} (${SERVER_VERSION.branch}:${SERVER_VERSION.commit})`;
    this.eventStream = new StacksEventStream({
      redisUrl: ENV.REDIS_URL,
      redisStreamPrefix: ENV.REDIS_STREAM_KEY_PREFIX,
      eventStreamType: StacksEventStreamType.all,
      lastMessageId: opts.lastMessageId,
      appName,
    });
  }

  async start() {
    await this.eventStream.connect({ waitForReady: true });
    this.eventStream.start(async (messageId, timestamp, path, body) => {
      return this.handleMsg(messageId, timestamp, path, body);
    });
  }

  async handleMsg(messageId: string, timestamp: string, path: string, body: any) {
    this.logger.info(`${path}: received Stacks stream event, msgId: ${messageId}`);
    switch (path) {
      case '/new_block': {
        const blockMsg = body as CoreNodeBlockMessage;
        const nakamotoBlockMsg = body as CoreNodeNakamotoBlockMessage;
        if (nakamotoBlockMsg.cycle_number && nakamotoBlockMsg.reward_set) {
          await this.db.ingestion.applyRewardSet(
            this.db.sql,
            nakamotoBlockMsg.cycle_number,
            nakamotoBlockMsg.reward_set
          );
        }
        if ('signer_signature_hash' in blockMsg) {
          const parsed = await this.threadedParser.exec({ kind: 'block', msg: nakamotoBlockMsg });
          const result = parsed.result as ParsedNakamotoBlock;
          await this.handleNakamotoBlockMsg(messageId, parseInt(timestamp), result);
        } else {
          // ignore pre-Nakamoto blocks
        }
        break;
      }

      case '/stackerdb_chunks': {
        const msg = body as StackerDbChunk;
        const parsed = await this.threadedParser.exec({ kind: 'chunk', msg });
        const result = parsed.result as ParsedStackerDbChunk[];
        await this.handleStackerDbMsg(messageId, parseInt(timestamp), result);
        break;
      }

      case '/new_burn_block': {
        const _msg = body as CoreNodeBurnBlockMessage;
        // ignore
        break;
      }

      case '/new_mempool_tx':
      case '/drop_mempool_tx':
      case '/attachments/new':
      case '/new_microblocks': {
        // ignore
        break;
      }

      default:
        this.logger.warn(`Unhandled stacks stream event: ${path}`);
        break;
    }
    this.events.emit('processedMessage', { msgId: messageId });
  }

  async stop(): Promise<void> {
    await this.eventStream.stop();
    await this.threadedParser.close();
  }

  async handleStackerDbMsg(
    messageId: string,
    timestamp: number,
    stackerDbChunks: ParsedStackerDbChunk[]
  ): Promise<void> {
    const time = stopwatch();
    const appliedSignerMessageResults: SignerMessagesEventPayload = [];
    await this.db.ingestion.sqlWriteTransaction(async sql => {
      for (const chunk of stackerDbChunks) {
        const result = await this.db.ingestion.applyStackerDbChunk(sql, timestamp, chunk);
        appliedSignerMessageResults.push(...result);
      }
      await this.db.ingestion.updateLastIngestedRedisMsgId(sql, messageId);
    });
    this.logger.info(`Apply StackerDB chunks finished in ${time.getElapsedSeconds()}s`);

    // After the sql transaction is complete, emit events for the applied signer messages.
    // Use setTimeout to break out of the call stack so caller is not blocked by event listeners.
    if (appliedSignerMessageResults.length > 0) {
      setTimeout(() => {
        this.db.ingestion.events.emit('signerMessages', appliedSignerMessageResults);
      });
    }
  }

  async handleNakamotoBlockMsg(
    messageId: string,
    _timestamp: number,
    block: ParsedNakamotoBlock
  ): Promise<void> {
    // TODO: wrap in sql transaction
    const time = stopwatch();
    await this.db.sqlWriteTransaction(async sql => {
      const lastIngestedBlockHeight = await this.db.getLastIngestedBlockHeight(sql);
      if (block.blockHeight <= lastIngestedBlockHeight) {
        this.logger.info(`Skipping previously ingested block ${block.blockHeight}`);
        return;
      }
      this.logger.info(`Apply block ${block.blockHeight}`);
      await this.db.ingestion.applyBlock(sql, block);
      await this.db.ingestion.updateChainTipBlockHeight(sql, block.blockHeight);
      await this.db.ingestion.updateLastIngestedRedisMsgId(sql, messageId);
    });
    this.logger.info(`Apply block ${block.blockHeight} finished in ${time.getElapsedSeconds()}s`);
  }
}
