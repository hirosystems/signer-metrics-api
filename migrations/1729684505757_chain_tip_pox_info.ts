/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.addColumns('chain_tip', {
    first_burnchain_block_height: {
      type: 'integer',
      default: null,
    },
    reward_cycle_length: {
      type: 'integer',
      default: null,
    },
  });
}
