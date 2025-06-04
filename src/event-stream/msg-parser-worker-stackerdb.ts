import type { StackerDbChunk } from './core-node-message';
import { parseStackerDbChunk } from './msg-parsing';

export function processTask(msg: StackerDbChunk) {
  return parseStackerDbChunk(msg);
}
export const workerModule = module;
