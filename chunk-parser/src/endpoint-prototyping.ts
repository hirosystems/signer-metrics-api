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
      }>;
    };
  }
];
