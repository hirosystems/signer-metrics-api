import * as Docker from 'dockerode';
import { connectPostgres } from '@hirosystems/api-toolkit';

const pgConfig = {
  PGHOST: '127.0.0.1',
  PGPORT: '',
  PGUSER: 'test',
  PGPASSWORD: 'test',
  PGDATABASE: 'testdb',
};

function isDockerImagePulled(docker: Docker, imgName: string) {
  return docker
    .getImage(imgName)
    .inspect()
    .then(
      () => true,
      () => false
    );
}

async function pullDockerImage(docker: Docker, imgName: string) {
  await new Promise<void>((resolve, reject) => {
    docker.pull(imgName, {}, (err, stream) => {
      if (err || !stream) return reject(err);
      docker.modem.followProgress(stream, err => (err ? reject(err) : resolve()), console.log);
    });
  });
}

async function pruneContainers(docker: Docker, label: string) {
  const containers = await docker.listContainers({ all: true, filters: { label: [label] } });
  for (const container of containers) {
    const c = docker.getContainer(container.Id);
    if (container.State !== 'exited') {
      await c.stop().catch(_err => {});
    }
    await c.remove();
  }
  return containers.length;
}

async function startPostgresContainer(): Promise<void> {
  const pgImage = 'postgres:17';
  const label = 'signer-metrics-pg-tests';
  try {
    const docker = new Docker();
    const imgPulled = await isDockerImagePulled(docker, pgImage);
    if (!imgPulled) {
      console.log('Pulling PostgreSQL image...');
      await pullDockerImage(docker, pgImage);
    }
    const prunedCount = await pruneContainers(docker, label);
    if (prunedCount > 0) {
      console.log(`Pruned ${prunedCount} existing PostgreSQL containers`);
    }
    console.log('Creating PostgreSQL container...');
    const container = await docker.createContainer({
      Labels: { [label]: 'true' },
      Image: pgImage,
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
