import { Type, TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { FastifyPluginCallback } from 'fastify';
import { Server } from 'http';
import {
  BlockEntrySchema,
  BlockParamsSchema,
  BlocksEntry,
  BlocksEntrySignerData,
  BlocksResponseSchema,
  cleanBlockHeightOrHashParam,
  parseBlockParam,
} from '../schemas';
import { NotFoundError } from '../errors';

export const BlockRoutes: FastifyPluginCallback<
  Record<never, never>,
  Server,
  TypeBoxTypeProvider
> = (fastify, options, done) => {
  fastify.get(
    '/v1/blocks',
    {
      schema: {
        operationId: 'getBlocks',
        summary: 'Aggregated signer information for most recent blocks',
        description: 'Aggregated signer information for most recent blocks',
        tags: ['Blocks'],
        querystring: Type.Object({
          limit: Type.Integer({
            description: 'Number of results to return',
            default: 100,
          }),
          offset: Type.Integer({
            description: 'Number of results to skip',
            default: 0,
          }),
        }),
        response: {
          200: BlocksResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await fastify.db.sqlTransaction(async sql => {
        const results = await fastify.db.getSignerDataForRecentBlocks({
          sql,
          limit: request.query.limit,
          offset: request.query.offset,
        });

        const formatted: BlocksEntry[] = results.map(result => {
          const entry: BlocksEntry = {
            block_height: result.block_height,
            block_hash: result.block_hash,
            index_block_hash: result.index_block_hash,
            burn_block_height: result.burn_block_height,
            tenure_height: result.tenure_height,
            block_time: result.block_time,
            signer_data: null,
          };

          if (!result.block_proposal_time_ms || !result.cycle_number) {
            // no signer data available for this, only return the block header data
            return entry;
          }

          const entrySignerData: BlocksEntrySignerData = {
            cycle_number: result.cycle_number,
            total_signer_count: result.total_signer_count,
            accepted_count:
              result.signer_accepted_mined_count + result.signer_accepted_excluded_count,
            rejected_count: result.signer_rejected_count,
            missing_count: result.signer_missing_count,

            accepted_excluded_count: result.signer_accepted_excluded_count,

            average_response_time_ms: result.average_response_time_ms,
            block_proposal_time_ms: Number.parseInt(result.block_proposal_time_ms),

            accepted_stacked_amount: (
              BigInt(result.accepted_mined_stacked_amount) +
              BigInt(result.accepted_excluded_stacked_amount)
            ).toString(),
            rejected_stacked_amount: result.rejected_stacked_amount,
            missing_stacked_amount: result.missing_stacked_amount,

            accepted_weight: result.accepted_mined_weight + result.accepted_excluded_weight,
            rejected_weight: result.rejected_weight,
            missing_weight: result.missing_weight,
          };
          entry.signer_data = entrySignerData;
          return entry;
        });

        return {
          total: results[0]?.chain_tip_block_height ?? 0,
          limit: request.query.limit,
          offset: request.query.offset,
          results: formatted,
        };
      });
      await reply.send(result);
    }
  );

  fastify.get(
    '/v1/blocks/:height_or_hash',
    {
      preValidation: (req, _reply, done) => {
        cleanBlockHeightOrHashParam(req.params);
        done();
      },
      schema: {
        operationId: 'getBlock',
        summary: 'Aggregated signer information for a block',
        description: 'Aggregated signer information for a block',
        tags: ['Blocks'],
        params: BlockParamsSchema,
        response: {
          200: BlockEntrySchema,
        },
      },
    },
    async (request, reply) => {
      const blockId = parseBlockParam(request.params.height_or_hash);
      const result = await fastify.db.sqlTransaction(async sql => {
        const result = await fastify.db.getSignerDataForBlock({ sql, blockId });
        if (!result) {
          throw new NotFoundError(`Block not found`);
        }

        const entry: BlocksEntry = {
          block_height: result.block_height,
          block_hash: result.block_hash,
          index_block_hash: result.index_block_hash,
          burn_block_height: result.burn_block_height,
          tenure_height: result.tenure_height,
          block_time: result.block_time,
          signer_data: null,
        };

        if (!result.block_proposal_time_ms || !result.cycle_number) {
          // no signer data available for this, only return the block header data
          return entry;
        }

        const entrySignerData: BlocksEntrySignerData = {
          cycle_number: result.cycle_number,
          total_signer_count: result.total_signer_count,
          accepted_count:
            result.signer_accepted_mined_count + result.signer_accepted_excluded_count,
          rejected_count: result.signer_rejected_count,
          missing_count: result.signer_missing_count,

          accepted_excluded_count: result.signer_accepted_excluded_count,

          average_response_time_ms: result.average_response_time_ms,
          block_proposal_time_ms: Number.parseInt(result.block_proposal_time_ms),

          accepted_stacked_amount: (
            BigInt(result.accepted_mined_stacked_amount) +
            BigInt(result.accepted_excluded_stacked_amount)
          ).toString(),
          rejected_stacked_amount: result.rejected_stacked_amount,
          missing_stacked_amount: result.missing_stacked_amount,

          accepted_weight: result.accepted_mined_weight + result.accepted_excluded_weight,
          rejected_weight: result.rejected_weight,
          missing_weight: result.missing_weight,
        };
        entry.signer_data = entrySignerData;
        return entry;
      });
      await reply.send(result);
    }
  );

  done();
};
