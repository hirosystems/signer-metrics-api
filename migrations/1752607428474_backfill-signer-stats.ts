/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    UPDATE reward_set_signers rss
    SET
      signer_stacked_amount_percentage = (rss.signer_stacked_amount::numeric / total.total_stacked),
      signer_weight_percentage = (rss.signer_weight::float / total.total_weight),
      signer_stacked_amount_rank = ranked.rank
    FROM
      (SELECT cycle_number, SUM(signer_stacked_amount::numeric) as total_stacked, SUM(signer_weight) as total_weight FROM reward_set_signers GROUP BY cycle_number) total,
      (SELECT signer_key, cycle_number, RANK() OVER (PARTITION BY cycle_number ORDER BY signer_stacked_amount::numeric DESC, signer_key ASC) as rank FROM reward_set_signers) ranked
    WHERE rss.cycle_number = total.cycle_number AND rss.cycle_number = ranked.cycle_number AND rss.signer_key = ranked.signer_key
  `);
  pgm.sql(`
    UPDATE reward_set_signers rss
    SET
      proposals_accepted_count = COALESCE(agg.accepted_count, 0),
      proposals_rejected_count = COALESCE(agg.rejected_count, 0),
      proposals_missed_count = COALESCE(agg.missed_count, 0),
      average_response_time_ms = COALESCE(agg.avg_ms, 0),
      last_response_time = agg.last_time,
      last_response_metadata_server_version = agg.last_version
    FROM
      (
        WITH signer_proposal_data AS (
          SELECT
            rss.signer_key,
            rss.cycle_number,
            bp.block_hash,
            bp.received_at AS proposal_received_at,
            br.accepted,
            br.received_at AS response_received_at,
            br.metadata_server_version,
            EXTRACT(EPOCH FROM (br.received_at - bp.received_at)) * 1000 AS response_time_ms
          FROM reward_set_signers rss
          JOIN block_proposals bp ON bp.reward_cycle = rss.cycle_number
          LEFT JOIN block_responses br ON br.signer_sighash = bp.block_hash AND br.signer_key = rss.signer_key
        ),
        aggregated_data AS (
          SELECT
            signer_key,
            cycle_number,
            COUNT(CASE WHEN accepted = true THEN 1 END)::integer AS accepted_count,
            COUNT(CASE WHEN accepted = false THEN 1 END)::integer AS rejected_count,
            COUNT(CASE WHEN accepted IS NULL THEN 1 END)::integer AS missed_count,
            ROUND(AVG(response_time_ms), 3)::float8 AS avg_ms
          FROM signer_proposal_data
          GROUP BY signer_key, cycle_number
        ),
        latest_response AS (
          SELECT
            signer_key,
            cycle_number,
            MAX(response_received_at) AS last_time,
            (array_agg(metadata_server_version ORDER BY response_received_at DESC))[1] AS last_version
          FROM signer_proposal_data
          WHERE response_received_at IS NOT NULL
          GROUP BY signer_key, cycle_number
        )
        SELECT
          agg.signer_key,
          agg.cycle_number,
          agg.accepted_count,
          agg.rejected_count,
          agg.missed_count,
          agg.avg_ms,
          lr.last_time,
          lr.last_version
        FROM aggregated_data agg
        LEFT JOIN latest_response lr ON lr.signer_key = agg.signer_key AND lr.cycle_number = agg.cycle_number
      ) agg
    WHERE rss.signer_key = agg.signer_key AND rss.cycle_number = agg.cycle_number
  `);
  pgm.dropTable('reward_set_signers_old-no-slot-index');
}
