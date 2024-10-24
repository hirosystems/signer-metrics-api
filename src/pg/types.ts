import { PgNumeric, PgBytea } from '@hirosystems/api-toolkit';

export type DbBlock = {
  block_height: number;
  tenure_height: number;
  block_hash: PgBytea;
  block_time: string;
  index_block_hash: PgBytea;
  burn_block_height: number;
  burn_block_hash: PgBytea;
};

export type DbBlockSignerSignature = {
  block_height: number;
  signer_key: PgBytea;
  signer_signature: PgBytea;
};

export type DbRewardSetSigner = {
  cycle_number: number;
  burn_block_height: number;
  block_height: number;
  signer_key: PgBytea;
  signer_weight: number;
  signer_stacked_amount: PgNumeric;
};

export type DbBlockResponse = {
  received_at: string;
  signer_key: PgBytea;
  accepted: boolean;
  signer_sighash: PgBytea;
  metadata_server_version: string;
  signature: PgBytea;
  reason_string: string | null;
  reason_code: number | null;
  reject_code: number | null;
  chain_id: number | null;
};

export type DbBlockProposal = {
  received_at: string;
  miner_key: PgBytea;
  block_height: number;
  block_time: string;
  block_hash: PgBytea;
  index_block_hash: PgBytea;
};
