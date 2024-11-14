import {
  BasePgStore,
  BasePgStoreModule,
  logger as defaultLogger,
  PgSqlClient,
} from '@hirosystems/api-toolkit';
import { EventEmitter } from 'node:events';
import { DbWriteEvents } from '../chainhook/chainhook-pg-store';
import { BlockProposalEventArgs, BlockResponseEventArgs } from '../types';

export type DbListenEvents = EventEmitter<{
  blockProposal: [BlockProposalEventArgs];
  blockResponse: [BlockResponseEventArgs];
}>;

const SQL_NOTIFIY_BLOCK_PROPOSAL_CHANNEL = 'block_proposal';
const SQL_NOTIFIY_BLOCK_RESPONSE_CHANNEL = 'block_response';

export class NotificationPgStore extends BasePgStoreModule {
  readonly events: DbListenEvents = new EventEmitter();
  readonly logger = defaultLogger.child({ module: 'NotificationPgStore' });
  readonly dbWriteEvents: DbWriteEvents;
  readonly rawSqlClient: PgSqlClient;

  constructor(db: BasePgStore, rawSqlClient: PgSqlClient, dbWriteEvents: DbWriteEvents) {
    super(db);
    this.rawSqlClient = rawSqlClient;
    this.dbWriteEvents = dbWriteEvents;
    this.subscribeToDbWriteEvents();
  }

  public async subscribeToDbListenEvents() {
    await this.rawSqlClient.listen(
      SQL_NOTIFIY_BLOCK_PROPOSAL_CHANNEL,
      payload => {
        const json = JSON.parse(payload) as BlockProposalEventArgs;
        setTimeout(() => this.events.emit('blockProposal', json));
      },
      () => {
        this.logger.info('Subscribed to sql.listen block proposal notifications');
      }
    );
    await this.rawSqlClient.listen(
      SQL_NOTIFIY_BLOCK_RESPONSE_CHANNEL,
      payload => {
        const json = JSON.parse(payload) as BlockResponseEventArgs;
        setTimeout(() => this.events.emit('blockResponse', json));
      },
      () => {
        this.logger.info('Subscribed to sql.listen block response notifications');
      }
    );
  }

  private subscribeToDbWriteEvents() {
    this.dbWriteEvents.on('blockProposal', blockProposal => {
      void this.sqlNotifyBlockProposal(blockProposal);
    });
    this.dbWriteEvents.on('blockResponse', blockResponse => {
      void this.sqlNotifyBlockResponse(blockResponse);
    });
  }

  private async sqlNotifyBlockProposal(blockProposal: BlockProposalEventArgs) {
    try {
      await this.rawSqlClient.notify(
        SQL_NOTIFIY_BLOCK_PROPOSAL_CHANNEL,
        JSON.stringify(blockProposal)
      );
    } catch (error) {
      this.logger.error(error, 'Failed to sql.notify block proposal');
    }
  }

  private async sqlNotifyBlockResponse(blockResponse: BlockProposalEventArgs) {
    try {
      await this.rawSqlClient.notify(
        SQL_NOTIFIY_BLOCK_RESPONSE_CHANNEL,
        JSON.stringify(blockResponse)
      );
    } catch (error) {
      this.logger.error(error, 'Failed to sql.notify block response');
    }
  }
}
