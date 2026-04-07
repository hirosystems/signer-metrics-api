import * as WorkerThreads from 'node:worker_threads';
import * as path from 'node:path';
import { waiter, Waiter, logger as defaultLogger } from '@stacks/api-toolkit';
import {
  ParsedNakamotoBlock,
  ParsedStackerDbChunk,
  parseNakamotoBlockMsg,
  parseStackerDbChunk,
} from './msg-parsing.js';
import {
  NakamotoBlockMsgReply,
  NakamotoBlockMsgRequest,
  StackerDbChunkMsgReply,
  StackerDbChunkMsgRequest,
  ThreadedParserMsgReply,
  ThreadedParserMsgType,
  workerFile,
} from './threaded-parser-worker.js';
import { NewBlockMessage, StackerDbChunksMessage } from '@stacks/node-publisher-client';

export class ThreadedParser {
  private readonly worker?: WorkerThreads.Worker;
  private readonly parseInMainThread: boolean;
  private readonly msgRequests: Map<number, Waiter<ThreadedParserMsgReply>> = new Map();
  private readonly logger = defaultLogger.child({ module: 'ThreadedParser' });
  private lastMsgId = 0;

  constructor() {
    if (!WorkerThreads.isMainThread) {
      throw new Error('ThreadedParser must be instantiated in the main thread');
    }
    const workerOpt: WorkerThreads.WorkerOptions = {};
    if (path.extname(workerFile) === '.ts') {
      if (process.env.NODE_ENV !== 'test') {
        throw new Error(
          'Worker threads are being created with tsx against .ts sources outside of a test environment'
        );
      }
      this.parseInMainThread = true;
      return;
    }
    this.parseInMainThread = false;
    this.worker = new WorkerThreads.Worker(workerFile, workerOpt);
    this.worker.on('error', err => {
      this.logger.error(err, 'Worker error');
    });
    this.worker.on('messageerror', err => {
      this.logger.error(err, 'Worker message error');
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

  async parseNakamotoBlock(block: NewBlockMessage): Promise<ParsedNakamotoBlock> {
    if (this.parseInMainThread) {
      return parseNakamotoBlockMsg(block);
    }
    const replyWaiter = waiter<NakamotoBlockMsgReply>();
    const msg: NakamotoBlockMsgRequest = {
      type: ThreadedParserMsgType.NakamotoBlock,
      msgId: this.lastMsgId++,
      block,
    };
    this.msgRequests.set(msg.msgId, replyWaiter as Waiter<ThreadedParserMsgReply>);
    this.worker?.postMessage(msg);
    const reply = await replyWaiter;
    return reply.block;
  }

  async parseStackerDbChunk(chunk: StackerDbChunksMessage): Promise<ParsedStackerDbChunk[]> {
    if (this.parseInMainThread) {
      return parseStackerDbChunk(chunk);
    }
    const replyWaiter = waiter<StackerDbChunkMsgReply>();
    const msg: StackerDbChunkMsgRequest = {
      type: ThreadedParserMsgType.StackerDbChunk,
      msgId: this.lastMsgId++,
      chunk,
    };
    this.msgRequests.set(msg.msgId, replyWaiter as Waiter<ThreadedParserMsgReply>);
    this.worker?.postMessage(msg);
    const reply = await replyWaiter;
    return reply.chunk;
  }

  async close() {
    if (this.worker) await this.worker.terminate();
  }
}
