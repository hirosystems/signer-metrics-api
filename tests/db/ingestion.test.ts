import { connectPostgres, PgConnectionArgs } from '@hirosystems/api-toolkit';
import { sleep } from '../../src/helpers';
import * as events from 'node:events';
import { ENV } from '../../src/env';

describe('Postgres ingestion tests', () => {
  test('connect postgres', async () => {
    const pgConfig: PgConnectionArgs = {
      host: ENV.PGHOST,
      port: ENV.PGPORT,
      user: ENV.PGUSER,
      password: ENV.PGPASSWORD,
      database: ENV.PGDATABASE,
    };
    const sql = await connectPostgres({
      usageName: 'signer-metrics-pg-store',
      connectionArgs: pgConfig,
      connectionConfig: {
        poolMax: ENV.PG_CONNECTION_POOL_MAX,
        idleTimeout: ENV.PG_IDLE_TIMEOUT,
        maxLifetime: ENV.PG_MAX_LIFETIME,
      },
    });
    await sql`SELECT 1`;
  });
});
