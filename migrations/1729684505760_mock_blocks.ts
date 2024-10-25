/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createTable('mock_blocks', {
    id: {
      type: 'bigserial',
      primaryKey: true,
    },
    received_at: {
      type: 'timestamptz',
      notNull: true,
    },
    miner_key: {
      type: 'bytea',
      notNull: true,
    },
    signature: {
      type: 'bytea',
      notNull: true,
    },

    // Mock proposal fields
    mock_proposal_miner_key: {
      type: 'bytea',
      notNull: true,
    },
    mock_proposal_signature: {
      type: 'bytea',
      notNull: true,
    },
    burn_block_height: {
      type: 'integer',
      notNull: true,
    },
    stacks_tip_consensus_hash: {
      type: 'bytea',
      notNull: true,
    },
    // AKA block_hash
    stacks_tip: {
      type: 'bytea',
      notNull: true,
    },
    // AKA block_height
    stacks_tip_height: {
      type: 'integer',
      notNull: true,
    },
    server_version: {
      type: 'text',
      notNull: true,
    },
    pox_consensus_hash: {
      type: 'bytea',
      notNull: true,
    },
    network_id: {
      type: 'integer',
      notNull: true,
    },
    index_block_hash: {
      type: 'bytea',
      notNull: true,
    },
  });

  pgm.createIndex('mock_blocks', ['received_at']);
  pgm.createIndex('mock_blocks', ['stacks_tip_height']);
  pgm.createIndex('mock_blocks', ['stacks_tip']);
  pgm.createIndex('mock_blocks', ['index_block_hash']);
  pgm.createIndex('mock_blocks', ['burn_block_height']);

  // Mock block signer signatures
  pgm.createTable('mock_block_signer_signatures', {
    id: {
      type: 'bigserial',
      primaryKey: true,
    },
    signer_key: {
      type: 'bytea',
      notNull: true,
    },
    signer_signature: {
      type: 'bytea',
      notNull: true,
    },
    // AKA block_height
    stacks_tip: {
      type: 'bytea',
      notNull: true,
    },
    index_block_hash: {
      type: 'bytea',
      notNull: true,
    },
  });

  pgm.createIndex('mock_block_signer_signatures', ['signer_key']);
  pgm.createIndex('mock_block_signer_signatures', ['stacks_tip']);
  pgm.createIndex('mock_block_signer_signatures', ['index_block_hash']);
}
