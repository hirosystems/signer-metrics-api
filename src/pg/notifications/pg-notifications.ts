import {
  BasePgStore,
  BasePgStoreModule,
  batchIterate,
  logger as defaultLogger,
  PgSqlClient,
} from '@hirosystems/api-toolkit';
import { EventEmitter } from 'node:events';
import { DbWriteEvents } from '../chainhook/chainhook-pg-store';
import { SignerMessagesEventPayload } from '../types';

export type DbListenEvents = EventEmitter<{
  signerMessages: [SignerMessagesEventPayload];
}>;

const SQL_NOTIFIY_BLOCK_PROPOSAL_CHANNEL = 'block_proposal';

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
    this.subscribeToDbListenEvents();
  }

  private subscribeToDbWriteEvents() {
    this.dbWriteEvents.on('signerMessages', msg => {
      // Split the messages into batches to avoid exceeding the maximum pg notify payload size
      for (const batch of batchIterate(msg, 25, false)) {
        this.rawSqlClient
          .notify(SQL_NOTIFIY_BLOCK_PROPOSAL_CHANNEL, JSON.stringify(batch))
          .catch((error: unknown) => {
            this.logger.error(error, 'Failed to sql.notify signerMessages');
          });
      }
    });
  }

  private subscribeToDbListenEvents() {
    this.rawSqlClient
      .listen(
        SQL_NOTIFIY_BLOCK_PROPOSAL_CHANNEL,
        payload => {
          const signerMessages = JSON.parse(payload) as SignerMessagesEventPayload;
          setTimeout(() => this.events.emit('signerMessages', signerMessages));
        },
        () => {
          this.logger.info('Subscribed to sql.listen block proposal notifications');
        }
      )
      .catch((error: unknown) => {
        this.logger.error(error, 'Failed to sql.listen block proposal notifications');
      });
  }
}
