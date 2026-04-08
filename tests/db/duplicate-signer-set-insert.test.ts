import * as fs from 'node:fs';
import * as assert from 'node:assert';
import { describe, test, before, after } from 'node:test';
import { PgStore } from '../../src/pg/pg-store.ts';
import { RpcStackerSetResponse } from '../../src/stacks-core-rpc/stacks-core-rpc-client.ts';
import { rpcStackerSetToDbRewardSetSigners } from '../../src/stacks-core-rpc/stacker-set-updater.ts';

describe('Duplicate signer set insert', () => {
  let db: PgStore;

  before(async () => {
    db = await PgStore.connect();
  });

  after(async () => {
    await db.close();
  });

  test('Insert initial signer set', async () => {
    const stackerSetDump = JSON.parse(
      fs.readFileSync('./tests/db/dumps/dump-stacker-set-cycle-72-2024-11-02.json', 'utf8')
    ) as RpcStackerSetResponse;
    const insertResult = await db.ingestion.insertRewardSetSigners(
      db.sql,
      rpcStackerSetToDbRewardSetSigners(stackerSetDump, 72)
    );
    assert.equal(insertResult.rowsDeleted, 0);
    assert.equal(insertResult.rowsInserted, 11);
  });

  test('Overwrite signer set', async () => {
    const stackerSetDump = JSON.parse(
      fs.readFileSync('./tests/db/dumps/dump-stacker-set-cycle-72-2024-11-02.json', 'utf8')
    ) as RpcStackerSetResponse;
    const insertResult = await db.ingestion.insertRewardSetSigners(
      db.sql,
      rpcStackerSetToDbRewardSetSigners(stackerSetDump, 72)
    );
    assert.equal(insertResult.rowsDeleted, 11);
    assert.equal(insertResult.rowsInserted, 11);
  });
});
