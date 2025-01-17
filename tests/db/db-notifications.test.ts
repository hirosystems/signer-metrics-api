import * as fs from "node:fs";
import * as readline from "node:readline/promises";
import * as zlib from "node:zlib";
import * as supertest from "supertest";
import { FastifyInstance } from "fastify";
import { StacksPayload } from "@hirosystems/chainhook-client";
import { buildApiServer, buildPromServer } from "../../src/api/init";
import { PgStore } from "../../src/pg/pg-store";
import { BlockProposalsEntry } from "../../src/api/schemas";
import {
  PoxInfo,
  RpcStackerSetResponse,
} from "../../src/stacks-core-rpc/stacks-core-rpc-client";
import { rpcStackerSetToDbRewardSetSigners } from "../../src/stacks-core-rpc/stacker-set-updater";
import { io, Socket } from "socket.io-client";
import {
  ClientToServerEvents,
  ServerToClientEvents,
} from "../../src/api/routes/socket-io";
import { waitForEvent } from "../../src/helpers";
import { ENV } from "../../src/env";
import { configureSignerMetrics } from "../../src/prom-metrics";
import { IFastifyMetrics } from 'fastify-metrics';
import * as prom from 'prom-client';

describe("Db notifications tests", () => {
  let db: PgStore;
  let apiServer: FastifyInstance;

  let socketClient: Socket<ServerToClientEvents, ClientToServerEvents>;

  const testingBlockHash =
    "0x2f1c4e83fda403682b1ab5dd41383e47d2cb3dfec0fd26f0886883462d7802fb";
  let proposalTestPayload: StacksPayload;
  let blockPushTestPayload: StacksPayload;

  beforeEach(async () => {
    db = await PgStore.connect();
    db.notifications._sqlNotifyDisabled = true;
    apiServer = await buildApiServer({ db });
    await apiServer.listen({ port: 0, host: "127.0.0.1" });

    // insert pox-info dump
    const poxInfoDump = JSON.parse(
      fs.readFileSync("./tests/dumps/dump-pox-info-2024-11-02.json", "utf8"),
    ) as PoxInfo;
    await db.updatePoxInfo(poxInfoDump);

    // insert stacker-set dump
    const stackerSetDump = JSON.parse(
      fs.readFileSync(
        "./tests/dumps/dump-stacker-set-cycle-72-2024-11-02.json",
        "utf8",
      ),
    ) as RpcStackerSetResponse;
    await db.chainhook.insertRewardSetSigners(
      db.sql,
      rpcStackerSetToDbRewardSetSigners(stackerSetDump, 72),
    );

    // insert chainhook-payloads dump
    const spyInfoLog = jest
      .spyOn(db.chainhook.logger, "info")
      .mockImplementation(() => {}); // Surpress noisy logs during bulk insertion test
    const payloadDumpFile =
      "./tests/dumps/dump-chainhook-payloads-2024-11-02.ndjson.gz";
    const rl = readline.createInterface({
      input: fs.createReadStream(payloadDumpFile).pipe(zlib.createGunzip()),
      crlfDelay: Infinity,
    });
    for await (const line of rl) {
      const payload = JSON.parse(line) as StacksPayload;
      // find and store the test block proposal payload for later testing
      if (!proposalTestPayload) {
        const proposal = payload.events.find(
          (event) =>
            event.payload.data.message.type === "BlockProposal" &&
            event.payload.data.message.data.block.block_hash ===
              testingBlockHash,
        );
        if (proposal) {
          proposalTestPayload = { ...payload, events: [proposal] };
        }
      }
      if (!blockPushTestPayload) {
        const blockPush = payload.events.find(
          (event) =>
            event.payload.data.message.type === "BlockPushed" &&
            event.payload.data.message.data.block.block_hash ===
              testingBlockHash,
        );
        if (blockPush) {
          blockPushTestPayload = { ...payload, events: [blockPush] };
        }
      }
      await db.chainhook.processPayload(payload);
    }
    rl.close();
    spyInfoLog.mockRestore();

    socketClient = io(
      `ws://127.0.0.1:${apiServer.addresses()[0].port}/block-proposals`,
      {
        path: "/signer-metrics/socket.io/",
      },
    );
    await new Promise<void>((resolve, reject) => {
      socketClient.on("connect", resolve);
      socketClient.io.on("error", reject);
    });
    db.notifications._sqlNotifyDisabled = false;
  });

  afterEach(async () => {
    socketClient.disconnect();
    await apiServer.close();
    await db.close();
  });

  test("test block proposal write events", async () => {
    const pgNotifyEvent = waitForEvent(
      db.notifications.events,
      "signerMessages",
      (msg) => {
        return (
          "proposal" in msg[0] && msg[0].proposal.blockHash === testingBlockHash
        );
      },
      AbortSignal.timeout(10000),
    );

    const initialWriteEvent = waitForEvent(
      db.chainhook.events,
      "signerMessages",
      (msg) => {
        return (
          "proposal" in msg[0] && msg[0].proposal.blockHash === testingBlockHash
        );
      },
      AbortSignal.timeout(10000),
    );

    const clientSocketEvent = new Promise<BlockProposalsEntry>((resolve) => {
      socketClient.on("blockProposal", (data) => {
        resolve(data);
      });
    });

    // delete block proposal from db, returning the data so we can re-write it
    const blockProposal = await db.chainhook.deleteBlockProposal(
      db.sql,
      testingBlockHash,
    );
    expect(blockProposal.block_hash).toBe(testingBlockHash);

    const blockResponses = await db.chainhook.deleteBlockResponses(
      db.sql,
      testingBlockHash,
    );
    expect(blockResponses.length).toBeGreaterThan(0);
    expect(blockResponses[0].signer_sighash).toBe(testingBlockHash);

    await db.chainhook.processPayload(proposalTestPayload);

    const promiseResults = await Promise.all([
      pgNotifyEvent,
      initialWriteEvent,
      clientSocketEvent,
    ]);
    expect(
      promiseResults[0][0].find(
        (r) => "proposal" in r && r.proposal.blockHash === testingBlockHash,
      ),
    ).toBeTruthy();
    expect(
      promiseResults[1][0].find(
        (r) => "proposal" in r && r.proposal.blockHash === testingBlockHash,
      ),
    ).toBeTruthy();
    expect(promiseResults[2].block_hash).toBe(testingBlockHash);
  });

  test("test block push write events", async () => {
    const pgNotifyEvent = waitForEvent(
      db.notifications.events,
      "signerMessages",
      (msg) => {
        return "push" in msg[0] && msg[0].push.blockHash === testingBlockHash;
      },
      AbortSignal.timeout(10000),
    );

    const initialWriteEvent = waitForEvent(
      db.chainhook.events,
      "signerMessages",
      (msg) => {
        return "push" in msg[0] && msg[0].push.blockHash === testingBlockHash;
      },
      AbortSignal.timeout(10000),
    );

    const clientSocketEvent = new Promise<BlockProposalsEntry>((resolve) => {
      socketClient.on("blockProposal", (data) => {
        resolve(data);
      });
    });

    // delete block proposal from db, returning the data so we can re-write it
    const blockPush = await db.chainhook.deleteBlockPush(
      db.sql,
      testingBlockHash,
    );
    expect(blockPush.block_hash).toBe(testingBlockHash);

    await db.chainhook.processPayload(blockPushTestPayload);

    const promiseResults = await Promise.all([
      pgNotifyEvent,
      initialWriteEvent,
      clientSocketEvent,
    ]);
    expect(
      promiseResults[0][0].find(
        (r) => "push" in r && r.push.blockHash === testingBlockHash,
      ),
    ).toBeTruthy();
    expect(
      promiseResults[1][0].find(
        (r) => "push" in r && r.push.blockHash === testingBlockHash,
      ),
    ).toBeTruthy();
    expect(promiseResults[2].block_hash).toBe(testingBlockHash);
  });

  test("prometheus signer metrics", async () => {
    const metrics: IFastifyMetrics = { client: prom, initMetricsInRegistry() {} };
    const promServer = await buildPromServer({ metrics });
    configureSignerMetrics(db);
    await promServer.listen({ host: "127.0.0.1", port: 9153 });

    const bucketsEnvName = "SIGNER_PROMETHEUS_METRICS_BLOCK_PERIODS";
    const metricPrefix = "signer_api_";
    const orig = ENV[bucketsEnvName];

    const buckets = [1, 2, 3, 5, 10, 100, 1000];
    process.env[bucketsEnvName] = buckets.join(",");
    ENV.reload();
    const blockRanges = ENV[bucketsEnvName].split(",").map(Number);

    // Delete from confirmed blocks tables to ensure there is a pending block_proposal
    const [{ block_height }] = await db.sql<
      { block_height: number }[]
    >`SELECT block_height FROM block_proposals ORDER BY block_height DESC LIMIT 1`;
    await db.sql`DELETE FROM blocks WHERE block_height >= ${block_height}`;
    await db.sql`DELETE FROM block_pushes WHERE block_height >= ${block_height}`;

    const pendingProposalDate = await db.getLastPendingProposalDate({
      sql: db.sql,
    });
    expect(pendingProposalDate).toBeInstanceOf(Date);
    expect(
      new Date().getTime() - pendingProposalDate!.getTime(),
    ).toBeGreaterThan(0);

    const dbPushMetricsResult = await db.getRecentBlockPushMetrics({
      sql: db.sql,
      blockRanges,
    });
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

    const dbMetricsResult = await db.getRecentSignerMetrics({
      sql: db.sql,
      blockRanges,
    });
    expect(dbMetricsResult).toEqual(
      expect.arrayContaining([
        {
          signer_key:
            "0x03fc7cb917698b6137060f434988f7688520972dfb944f9b03c0fbf1c75303e79a",
          block_ranges: {
            "1": { missing: 0, accepted: 1, rejected: 0 },
            "2": { missing: 0, accepted: 2, rejected: 0 },
            "3": { missing: 0, accepted: 3, rejected: 0 },
            "5": { missing: 0, accepted: 5, rejected: 0 },
            "10": { missing: 0, accepted: 10, rejected: 0 },
            "100": { missing: 1, accepted: 86, rejected: 12 },
            "1000": { missing: 1, accepted: 86, rejected: 12 },
          },
        },
      ]),
    );

    const responseTest = await supertest(promServer.server)
      .get("/metrics")
      .expect(200);
    const receivedLines = responseTest.text.split("\n");

    const expectedPendingProposalLineRegex = new RegExp(
      `# TYPE ${metricPrefix}time_since_last_pending_block_proposal_ms gauge\n${metricPrefix}time_since_last_pending_block_proposal_ms [1-9]\d*`,
      "g",
    );
    expect(responseTest.text).toMatch(expectedPendingProposalLineRegex);

    const expectedPushTimeLines = `# TYPE ${metricPrefix}avg_block_push_time_ms gauge
${metricPrefix}avg_block_push_time_ms{period="1"} 27262
${metricPrefix}avg_block_push_time_ms{period="2"} 30435.5
${metricPrefix}avg_block_push_time_ms{period="3"} 28167.333`;
    expect(receivedLines).toEqual(
      expect.arrayContaining(expectedPushTimeLines.split("\n")),
    );

    const expectedAcceptanceRateLines = `# TYPE ${metricPrefix}proposal_acceptance_rate gauge
${metricPrefix}proposal_acceptance_rate{period="1"} 0
${metricPrefix}proposal_acceptance_rate{period="2"} 0.5
${metricPrefix}proposal_acceptance_rate{period="3"} 0.6667
${metricPrefix}proposal_acceptance_rate{period="5"} 0.6
${metricPrefix}proposal_acceptance_rate{period="10"} 0.8
${metricPrefix}proposal_acceptance_rate{period="100"} 0.7778
${metricPrefix}proposal_acceptance_rate{period="1000"} 0.7778`;
    expect(receivedLines).toEqual(
      expect.arrayContaining(expectedAcceptanceRateLines.split("\n")),
    );

    const expectedSignerStateLines = `# TYPE ${metricPrefix}signer_state_count gauge
${metricPrefix}signer_state_count{signer="0x03fc7cb917698b6137060f434988f7688520972dfb944f9b03c0fbf1c75303e79a",period="1",state="missing"} 0
${metricPrefix}signer_state_count{signer="0x03fc7cb917698b6137060f434988f7688520972dfb944f9b03c0fbf1c75303e79a",period="1",state="accepted"} 1
${metricPrefix}signer_state_count{signer="0x03fc7cb917698b6137060f434988f7688520972dfb944f9b03c0fbf1c75303e79a",period="1",state="rejected"} 0
${metricPrefix}signer_state_count{signer="0x03fc7cb917698b6137060f434988f7688520972dfb944f9b03c0fbf1c75303e79a",period="2",state="missing"} 0
${metricPrefix}signer_state_count{signer="0x03fc7cb917698b6137060f434988f7688520972dfb944f9b03c0fbf1c75303e79a",period="2",state="accepted"} 2
${metricPrefix}signer_state_count{signer="0x03fc7cb917698b6137060f434988f7688520972dfb944f9b03c0fbf1c75303e79a",period="2",state="rejected"} 0`;
    expect(receivedLines).toEqual(
      expect.arrayContaining(expectedSignerStateLines.split("\n")),
    );

    const expectedWeightPercentageLines = `# TYPE ${metricPrefix}signer_weight_percentage gauge
${metricPrefix}signer_weight_percentage{signer="0x02e8620935d58ebffa23c260f6917cbd0915ea17d7a46df17e131540237d335504"} 76
${metricPrefix}signer_weight_percentage{signer="0x036a44f61d85efa844b42475f107b106dc8fb209ae27813893c3269c59821e0333"} 6
${metricPrefix}signer_weight_percentage{signer="0x0382ebc8732f0d5f1501a9f842dc6a357497303c71ea8ca4b3858f41fe64e2c3a1"} 2
${metricPrefix}signer_weight_percentage{signer="0x0333545cd2634813ea042c9dfc199b6e635dc0db391b6104b002d82393c9a58691"} 2
${metricPrefix}signer_weight_percentage{signer="0x0399649284ed10a00405f032f8567b5e5463838aaa00af8d6bc9da71dda4e19c9c"} 2
${metricPrefix}signer_weight_percentage{signer="0x037fc1bb0eab484f5807ba2bfdeb208f9104fa89abbbb8034e23f33df4b9e5ab10"} 2
${metricPrefix}signer_weight_percentage{signer="0x02f5b5555964731f77bc3a3767ef3ed64ed0ba2971e8792272349db1a148e43ad5"} 2
${metricPrefix}signer_weight_percentage{signer="0x02abcde47f94fcf54f6926127368ddd2ae8c11a27b854269378113e2f6835cb372"} 2
${metricPrefix}signer_weight_percentage{signer="0x02b635d0521ef891a2549253eff2f5d09665af0ecfb21b0aacbf2658e7e7b06761"} 2
${metricPrefix}signer_weight_percentage{signer="0x03fc7cb917698b6137060f434988f7688520972dfb944f9b03c0fbf1c75303e79a"} 2
${metricPrefix}signer_weight_percentage{signer="0x02567b1f5056f6c3e59e759f66216d21239904d1cc2d847c5dcc3c2b6534d7bead"} 2`;
    expect(receivedLines).toEqual(
      expect.arrayContaining(expectedWeightPercentageLines.split("\n")),
    );

    process.env[bucketsEnvName] = orig;
    ENV.reload();

    await promServer.close();
  });
});
