/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createTable('block_proposals', {
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
    block_height: {
      type: 'integer',
      notNull: true,
    },
    block_time: {
      type: 'timestamptz',
      notNull: true,
    },
    // AKA signer_sighash
    block_hash: {
      type: 'bytea',
      notNull: true,
    },
    index_block_hash: {
      type: 'bytea',
      notNull: true,
    },
    burn_block_height: {
      type: 'integer',
      notNull: true,
    },
    // AKA cycle_number
    reward_cycle: {
      type: 'integer',
      notNull: true,
    },
  });

  pgm.createIndex('block_proposals', ['received_at']);
  pgm.createIndex('block_proposals', ['block_height']);
  pgm.createIndex('block_proposals', ['block_hash']);
  pgm.createIndex('block_proposals', ['index_block_hash']);
  pgm.createIndex('block_proposals', ['reward_cycle']);

  pgm.createConstraint('block_proposals', 'block_proposals_block_hash_unique', {
    unique: ['block_hash'],
  });
}
