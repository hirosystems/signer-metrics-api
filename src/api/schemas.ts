import { SwaggerOptions } from '@fastify/swagger';
import { SERVER_VERSION } from '@hirosystems/api-toolkit';
import { Static, TSchema, Type } from '@sinclair/typebox';

export const OpenApiSchemaOptions: SwaggerOptions = {
  openapi: {
    info: {
      title: 'Signer Monitor API',
      description: 'Welcome to the API reference overview for the Signer Monitor API.',
      version: SERVER_VERSION.tag,
    },
    externalDocs: {
      url: 'https://github.com/hirosystems/signer-monitor',
      description: 'Source Repository',
    },
    servers: [
      {
        url: 'https://api.hiro.so/',
        description: 'mainnet',
      },
      {
        url: 'https://api.testnet.hiro.so/',
        description: 'testnet',
      },
    ],
    tags: [
      {
        name: 'Status',
        description: 'Service status endpoints',
      },
    ],
  },
  exposeRoute: true,
};

export const ApiStatusResponse = Type.Object(
  {
    server_version: Type.String({ examples: ['signer-monitor-api v0.0.1 (master:a1b2c3)'] }),
    status: Type.String({ examples: ['ready'] }),
    chain_tip: Type.Object({
      block_height: Type.Integer({ examples: [163541] }),
    }),
  },
  { title: 'Api Status Response' }
);

export const BlocksEntrySignerDataSchema = Type.Object(
  {
    cycle_number: Type.Integer(),
    total_signer_count: Type.Integer({
      description: 'Total number of signers expected for this block',
    }),

    accepted_count: Type.Integer({
      description: 'Number of signers that submitted an approval for this block',
    }),
    rejected_count: Type.Integer({
      description: 'Number of signers that submitted a rejection for this block',
    }),
    missing_count: Type.Integer({
      description: 'Number of signers that failed to submit any response/vote for this block',
    }),

    accepted_excluded_count: Type.Integer({
      description:
        'Number of signers that submitted an approval but where not included in time by the miner (this is a subset of the accepted_count)',
    }),

    average_response_time_ms: Type.Number({
      description:
        'Average time duration (in milliseconds) taken by signers to submit a response for this block (tracked best effort)',
    }),
    block_proposal_time_ms: Type.Number({
      description:
        'Unix timestamp in milliseconds of when the block was first proposed (tracked best effort)',
    }),

    accepted_stacked_amount: Type.String({
      description: 'Sum of total STX stacked of signers who approved the block',
    }),
    rejected_stacked_amount: Type.String({
      description: 'Sum of total STX stacked of signers who rejected the block',
    }),
    missing_stacked_amount: Type.String({
      description: 'Sum of total STX stacked of missing signers',
    }),

    accepted_weight: Type.Integer({
      description:
        'Sum of voting weight of signers who approved the block (based on slots allocated to each signer proportional to stacked amount)',
    }),
    rejected_weight: Type.Integer({
      description: 'Sum of voting weight of signers who rejected the block',
    }),
    missing_weight: Type.Integer({
      description: 'Sum of voting weight of missing signers',
    }),
  },
  { description: 'Signer data can by null if it was not detected by the monitor service' }
);

export type BlocksEntrySignerData = Static<typeof BlocksEntrySignerDataSchema>;

export const BlockEntrySchema = Type.Object({
  block_height: Type.Integer(),
  block_hash: Type.String(),
  block_time: Type.Integer({
    description: 'Unix timestamp in seconds of when the block was mined',
  }),
  index_block_hash: Type.String(),
  burn_block_height: Type.Integer(),
  tenure_height: Type.Integer(),
  signer_data: Type.Optional(BlocksEntrySignerDataSchema),
});
export type BlocksEntry = Static<typeof BlockEntrySchema>;
