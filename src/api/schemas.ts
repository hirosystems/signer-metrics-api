import { SwaggerOptions } from '@fastify/swagger';
import { SERVER_VERSION } from '@hirosystems/api-toolkit';
import { Static, TSchema, Type } from '@sinclair/typebox';

export const OpenApiSchemaOptions: SwaggerOptions = {
  openapi: {
    info: {
      title: 'Signer Monitor API',
      description:
        'Welcome to the API reference overview for the Signer Monitor API.',
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
