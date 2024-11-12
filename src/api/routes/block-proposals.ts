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
        const results = await fastify.db.getRecentBlockProposals({
          sql,
          limit: request.query.limit,
          offset: request.query.offset,
        });
        return results;
      });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      await reply.send(result as any);
    }
  );

  done();
};
