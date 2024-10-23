import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { FastifyPluginCallback } from 'fastify';
import { Server } from 'http';
import { ApiStatusResponse } from '../schemas';
import { SERVER_VERSION } from '@hirosystems/api-toolkit';

export const StatusRoutes: FastifyPluginCallback<
  Record<never, never>,
  Server,
  TypeBoxTypeProvider
> = (fastify, options, done) => {
  fastify.get(
    '/',
    {
      schema: {
        operationId: 'getApiStatus',
        summary: 'API Status',
        description: 'Displays the status of the API and its current workload',
        tags: ['Status'],
        response: {
          200: ApiStatusResponse,
        },
      },
    },
    async (request, reply) => {
      const result = await fastify.db.sqlTransaction(async sql => {
        const block_height = await fastify.db.getChainTipBlockHeight();

        return {
          server_version: `signer-monitor-api ${SERVER_VERSION.tag} (${SERVER_VERSION.branch}:${SERVER_VERSION.commit})`,
          status: 'ready',
          chain_tip: {
            block_height,
          },
        };
      });
      await reply.send(result);
    }
  );
  done();
};
