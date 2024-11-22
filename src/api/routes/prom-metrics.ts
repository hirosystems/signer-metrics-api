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

  // Getter for block periods so that the env var can be updated
  const getBlockPeriods = () => ENV.SIGNER_PROMETHEUS_METRICS_BLOCK_PERIODS.split(',').map(Number);

  const signerRegistry = new Registry();

  new Gauge({
    name: 'time_since_last_pending_block_proposal_ms',
    help: 'Time in milliseconds since the oldest pending block proposal',
    registers: [signerRegistry],
    async collect() {
      const dbResult = await db.sqlTransaction(async sql => {
        return await db.getLastPendingProposalDate({ sql });
      });
      this.reset();
      this.set(dbResult ? Date.now() - dbResult.getTime() : 0);
    },
  });

  new Gauge({
    name: 'avg_block_push_time_ms',
    help: 'Average time (in milliseconds) taken for block proposals to be accepted and pushed over different block periods',
    labelNames: ['period'] as const,
    registers: [signerRegistry],
    async collect() {
      const dbResults = await db.sqlTransaction(async sql => {
        return await db.getRecentBlockPushMetrics({ sql, blockRanges: getBlockPeriods() });
      });
      this.reset();
      for (const row of dbResults) {
        this.set({ period: row.block_range }, row.avg_push_time_ms);
      }
    },
  });

  new Gauge({
    name: 'proposal_acceptance_rate',
    help: 'The acceptance rate of block proposals for different block ranges (as a float between 0 and 1).',
    labelNames: ['period'],
    registers: [signerRegistry],
    async collect() {
      const dbResults = await db.sqlTransaction(async sql => {
        return await db.getRecentBlockAcceptanceMetrics({ sql, blockRanges: getBlockPeriods() });
      });
      this.reset();
      for (const row of dbResults) {
        this.set({ period: row.block_range }, row.acceptance_rate);
      }
    },
  });

  new Gauge({
    name: 'signer_state_count',
    help: 'Count of signer states over different block periods',
    labelNames: ['signer', 'period', 'state'] as const,
    registers: [signerRegistry],
    async collect() {
      const dbResults = await db.sqlTransaction(async sql => {
        return await db.getRecentSignerMetrics({ sql, blockRanges: getBlockPeriods() });
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

  fastify.get(
    '/metrics',
    {
      schema: {
        operationId: 'getPrometheusMetrics',
        summary: 'API Signer Prometheus Metrics',
        description: 'Retreives the Prometheus metrics signer and block proposal related data',
        tags: ['Prometheus Metrics'],
        response: {
          200: {
            description: 'Prometheus metrics in plain text format',
            content: {
              'text/plain': {
                schema: { type: 'string' },
              },
            },
          },
        },
      },
    },
    async (_, reply) => {
      const metrics = await signerRegistry.metrics();
      await reply.type(signerRegistry.contentType).send(metrics);
    }
  );

  await Promise.resolve();
};
