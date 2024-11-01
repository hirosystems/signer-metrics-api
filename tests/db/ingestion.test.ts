import { PgStore } from '../../src/pg/pg-store';
import * as fs from 'node:fs';
import * as readline from 'node:readline/promises';
import { StacksPayload } from '@hirosystems/chainhook-client';

describe('Postgres ingestion tests', () => {
  let db: PgStore;
  beforeAll(async () => {
    db = await PgStore.connect();
  });

  afterAll(async () => {
    await db.close();
  });

  test('db chaintip starts at 1', async () => {
    const chainTip = await db.getChainTipBlockHeight();
    expect(chainTip).toBe(1);
  });

  test('ingest chainhook payloads', async () => {
    const fileStream = fs.createReadStream('./tests/chainhook-payloads.ndjson');
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
    for await (const line of rl) {
      const payload = JSON.parse(line) as StacksPayload;
      await db.chainhook.processPayload(payload);
    }
    rl.close();

    const chainTip = await db.getChainTipBlockHeight();
    expect(chainTip).toBe(145);
  });
});
