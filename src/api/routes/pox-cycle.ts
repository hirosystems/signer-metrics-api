import { Type, TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { FastifyPluginCallback } from 'fastify';
import { Server } from 'http';
import { ApiStatusResponse } from '../schemas';

export const PoxCycleRoutes: FastifyPluginCallback<
  Record<never, never>,
  Server,
  TypeBoxTypeProvider
> = (fastify, options, done) => {
  fastify.get(
    '/v1/pox-cycle/:cycle_number/signers',
    {
      schema: {
        operationId: 'getPoxCycleSigners',
        summary: 'PoX Cycle Signers',
        description: 'List of signers for a given PoX cycle',
        tags: ['Signers'],
        params: Type.Object({
          cycle_number: Type.Integer({ description: 'PoX cycle number' }),
        }),
        querystring: Type.Object({
          limit: Type.Integer({
            description: 'Number of results to return (default: 100)',
            default: 100,
          }),
          offset: Type.Integer({
            description: 'Number of results to skip (default: 0)',
            default: 0,
          }),
        }),
        response: {
          200: Type.Object({
            total: Type.Integer(),
            // TODO: implement cursor pagination
            // next_cursor: Type.String(),
            // prev_cursor: Type.String(),
            // cursor: Type.String(),
            limit: Type.Integer(),
            offset: Type.Integer(),
            results: Type.Array(
              Type.Object({
                signer_key: Type.String(),
                weight: Type.Integer({
                  description:
                    'Voting weight of this signer (based on slots allocated which is proportional to stacked amount)',
                }),
                weight_percentage: Type.Number({
                  description: 'Voting weight percent (weight / total_weight)',
                }),
                stacked_amount: Type.String({
                  description:
                    'Total STX stacked associated with this signer (string quoted integer)',
                }),
                stacked_amount_percent: Type.Number({
                  description: 'Stacked amount percent (stacked_amount / total_stacked_amount)',
                }),
                proposals_accepted_count: Type.Integer({
                  description: 'Number of block proposals accepted by this signer',
                }),
                proposals_rejected_count: Type.Integer({
                  description: 'Number of block proposals rejected by this signer',
                }),
                proposals_missed_count: Type.Integer({
                  description: 'Number of block proposals missed by this signer',
                }),
                average_response_time: Type.Number({
                  description:
                    'Time duration (in milliseconds) taken to submit responses to block proposals (tracked best effort)',
                }),
                // TODO: implement these nice-to-have fields
                /*
                mined_blocks_accepted_included_count: Type.Integer({
                  description: 'Number of mined blocks where signer approved and was included',
                }),
                mined_blocks_accepted_excluded_count: Type.Integer({
                  description: 'Number of mined blocks where signer approved but was not included',
                }),
                mined_blocks_rejected_count: Type.Integer({
                  description: 'Number of mined blocks where signer rejected',
                }),
                mined_blocks_missing_count: Type.Integer({
                  description: 'Number of mined blocks where signer was missing',
                }),
                */
              })
            ),
          }),
        },
      },
    },
    async (request, reply) => {
      const result = await fastify.db.sqlTransaction(async sql => {
        const results = await fastify.db.getSignersForCycle(
          request.params.cycle_number,
          request.query.limit,
          request.query.offset
        );

        const formatted = results.map(result => {
          return {
            signer_key: result.signer_key,
            weight: result.weight,
            weight_percentage: result.weight_percentage,
            stacked_amount: result.stacked_amount,
            stacked_amount_percent: result.stacked_amount_percentage,
            proposals_accepted_count: result.proposals_accepted_count,
            proposals_rejected_count: result.proposals_rejected_count,
            proposals_missed_count: result.proposals_missed_count,
            average_response_time: result.average_response_time,
          };
        });

        return {
          total: formatted.length,
          limit: request.query.limit,
          offset: request.query.offset,
          results: formatted,
        };
      });
      await reply.send(result);
    }
  );
  done();
};
