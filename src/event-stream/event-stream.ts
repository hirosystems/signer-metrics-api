import { StacksEventStream, StacksEventStreamType } from '@hirosystems/salt-n-pepper-client';
import { PgStore } from '../pg/pg-store';
import {
  CoreNodeBlockMessage,
  CoreNodeBurnBlockMessage,
  CoreNodeNakamotoBlockMessage,
  StackerDbChunk,
} from './core-node-message';
import { logger as defaultLogger, stopwatch } from '@hirosystems/api-toolkit';
import { ENV } from '../env';
import {
  ParsedNakamotoBlock,
  ParsedStackerDbChunk,
  parseNakamotoBlockMsg,
  parseStackerDbChunk,
} from './msg-parsing';
import { SignerMessagesEventPayload } from '../pg/types';
import { ThreadedParser } from './threaded-parser';

export class EventStreamHandler {
  db: PgStore;
  logger = defaultLogger.child({ name: 'EventStreamHandler' });
  eventStream: StacksEventStream;
  threadedParser: ThreadedParser;

  constructor(opts: { db: PgStore; lastMessageId: string }) {
    this.db = opts.db;
    this.eventStream = new StacksEventStream({
      redisUrl: ENV.REDIS_URL,
      eventStreamType: StacksEventStreamType.all,
      lastMessageId: opts.lastMessageId,
    });
    this.threadedParser = new ThreadedParser();
  }

  async start() {
    await this.eventStream.connect({ waitForReady: true });
    this.eventStream.start(async (messageId, timestamp, path, body) => {
      this.logger.info(`${path}: received Stacks stream event`);
      switch (path) {
        case '/new_block': {
          const blockMsg = body as CoreNodeBlockMessage;
          if ('signer_signature_hash' in blockMsg) {
            const nakamotoBlockMsg = body as CoreNodeNakamotoBlockMessage;
            // const parsed = parseNakamotoBlockMsg(nakamotoBlockMsg);
            const parsed = await this.threadedParser.parseNakamotoBlock(nakamotoBlockMsg);
            await this.handleNakamotoBlockMsg(messageId, parseInt(timestamp), parsed);
          } else {
            // ignore pre-Nakamoto blocks
          }
          break;
        }

        case '/stackerdb_chunks': {
          const msg = body as StackerDbChunk;
          // const parsed = parseStackerDbChunk(msg);
          const parsed = await this.threadedParser.parseStackerDbChunk(msg);
          await this.handleStackerDbMsg(messageId, parseInt(timestamp), parsed);
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
      await Promise.resolve();
    });
  }

  async stop(): Promise<void> {
    await this.eventStream.stop();
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
