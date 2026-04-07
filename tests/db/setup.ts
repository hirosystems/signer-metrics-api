import type { DockerTestContainerConfig } from '@stacks/api-test-toolkit';
import { dockerTestUp, dockerTestDown } from '@stacks/api-test-toolkit';

process.env.STACKS_NODE_RPC_HOST = '127.0.0.1';
process.env.STACKS_NODE_RPC_PORT = '20443';
process.env.REDIS_URL = 'redis://127.0.0.1:6379';
process.env.PGHOST = 'localhost';
process.env.PGPORT = '5432';
process.env.PGUSER = 'test';
process.env.PGPASSWORD = 'test';
process.env.PGDATABASE = 'testdb';

function defaultContainers(): DockerTestContainerConfig[] {
  const postgres: DockerTestContainerConfig = {
    image: 'postgres:17',
    name: `signer-metrics-api-test-postgres`,
    ports: [{ host: 5432, container: 5432 }],
    env: ['POSTGRES_USER=test', 'POSTGRES_PASSWORD=test', 'POSTGRES_DB=testdb'],
    // waitPort: 5432,
    healthcheck: 'pg_isready -U postgres',
  };

  const redis: DockerTestContainerConfig = {
    image: 'redis:7',
    name: `signer-metrics-api-test-redis`,
    host: '0.0.0.0',
    ports: [{ host: 6379, container: 6379 }],
    waitPort: 6379,
  };

  return [postgres, redis];
}

export async function globalSetup() {
  const containers = defaultContainers();
  for (const config of containers) {
    await dockerTestUp({ config });
  }
  process.stdout.write(`[testenv:signer-metrics-api] all containers ready\n`);
}

export async function globalTeardown() {
  const containers = defaultContainers();
  for (const config of [...containers].reverse()) {
    await dockerTestDown({ config });
  }
  process.stdout.write(`[testenv:signer-metrics-api] all containers removed\n`);
}
