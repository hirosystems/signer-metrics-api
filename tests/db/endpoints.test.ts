/* eslint-disable @typescript-eslint/no-non-null-assertion */
import * as fs from 'node:fs';
import * as readline from 'node:readline/promises';
import * as assert from 'node:assert';
import * as zlib from 'node:zlib';
import * as supertest from 'supertest';
import { FastifyInstance } from 'fastify';
import * as dateFns from 'date-fns';
import { StacksPayload } from '@hirosystems/chainhook-client';
import { buildApiServer } from '../../src/api/init';
import { PgStore } from '../../src/pg/pg-store';
import {
  BlocksEntry,
  BlocksResponse,
  CycleSigner,
  CycleSignerResponse,
  CycleSignersResponse,
} from '../../src/api/schemas';
import { PoxInfo, RpcStackerSetResponse } from '../../src/stacks-core-rpc/stacks-core-rpc-client';
import { rpcStackerSetToDbRewardSetSigners } from '../../src/stacks-core-rpc/stacker-set-updater';

describe('Endpoint tests', () => {
  let db: PgStore;
  let apiServer: FastifyInstance;

  beforeAll(async () => {
    db = await PgStore.connect();
    apiServer = await buildApiServer({ db });
    await apiServer.listen({ port: 0, host: '127.0.0.1' });

    // insert pox-info dump
    const poxInfoDump = JSON.parse(
      fs.readFileSync('./tests/dumps/dump-pox-info-2024-11-02.json', 'utf8')
    ) as PoxInfo;
    await db.updatePoxInfo(poxInfoDump);

    // insert stacker-set dump
    const stackerSetDump = JSON.parse(
      fs.readFileSync('./tests/dumps/dump-stacker-set-cycle-72-2024-11-02.json', 'utf8')
    ) as RpcStackerSetResponse;
    await db.chainhook.insertRewardSetSigners(
      db.sql,
      rpcStackerSetToDbRewardSetSigners(stackerSetDump, 72)
    );

    // insert chainhook-payloads dump
    const spyInfoLog = jest.spyOn(db.chainhook.logger, 'info').mockImplementation(() => {}); // Surpress noisy logs during bulk insertion test
    const payloadDumpFile = './tests/dumps/dump-chainhook-payloads-2024-11-02.ndjson.gz';
    const rl = readline.createInterface({
      input: fs.createReadStream(payloadDumpFile).pipe(zlib.createGunzip()),
      crlfDelay: Infinity,
    });
    for await (const line of rl) {
      await db.chainhook.processPayload(JSON.parse(line) as StacksPayload);
    }
    rl.close();
    spyInfoLog.mockRestore();
  });

  afterAll(async () => {
    await apiServer.close();
    await db.close();
  });

  test('get pox info from db', async () => {
    const poxInfo = await db.getPoxInfo();
    expect(poxInfo).toEqual({
      first_burnchain_block_height: 0,
      reward_cycle_length: 900,
    });
  });

  test('get status', async () => {
    const response = await supertest(apiServer.server).get('/signer-metrics').expect(200);
    expect(response.body).toMatchObject({
      chain_tip: {
        block_height: 112291,
      },
      server_version: expect.any(String),
      status: 'ready',
    });
  });

  test('get latest blocks', async () => {
    const responseTest = await supertest(apiServer.server)
      .get('/signer-metrics/v1/blocks?limit=20')
      .expect(200);
    const body: BlocksResponse = responseTest.body;

    // block 112274 has all signer states (missing, rejected, accepted, accepted_excluded)
    const testBlock = body.results.find(r => r.block_height === 112274);
    assert.ok(testBlock);
    assert.ok(testBlock.signer_data);

    const expectedBlockData: BlocksEntry = {
      block_height: 112274,
      block_hash: '0x782d69b5955a91b110859ee6fc6454cc19814d6434cdde61d5bc91697dee50fc',
      block_time: 1730554291,
      index_block_hash: '0xb5c47a7c0e444b6a96331e0435d940a528dfde98966bb079b1b0b7d706b3016f',
      burn_block_height: 65203,
      tenure_height: 53405,
      signer_data: {
        cycle_number: 72,
        total_signer_count: 11,
        accepted_count: 7,
        rejected_count: 1,
        missing_count: 3,
        accepted_excluded_count: 1,
        average_response_time_ms: 11727.75,
        block_proposal_time_ms: 1730554295560,
        accepted_stacked_amount: '306370000003000',
        rejected_stacked_amount: '9690000000000',
        missing_stacked_amount: '21200000000000',
        accepted_weight: 46,
        rejected_weight: 1,
        missing_weight: 3,
      },
    };
    expect(testBlock).toEqual(expectedBlockData);
  });

  test('get signers for cycle', async () => {
    const responseTest = await supertest(apiServer.server)
      .get('/signer-metrics/v1/cycles/72/signers')
      .expect(200);
    const body: CycleSignersResponse = responseTest.body;

    // this signer has all states (missing, rejected, accepted)
    const testSignerKey = '0x02e8620935d58ebffa23c260f6917cbd0915ea17d7a46df17e131540237d335504';
    const testSigner = body.results.find(r => r.signer_key === testSignerKey);
    const expectedSignerData: CycleSigner = {
      signer_key: '0x02e8620935d58ebffa23c260f6917cbd0915ea17d7a46df17e131540237d335504',
      weight: 38,
      weight_percentage: 76,
      stacked_amount: '250000000000000',
      stacked_amount_percent: 74.127,
      stacked_amount_rank: 1,
      proposals_accepted_count: 84,
      proposals_rejected_count: 12,
      proposals_missed_count: 3,
      average_response_time_ms: 26273.979,
      last_seen: '2024-11-02T13:33:21.831Z',
      version:
        'stacks-signer signer-3.0.0.0.0.1 (release/signer-3.0.0.0.0.1:b26f406, release build, linux [x86_64])',
    };
    expect(testSigner).toEqual(expectedSignerData);

    // this signer has missed all block_proposal (no block_response has been seen)
    const miaSignerKey = '0x0399649284ed10a00405f032f8567b5e5463838aaa00af8d6bc9da71dda4e19c9c';
    const miaSigner = body.results.find(r => r.signer_key === miaSignerKey);
    const expectedMiaSignerData: CycleSigner = {
      signer_key: '0x0399649284ed10a00405f032f8567b5e5463838aaa00af8d6bc9da71dda4e19c9c',
      weight: 1,
      weight_percentage: 2,
      stacked_amount: '7700000000000',
      stacked_amount_percent: 2.283,
      stacked_amount_rank: 5,
      proposals_accepted_count: 0,
      proposals_rejected_count: 0,
      proposals_missed_count: 99,
      average_response_time_ms: 0,
      last_seen: null,
      version: null,
    };
    expect(miaSigner).toEqual(expectedMiaSignerData);
  });

  test('get signers for cycle with time range', async () => {
    const blocksResponse = await supertest(apiServer.server)
      .get('/signer-metrics/v1/blocks?limit=20')
      .expect(200);
    const { results: allBlocks } = blocksResponse.body as BlocksResponse;
    const blocks = allBlocks.filter(b => b.signer_data);

    const latestBlockTime = new Date(blocks[0].signer_data!.block_proposal_time_ms);
    const secondLatestBlockTime = new Date(blocks[1].signer_data!.block_proposal_time_ms);
    const oldestBlock = new Date(blocks.at(-1)!.signer_data!.block_proposal_time_ms);

    // Get a range that includes the first two blocks
    const from1 = dateFns.subSeconds(secondLatestBlockTime, 1);
    const to1 = dateFns.addSeconds(latestBlockTime, 1);

    const signersResp1 = await supertest(apiServer.server)
      .get(
        `/signer-metrics/v1/cycles/72/signers?from=${from1.toISOString()}&to=${to1.toISOString()}`
      )
      .expect(200);
    const signersBody1: CycleSignersResponse = signersResp1.body;
    const testSignerKey1 = '0x02e8620935d58ebffa23c260f6917cbd0915ea17d7a46df17e131540237d335504';
    const testSigner1 = signersBody1.results.find(r => r.signer_key === testSignerKey1);
    const expectedSignerData1: CycleSigner = {
      signer_key: '0x02e8620935d58ebffa23c260f6917cbd0915ea17d7a46df17e131540237d335504',
      weight: 38,
      weight_percentage: 76,
      stacked_amount: '250000000000000',
      stacked_amount_percent: 74.127,
      stacked_amount_rank: 1,
      proposals_accepted_count: 1,
      proposals_rejected_count: 0,
      proposals_missed_count: 1,
      average_response_time_ms: 28515,
      last_seen: '2024-11-02T13:33:21.831Z',
      version:
        'stacks-signer signer-3.0.0.0.0.1 (release/signer-3.0.0.0.0.1:b26f406, release build, linux [x86_64])',
    };
    expect(testSigner1).toEqual(expectedSignerData1);

    // number of seconds between now and the second latest block
    let latestBlockSecondsAgo = dateFns.differenceInSeconds(new Date(), secondLatestBlockTime);
    latestBlockSecondsAgo += 10; // add a few seconds to account for test execution time
    const signersResp2 = await supertest(apiServer.server)
      .get(`/signer-metrics/v1/cycles/72/signers?from=now-${latestBlockSecondsAgo}s&to=now`)
      .expect(200);
    const signersBody2: CycleSignersResponse = signersResp2.body;
    const testSigner2 = signersBody2.results.find(r => r.signer_key === testSignerKey1);
    // should return data for the last 2 blocks
    expect(testSigner2).toEqual(expectedSignerData1);

    const oldestBlockSecondsAgo = dateFns.differenceInSeconds(new Date(), oldestBlock);
    const signersResp3 = await supertest(apiServer.server)
      .get(
        `/signer-metrics/v1/cycles/72/signers?from=${oldestBlock.toISOString()}&to=now-${oldestBlockSecondsAgo}s`
      )
      .expect(200);
    const signersBody3: CycleSignersResponse = signersResp3.body;
    const testSigner3 = signersBody3.results.find(r => r.signer_key === testSignerKey1);
    // should return data for the oldest block
    const expected3: CycleSigner = {
      signer_key: '0x02e8620935d58ebffa23c260f6917cbd0915ea17d7a46df17e131540237d335504',
      weight: 38,
      weight_percentage: 76,
      stacked_amount: '250000000000000',
      stacked_amount_percent: 74.127,
      stacked_amount_rank: 1,
      proposals_accepted_count: 1,
      proposals_rejected_count: 0,
      proposals_missed_count: 0,
      average_response_time_ms: 29020,
      last_seen: '2024-11-02T13:30:43.731Z',
      version:
        'stacks-signer signer-3.0.0.0.0.1 (release/signer-3.0.0.0.0.1:b26f406, release build, linux [x86_64])',
    };
    expect(testSigner3).toEqual(expected3);
  });

  test('get signer for cycle', async () => {
    // this signer has all states (missing, rejected, accepted)
    const testSignerKey = '0x02e8620935d58ebffa23c260f6917cbd0915ea17d7a46df17e131540237d335504';
    const responseTest = await supertest(apiServer.server)
      .get(`/signer-metrics/v1/cycles/72/signers/${testSignerKey}`)
      .expect(200);
    const body: CycleSignerResponse = responseTest.body;
    const expectedSignerData: CycleSignerResponse = {
      signer_key: '0x02e8620935d58ebffa23c260f6917cbd0915ea17d7a46df17e131540237d335504',
      weight: 38,
      weight_percentage: 76,
      stacked_amount: '250000000000000',
      stacked_amount_percent: 74.127,
      stacked_amount_rank: 1,
      proposals_accepted_count: 84,
      proposals_rejected_count: 12,
      proposals_missed_count: 3,
      average_response_time_ms: 26273.979,
      last_seen: '2024-11-02T13:33:21.831Z',
      version:
        'stacks-signer signer-3.0.0.0.0.1 (release/signer-3.0.0.0.0.1:b26f406, release build, linux [x86_64])',
    };
    expect(body).toEqual(expectedSignerData);

    // this signer has missed all block_proposal (no block_response has been seen)
    const miaSignerKey = '0x0399649284ed10a00405f032f8567b5e5463838aaa00af8d6bc9da71dda4e19c9c';
    const responseTest2 = await supertest(apiServer.server)
      .get(`/signer-metrics/v1/cycles/72/signers/${miaSignerKey}`)
      .expect(200);
    const miaSigner: CycleSignerResponse = responseTest2.body;
    const expectedMiaSignerData: CycleSigner = {
      signer_key: '0x0399649284ed10a00405f032f8567b5e5463838aaa00af8d6bc9da71dda4e19c9c',
      weight: 1,
      weight_percentage: 2,
      stacked_amount: '7700000000000',
      stacked_amount_percent: 2.283,
      stacked_amount_rank: 5,
      proposals_accepted_count: 0,
      proposals_rejected_count: 0,
      proposals_missed_count: 99,
      average_response_time_ms: 0,
      last_seen: null,
      version: null,
    };
    expect(miaSigner).toEqual(expectedMiaSignerData);
  });
});
