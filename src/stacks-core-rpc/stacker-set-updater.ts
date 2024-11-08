import { PgStore } from '../pg/pg-store';
import PQueue from 'p-queue';
import { fetchStackerSet, getStacksNodeUrl, RpcStackerSetResponse } from './stacks-core-rpc-client';
import { sleep } from '../helpers';
import { logger } from '@hirosystems/api-toolkit';
import { DbRewardSetSigner } from '../pg/types';

// TODO: make this configurable
// How long to wait between retries when fetching fails
const FETCH_STACKER_SET_RETRY_INTERVAL_MS = 3000;

// TODO: make this configurable
const FETCH_STACKER_SET_CONCURRENCY_LIMIT = 2;

export class StackerSetUpdator {
  private readonly queue: PQueue;
  private readonly db: PgStore;
  private readonly abortController: AbortController;
  private readonly queuedCycleNumbers = new Set<number>();

  constructor(args: { db: PgStore }) {
    this.db = args.db;
    this.abortController = new AbortController();
    this.queue = new PQueue({
      concurrency: FETCH_STACKER_SET_CONCURRENCY_LIMIT,
      autoStart: true,
    });
    this.db.chainhook.events.on('missingStackerSet', ({ cycleNumber }) => {
      this.add({ cycleNumber });
    });
  }

  async stop() {
    this.abortController.abort();
    await this.queue.onIdle();
    this.queue.pause();
  }

  add({ cycleNumber }: { cycleNumber: number }): void {
    if (this.queuedCycleNumbers.has(cycleNumber) || this.abortController.signal.aborted) {
      return;
    }
    this.queuedCycleNumbers.add(cycleNumber);
    void this.queue
      .add(() => this.fetchStackerSet(cycleNumber))
      .catch(error => {
        if (!this.abortController.signal.aborted) {
          logger.error(error, `Unexpected stacker-set fetch queue error for cycle ${cycleNumber}`);
          this.queuedCycleNumbers.delete(cycleNumber);
        }
      });
  }

  private async fetchStackerSet(cycleNumber: number) {
    try {
      logger.info(`Fetching stacker set for cycle ${cycleNumber} from stacks-core RPC ...`);
      const stackerSet = await fetchStackerSet(cycleNumber, this.abortController.signal);
      if (stackerSet.prePox4) {
        logger.info(`Skipping stacker set update for cycle ${cycleNumber}, PoX-4 not yet active`);
        this.queuedCycleNumbers.delete(cycleNumber);
        return; // Exit job successful fetch
      }
      logger.info(`Fetched stacker set for cycle ${cycleNumber}, updating database ...`);
      const dbRewardSetSigners = rpcStackerSetToDbRewardSetSigners(
        stackerSet.response,
        cycleNumber
      );
      await this.db.chainhook.sqlWriteTransaction(async sql => {
        await this.db.chainhook.insertRewardSetSigners(sql, dbRewardSetSigners);
      });
      logger.info(
        `Updated database with stacker set for cycle ${cycleNumber}, ${dbRewardSetSigners.length} signers`
      );
      this.queuedCycleNumbers.delete(cycleNumber);
    } catch (error) {
      if (this.abortController.signal.aborted) {
        return; // Updater service was stopped, ignore error and exit loop
      }
      logger.warn(
        error,
        `Failed to fetch stacker set for cycle ${cycleNumber}, retrying in ${FETCH_STACKER_SET_RETRY_INTERVAL_MS}ms ...`
      );
      await sleep(FETCH_STACKER_SET_RETRY_INTERVAL_MS, this.abortController.signal);
      setImmediate(() => {
        this.queuedCycleNumbers.delete(cycleNumber);
        this.add({ cycleNumber });
      });
    }
  }
}

export function rpcStackerSetToDbRewardSetSigners(
  rpcResponse: RpcStackerSetResponse,
  cycleNumber: number
): DbRewardSetSigner[] {
  return rpcResponse.stacker_set.signers.map((entry, index) => {
    const rewardSetSigner: DbRewardSetSigner = {
      cycle_number: cycleNumber,
      signer_key: Buffer.from(entry.signing_key.replace(/^0x/, ''), 'hex'),
      signer_weight: entry.weight,
      signer_stacked_amount: entry.stacked_amt.toString(),
      slot_index: index,
    };
    return rewardSetSigner;
  });
}
