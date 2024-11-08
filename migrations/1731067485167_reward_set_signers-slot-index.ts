/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  // rename reward_set_signers rather than delete in case of rollback
  pgm.dropIndex('reward_set_signers', ['signer_key']);
  pgm.dropIndex('reward_set_signers', ['block_height']);
  pgm.dropIndex('reward_set_signers', ['cycle_number']);
  pgm.dropConstraint('reward_set_signers', 'reward_set_signers_cycle_unique');
  pgm.renameTable('reward_set_signers', 'reward_set_signers_old-no-slot-index');

  pgm.createTable('reward_set_signers', {
    id: {
      type: 'serial',
      primaryKey: true,
    },
    // AKA reward_cycle
    cycle_number: {
      type: 'integer',
      notNull: true,
    },
    signer_key: {
      type: 'bytea',
      notNull: true,
    },
    signer_weight: {
      type: 'integer',
      notNull: true,
    },
    signer_stacked_amount: {
      type: 'numeric',
      notNull: true,
    },
    slot_index: {
      type: 'integer',
      notNull: true,
    },
  });

  pgm.createIndex('reward_set_signers', ['signer_key']);
  pgm.createIndex('reward_set_signers', ['cycle_number']);

  pgm.createConstraint('reward_set_signers', 'reward_set_signers_cycle_unique', {
    unique: ['signer_key', 'cycle_number'],
  });
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropTable('reward_set_signers');
  pgm.renameTable('reward_set_signers_old-no-slot-index', 'reward_set_signers');
}
