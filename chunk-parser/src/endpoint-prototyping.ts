// Pseudo-schema for anticipated API endpoints
type Endpoints = [
  {
    /** List most recent blocks and aggregate signer information for each block */
    url: '/v1/blocks';
    response: {
      total: number;
      next_cursor: string;
      prev_cursor: string;
      cursor: string;
      results: Array<{
        block_hash: string;
        block_height: number;
        index_block_hash: string;
        burn_block_height: number;

        /** Total number of signers expected for this block */
        total_signer_count: number;
        /** Number of signers that submitted a approval for this block */
        signer_accepted_count: number;
        /** Number of signers that submitted a rejection for this block */
        signer_rejected_count: number;
        /** Number of signers that failed to submit any response/vote for this block */
        signer_missing_count: number;

        /** Average time duration (in seconds) taken by signers to submit a response for this block (tracked best effort) */
        average_signer_response_time: number;
        /** Unix timestamp of when the block was first proposed (tracked best effort) */
        block_proposal_time: number;

        /** Sum of total STX stacked of signers who approved the block */
        accepted_stacked_amount: number;
        /** Sum of total STX stacked of signers who rejected the block */
        rejected_stacked_amount: number;
        /** Sum of total STX stacked of missing signers */
        missing_stacked_amount: number;

        /** Sum of voting weight of signers who approved the block (based on slots allocated to each signer proportional to stacked amount) */
        accepted_weight: number;
        /** Sum of voting weight of signers who rejected the block */
        rejected_weight: number;
        /** Sum of voting weight of missing signers */
        missing_weight: number;
      }>;
    };
  },
  {
    url: '/v1/blocks/{block_hash_or_height}';
    response: {
      // (Same as above, but for a single block)
    };
  },
  {
    /** List signer information for a given block */
    url: '/v1/blocks/{block_hash_or_height}/signers';
    response: {
      total: number;
      next_cursor: string;
      prev_cursor: string;
      cursor: string;
      results: Array<{
        signer_key: string;
        vote: 'accept' | 'reject' | 'missing';
        /** Voting weight of this signer (based on slots allocated which is proportional to stacked amount) */
        weight: number;
        /** Total STX stacked associated with this signer */
        stacked_amount: number;
        /** Unix timestamp of when the block was first proposed (tracked best effort) */
        block_proposal_time: number;
        /** Unix timestamp of when this signer submission was received (tracked best effort) */
        receive_time: number;
        /** Time duration (in seconds) taken to submit a response for this block (tracked best effort). Null if vote is `missing` */
        response_time?: number;
        /** Set only if vote was `reject` */
        reject_code?: 'ValidationFailed' | 'ConnectivityIssues' | 'RejectedInPriorRound' | 'NoSortitionView' | 'SortitionViewMismatch' | 'TestingDirective';
        /** Set only if `reject_code` is `ValidationFailed` */
        validation_failed_code?: 'BadBlockHash' | 'BadTransaction' | 'InvalidBlock' | 'ChainstateError' | 'UnknownParent' | 'NonCanonicalTenure' | 'NoSuchTenure';
        /** If the vote was included in the block (miner can assembly blocks as soon as signature threshold is met which can incidentally exclude votes) */
        included_in_block: boolean;
      }>;
    }
  },
  {
    url: '/v1/cycle/{cycle_number}/signers';
    response: {
      total: number;
      next_cursor: string;
      prev_cursor: string;
      cursor: string;
      results: Array<{
        signer_key: string;

        /** Voting weight of this signer (based on slots allocated which is proportional to stacked amount) */
        weight: number;
        /** Voting weight percent (weight / total_weight) */
        weight_percentage: number;
        /** Total STX stacked associated with this signer */
        stacked_amount: number;
        /** Stacked amount percent (stacked_amount / total_stacked_amount) */
        stacked_amount_percent: number;

        proposals_accepted_count: number;
        proposals_rejected_count: number;
        proposals_missed_count: number;

        /** Number of mined blocks where signer approved and was included */
        mined_blocks_accepted_included_count: number;
        /** Number of mined blocks where signer approved but was not included */
        mined_blocks_accepted_excluded_count: number;
        /** Number of mined blocks where signer rejected */
        mined_blocks_rejected_count: number;
        /** Number of mined blocks where signer was missing (did not submit an accept or reject response) */
        mined_blocks_missing_count: number;

        /** Time duration (in seconds) taken to submit responses to block proposals (tracked best effort) */
        average_response_time: number;
      }>;
    }
  },
  {
    /** List of most recent signer responses */
    url: '/v1/signer-responses';
    response: {
      total: number;
      next_cursor: string;
      prev_cursor: string;
      cursor: string;
      results: Array<{
        block_hash: string;
        block_height: number;
        index_block_hash: string;
        burn_block_height: number;
        signer_key: string;
        vote: 'accept' | 'reject';
        /** Voting weight of this signer (based on slots allocated which is proportional to stacked amount) */
        weight: number;
        /** Total STX stacked associated with this signer */
        stacked_amount: number;
        /** Unix timestamp of when the block was first proposed (tracked best effort) */
        block_proposal_time: number;
        /** Unix timestamp of when this signer submission was received (tracked best effort) */
        receive_time: number;
        /** Time duration (in seconds) taken to submit a response for this block (tracked best effort) */
        response_time: number;
        /** Set only if vote was `reject` */
        reject_code?: 'ValidationFailed' | 'ConnectivityIssues' | 'RejectedInPriorRound' | 'NoSortitionView' | 'SortitionViewMismatch' | 'TestingDirective';
        /** Set only if `reject_code` is `ValidationFailed` */
        validation_failed_code?: 'BadBlockHash' | 'BadTransaction' | 'InvalidBlock' | 'ChainstateError' | 'UnknownParent' | 'NonCanonicalTenure' | 'NoSuchTenure';
        /** If the vote was included in the block (miner can assembly blocks as soon as signature threshold is met which can incidentally exclude votes) */
        included_in_block: boolean;
      }>;
    };
  }
];


/*
## Notes

I think by default these endpoints will return data only for canonical blocks _and_ blocks that have been accepted.
In the future, we can have something like a query parameter or separate endpoints to include data for non-canonical
and/or rejected blocks. For now seems out-of-scope for mvp.

Even though we will be receiving responses from signers in real-time, I think these will only show data for blocks
that have been fully confirmed i.e. from a /new_block event. To do otherwise seems like it would imply that response
data has an inaccurate level of finality. However, we could have an endpoint (or query param toggle) to show real-time
voting responses from signers that have not yet been confirmed in a block (probably ouf-of-scope for mvp).

*/
