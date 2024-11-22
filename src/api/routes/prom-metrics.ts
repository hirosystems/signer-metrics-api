import { Gauge, Registry } from 'prom-client';
import { ENV } from '../../env';
import { FastifyPluginAsync } from 'fastify';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Server } from 'node:http';

export const SignerPromMetricsRoutes: FastifyPluginAsync<
  Record<never, never>,
  Server,
  TypeBoxTypeProvider
> = async (fastify, _options) => {
  const db = fastify.db;

  const signerRegistry = new Registry();
  new Gauge({
    name: 'signer_state_count',
    help: 'Count of signer states over different block periods',
    labelNames: ['signer', 'period', 'state'] as const,
    registers: [signerRegistry],
    async collect() {
      const blockRanges = ENV.SIGNER_PROMETHEUS_METRICS_BLOCK_PERIODS.split(',').map(Number);
      const dbResults = await db.sqlTransaction(async sql => {
        return await db.getRecentSignerMetrics({ sql, blockRanges });
      });
      this.reset();
      for (const row of dbResults) {
        for (const [blockRange, states] of Object.entries(row.block_ranges)) {
          for (const [state, count] of Object.entries(states)) {
            this.set({ signer: row.signer_key, period: blockRange, state: state }, count);
          }
        }
      }
    },
  });

  fastify.route({
    url: '/metrics',
    method: 'GET',
    logLevel: 'info',
    handler: async (_, reply) => {
      const metrics = await signerRegistry.metrics();
      await reply.type(signerRegistry.contentType).send(metrics);
    },
  });

  await Promise.resolve();
};
