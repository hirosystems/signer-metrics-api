import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createTable('block_pushes', {
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
  });

  pgm.createIndex('block_pushes', ['received_at']);
  pgm.createIndex('block_pushes', ['block_height']);
  pgm.createIndex('block_pushes', ['block_hash']);
  pgm.createIndex('block_pushes', ['index_block_hash']);

  pgm.createConstraint('block_pushes', 'block_pushes_block_hash_unique', {
    unique: ['block_hash'],
  });
}
