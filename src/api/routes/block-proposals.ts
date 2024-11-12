import { Type, TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { FastifyPluginCallback } from 'fastify';
import { Server } from 'http';
import BigNumber from 'bignumber.js';
import { differenceInMilliseconds } from 'date-fns';
import {
  BlockEntrySchema,
  BlockParamsSchema,
  BlockProposalsEntry,
  BlockProposalSignerData,
  BlockProposalsResponseSchema,
  BlocksEntry,
  BlocksEntrySignerData,
  BlocksResponseSchema,
  cleanBlockHeightOrHashParam,
  parseBlockParam,
} from '../schemas';
import { NotFoundError } from '../errors';

export const BlockProposalsRoutes: FastifyPluginCallback<
  Record<never, never>,
  Server,
  TypeBoxTypeProvider
> = (fastify, _options, done) => {
  fastify.get(
    '/v1/block_proposals',
    {
      schema: {
        operationId: 'getBlockProposals',
        summary: 'Signer information for most recent block proposals',
        description: 'Signer information for most recent block proposals',
        tags: ['Blocks Proposals'],
        querystring: Type.Object({
          limit: Type.Integer({
            description: 'Number of results to return',
            default: 25,
            minimum: 1,
            maximum: 50,
          }),
          offset: Type.Integer({
            description: 'Number of results to skip',
            default: 0,
          }),
        }),
        response: {
          200: BlockProposalsResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await fastify.db.sqlTransaction(async sql => {
        const results = await fastify.db.getRecentBlockProposals({
          sql,
          limit: request.query.limit,
          offset: request.query.offset,
        });
        const blockProposals = results.map(r => {
          const signerData = r.signer_data.map(s => {
            const data: BlockProposalSignerData = {
              signer_key: s.signer_key,
              slot_index: s.slot_index,
              response: s.response,
              weight: s.weight,
              weight_percentage: Number(
                BigNumber(s.weight).div(r.total_signer_weight).times(100).toFixed(3)
              ),
              stacked_amount: s.stacked_amount,
              version: s.version,
              received_at: s.received_at ? new Date(s.received_at).toISOString() : null,
              response_time_ms: s.received_at
                ? differenceInMilliseconds(new Date(s.received_at), r.received_at)
                : null,
              reason_string: s.reason_string,
              reason_code: s.reason_code,
              reject_code: s.reject_code,
            };
            return data;
          });

          const entry: BlockProposalsEntry = {
            received_at: r.received_at.toISOString(),
            block_height: r.block_height,
            block_hash: r.block_hash,
            index_block_hash: r.index_block_hash,
            burn_block_height: r.burn_block_height,
            block_time: r.block_time,
            cycle_number: r.cycle_number,
            status: r.status,

            // cycle data
            total_signer_count: r.total_signer_count,
            total_signer_weight: r.total_signer_weight,
            total_signer_stacked_amount: r.total_signer_stacked_amount,

            accepted_count: r.accepted_count,
            rejected_count: r.rejected_count,
            missing_count: r.missing_count,

            accepted_weight: r.accepted_weight,
            rejected_weight: r.rejected_weight,
            missing_weight: r.missing_weight,

            signer_data: signerData,
          };
          return entry;
        });
        return blockProposals;
      });
      await reply.send({
        limit: request.query.limit,
        offset: request.query.offset,
        results: result,
      });
    }
  );

  done();
};
