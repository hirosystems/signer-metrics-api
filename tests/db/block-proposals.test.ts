import * as fs from 'node:fs';
import * as readline from 'node:readline/promises';
import * as zlib from 'node:zlib';
import { FastifyInstance } from 'fastify';
import { StacksPayload } from '@hirosystems/chainhook-client';
import { buildApiServer } from '../../src/api/init';
import { PgStore } from '../../src/pg/pg-store';
import { PoxInfo, RpcStackerSetResponse } from '../../src/stacks-core-rpc/stacks-core-rpc-client';
import { rpcStackerSetToDbRewardSetSigners } from '../../src/stacks-core-rpc/stacker-set-updater';
import { DbBlockPush } from '../../src/pg/types';

describe('Block proposal tests', () => {
  let db: PgStore;
  let apiServer: FastifyInstance;

  beforeEach(async () => {
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

  afterEach(async () => {
    await apiServer.close();
    await db.close();
  });

  test('block proposal is accepted by block push only', async () => {
    // Get latest block push
    const [blockPush] = await db.sql<
      DbBlockPush[]
    >`SELECT * FROM block_pushes ORDER BY block_height DESC LIMIT 1`;

    let [testProposal] = await db.getBlockProposal({
      sql: db.sql,
      blockHash: blockPush.block_hash as string,
    });
    expect(testProposal.status).toBe('accepted');

    // Delete from blocks table
    await db.chainhook.rollBackBlock(db.sql, blockPush.block_height);
    await db.chainhook.rollBackBlockSignerSignatures(db.sql, blockPush.block_height);
    // Set chaintip to the block before the block push
    await db.sql`UPDATE chain_tip SET block_height = ${blockPush.block_height - 1}`;

    // Re-fetch block proposal
    [testProposal] = await db.getBlockProposal({
      sql: db.sql,
      blockHash: blockPush.block_hash as string,
    });
    // Block proposal should be accepted when only block_push is present
    expect(testProposal.status).toBe('accepted');
    // Same for recentBlockProposals query
    const testProposalFromList = (
      await db.getRecentBlockProposals({
        sql: db.sql,
        limit: 100,
        offset: 0,
      })
    ).find(b => b.block_hash === blockPush.block_hash);
    expect(testProposalFromList?.status).toBe('accepted');
  });
});
