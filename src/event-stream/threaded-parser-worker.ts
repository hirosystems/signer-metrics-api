import type { CoreNodeNakamotoBlockMessage, StackerDbChunk } from './core-node-message';
import { parseNakamotoBlockMsg, parseStackerDbChunk } from './msg-parsing';

export function processTask(
  args:
    | { kind: 'block'; msg: CoreNodeNakamotoBlockMessage }
    | { kind: 'chunk'; msg: StackerDbChunk }
) {
  if (args.kind === 'block') {
    return { kind: 'block', result: parseNakamotoBlockMsg(args.msg) };
  } else {
    return { kind: 'chunk', result: parseStackerDbChunk(args.msg) };
  }
}

export const workerModule = module;
