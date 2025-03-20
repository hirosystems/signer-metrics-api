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
      type: 'bytea',
      notNull: true,
    },
    accepted: {
      type: 'boolean',
      notNull: true,
    },
    // AKA block_hash
    signer_sighash: {
      type: 'bytea',
      primaryKey: true,
    },
    metadata_server_version: {
      type: 'text',
      notNull: true,
    },
    signature: {
      type: 'bytea',
    },

    // columns for rejected
    reason_string: {
      type: 'text',
    },
    reason_code: {
      type: 'text',
    },
    reject_code: {
      type: 'text',
    },
    chain_id: {
      type: 'bigint',
    },
  });

  pgm.createIndex('block_responses', ['signer_key']);
  pgm.createIndex('block_responses', ['received_at']);
  pgm.createIndex('block_responses', ['signer_sighash']);
  pgm.createIndex('block_responses', ['accepted']);

  pgm.createConstraint('block_responses', 'block_responses_signer_key_sighash_unique', {
    unique: ['signer_key', 'signer_sighash'],
  });
}
