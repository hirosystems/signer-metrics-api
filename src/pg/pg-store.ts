import { ENV } from '../env';
import { BasePgStore, PgSqlClient, connectPostgres, runMigrations } from '@hirosystems/api-toolkit';
import * as path from 'path';
import { ChainhookPgStore } from './chainhook/chainhook-pg-store';
import { DbRewardSetSigner } from './types';

export const MIGRATIONS_DIR = path.join(__dirname, '../../migrations');

/**
 * Connects and queries the Signer Monitor's local postgres DB.
 */
export class PgStore extends BasePgStore {
  readonly chainhook: ChainhookPgStore;

  static async connect(opts?: { skipMigrations: boolean }): Promise<PgStore> {
    const pgConfig = {
      host: ENV.PGHOST,
      port: ENV.PGPORT,
      user: ENV.PGUSER,
      password: ENV.PGPASSWORD,
      database: ENV.PGDATABASE,
    };
    const sql = await connectPostgres({
      usageName: 'signer-monitor-pg-store',
      connectionArgs: pgConfig,
      connectionConfig: {
        poolMax: ENV.PG_CONNECTION_POOL_MAX,
        idleTimeout: ENV.PG_IDLE_TIMEOUT,
        maxLifetime: ENV.PG_MAX_LIFETIME,
      },
    });
    if (opts?.skipMigrations !== true) {
      await runMigrations(MIGRATIONS_DIR, 'up');
    }
    return new PgStore(sql);
  }

  constructor(sql: PgSqlClient) {
    super(sql);
    this.chainhook = new ChainhookPgStore(this);
  }

  async getChainTipBlockHeight(): Promise<number> {
    const result = await this.sql<{ block_height: number }[]>`SELECT block_height FROM chain_tip`;
    return result[0].block_height;
  }

  async getSignersForCycle(cycleNumber: number, limit: number, offset: number) {
    // TODO: add pagination
    // TODO: joins against the block_signer_signatures table to determine mined_blocks_* values
    const dbRewardSetSigners = await this.sql<
      {
        signer_key: string;
        weight: number;
        weight_percentage: number;
        stacked_amount: number;
        stacked_amount_percentage: number;
        proposals_accepted_count: number;
        proposals_rejected_count: number;
        proposals_missed_count: number;
        average_response_time: number;
      }[]
    >`
      WITH signer_data AS (
        -- Fetch the signers for the given cycle
        SELECT 
          rss.signer_key,
          rss.signer_weight,
          rss.signer_stacked_amount
        FROM reward_set_signers rss
        WHERE rss.cycle_number = ${cycleNumber}
      ),
      proposal_data AS (
        -- Fetch proposals for the given cycle
        SELECT 
          bp.block_hash, 
          bp.block_height, 
          bp.received_at AS proposal_received_at, 
          br.signer_key,
          br.accepted,
          br.received_at AS response_received_at,
          EXTRACT(MILLISECOND FROM (br.received_at - bp.received_at)) AS response_time_ms
        FROM block_proposals bp
        LEFT JOIN block_responses br
          ON bp.block_hash = br.signer_sighash -- Match the block proposal to the response
        WHERE bp.reward_cycle = ${cycleNumber}
      ),
      aggregated_data AS (
        -- Aggregate the proposal and response data by signer
        SELECT
          sd.signer_key,
          COUNT(CASE WHEN pd.accepted = true THEN 1 END)::integer AS proposals_accepted_count,
          COUNT(CASE WHEN pd.accepted = false THEN 1 END)::integer AS proposals_rejected_count,
          COUNT(CASE WHEN pd.accepted IS NULL THEN 1 END)::integer AS proposals_missed_count,
          AVG(pd.response_time_ms) AS average_response_time
        FROM signer_data sd
        LEFT JOIN proposal_data pd
          ON sd.signer_key = pd.signer_key -- Join on the signer_key to match responses
        GROUP BY sd.signer_key
      )
      SELECT 
        sd.signer_key,
        sd.signer_weight AS weight,
        sd.signer_stacked_amount AS stacked_amount,
        ROUND(sd.signer_weight * 100.0 / (SELECT SUM(signer_weight) FROM reward_set_signers WHERE cycle_number = ${cycleNumber}), 4)::float8 AS weight_percentage,
        ROUND(sd.signer_stacked_amount * 100.0 / (SELECT SUM(signer_stacked_amount) FROM reward_set_signers WHERE cycle_number = ${cycleNumber}), 4)::float8 AS stacked_amount_percentage,
        ad.proposals_accepted_count,
        ad.proposals_rejected_count,
        ad.proposals_missed_count,
        COALESCE(ad.average_response_time, 0) AS average_response_time
      FROM signer_data sd
      LEFT JOIN aggregated_data ad
        ON sd.signer_key = ad.signer_key
      ORDER BY sd.signer_weight DESC
    `;
    return dbRewardSetSigners;
  }
}
