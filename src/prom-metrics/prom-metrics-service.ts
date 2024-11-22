import { Gauge, Registry } from 'prom-client';
import { PgStore } from '../pg/pg-store';
import { sleep } from '../helpers';
import { ENV } from '../env';
import { logger as defaultLogger } from '@hirosystems/api-toolkit';
import { FastifyPluginAsync } from 'fastify';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Server } from 'node:http';

export class PromMetricsService {
  private readonly signerRegistry = new Registry();

  private readonly signerStateCount: Gauge<'signer' | 'period' | 'state'>;

  private readonly db: PgStore;
  private readonly abortController: AbortController = new AbortController();
  private readonly logger = defaultLogger.child({ module: 'PromMetricsService' });

  constructor(args: { db: PgStore }) {
    this.db = args.db;
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const instance = this;
    const gauge = new Gauge({
      name: 'signer_state_count',
      help: 'Count of signer states over different block periods',
      labelNames: ['signer', 'period', 'state'] as const,
      registers: [this.signerRegistry],
      async collect() {
        const areEqual = Object.is(this, gauge);
        console.log(areEqual);
        await instance.gatherMetrics(this);
      },
    });
    this.signerStateCount = gauge;

    // TODO: decide if this should be a background job vs on-demand collection
    // void this.startGatherMetricsJob();
  }

  public stop() {
    this.abortController.abort();
  }

  private async startGatherMetricsJob() {
    while (!this.abortController.signal.aborted) {
      try {
        await this.gatherMetrics(this.signerStateCount);
      } catch (error) {
        if (this.abortController.signal.aborted) {
          return;
        }
        this.logger.error(error, 'Error gathering signer prometheus metrics');
      }

      try {
        await sleep(
          ENV.SIGNER_PROMETHEUS_METRICS_UPDATE_INTERVAL_SECONDS * 1000,
          this.abortController.signal
        );
      } catch (_err) {
        if (this.abortController.signal.aborted) {
          return;
        }
      }
    }
  }

  private async gatherMetrics(gauge: typeof this.signerStateCount) {
    const dbResults = await this.db.sqlTransaction(async sql => {
      const blockRanges = ENV.SIGNER_PROMETHEUS_METRICS_BLOCK_PERIODS;
      return await this.db.getRecentSignerMetrics({ sql, blockRanges });
    });
    gauge.reset();
    for (const row of dbResults) {
      for (const [blockRange, states] of Object.entries(row.block_ranges)) {
        for (const [state, count] of Object.entries(states)) {
          gauge.set({ signer: row.signer_key, period: blockRange, state: state }, count);
        }
      }
    }
  }

  public getRegistry() {
    return this.signerRegistry;
  }
}

export const SignerPromMetricsRoutes: FastifyPluginAsync<
  Record<never, never>,
  Server,
  TypeBoxTypeProvider
> = async (fastify, _options) => {
  const db = fastify.db;
  const promMetricsService = new PromMetricsService({ db });

  fastify.addHook('onClose', (_instance, done) => {
    promMetricsService.stop();
    done();
  });

  fastify.route({
    url: '/metrics',
    method: 'GET',
    logLevel: 'info',
    handler: async (_, reply) => {
      const registry = promMetricsService.getRegistry();
      const metrics = await registry.metrics();
      await reply.type(registry.contentType).send(metrics);
    },
  });

  await Promise.resolve();
};
