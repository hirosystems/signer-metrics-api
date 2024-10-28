/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createTable('mock_proposals', {
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
      type: 'bigint',
      notNull: true,
    },
    index_block_hash: {
      type: 'bytea',
      notNull: true,
    },
  });

  pgm.createIndex('mock_proposals', ['received_at']);
  pgm.createIndex('mock_proposals', ['stacks_tip_height']);
  pgm.createIndex('mock_proposals', ['stacks_tip']);
  pgm.createIndex('mock_proposals', ['index_block_hash']);
  pgm.createIndex('mock_proposals', ['burn_block_height']);

  pgm.createConstraint('mock_proposals', 'mock_proposals_idb_unique', {
    unique: ['index_block_hash'],
  });
}
