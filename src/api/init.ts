import Fastify, { FastifyPluginAsync, FastifyServerOptions } from 'fastify';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { PgStore } from '../pg/pg-store';
import FastifyCors from '@fastify/cors';
import { StatusRoutes } from './routes/status';
import FastifyMetrics, { IFastifyMetrics } from 'fastify-metrics';
import { Server } from 'http';
import { isProdEnv } from '../helpers';
import { PINO_LOGGER_CONFIG } from '@hirosystems/api-toolkit';
import { CycleRoutes } from './routes/cycle';
import { BlockRoutes } from './routes/blocks';

export const Api: FastifyPluginAsync<Record<never, never>, Server, TypeBoxTypeProvider> = async (
  fastify,
  options
) => {
  await fastify.register(
    async fastify => {
      await fastify.register(StatusRoutes);
      await fastify.register(CycleRoutes);
      await fastify.register(BlockRoutes);
    },
    { prefix: '/signer-metrics' }
  );
};

export async function buildApiServer(args: { db: PgStore }) {
  const logger: FastifyServerOptions['logger'] = {
    ...PINO_LOGGER_CONFIG,
    name: 'fastify-api',
    serializers: {
      res: reply => ({
        statusCode: reply.statusCode,
        method: reply.request?.method,
        url: reply.request?.url,
        requestBodySize:
          parseInt(reply.request?.headers?.['content-length'] as string) || 'unknown',
        responseBodySize: parseInt(reply.getHeader?.('content-length') as string) || 'unknown',
      }),
    },
  };

  const fastify = Fastify({
    trustProxy: true,
    logger: logger,
  }).withTypeProvider<TypeBoxTypeProvider>();

  fastify.decorate('db', args.db);
  if (isProdEnv) {
    await fastify.register(FastifyMetrics, { endpoint: null });
  }
  await fastify.register(FastifyCors);
  await fastify.register(Api);

  fastify.addHook('onSend', async (_req, reply, payload) => {
    if ((reply.getHeader('Content-Type') as string).startsWith('application/json')) {
      // Pretty-print with indentation
      return JSON.stringify(JSON.parse(payload as string), null, 2);
    } else {
      return payload;
    }
  });

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
