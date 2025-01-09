import * as WorkerThreads from 'node:worker_threads';
import { waiter, Waiter, logger as defaultLogger } from '@hirosystems/api-toolkit';
import { CoreNodeNakamotoBlockMessage, StackerDbChunk } from './core-node-message';
import { ParsedNakamotoBlock, ParsedStackerDbChunk } from './msg-parsing';
import {
  NakamotoBlockMsgReply,
  NakamotoBlockMsgRequest,
  StackerDbChunkMsgReply,
  StackerDbChunkMsgRequest,
  ThreadedParserMsgReply,
  ThreadedParserMsgType,
  workerFile,
} from './threaded-parser-worker';

export class ThreadedParser {
  private readonly worker: WorkerThreads.Worker;
  private readonly msgRequests: Map<number, Waiter<ThreadedParserMsgReply>> = new Map();
  private readonly logger = defaultLogger.child({ module: 'ThreadedParser' });
  private lastMsgId = 0;

  constructor() {
    if (!WorkerThreads.isMainThread) {
      throw new Error('ThreadedParser must be instantiated in the main thread');
    }
    this.worker = new WorkerThreads.Worker(workerFile);
    this.worker.on('error', err => {
      this.logger.error('Worker error', err);
    });
    this.worker.on('messageerror', err => {
      this.logger.error('Worker message error', err);
    });
    this.worker.on('message', (msg: ThreadedParserMsgReply) => {
      const waiter = this.msgRequests.get(msg.msgId);
      if (waiter) {
        waiter.finish(msg);
        this.msgRequests.delete(msg.msgId);
      } else {
        this.logger.warn('Received unexpected message from worker', msg);
      }
    });
  }

  async parseNakamotoBlock(block: CoreNodeNakamotoBlockMessage): Promise<ParsedNakamotoBlock> {
    const replyWaiter = waiter<NakamotoBlockMsgReply>();
    const msg: NakamotoBlockMsgRequest = {
      type: ThreadedParserMsgType.NakamotoBlock,
      msgId: this.lastMsgId++,
      block,
    };
    this.msgRequests.set(msg.msgId, replyWaiter as Waiter<ThreadedParserMsgReply>);
    this.worker.postMessage(msg);
    const reply = await replyWaiter;
    return reply.block;
  }

  async parseStackerDbChunk(chunk: StackerDbChunk): Promise<ParsedStackerDbChunk[]> {
    const replyWaiter = waiter<StackerDbChunkMsgReply>();
    const msg: StackerDbChunkMsgRequest = {
      type: ThreadedParserMsgType.StackerDbChunk,
      msgId: this.lastMsgId++,
      chunk,
    };
    this.msgRequests.set(msg.msgId, replyWaiter as Waiter<ThreadedParserMsgReply>);
    this.worker.postMessage(msg);
    const reply = await replyWaiter;
    return reply.chunk;
  }
}
