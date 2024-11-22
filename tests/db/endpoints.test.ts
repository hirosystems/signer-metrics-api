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
  BlockProposalsEntry,
  BlockProposalSignerData,
  BlockProposalsResponse,
  BlocksEntry,
  BlocksResponse,
  CycleSigner,
  CycleSignerResponse,
  CycleSignersResponse,
} from '../../src/api/schemas';
import { PoxInfo, RpcStackerSetResponse } from '../../src/stacks-core-rpc/stacks-core-rpc-client';
import { rpcStackerSetToDbRewardSetSigners } from '../../src/stacks-core-rpc/stacker-set-updater';
import { ENV } from '../../src/env';

describe('Endpoint tests', () => {
  let db: PgStore;
  let apiServer: FastifyInstance;

  beforeAll(async () => {
    db = await PgStore.connect();
    db.notifications._sqlNotifyDisabled = true;
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

  test('prometheus signer metrics', async () => {
    const bucketsEnvName = 'SIGNER_PROMETHEUS_METRICS_BLOCK_PERIODS';
    const orig = ENV[bucketsEnvName];

    const buckets = [1, 2, 3, 5, 10, 100, 1000];
    process.env[bucketsEnvName] = buckets.join(',');
    ENV.reload();
    const blockRanges = ENV[bucketsEnvName].split(',').map(Number);

    // Delete from confirmed blocks tables to ensure there is a pending block_proposal
    const [{ block_height }] = await db.sql<
      { block_height: number }[]
    >`SELECT block_height FROM block_proposals ORDER BY block_height DESC LIMIT 1`;
    await db.sql`DELETE FROM blocks WHERE block_height >= ${block_height}`;
    await db.sql`DELETE FROM block_pushes WHERE block_height >= ${block_height}`;

    const pendingProposalDate = await db.getLastPendingProposalDate({ sql: db.sql });
    expect(pendingProposalDate).toBeInstanceOf(Date);
    expect(new Date().getTime() - pendingProposalDate!.getTime()).toBeGreaterThan(0);

    const dbPushMetricsResult = await db.getRecentBlockPushMetrics({ sql: db.sql, blockRanges });
    expect(dbPushMetricsResult).toEqual([
      { block_range: 1, avg_push_time_ms: 27262 },
      { block_range: 2, avg_push_time_ms: 30435.5 },
      { block_range: 3, avg_push_time_ms: 28167.333 },
      { block_range: 5, avg_push_time_ms: 28553.8 },
      { block_range: 10, avg_push_time_ms: 31264.4 },
      { block_range: 100, avg_push_time_ms: 29451.831 },
      { block_range: 1000, avg_push_time_ms: 29451.831 },
    ]);

    const dbAcceptanceMetricsResult = await db.getRecentBlockAcceptanceMetrics({
      sql: db.sql,
      blockRanges,
    });
    expect(dbAcceptanceMetricsResult).toEqual([
      { acceptance_rate: 0, block_range: 1 },
      { acceptance_rate: 0.5, block_range: 2 },
      { acceptance_rate: 0.6667, block_range: 3 },
      { acceptance_rate: 0.6, block_range: 5 },
      { acceptance_rate: 0.8, block_range: 10 },
      { acceptance_rate: 0.7778, block_range: 100 },
      { acceptance_rate: 0.7778, block_range: 1000 },
    ]);

    const dbMetricsResult = await db.getRecentSignerMetrics({ sql: db.sql, blockRanges });
    expect(dbMetricsResult).toEqual(
      expect.arrayContaining([
        {
          signer_key: '0x03fc7cb917698b6137060f434988f7688520972dfb944f9b03c0fbf1c75303e79a',
          block_ranges: {
            '1': { missing: 0, accepted: 1, rejected: 0 },
            '2': { missing: 0, accepted: 2, rejected: 0 },
            '3': { missing: 0, accepted: 3, rejected: 0 },
            '5': { missing: 0, accepted: 5, rejected: 0 },
            '10': { missing: 0, accepted: 10, rejected: 0 },
            '100': { missing: 1, accepted: 86, rejected: 12 },
            '1000': { missing: 1, accepted: 86, rejected: 12 },
          },
        },
      ])
    );

    const responseTest = await supertest(apiServer.server)
      .get('/signer-metrics/metrics')
      .expect(200);
    const receivedLines = responseTest.text.split('\n');

    const expectedPendingProposalLineRegex =
      /# TYPE time_since_last_pending_block_proposal_ms gauge\ntime_since_last_pending_block_proposal_ms [1-9]\d*/;
    expect(responseTest.text).toMatch(expectedPendingProposalLineRegex);

    const expectedPushTimeLines = `# TYPE avg_block_push_time_ms gauge
avg_block_push_time_ms{period="1"} 27262
avg_block_push_time_ms{period="2"} 30435.5
avg_block_push_time_ms{period="3"} 28167.333`;
    expect(receivedLines).toEqual(expect.arrayContaining(expectedPushTimeLines.split('\n')));

    const expectedAcceptanceRateLines = `# TYPE proposal_acceptance_rate gauge
proposal_acceptance_rate{period="1"} 0
proposal_acceptance_rate{period="2"} 0.5
proposal_acceptance_rate{period="3"} 0.6667
proposal_acceptance_rate{period="5"} 0.6
proposal_acceptance_rate{period="10"} 0.8
proposal_acceptance_rate{period="100"} 0.7778
proposal_acceptance_rate{period="1000"} 0.7778`;
    expect(receivedLines).toEqual(expect.arrayContaining(expectedAcceptanceRateLines.split('\n')));

    const expectedSignerStateLines = `# TYPE signer_state_count gauge
signer_state_count{signer="0x03fc7cb917698b6137060f434988f7688520972dfb944f9b03c0fbf1c75303e79a",period="1",state="missing"} 0
signer_state_count{signer="0x03fc7cb917698b6137060f434988f7688520972dfb944f9b03c0fbf1c75303e79a",period="1",state="accepted"} 1
signer_state_count{signer="0x03fc7cb917698b6137060f434988f7688520972dfb944f9b03c0fbf1c75303e79a",period="1",state="rejected"} 0
signer_state_count{signer="0x03fc7cb917698b6137060f434988f7688520972dfb944f9b03c0fbf1c75303e79a",period="2",state="missing"} 0
signer_state_count{signer="0x03fc7cb917698b6137060f434988f7688520972dfb944f9b03c0fbf1c75303e79a",period="2",state="accepted"} 2
signer_state_count{signer="0x03fc7cb917698b6137060f434988f7688520972dfb944f9b03c0fbf1c75303e79a",period="2",state="rejected"} 0`;
    expect(receivedLines).toEqual(expect.arrayContaining(expectedSignerStateLines.split('\n')));

    process.env[bucketsEnvName] = orig;
    ENV.reload();
  });

  test('get block proposals', async () => {
    const responseTest = await supertest(apiServer.server)
      .get('/signer-metrics/v1/block_proposals?limit=50')
      .expect(200);
    const body: BlockProposalsResponse = responseTest.body;
    for (const proposal of body.results) {
      expect(proposal.total_signer_count).toBe(proposal.signer_data.length);
      const totalWeight = proposal.signer_data.reduce((acc, s) => acc + s.weight, 0);
      expect(proposal.total_signer_weight).toBe(totalWeight);
      const totalMissing = proposal.signer_data.filter(s => s.response === 'missing').length;
      expect(proposal.missing_count).toBe(totalMissing);
      const totalAccepted = proposal.signer_data.filter(s => s.response === 'accepted').length;
      expect(proposal.accepted_count).toBe(totalAccepted);
    }

    const rejectedBlockHash = '0x91b01811fdfddb38886412509fc1e6d48c91b3f4406b32b887ec261e6312ee6b';
    const rejectedBlock = body.results.find(r => r.block_hash === rejectedBlockHash);
    const expectedRejectedSignerData: BlockProposalSignerData = {
      signer_key: '0x02e8620935d58ebffa23c260f6917cbd0915ea17d7a46df17e131540237d335504',
      slot_index: 3,
      response: 'rejected',
      weight: 38,
      weight_percentage: 76,
      stacked_amount: '250000000000000',
      version:
        'stacks-signer signer-3.0.0.0.0.1 (release/signer-3.0.0.0.0.1:b26f406, release build, linux [x86_64])',
      received_at: '2024-11-02T13:27:31.613Z',
      response_time_ms: 10874,
      reason_string: 'The block was rejected due to a mismatch with expected sortition view.',
      reason_code: 'SORTITION_VIEW_MISMATCH',
      reject_code: null,
    };
    const expectedRejectedBlockData: BlockProposalsEntry = {
      received_at: '2024-11-02T13:27:20.739Z',
      block_height: 112267,
      block_hash: '0x91b01811fdfddb38886412509fc1e6d48c91b3f4406b32b887ec261e6312ee6b',
      index_block_hash: '0xd19204301daa0831a145918a75cc6224a3d7260532de772a36854f30dccbe701',
      burn_block_height: 65203,
      block_time: 1730554011,
      cycle_number: 72,
      status: 'rejected',
      push_time_ms: null,
      total_signer_count: 11,
      total_signer_weight: 50,
      total_signer_stacked_amount: '337260000003000',
      accepted_count: 1,
      rejected_count: 7,
      missing_count: 3,
      accepted_weight: 1,
      rejected_weight: 46,
      missing_weight: 3,
      signer_data: expect.arrayContaining([expectedRejectedSignerData]),
    };
    expect(rejectedBlock).toEqual(expectedRejectedBlockData);

    const acceptedBlockHash = '0x2f1c4e83fda403682b1ab5dd41383e47d2cb3dfec0fd26f0886883462d7802fb';
    const acceptedBlock = body.results.find(r => r.block_hash === acceptedBlockHash);
    const expectedAcceptedSignerData: BlockProposalSignerData = {
      signer_key: '0x02567b1f5056f6c3e59e759f66216d21239904d1cc2d847c5dcc3c2b6534d7bead',
      slot_index: 0,
      response: 'accepted',
      weight: 1,
      weight_percentage: 2,
      stacked_amount: '6490000003000',
      version: 'stacks-signer 0.0.1 (:, release build, linux [x86_64])',
      received_at: '2024-11-02T13:32:58.090Z',
      response_time_ms: 4774,
      reason_string: null,
      reason_code: null,
      reject_code: null,
    };
    const expectedAcceptedBlockData: BlockProposalsEntry = {
      received_at: '2024-11-02T13:32:53.316Z',
      block_height: 112276,
      block_hash: '0x2f1c4e83fda403682b1ab5dd41383e47d2cb3dfec0fd26f0886883462d7802fb',
      index_block_hash: '0x26f19d44de4ca2b13dbeb8e684cd50125294869a43fba4b8598118876dbba57a',
      burn_block_height: 65204,
      block_time: 1730554358,
      cycle_number: 72,
      status: 'accepted',
      push_time_ms: 27262,
      total_signer_count: 11,
      total_signer_weight: 50,
      total_signer_stacked_amount: '337260000003000',
      accepted_count: 8,
      rejected_count: 0,
      missing_count: 3,
      accepted_weight: 47,
      rejected_weight: 0,
      missing_weight: 3,
      signer_data: expect.arrayContaining([expectedAcceptedSignerData]),
    };
    expect(acceptedBlock).toEqual(expectedAcceptedBlockData);

    const getProposal1 = await supertest(apiServer.server)
      .get(`/signer-metrics/v1/block_proposals/${rejectedBlockHash}`)
      .expect(200);
    const body1: BlockProposalsEntry = getProposal1.body;
    expect(body1).toEqual(expectedRejectedBlockData);

    const getProposal2 = await supertest(apiServer.server)
      .get(`/signer-metrics/v1/block_proposals/${acceptedBlockHash}`)
      .expect(200);
    const body2: BlockProposalsEntry = getProposal2.body;
    expect(body2).toEqual(expectedAcceptedBlockData);

    await supertest(apiServer.server)
      .get(
        `/signer-metrics/v1/block_proposals/0x00000083fda403682b1ab5dd41383e47d2cb3dfec0fd26f0886883462d000000`
      )
      .expect(404);
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

  test('get block by hash or height', async () => {
    // block 112274 has all signer states (missing, rejected, accepted, accepted_excluded)
    const blockHeight = 112274;
    const blockHash = '0x782d69b5955a91b110859ee6fc6454cc19814d6434cdde61d5bc91697dee50fc';

    const expectedBlockData: BlocksEntry = {
      block_height: blockHeight,
      block_hash: blockHash,
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

    const { body: testBlockHeight } = (await supertest(apiServer.server)
      .get(`/signer-metrics/v1/blocks/${blockHeight}`)
      .expect(200)) as { body: BlocksEntry };
    expect(testBlockHeight).toEqual(expectedBlockData);

    const { body: testBlockHash } = (await supertest(apiServer.server)
      .get(`/signer-metrics/v1/blocks/${blockHash}`)
      .expect(200)) as { body: BlocksEntry };
    expect(testBlockHash).toEqual(expectedBlockData);

    // Test 404 using a non-existent block hash
    const nonExistentHash = '0x000069b5955a91b110859ee6fc6454cc19814d6434cdde61d5bc91697dee50f0';
    const notFoundResp = await supertest(apiServer.server)
      .get(`/signer-metrics/v1/blocks/${nonExistentHash}`)
      .expect(404);
    expect(notFoundResp.body).toMatchObject({
      error: 'Not Found',
      message: 'Block not found',
      statusCode: 404,
    });
  });

  test('get block by latest', async () => {
    // Note: the current block payload test data does not have signer data for the latest block
    const expectedBlockData: BlocksEntry = {
      block_height: 112291,
      block_hash: '0x82ac0b52a4dde86ac05d04f59d81081d047125d0c7eaf424683191fc3fd839f2',
      block_time: 1730554958,
      index_block_hash: '0x7183de5c4ae700248283fede9264d31a37ab3ca1b54b4fd24adc449fbbd4c2b7',
      burn_block_height: 65206,
      tenure_height: 53408,
      signer_data: null,
    };

    const { body: testBlockLatest } = (await supertest(apiServer.server)
      .get(`/signer-metrics/v1/blocks/latest`)
      .expect(200)) as { body: BlocksEntry };
    expect(testBlockLatest).toEqual(expectedBlockData);
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
      slot_index: 3,
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
      slot_index: 9,
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
      slot_index: 3,
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
      slot_index: 3,
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
      slot_index: 3,
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
      slot_index: 9,
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
