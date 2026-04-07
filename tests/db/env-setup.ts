import { ENV } from '../../src/env.ts';

export function setUpEnv() {
  ENV.STACKS_NODE_RPC_HOST = '127.0.0.1';
  ENV.STACKS_NODE_RPC_PORT = 20443;
  ENV.REDIS_URL = 'redis://127.0.0.1:6379';
  ENV.PGHOST = 'localhost';
  ENV.PGPORT = 5432;
  ENV.PGUSER = 'test';
  ENV.PGPASSWORD = 'test';
  ENV.PGDATABASE = 'testdb';
}
