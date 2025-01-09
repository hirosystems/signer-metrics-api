import { PgStore } from '../../src/pg/pg-store';
import * as fs from 'node:fs';
import * as readline from 'node:readline/promises';
import * as zlib from 'node:zlib';
import { StacksPayload } from '@hirosystems/chainhook-client';

describe('Postgres ingestion tests', () => {
  let db: PgStore;
  beforeAll(async () => {
    db = await PgStore.connect();
    db.notifications._sqlNotifyDisabled = true;
  });

  afterAll(async () => {
    await db.close();
  });

  test('db chaintip starts at 1', async () => {
    const chainTip = await db.getChainTipBlockHeight();
    expect(chainTip).toBe(1);
  });

  test('ingest chainhook payloads', async () => {
    // Surpress noisy logs during bulk insertion test
    const spyInfoLog = jest.spyOn(db.ingestion.logger, 'info').mockImplementation(() => {});
    const spyWarnLog = jest.spyOn(db.ingestion.logger, 'warn').mockImplementation(() => {});

    const payloadDumpFile = './tests/dumps/dump-regtest-chainhook-payloads.ndjson.gz';
    const rl = readline.createInterface({
      input: fs.createReadStream(payloadDumpFile).pipe(zlib.createGunzip()),
      crlfDelay: Infinity,
    });
    for await (const line of rl) {
      const payload = JSON.parse(line) as StacksPayload;
      await db.ingestion.processPayload(payload);
    }
    rl.close();

    spyInfoLog.mockRestore();
    spyWarnLog.mockRestore();

    const chainTip = await db.getChainTipBlockHeight();
    expect(chainTip).toBe(145);
  });
});
