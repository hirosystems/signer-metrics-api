import { PgNumeric, PgBytea } from '@hirosystems/api-toolkit';

export type DbBlock = {
  block_height: number;
  tenure_height: number;
  block_hash: PgBytea;
  block_time: string;
  index_block_hash: PgBytea;
  burn_block_height: number;
  burn_block_hash: PgBytea;
  is_nakamoto_block: boolean;
};

export type DbBlockSignerSignature = {
  block_height: number;
  signer_key: PgBytea;
  signer_signature: PgBytea;
};

export type DbRewardSetSigner = {
  cycle_number: number;
  signer_key: PgBytea;
  signer_weight: number;
  signer_stacked_amount: PgNumeric;
  slot_index: number;
};

export type DbBlockResponse = {
  received_at: string;
  signer_key: PgBytea;
  accepted: boolean;
  signer_sighash: PgBytea;
  metadata_server_version: string;
  signature: PgBytea | null;
  reason_string: string | null;
  reason_code: string | null;
  reject_code: string | null;
  chain_id: number | null;
};

export type DbBlockProposal = {
  received_at: string;
  miner_key: PgBytea;
  block_height: number;
  block_time: string;
  block_hash: PgBytea;
  index_block_hash: PgBytea;
  burn_block_height: number;
  reward_cycle: number;
};

export type DbMockProposal = {
  received_at: string;
  miner_key: PgBytea;
  burn_block_height: number;
  stacks_tip_consensus_hash: PgBytea;
  stacks_tip: PgBytea;
  stacks_tip_height: number;
  server_version: string;
  pox_consensus_hash: PgBytea;
  network_id: number;
  index_block_hash: PgBytea;
};

export type DbMockSignature = {
  received_at: string;
  signer_key: PgBytea;
  signature: PgBytea;

  // Mock proposal fields
  burn_block_height: number;
  stacks_tip_consensus_hash: PgBytea;
  stacks_tip: PgBytea;
  stacks_tip_height: number;
  server_version: string;
  pox_consensus_hash: PgBytea;
  network_id: number;
  index_block_hash: PgBytea;

  // Metadata fields
  metadata_server_version: string;
};

export type DbMockBlock = {
  received_at: string;
  miner_key: PgBytea;
  signature: PgBytea;

  // Mock proposal fields
  burn_block_height: number;
  stacks_tip_consensus_hash: PgBytea;
  stacks_tip: PgBytea;
  stacks_tip_height: number;
  server_version: string;
  pox_consensus_hash: PgBytea;
  network_id: number;
  index_block_hash: PgBytea;
};

export type DbMockBlockSignerSignature = {
  signer_key: PgBytea;
  signer_signature: PgBytea;
  stacks_tip: PgBytea;
  stacks_tip_height: number;
  index_block_hash: PgBytea;
};
