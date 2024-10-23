/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createTable('block_responses', {
    id: {
      type: 'bigserial',
      primaryKey: true,
    },
    received_at: {
      type: 'timestamptz',
      notNull: true,
    },
    signer_key: {
      type: 'text',
      notNull: true,
    },
    accepted: {
      type: 'boolean',
      notNull: true,
    },
    signer_sighash: {
      type: 'text',
      primaryKey: true,
    },
    metadata_server_version: {
      type: 'text',
      notNull: true,
    },
    signature: {
      type: 'text',
      notNull: true,
    },

    // columns for rejected
    reason_string: {
      type: 'text',
    },
    reason_code: {
      type: 'smallint',
    },
    reject_code: {
      type: 'smallint',
    },
    chain_id: {
      type: 'integer',
    }
  });

  pgm.createIndex('block_responses', ['signer_key']);
  pgm.createIndex('block_responses', ['received_at']);
  pgm.createIndex('block_responses', ['signer_sighash']);
  pgm.createIndex('block_responses', ['accepted']);
}
