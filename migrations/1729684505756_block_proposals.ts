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
      type: 'text',
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
    block_hash: {
      type: 'text',
      notNull: true,
    },
    index_block_hash: {
      type: 'text',
      notNull: true,
    },
  });

  pgm.createIndex('block_proposals', ['received_at']);
  pgm.createIndex('block_proposals', ['block_height']);
  pgm.createIndex('block_proposals', ['block_hash']);
  pgm.createIndex('block_proposals', ['index_block_hash']);
}
