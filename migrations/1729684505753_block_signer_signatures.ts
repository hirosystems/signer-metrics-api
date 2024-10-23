/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createTable('block_signer_signatures', {
    id: {
      type: 'serial',
      primaryKey: true,
    },
    block_height: {
      type: 'integer',
      notNull: true,
    },
    signer_signature: {
      type: 'text',
      notNull: true,
    },
  });

  pgm.createIndex('block_signer_signatures', ['signer_signature']);
  pgm.createIndex('block_signer_signatures', ['block_height']);
}
