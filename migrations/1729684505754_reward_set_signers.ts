import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
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
    burn_block_height: {
      type: 'integer',
      notNull: true,
    },
    block_height: {
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
  });

  pgm.createIndex('reward_set_signers', ['signer_key']);
  pgm.createIndex('reward_set_signers', ['block_height']);
  pgm.createIndex('reward_set_signers', ['cycle_number']);

  pgm.createConstraint('reward_set_signers', 'reward_set_signers_cycle_unique', {
    unique: ['signer_key', 'cycle_number'],
  });
}
