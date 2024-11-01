import { connectPostgres, logger, PgConnectionArgs } from '@hirosystems/api-toolkit';
import { sleep } from '../../src/helpers';
import * as events from 'node:events';
import { ENV } from '../../src/env';
import { PgStore } from '../../src/pg/pg-store';
import * as fs from 'node:fs';
import * as readline from 'node:readline/promises';
import { StacksPayload } from '@hirosystems/chainhook-client';
import { buildApiServer } from '../../src/api/init';
import * as supertest from 'supertest';
import { FastifyInstance } from 'fastify';
import { BlocksResponse } from '../../src/api/schemas';

describe('Postgres ingestion tests', () => {
  let db: PgStore;
  let apiServer: FastifyInstance;

  beforeAll(async () => {
    db = await PgStore.connect();
    apiServer = await buildApiServer({ db });
    await apiServer.listen({ port: 0, host: '127.0.0.1' });

    const fileStream = fs.createReadStream('./tests/chainhook-payloads.ndjson');
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
    for await (const line of rl) {
      await db.chainhook.processPayload(JSON.parse(line) as StacksPayload);
    }
    rl.close();
  });

  afterAll(async () => {
    await apiServer.close();
    await db.close();
  });

  test('get status', async () => {
    const response = await supertest(apiServer.server).get('/signer-metrics').expect(200);
    expect(response.body).toMatchObject({
      chain_tip: {
        block_height: 145,
      },
      server_version: expect.any(String),
      status: 'ready',
    });
  });

  test('get latest blocks', async () => {
    const responseTest = await supertest(apiServer.server)
      .get('/signer-metrics/v1/blocks?limit=200')
      .expect(200);
    const body: BlocksResponse = responseTest.body;
    for (const entry of body.results) {
      if (entry.signer_data && entry.signer_data.missing_count > 0) {
        logger.error('Found missing signer data in block', entry);
      }
      if (entry.signer_data && entry.signer_data.rejected_count > 0) {
        logger.error('Found rejected signer data in block', entry);
      }
    }

    const blockWithMissing = {
      block_height: 96,
      block_hash: '0xdc490f7aa48ca7cd48a818c6601da643dec672c57e92f91d56b119e127fd456f',
      block_time: 1730396530,
      index_block_hash: '0x981f2d6f77ab0dc5960dd77a82940c7e920affa3a155d815f476d28d17555ea6',
      burn_block_height: 138,
      tenure_height: 33,
      signer_data: {
        cycle_number: 6,
        total_signer_count: 3,
        accepted_count: 2,
        rejected_count: 0,
        missing_count: 1,
        accepted_excluded_count: 0,
        average_response_time_ms: 36.5,
        block_proposal_time_ms: 1730396530599,
        accepted_stacked_amount: '6875400000000000',
        rejected_stacked_amount: '0',
        missing_stacked_amount: '1375080000000000',
        accepted_weight: 7,
        rejected_weight: 0,
        missing_weight: 1,
      },
    };

    const response = await supertest(apiServer.server)
      .get('/signer-metrics/v1/blocks?limit=2')
      .expect(200);
    expect(response.body).toMatchObject({
      total: 145,
      limit: 2,
      offset: 0,
      results: [
        {
          block_height: 145,
          block_hash: '0xc7db3c28cd7de628e9824213c05a512402ccf0caeb2dd2892f83a2f1cfb10e78',
          block_time: 1730396665,
          index_block_hash: '0x188f5bd2c17518476bd6643edf8335f8e1bac14dcfdd998f8decceb104c7e3a4',
          burn_block_height: 142,
          tenure_height: 37,
          signer_data: {
            cycle_number: 7,
            total_signer_count: 3,
            accepted_count: 3,
            rejected_count: 0,
            missing_count: 0,
            accepted_excluded_count: 1,
            average_response_time_ms: 63.667,
            block_proposal_time_ms: 1730396665087,
            accepted_stacked_amount: '8250480000000000',
            rejected_stacked_amount: '0',
            missing_stacked_amount: '0',
            accepted_weight: 8,
            rejected_weight: 0,
            missing_weight: 0,
          },
        },
        {
          block_height: 144,
          block_hash: '0xd9334bdf52f285ce55a1027aa5d79beea085472379713e9b458e8f0e5a37daa1',
          block_time: 1730396662,
          index_block_hash: '0x1d1a121a029409f070b3c072c9027e21ac787d23f2ab8e663a23b8789301e72a',
          burn_block_height: 142,
          tenure_height: 37,
          signer_data: {
            cycle_number: 7,
            total_signer_count: 3,
            accepted_count: 3,
            rejected_count: 0,
            missing_count: 0,
            accepted_excluded_count: 1,
            average_response_time_ms: 45.333,
            block_proposal_time_ms: 1730396662349,
            accepted_stacked_amount: '8250480000000000',
            rejected_stacked_amount: '0',
            missing_stacked_amount: '0',
            accepted_weight: 8,
            rejected_weight: 0,
            missing_weight: 0,
          },
        },
      ],
    });
  });
});
