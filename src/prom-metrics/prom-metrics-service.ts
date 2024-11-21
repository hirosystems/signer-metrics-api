import { Gauge, Registry } from 'prom-client';
import { PgStore } from '../pg/pg-store';
import { sleep } from '../helpers';
import { ENV } from '../env';
import { logger as defaultLogger } from '@hirosystems/api-toolkit';

export class PromMetricsService {
  private readonly signerRegistry = new Registry();

  private readonly signerStateCount = new Gauge({
    name: 'signer_state_count',
    help: 'Count of signer states over different block periods',
    labelNames: ['signer', 'period', 'state'] as const,
    registers: [this.signerRegistry],
  });

  private readonly db: PgStore;
  private readonly abortController: AbortController = new AbortController();
  private readonly logger = defaultLogger.child({ module: 'PromMetricsService' });

  constructor(args: { db: PgStore }) {
    this.db = args.db;
    void this.startGatherMetricsJob();
  }

  public stop() {
    this.abortController.abort();
  }

  private async startGatherMetricsJob() {
    while (!this.abortController.signal.aborted) {
      try {
        await this.gatherMetrics();
      } catch (error) {
        if (this.abortController.signal.aborted) {
          return;
        }
        this.logger.error(error, 'Error gathering signer prometheus metrics');
      }

      try {
        await sleep(
          ENV.SIGNER_PROMETHEUS_METRICS_UPDATE_INTERVAL * 1000,
          this.abortController.signal
        );
      } catch (_err) {
        if (this.abortController.signal.aborted) {
          return;
        }
      }
    }
  }

  private async gatherMetrics() {
    const dbResults = await this.db.sqlTransaction(async sql => {
      const blockRanges = ENV.SIGNER_PROMETHEUS_METRICS_BLOCK_PERIODS;
      return await this.db.getRecentSignerMetrics({ sql, blockRanges });
    });
    this.signerStateCount.reset();
    for (const row of dbResults) {
      for (const [blockRange, states] of Object.entries(row.block_ranges)) {
        for (const [state, count] of Object.entries(states)) {
          this.signerStateCount.set(
            { signer: row.signer_key, period: blockRange, state: state },
            count
          );
        }
      }
    }
  }

  public getRegistry() {
    return this.signerRegistry;
  }
}

// res.set('Content-Type', customRegistry.contentType);
// res.end(await customRegistry.metrics());
