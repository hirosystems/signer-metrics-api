import * as fs from 'node:fs';
import * as readline from 'node:readline/promises';
import * as assert from 'node:assert';
import * as zlib from 'node:zlib';
import { once } from 'node:events';
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
import { BlockProposalEventArgs } from '../../src/pg/types';

describe('Db notifications tests', () => {
  let db: PgStore;
  let apiServer: FastifyInstance;

  const testingBlockHash = '0x2f1c4e83fda403682b1ab5dd41383e47d2cb3dfec0fd26f0886883462d7802fb';
  let proposalTestPayload: StacksPayload;

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
      const payload = JSON.parse(line) as StacksPayload;
      // find and store the test block proposal payload for later testing
      if (
        !proposalTestPayload &&
        payload.events.find(
          event =>
            event.payload.data.message.type === 'BlockProposal' &&
            event.payload.data.message.data.block.block_hash === testingBlockHash
        )
      ) {
        proposalTestPayload = payload;
      }
      await db.chainhook.processPayload(payload);
    }
    rl.close();
    spyInfoLog.mockRestore();
  });

  afterAll(async () => {
    await apiServer.close();
    await db.close();
  });

  test('test block proposal write events', async () => {
    // await new Promise(resolve => {
    //   setTimeout(() => {
    //     void db.notifications.subscribeToDbListenEvents().then(resolve);
    //   }, 0);
    // });
    await db.notifications.subscribeToDbListenEvents();

    const pgNotifyEvent: Promise<BlockProposalEventArgs[]> = once(
      db.notifications.events,
      'blockProposal'
    );
    const initialWriteEvent: Promise<BlockProposalEventArgs[]> = once(
      db.chainhook.events,
      'blockProposal'
    );
    // delete block proposal from db, returning the data so we can re-write it
    const blockProposal = await db.chainhook.deleteBlockProposal(db.sql, testingBlockHash);
    expect(blockProposal.block_hash).toBe(testingBlockHash);

    const blockResponses = await db.chainhook.deleteBlockResponses(db.sql, testingBlockHash);
    expect(blockResponses.length).toBeGreaterThan(0);
    expect(blockResponses[0].signer_sighash).toBe(testingBlockHash);

    await db.chainhook.processPayload(proposalTestPayload);

    const promiseResults = await Promise.allSettled([pgNotifyEvent, initialWriteEvent]);
    console.log(promiseResults);
  });
});
