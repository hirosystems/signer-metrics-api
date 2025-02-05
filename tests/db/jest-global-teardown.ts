import * as Docker from 'dockerode';

// Jest global teardown to stop and remove the container
export default async function teardown(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  const containerId = (globalThis as any).__PG_CONTAINER_ID as string | undefined;
  if (containerId) {
    console.log(`Stopping and removing PostgreSQL container ${containerId}...`);
    const docker = new Docker();
    const container = docker.getContainer(containerId);
    await container.stop();
    await container.remove({ v: true });
    console.log(`PostgreSQL container stopped and removed`);
  }
}
