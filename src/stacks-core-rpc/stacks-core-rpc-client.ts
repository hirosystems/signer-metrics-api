import { ENV } from '../env';

export function getStacksNodeUrl(): string {
  return `http://${ENV.STACKS_NODE_RPC_HOST}:${ENV.STACKS_NODE_RPC_PORT}`;
}

export interface PoxInfo {
  first_burnchain_block_height: number;
  reward_cycle_length: number;
}

export async function fetchRpcPoxInfo(abortSignal: AbortSignal) {
  const url = `${getStacksNodeUrl()}/v2/pox`;
  const res = await fetch(url, { signal: abortSignal });
  const json = await res.json();
  return json as PoxInfo;
}

export interface RpcStackerSetResponse {
  stacker_set: {
    rewarded_addresses: any[];
    start_cycle_state: {
      missed_reward_slots: any[];
    };
    pox_ustx_threshold: number;
    signers: {
      signing_key: string;
      stacked_amt: number;
      weight: number;
    }[];
  };
}

export async function fetchStackerSet(cycleNumber: number, abortSignal: AbortSignal) {
  const url = `${getStacksNodeUrl()}/v3/stacker_set/${cycleNumber}`;
  const res = await fetch(url, { signal: abortSignal });
  const json = await res.json();
  return json as RpcStackerSetResponse;
}
