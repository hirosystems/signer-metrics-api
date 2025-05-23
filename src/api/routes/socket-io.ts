import { Server as HttpServer } from 'http';
import { Namespace, Server } from 'socket.io';
import { FastifyPluginAsync } from 'fastify';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { SignerMessagesEventPayload } from '../../pg/types';
import { logger } from '@hirosystems/api-toolkit';
import { parseDbBlockProposalData } from './block-proposals';
import { BlockProposalsEntry } from '../schemas';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ClientToServerEvents {}

export interface ServerToClientEvents {
  blockProposal: (arg: BlockProposalsEntry) => void;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface InterServerEvents {}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface SocketData {}

type BlockProposalSocketNamespace = Namespace<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

export const SocketIORoutes: FastifyPluginAsync<
  Record<never, never>,
  HttpServer,
  TypeBoxTypeProvider
> = async (fastify, _options) => {
  const db = fastify.db;
  const io = new Server(fastify.server, {
    cors: { origin: '*' },
    path: fastify.prefix + '/socket.io/',
    transports: ['websocket', 'polling'],
  });

  const blockProposalNs = io.of('/block-proposals') as BlockProposalSocketNamespace;

  const signerMessageListener = (msg: SignerMessagesEventPayload) => {
    try {
      if (blockProposalNs.sockets.size === 0) {
        return;
      }
      // Use Set to get a unique list of block hashes
      const blockHashes = new Set<string>(
        msg.map(m => {
          if ('proposal' in m) return m.proposal.blockHash;
          else if ('response' in m) return m.response.blockHash;
          else if ('push' in m) return m.push.blockHash;
          else throw new Error(`Invalid signer message type: ${JSON.stringify(m)}`);
        })
      );
      const proposalBroadcasts = Array.from(blockHashes).map(blockHash => {
        return db
          .sqlTransaction(async sql => {
            const results = await db.getBlockProposal({
              sql,
              blockHash,
            });
            if (results.length > 0) {
              const blockProposal = parseDbBlockProposalData(results[0]);
              blockProposalNs.emit('blockProposal', blockProposal);
            }
          })
          .catch((error: unknown) => {
            logger.error(error, `Failed to broadcast block proposal for block hash ${blockHash}`);
          });
      });
      void Promise.allSettled(proposalBroadcasts);
    } catch (error) {
      logger.error(error, 'Failed to broadcast block proposal');
    }
  };

  fastify.addHook('onListen', () => {
    fastify.db.ingestion.events.on('signerMessages', signerMessageListener);
  });

  fastify.addHook('preClose', done => {
    fastify.db?.ingestion.events.off('signerMessages', signerMessageListener);
    io.local.disconnectSockets(true);
    done();
  });
  fastify.addHook('onClose', async () => {
    await io.close();
  });

  await Promise.resolve();
};
