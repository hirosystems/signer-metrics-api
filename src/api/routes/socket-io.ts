import { Server as HttpServer } from 'http';
import { Namespace, Server, Socket } from 'socket.io';
import { FastifyPluginCallback } from 'fastify';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';

interface NamespaceSpecificClientToServerEvents {
  foo: (arg: string) => void;
}

interface NamespaceSpecificServerToClientEvents {
  bar: (arg: string) => void;
}

interface NamespaceSpecificInterServerEvents {
  baz: (arg: string) => void;
}

interface NamespaceSpecificSocketData {
  thing: string;
}

export const SocketIORoutes: FastifyPluginCallback<
  Record<never, never>,
  HttpServer,
  TypeBoxTypeProvider
> = (fastify, _options, done) => {
  const io = new Server(fastify.server, {
    path: fastify.prefix + '/socket.io/',
    transports: ['websocket', 'polling'],
  });

  const blockProposalNs = io.of('/block-proposals') as Namespace<
    NamespaceSpecificClientToServerEvents,
    NamespaceSpecificServerToClientEvents,
    NamespaceSpecificInterServerEvents,
    NamespaceSpecificSocketData
  >;

  blockProposalNs.on('connection', socket => {
    // socket.emit('bar',)
  });

  fastify.addHook('preClose', done => {
    io.local.disconnectSockets(true);
    done();
  });
  fastify.addHook('onClose', async () => {
    await io.close();
  });

  done();
};
