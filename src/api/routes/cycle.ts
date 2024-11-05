import { Type, TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { FastifyPluginCallback } from 'fastify';
import { Server } from 'http';
import {
  CycleSigner,
  CycleSignerResponse,
  CycleSignerResponseSchema,
  CycleSignersResponseSchema,
} from '../schemas';
import { parseTime } from '../../helpers';
import { InvalidRequestError } from '../errors';

export const CycleRoutes: FastifyPluginCallback<
  Record<never, never>,
  Server,
  TypeBoxTypeProvider
> = (fastify, options, done) => {
  fastify.get(
    '/v1/cycles/:cycle_number/signers',
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
          from: Type.Optional(
            Type.String({ description: 'Start of time range (e.g., now-2h or ISO timestamp)' })
          ),
          to: Type.Optional(
            Type.String({ description: 'End of time range (e.g., now or ISO timestamp)' })
          ),
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
          200: CycleSignersResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { from, to, limit, offset } = request.query;

      const fromDate = from ? parseTime(from) : null;
      const toDate = to ? parseTime(to) : null;
      if (from && !fromDate) {
        throw new InvalidRequestError('`from` parameter has an invalid format.');
      }
      if (to && !toDate) {
        throw new InvalidRequestError('`to` parameter has an invalid format.');
      }
      if (fromDate && toDate && fromDate > toDate) {
        throw new InvalidRequestError('`from` parameter must be earlier than `to` parameter.');
      }

      const result = await fastify.db.sqlTransaction(async sql => {
        const results = await fastify.db.getSignersForCycle({
          sql,
          cycleNumber: request.params.cycle_number,
          fromDate: fromDate ?? undefined,
          toDate: toDate ?? undefined,
          limit,
          offset,
        });

        const formatted = results.map(result => {
          const cycleSinger: CycleSigner = {
            signer_key: result.signer_key,
            weight: result.weight,
            weight_percentage: result.weight_percentage,
            stacked_amount: result.stacked_amount,
            stacked_amount_percent: result.stacked_amount_percentage,
            stacked_amount_rank: result.stacked_amount_rank,
            proposals_accepted_count: result.proposals_accepted_count,
            proposals_rejected_count: result.proposals_rejected_count,
            proposals_missed_count: result.proposals_missed_count,
            average_response_time_ms: result.average_response_time_ms,
            last_seen: result.last_block_response_time?.toISOString() ?? null,
            version: result.last_metadata_server_version ?? null,
          };
          return cycleSinger;
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

  fastify.get(
    '/v1/cycles/:cycle_number/signers/:signer_id',
    {
      schema: {
        operationId: 'getPoxCycleSigner',
        summary: 'PoX Cycle Signer',
        description: 'Get stats for a specific signer in a given PoX cycle',
        tags: ['Signers'],
        params: Type.Object({
          cycle_number: Type.Integer({ description: 'PoX cycle number' }),
          signer_id: Type.String({ description: 'Signer public key (hex encoded)' }),
        }),
        response: {
          404: Type.Object({
            error: Type.String({ description: 'Error message when signer is not found' }),
          }),
          200: CycleSignerResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await fastify.db.sqlTransaction(async sql => {
        const signer = await fastify.db.getSignerForCycle(
          request.params.cycle_number,
          request.params.signer_id
        );

        if (!signer) {
          return reply.status(404).send({
            error: 'Signer not found',
          });
        }
        const cycleSigner: CycleSignerResponse = {
          signer_key: signer.signer_key,
          weight: signer.weight,
          weight_percentage: signer.weight_percentage,
          stacked_amount: signer.stacked_amount,
          stacked_amount_percent: signer.stacked_amount_percentage,
          stacked_amount_rank: signer.stacked_amount_rank,
          proposals_accepted_count: signer.proposals_accepted_count,
          proposals_rejected_count: signer.proposals_rejected_count,
          proposals_missed_count: signer.proposals_missed_count,
          average_response_time_ms: signer.average_response_time_ms,
          last_seen: signer.last_block_response_time?.toISOString() ?? null,
          version: signer.last_metadata_server_version ?? null,
        };
        return cycleSigner;
      });
      await reply.send(result);
    }
  );

  done();
};
