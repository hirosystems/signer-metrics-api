import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.addColumns('chain_tip', {
    last_redis_msg_id: {
      type: 'text',
      notNull: true,
      default: '0',
    },
  });
}
