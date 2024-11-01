import { connectPostgres, logger, PgConnectionArgs } from '@hirosystems/api-toolkit';
import { sleep } from '../../src/helpers';
import * as events from 'node:events';
import { ENV } from '../../src/env';
import { PgStore } from '../../src/pg/pg-store';
import * as fs from 'node:fs';
import * as readline from 'node:readline/promises';
import { StacksPayload } from '@hirosystems/chainhook-client';
import * as crypto from 'node:crypto';

describe('Postgres ingestion tests', () => {
  let db: PgStore;
  beforeAll(async () => {
    // use a random PGSCHEMA for each test to avoid conflicts
    const pgSchema = `test_${crypto.randomUUID()}`;
    logger.error(`Using schema: ${pgSchema}`);
    process.env.PGSCHEMA = pgSchema;
    ENV.reload();
    db = await PgStore.connect();
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
