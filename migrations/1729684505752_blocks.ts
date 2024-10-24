/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createTable('blocks', {
    id: {
      type: 'serial',
      primaryKey: true,
    },
    block_height: {
      type: 'integer',
      notNull: true,
    },
    tenure_height: {
      type: 'integer',
      notNull: true,
    },
    // AKA signer_sighash
    block_hash: {
      type: 'bytea',
      notNull: true,
    },
    block_time: {
      type: 'timestamptz',
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
    burn_block_hash: {
      type: 'bytea',
      notNull: true,
    },
  });

  pgm.createIndex('blocks', ['block_height']);
  pgm.createIndex('blocks', ['index_block_hash']);
  pgm.createIndex('blocks', ['block_hash']);
}
