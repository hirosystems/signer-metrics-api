import * as fs from 'node:fs';
import { PgStore } from '../../src/pg/pg-store';
import { RpcStackerSetResponse } from '../../src/stacks-core-rpc/stacks-core-rpc-client';
import { rpcStackerSetToDbRewardSetSigners } from '../../src/stacks-core-rpc/stacker-set-updater';

describe('Duplicate signer set insert', () => {
  let db: PgStore;

  beforeAll(async () => {
    db = await PgStore.connect();
  });

  afterAll(async () => {
    await db.close();
  });

  test('Insert initial signer set', async () => {
    const stackerSetDump = JSON.parse(
      fs.readFileSync('./tests/dumps/dump-stacker-set-cycle-72-2024-11-02.json', 'utf8')
    ) as RpcStackerSetResponse;
    const insertResult = await db.ingestion.insertRewardSetSigners(
      db.sql,
      rpcStackerSetToDbRewardSetSigners(stackerSetDump, 72)
    );
    expect(insertResult).toEqual({
      rowsDeleted: 0,
      rowsInserted: 11,
    });
  });

  test('Overwrite signer set', async () => {
    const stackerSetDump = JSON.parse(
      fs.readFileSync('./tests/dumps/dump-stacker-set-cycle-72-2024-11-02.json', 'utf8')
    ) as RpcStackerSetResponse;
    const insertResult = await db.ingestion.insertRewardSetSigners(
      db.sql,
      rpcStackerSetToDbRewardSetSigners(stackerSetDump, 72)
    );
    expect(insertResult).toEqual({
      rowsDeleted: 11,
      rowsInserted: 11,
    });
  });
});
