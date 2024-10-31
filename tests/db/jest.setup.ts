import * as Docker from 'dockerode';
import { connectPostgres } from '@hirosystems/api-toolkit';

const pgConfig = {
  PGHOST: '127.0.0.1',
  PGPORT: '',
  PGUSER: 'test',
  PGPASSWORD: 'test',
  PGDATABASE: 'testdb',
};

async function startPostgresContainer(): Promise<void> {
  try {
    const docker = new Docker();

    console.log('Pulling PostgreSQL image...');
    await new Promise<void>((resolve, reject) => {
      void docker.pull('postgres:latest', {}, (_err, stream) => {
        if (!stream) throw new Error('Stream is undefined');
        docker.modem.followProgress(stream, err => (err ? reject(err) : resolve()), console.log);
      });
    });

    console.log('Creating PostgreSQL container...');
    const container = await docker.createContainer({
      Image: 'postgres:latest',
      ExposedPorts: { '5432/tcp': {} },
      HostConfig: {
        PortBindings: {
          '5432/tcp': [{ HostPort: '0' }], // 0 to assign a random port
        },
      },
      Env: [
        `POSTGRES_USER=${pgConfig.PGUSER}`,
        `POSTGRES_PASSWORD=${pgConfig.PGPASSWORD}`,
        `POSTGRES_DB=${pgConfig.PGDATABASE}`,
        `POSTGRES_PORT=5432`,
      ],
    });
    console.log('Starting PostgreSQL container...');
    await container.start();

    // Inspect container to get the host port assigned
    const containerInfo = await container.inspect();
    pgConfig.PGPORT = containerInfo.NetworkSettings.Ports['5432/tcp'][0].HostPort;
    console.log(`Postgres container started on port ${pgConfig.PGPORT}`);

    Object.assign(globalThis, { __PG_CONTAINER_ID: container.id });

    for (const entry of Object.entries(pgConfig)) {
      process.env[entry[0]] = entry[1];
    }

    // Wait for the database to be ready
    await waitForPostgres();
  } catch (error) {
    console.error('Error starting PostgreSQL container:', error);
    throw error;
  }
}

// Helper function to wait for PostgreSQL to be ready
async function waitForPostgres(): Promise<void> {
  const sql = await connectPostgres({
    usageName: 'signer-metrics-pg-tests',
    connectionArgs: {
      host: pgConfig.PGHOST,
      port: parseInt(pgConfig.PGPORT),
      user: pgConfig.PGUSER,
      password: pgConfig.PGPASSWORD,
      database: pgConfig.PGDATABASE,
    },
  });
  await sql`SELECT 1`;
  console.log('Postgres is ready');
}

// Jest global setup
export default async function setup(): Promise<void> {
  // Setup misc required env vars
  process.env.STACKS_NODE_RPC_HOST = '';
  process.env.STACKS_NODE_RPC_PORT = '1';
  process.env.CHAINHOOK_NODE_AUTH_TOKEN = '';

  await startPostgresContainer();
}
