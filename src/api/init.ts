import Fastify, { FastifyPluginAsync } from 'fastify';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { PgStore } from '../pg/pg-store';
import FastifyCors from '@fastify/cors';
import { StatusRoutes } from './routes/status';
import FastifyMetrics, { IFastifyMetrics } from 'fastify-metrics';
import { Server } from 'http';
import { isProdEnv } from '../helpers';
import { PINO_LOGGER_CONFIG } from '@hirosystems/api-toolkit';
import { PoxCycleRoutes } from './routes/pox-cycle';

export const Api: FastifyPluginAsync<Record<never, never>, Server, TypeBoxTypeProvider> = async (
  fastify,
  options
) => {
  await fastify.register(StatusRoutes);
  await fastify.register(PoxCycleRoutes);
};

export async function buildApiServer(args: { db: PgStore }) {
  const fastify = Fastify({
    trustProxy: true,
    logger: PINO_LOGGER_CONFIG,
  }).withTypeProvider<TypeBoxTypeProvider>();

  fastify.decorate('db', args.db);
  if (isProdEnv) {
    await fastify.register(FastifyMetrics, { endpoint: null });
  }
  await fastify.register(FastifyCors);
  await fastify.register(Api, { prefix: '/signer-monitor' });

  return fastify;
}

export async function buildPromServer(args: { metrics: IFastifyMetrics }) {
  const promServer = Fastify({
    trustProxy: true,
    logger: PINO_LOGGER_CONFIG,
  });

  promServer.route({
    url: '/metrics',
    method: 'GET',
    logLevel: 'info',
    handler: async (_, reply) => {
      await reply.type('text/plain').send(await args.metrics.client.register.metrics());
    },
  });

  return promServer;
}
