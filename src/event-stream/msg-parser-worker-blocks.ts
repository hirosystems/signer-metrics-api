import type { CoreNodeNakamotoBlockMessage } from './core-node-message';
import { ParsedNakamotoBlock, parseNakamotoBlockMsg } from './msg-parsing';

export function processTask(msg: CoreNodeNakamotoBlockMessage): ParsedNakamotoBlock {
  return parseNakamotoBlockMsg(msg);
}

export const workerModule = module;
