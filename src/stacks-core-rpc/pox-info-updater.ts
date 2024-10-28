import { logger } from '@hirosystems/api-toolkit';
import { PgStore } from '../pg/pg-store';
import { sleep } from '../helpers';
import { fetchRpcPoxInfo, getStacksNodeUrl } from './stacks-core-rpc-client';

// How long to wait between PoX rpc fetches when the database already has PoX info
const POX_INFO_UPDATE_INTERVAL_MS = 30000;

// How long to wait between retries when fetching PoX info fails and the database is missing PoX info
const POX_INFO_UPDATE_CRITICAL_RETRY_INTERVAL_MS = 3000;

export function startPoxInfoUpdater(args: { db: PgStore }) {
  const abortController = new AbortController();
  void runPoxInfoBackgroundJob(args.db, abortController.signal);
  return {
    close: () => abortController.abort(),
  };
}

async function runPoxInfoBackgroundJob(db: PgStore, abortSignal: AbortSignal) {
  let isDbMissingPoxInfo: boolean | null = null;
  while (!abortSignal.aborted) {
    try {
      // Check if isDbMissingPoxInfo is null, which means we haven't checked the database yet
      if (isDbMissingPoxInfo === null) {
        const dbPoxInfo = await db.getPoxInfo();
        isDbMissingPoxInfo = dbPoxInfo.reward_cycle_length === null;
      }

      if (isDbMissingPoxInfo) {
        logger.info(
          `Database is missing PoX info, fetching from stacks-core RPC ${getStacksNodeUrl()}`
        );
      }
      const rpcPoxInfo = await fetchRpcPoxInfo(abortSignal);
      if (isDbMissingPoxInfo) {
        logger.info(
          `Fetched PoX info from stacks-core RPC: first_burnchain_block_height=${rpcPoxInfo.first_burnchain_block_height}, reward_cycle_length=${rpcPoxInfo.reward_cycle_length}, storing in database`
        );
      }
      await db.updatePoxInfo(rpcPoxInfo);
      isDbMissingPoxInfo = false;
      await sleep(POX_INFO_UPDATE_INTERVAL_MS, abortSignal);
    } catch (error) {
      if (abortSignal.aborted) {
        return;
      }
      if (isDbMissingPoxInfo) {
        logger.error(
          error,
          `Failed to fetch PoX info from stacks-core RPC, retrying in ${POX_INFO_UPDATE_CRITICAL_RETRY_INTERVAL_MS}ms ...`
        );
        await sleep(POX_INFO_UPDATE_CRITICAL_RETRY_INTERVAL_MS, abortSignal);
      } else {
        logger.warn(
          error,
          `Failed to update PoX info (database already has PoX info, this is not critical)`
        );
        await sleep(POX_INFO_UPDATE_INTERVAL_MS, abortSignal);
      }
    }
  }
}
