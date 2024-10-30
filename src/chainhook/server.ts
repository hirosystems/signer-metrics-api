import {
  ChainhookEventObserver,
  ChainhookNodeOptions,
  EventObserverOptions,
  EventObserverPredicate,
  Payload,
  StacksPayload,
} from '@hirosystems/chainhook-client';
import { PgStore } from '../pg/pg-store';
import { ENV } from '../env';
import { logger } from '@hirosystems/api-toolkit';

export async function startChainhookServer(args: { db: PgStore }): Promise<ChainhookEventObserver> {
  const blockHeight = await args.db.getChainTipBlockHeight();
  logger.info(`ChainhookServer is at block ${blockHeight}`);

  const predicates: EventObserverPredicate[] = [];
  if (ENV.CHAINHOOK_AUTO_PREDICATE_REGISTRATION) {
    predicates.push({
      name: 'signer-monitor-api-signer-messages',
      version: 1,
      chain: 'stacks',
      networks: {
        [ENV.NETWORK]: {
          startBlock: 1,
          if_this: {
            scope: 'signer_message',
            after_timestamp: 1,
          },
        },
      },
    });

    const startHeight = ENV.NETWORK === 'mainnet' ? 171800 : 1;
    const startBlock = Math.max(startHeight, blockHeight);
    predicates.push({
      name: 'signer-monitor-api-blocks',
      version: 1,
      chain: 'stacks',
      networks: {
        [ENV.NETWORK]: {
          start_block: startBlock,
          if_this: {
            scope: 'block_height',
            higher_than: startHeight,
          },
        },
      },
    });
  }

  const observer: EventObserverOptions = {
    hostname: ENV.API_HOST,
    port: ENV.EVENT_PORT,
    auth_token: ENV.CHAINHOOK_NODE_AUTH_TOKEN,
    external_base_url: `http://${ENV.EXTERNAL_HOSTNAME}`,
    wait_for_chainhook_node: ENV.CHAINHOOK_AUTO_PREDICATE_REGISTRATION,
    validate_chainhook_payloads: false,
    body_limit: ENV.EVENT_SERVER_BODY_LIMIT,
    predicate_disk_file_path: ENV.CHAINHOOK_PREDICATE_PATH,
    // TODO: bug around predicate re-registration
    // predicate_health_check_interval_ms: 300_000,
    node_type: 'chainhook',
  };
  const chainhook: ChainhookNodeOptions = {
    base_url: `http://${ENV.CHAINHOOK_NODE_RPC_HOST}:${ENV.CHAINHOOK_NODE_RPC_PORT}`,
  };
  const server = new ChainhookEventObserver(observer, chainhook);
  await server.start(predicates, async (payload: Payload) => {
    logger.info(
      `ChainhookServer received ${
        payload.chainhook.is_streaming_blocks ? 'streamed' : 'replay'
      } payload from predicate ${payload.chainhook.uuid}`
    );
    await args.db.chainhook.processPayload(payload as StacksPayload);
  });
  return server;
}

export async function closeChainhookServer(server: ChainhookEventObserver) {
  await server.close();
}
