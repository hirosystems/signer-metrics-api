import { ENV } from '../env';
import { BasePgStore, PgSqlClient, connectPostgres, runMigrations } from '@hirosystems/api-toolkit';
import * as path from 'path';
import { ChainhookPgStore } from './chainhook/chainhook-pg-store';
import { DbRewardSetSigner } from './types';
import { normalizeHexString } from '../helpers';

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

  async getPoxInfo() {
    const result = await this.sql<
      { first_burnchain_block_height: number | null; reward_cycle_length: number | null }[]
    >`
      SELECT first_burnchain_block_height, reward_cycle_length FROM chain_tip
    `;
    return result[0];
  }

  async updatePoxInfo(poxInfo: {
    first_burnchain_block_height: number;
    reward_cycle_length: number;
  }): Promise<{ rowUpdated: boolean }> {
    // Update the first_burnchain_block_height and reward_cycle_length columns in the chain_tip table only if
    // they differ from the existing values. Return true if the row was updated, false otherwise.
    // Should only update the row if the values are null (i.e. the first time the values are set).
    const updateResult = await this.sql`
      UPDATE chain_tip 
      SET 
        first_burnchain_block_height = ${poxInfo.first_burnchain_block_height},
        reward_cycle_length = ${poxInfo.reward_cycle_length}
      WHERE
        first_burnchain_block_height IS DISTINCT FROM ${poxInfo.first_burnchain_block_height} 
        OR reward_cycle_length IS DISTINCT FROM ${poxInfo.reward_cycle_length}
    `;
    return { rowUpdated: updateResult.count > 0 };
  }

  async getRecentBlocks(limit: number, offset: number) {
    // The `blocks` table (and its associated block_signer_signatures table) is the source of truth that is
    // never missing blocks and does not contain duplicate rows per block.
    //
    // Each block has a known set of signer_keys which can be determined by first looking up the block's
    // cycle_number from the `block_proposals` table matching on block_hash, then using cycle_number to look
    // up the set of signer_keys from the reward_set_signers table (matching cycle_number with reward_cycle).
    //
    // From the set of known signer_keys, we can then determine the following state for each signer_key:
    //  * accepted_mined: the signer_key is included in the block_signer_signatures table for the
    //    associatedblock, and there exists an associated block_responses entry for the signer_key
    //    and block, where accepted=true.
    //  * accepted_excluded: the signer_key is not included in block_signer_signatures, however, there
    //    exists an associated block_responses entry for the signer_key and block, where accepted=true.
    //  * rejected: the signer_key is not included in block_signer_signatures, however, there exists
    //    an associated block_responses entry for the signer_key and block, where accepted=false.
    //  * missing: the signer_key is not included in block_signer_signatures table and there is associated
    //    block_responses entry.
    //
    // For the accepted_mined, accepted_excluded, and rejected states we can determine response_time_ms (how
    // long it took each signer to submit a block_response) by comparing block_proposal.received_at to
    // block_response.received_at.
    //
    // Fetch the latest N blocks from the `blocks` table ordered by block_height DESC, and for each block
    // determine the following additional fields:
    //  * cycle_number: the cycle_number from the associated block_proposal
    //  * block_proposal_time_ms: The received_at from the associated block_proposal
    //  * total_signer_count: The count of known signer_keys (look them up from reward_set_signers).
    //  * signer_accepted_mined_count: The count of accepted_mined signer states
    //  * signer_accepted_excluded_count: The count of accepted_excluded signer states
    //  * signer_rejected_count: The count of rejected signer states
    //  * signer_missing_count: The count of missing signer states
    //  * average_response_time_ms: The average signer response_time_ms
    //  * accepted_mined_stacked_amount: the total signer_stacked_amount of each signer in the accepted_mined state
    //  * accepted_excluded_stacked_amount: the total signer_stacked_amount of each signer in the accepted_excluded state
    //  * rejected_stacked_amount: the total signer_stacked_amount of each signer in the rejected state
    //  * missing_stacked_amount: the total signer_stacked_amount of each signer in the missing state
    //  * accepted_mined_weight: the total signer_weight of each signer in the accepted_mined state
    //  * accepted_excluded_weight: the total signer_weight of each signer in the accepted_excluded state
    //  * rejected_weight: the total signer_weight of each signer in the rejected state
    //  * missing_weight: the total signer_weight of each signer in the missing state

    const result = await this.sql<
      {
        block_height: number;
        block_hash: string;
        index_block_hash: string;
        burn_block_height: number;
        tenure_height: number;
        block_time: number;
        cycle_number: number | null;
        block_proposal_time_ms: string | null;
        total_signer_count: number;
        signer_accepted_mined_count: number;
        signer_accepted_excluded_count: number;
        signer_rejected_count: number;
        signer_missing_count: number;
        average_response_time_ms: number;
        accepted_mined_stacked_amount: string;
        accepted_excluded_stacked_amount: string;
        rejected_stacked_amount: string;
        missing_stacked_amount: string;
        accepted_mined_weight: number;
        accepted_excluded_weight: number;
        rejected_weight: number;
        missing_weight: number;
        chain_tip_block_height: number;
      }[]
    >`
      WITH latest_blocks AS (
        SELECT * FROM blocks
        ORDER BY block_height DESC
        LIMIT ${limit}
        OFFSET ${offset}
      ),
      block_signers AS (
        SELECT
          lb.id AS block_id,
          lb.block_height,
          lb.block_time,
          lb.block_hash,
          lb.index_block_hash,
          lb.burn_block_height,
          bp.reward_cycle as cycle_number,
          bp.received_at AS block_proposal_time_ms,
          rs.signer_key,
          COALESCE(rs.signer_weight, 0) AS signer_weight,
          COALESCE(rs.signer_stacked_amount, 0) AS signer_stacked_amount,
          CASE
            WHEN bss.id IS NOT NULL THEN 'accepted_mined'
            WHEN bss.id IS NULL AND fbr.accepted = TRUE THEN 'accepted_excluded'
            WHEN bss.id IS NULL AND fbr.accepted = FALSE THEN 'rejected'
            WHEN bss.id IS NULL AND fbr.id IS NULL THEN 'missing'
          END AS signer_status,
          EXTRACT(MILLISECOND FROM (fbr.received_at - bp.received_at)) AS response_time_ms
        FROM latest_blocks lb
        LEFT JOIN block_proposals bp ON lb.block_hash = bp.block_hash
        LEFT JOIN reward_set_signers rs ON bp.reward_cycle = rs.cycle_number
        LEFT JOIN block_signer_signatures bss ON lb.block_height = bss.block_height AND rs.signer_key = bss.signer_key
        LEFT JOIN block_responses fbr ON fbr.signer_key = rs.signer_key AND fbr.signer_sighash = lb.block_hash
      ),
      signer_state_aggregation AS (
        SELECT
          block_id,
          MAX(cycle_number) AS cycle_number,
          MAX(block_proposal_time_ms) AS block_proposal_time_ms,
          COUNT(signer_key) AS total_signer_count,
          COALESCE(COUNT(CASE WHEN signer_status = 'accepted_mined' THEN 1 END), 0) AS signer_accepted_mined_count,
          COALESCE(COUNT(CASE WHEN signer_status = 'accepted_excluded' THEN 1 END), 0) AS signer_accepted_excluded_count,
          COALESCE(COUNT(CASE WHEN signer_status = 'rejected' THEN 1 END), 0) AS signer_rejected_count,
          COALESCE(COUNT(CASE WHEN signer_status = 'missing' THEN 1 END), 0) AS signer_missing_count,
          COALESCE(AVG(response_time_ms) FILTER (WHERE signer_status IN ('accepted_mined', 'accepted_excluded', 'rejected')), 0) AS average_response_time_ms,
          COALESCE(SUM(CASE WHEN signer_status = 'accepted_mined' THEN signer_stacked_amount END), 0) AS accepted_mined_stacked_amount,
          COALESCE(SUM(CASE WHEN signer_status = 'accepted_excluded' THEN signer_stacked_amount END), 0) AS accepted_excluded_stacked_amount,
          COALESCE(SUM(CASE WHEN signer_status = 'rejected' THEN signer_stacked_amount END), 0) AS rejected_stacked_amount,
          COALESCE(SUM(CASE WHEN signer_status = 'missing' THEN signer_stacked_amount END), 0) AS missing_stacked_amount,
          COALESCE(SUM(CASE WHEN signer_status = 'accepted_mined' THEN signer_weight END), 0) AS accepted_mined_weight,
          COALESCE(SUM(CASE WHEN signer_status = 'accepted_excluded' THEN signer_weight END), 0) AS accepted_excluded_weight,
          COALESCE(SUM(CASE WHEN signer_status = 'rejected' THEN signer_weight END), 0) AS rejected_weight,
          COALESCE(SUM(CASE WHEN signer_status = 'missing' THEN signer_weight END), 0) AS missing_weight
        FROM block_signers
        GROUP BY block_id
      )
      SELECT
          lb.block_height,
          lb.block_hash,
          lb.index_block_hash,
          lb.burn_block_height,
          lb.tenure_height,
          EXTRACT(EPOCH FROM lb.block_time)::integer AS block_time,
          bsa.cycle_number,
          (EXTRACT(EPOCH FROM bsa.block_proposal_time_ms) * 1000)::bigint AS block_proposal_time_ms,
          bsa.total_signer_count::integer,
          bsa.signer_accepted_mined_count::integer,
          bsa.signer_accepted_excluded_count::integer,
          bsa.signer_rejected_count::integer,
          bsa.signer_missing_count::integer,
          ROUND(bsa.average_response_time_ms, 3)::float8 as average_response_time_ms,
          bsa.accepted_mined_stacked_amount,
          bsa.accepted_excluded_stacked_amount,
          bsa.rejected_stacked_amount,
          bsa.missing_stacked_amount,
          bsa.accepted_mined_weight::integer,
          bsa.accepted_excluded_weight::integer,
          bsa.rejected_weight::integer,
          bsa.missing_weight::integer,
          ct.block_height AS chain_tip_block_height
      FROM latest_blocks lb
      JOIN signer_state_aggregation bsa ON lb.id = bsa.block_id
      CROSS JOIN chain_tip ct
      ORDER BY lb.block_height DESC
    `;
    return result;
  }

  async getSignersForCycle(cycleNumber: number, limit: number, offset: number) {
    // TODO: add pagination
    // TODO: joins against the block_signer_signatures table to determine mined_blocks_* values

    // Get the list of signers for a given cycle number via signer_key in the reward_set_signers table,
    // where cycle_number equals the given cycle number. Then get all block proposals from the block_proposals
    // table where reward_cycle matches the given cycle number. Each block_proposal has many associated
    // entries from the block_responses table (where block_proposal.block_hash matches block_responses.signer_sighash).
    // For each block_proposal there is an associated list of block_responses (at most one block_responses entry per signer_key).
    // For each signer_key (from the reward_set_signers table) get:
    //  * Number of block_proposal entries that have an associated accepted=true block_responses entry.
    //  * Number of block_proposal entries that have an associated accepted=false block_response entry.
    //  * Number of block_proposal entries that are missing an associated block_response entry.
    //  * The average time duration between block_proposal.received_at and block_response.received_at.

    const dbRewardSetSigners = await this.sql<
      {
        signer_key: string;
        weight: number;
        weight_percentage: number;
        stacked_amount: string;
        stacked_amount_percentage: number;
        proposals_accepted_count: number;
        proposals_rejected_count: number;
        proposals_missed_count: number;
        average_response_time_ms: number;
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
        -- Select all proposals for the given cycle
        SELECT
          bp.block_hash,
          bp.block_height,
          bp.received_at AS proposal_received_at
        FROM block_proposals bp
        WHERE bp.reward_cycle = ${cycleNumber}
      ),
      response_data AS (
        -- Select responses associated with the proposals from the given cycle
        SELECT
          br.signer_key,
          br.signer_sighash,
          br.accepted,
          br.received_at,
          br.id
        FROM block_responses br
        JOIN proposal_data pd ON br.signer_sighash = pd.block_hash -- Only responses linked to selected proposals
      ),
      signer_proposal_data AS (
        -- Cross join signers with proposals and left join filtered responses
        SELECT
          sd.signer_key,
          pd.block_hash,
          pd.proposal_received_at,
          rd.accepted,
          rd.received_at AS response_received_at,
          EXTRACT(MILLISECOND FROM (rd.received_at - pd.proposal_received_at)) AS response_time_ms
        FROM signer_data sd
        CROSS JOIN proposal_data pd -- Cross join to associate all signers with all proposals
        LEFT JOIN response_data rd
          ON pd.block_hash = rd.signer_sighash
          AND sd.signer_key = rd.signer_key -- Match signers with their corresponding responses
      ),
      aggregated_data AS (
        -- Aggregate the proposal and response data by signer
        SELECT
          spd.signer_key,
          COUNT(CASE WHEN spd.accepted = true THEN 1 END)::integer AS proposals_accepted_count,
          COUNT(CASE WHEN spd.accepted = false THEN 1 END)::integer AS proposals_rejected_count,
          COUNT(CASE WHEN spd.accepted IS NULL THEN 1 END)::integer AS proposals_missed_count,
          ROUND(AVG(spd.response_time_ms), 3)::float8 AS average_response_time_ms
        FROM signer_proposal_data spd
        GROUP BY spd.signer_key
      )
      SELECT
        sd.signer_key,
        sd.signer_weight AS weight,
        sd.signer_stacked_amount AS stacked_amount,
        ROUND(sd.signer_weight * 100.0 / (SELECT SUM(signer_weight) FROM reward_set_signers WHERE cycle_number = ${cycleNumber}), 3)::float8 AS weight_percentage,
        ROUND(sd.signer_stacked_amount * 100.0 / (SELECT SUM(signer_stacked_amount) FROM reward_set_signers WHERE cycle_number = ${cycleNumber}), 3)::float8 AS stacked_amount_percentage,
        ad.proposals_accepted_count,
        ad.proposals_rejected_count,
        ad.proposals_missed_count,
        COALESCE(ad.average_response_time_ms, 0) AS average_response_time_ms
      FROM signer_data sd
      LEFT JOIN aggregated_data ad
        ON sd.signer_key = ad.signer_key
      ORDER BY sd.signer_weight DESC
    `;
    return dbRewardSetSigners;
  }

  async getSignerForCycle(cycleNumber: number, signerId: string) {
    const dbRewardSetSigner = await this.sql<
      {
        signer_key: string;
        weight: number;
        weight_percentage: number;
        stacked_amount: string;
        stacked_amount_percentage: number;
        stacked_amount_rank: number;
        proposals_accepted_count: number;
        proposals_rejected_count: number;
        proposals_missed_count: number;
        average_response_time_ms: number;
      }[]
    >`
      WITH signer_data AS (
        -- Fetch the specific signer for the given cycle
        SELECT
          rss.signer_key,
          rss.signer_weight,
          rss.signer_stacked_amount
        FROM reward_set_signers rss
        WHERE rss.cycle_number = ${cycleNumber}
          AND rss.signer_key = ${normalizeHexString(signerId)}
      ),
      proposal_data AS (
        -- Select all proposals for the given cycle
        SELECT
          bp.block_hash,
          bp.block_height,
          bp.received_at AS proposal_received_at
        FROM block_proposals bp
        WHERE bp.reward_cycle = ${cycleNumber}
      ),
      response_data AS (
        -- Select all responses for the proposals in the given cycle
        SELECT
          br.signer_key,
          br.signer_sighash,
          br.accepted,
          br.received_at,
          br.id
        FROM block_responses br
        JOIN proposal_data pd ON br.signer_sighash = pd.block_hash
        WHERE br.signer_key = ${normalizeHexString(signerId)} -- Filter for the specific signer
      ),
      signer_proposal_data AS (
        -- Cross join the specific signer with proposals and left join filtered responses
        SELECT
          sd.signer_key,
          pd.block_hash,
          pd.proposal_received_at,
          rd.accepted,
          rd.received_at AS response_received_at,
          EXTRACT(MILLISECOND FROM (rd.received_at - pd.proposal_received_at)) AS response_time_ms
        FROM signer_data sd
        CROSS JOIN proposal_data pd
        LEFT JOIN response_data rd
          ON pd.block_hash = rd.signer_sighash
          AND sd.signer_key = rd.signer_key -- Match signers with their corresponding responses
      ),
      aggregated_data AS (
        -- Aggregate the proposal and response data for the specific signer
        SELECT
          spd.signer_key,
          COUNT(CASE WHEN spd.accepted = true THEN 1 END)::integer AS proposals_accepted_count,
          COUNT(CASE WHEN spd.accepted = false THEN 1 END)::integer AS proposals_rejected_count,
          COUNT(CASE WHEN spd.accepted IS NULL THEN 1 END)::integer AS proposals_missed_count,
          ROUND(AVG(spd.response_time_ms), 3)::float8 AS average_response_time_ms
        FROM signer_proposal_data spd
        GROUP BY spd.signer_key
      ),
      signer_rank AS (
        -- Calculate the rank of the signer based on stacked amount
        SELECT
          signer_key,
          RANK() OVER (ORDER BY signer_stacked_amount DESC) AS stacked_amount_rank
        FROM reward_set_signers
        WHERE cycle_number = ${cycleNumber}
      )
      SELECT
        encode(sd.signer_key, 'hex') AS signer_key,
        sd.signer_weight AS weight,
        sd.signer_stacked_amount AS stacked_amount,
        ROUND(sd.signer_weight * 100.0 / (SELECT SUM(signer_weight) FROM reward_set_signers WHERE cycle_number = ${cycleNumber}), 3)::float8 AS weight_percentage,
        ROUND(sd.signer_stacked_amount * 100.0 / (SELECT SUM(signer_stacked_amount) FROM reward_set_signers WHERE cycle_number = ${cycleNumber}), 3)::float8 AS stacked_amount_percentage,
        sr.stacked_amount_rank,
        ad.proposals_accepted_count,
        ad.proposals_rejected_count,
        ad.proposals_missed_count,
        COALESCE(ad.average_response_time_ms, 0) AS average_response_time_ms
      FROM signer_data sd
      LEFT JOIN aggregated_data ad
        ON sd.signer_key = ad.signer_key
      LEFT JOIN signer_rank sr
        ON sd.signer_key = sr.signer_key
    `;
    return dbRewardSetSigner[0];
  }
}
