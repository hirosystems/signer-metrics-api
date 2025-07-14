/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.addColumns('reward_set_signers', {
    last_response_time: {
      type: 'timestamptz',
    },
    last_response_metadata_server_version: {
      type: 'text',
    },
    proposals_accepted_count: {
      type: 'integer',
      default: 0,
      notNull: true,
    },
    proposals_rejected_count: {
      type: 'integer',
      default: 0,
      notNull: true,
    },
    proposals_missed_count: {
      type: 'integer',
      default: 0,
      notNull: true,
    },
    average_response_time_ms: {
      type: 'float',
      default: 0,
      notNull: true,
    },
    signer_stacked_amount_percentage: {
      type: 'float',
      notNull: true,
    },
    signer_stacked_amount_rank: {
      type: 'integer',
      notNull: true,
    },
    signer_weight_percentage: {
      type: 'float',
      notNull: true,
    },
  });
}
