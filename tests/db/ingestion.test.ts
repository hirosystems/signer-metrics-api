import { PgStore } from '../../src/pg/pg-store';
import * as fs from 'node:fs';
import * as readline from 'node:readline/promises';
import * as zlib from 'node:zlib';
import { EventStreamHandler } from '../../src/event-stream/event-stream';
import { onceFilter } from '../../src/helpers';

describe('End-to-end ingestion tests', () => {
  let snpObserverUrl: string;

  const sampleEventsLastMsgId = '5402-0'; // last msgID in the stackerdb-sample-events.tsv.gz events dump
  const sampleEventsBlockHeight = 505; // last block height in the stackerdb-sample-events.tsv.gz events dump

  let db: PgStore;
  beforeAll(async () => {
    snpObserverUrl = process.env['SNP_OBSERVER_URL'] as string;
    db = await PgStore.connect();
  });

  afterAll(async () => {
    await db.close();
  });

  test('db chaintip starts at 1', async () => {
    const chainTip = await db.getChainTipBlockHeight();
    expect(chainTip).toBe(1);
  });

  test('populate SNP server data', async () => {
    const payloadDumpFile = './tests/dumps/stackerdb-sample-events.tsv.gz';
    const rl = readline.createInterface({
      input: fs.createReadStream(payloadDumpFile).pipe(zlib.createGunzip()),
      crlfDelay: Infinity,
    });
    for await (const line of rl) {
      const [_id, timestamp, path, payload] = line.split('\t');
      // use fetch to POST the payload to the SNP event observer server
      try {
        const res = await fetch(snpObserverUrl + path, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Original-Timestamp': timestamp },
          body: payload,
        });
        if (res.status !== 200) {
          throw new Error(`Failed to POST event: ${path} - ${payload.slice(0, 100)}`);
        }
      } catch (error) {
        console.error(`Error posting event: ${error}`, error);
        throw error;
      }
    }
    rl.close();
  });

  test('ingest msgs from SNP server', async () => {
    const lastRedisMsgId = await db.getLastIngestedRedisMsgId();
    expect(lastRedisMsgId).toBe('0');
    const eventStreamListener = new EventStreamHandler({ db, lastMessageId: lastRedisMsgId });
    await eventStreamListener.start();
    // wait for last msgID to be processed
    const [{ msgId: lastMsgProcessed }] = await onceFilter(
      eventStreamListener.events,
      'processedMessage',
      ({ msgId }) => {
        return msgId === sampleEventsLastMsgId;
      }
    );
    expect(lastMsgProcessed).toBe(sampleEventsLastMsgId);
    await eventStreamListener.stop();
  });

  test('validate all events ingested', async () => {
    const finalPostgresMsgId = await db.getLastIngestedRedisMsgId();
    expect(finalPostgresMsgId).toBe(sampleEventsLastMsgId);
  });

  test('validate blocks ingested', async () => {
    const chainTip = await db.getChainTipBlockHeight();
    expect(chainTip).toBe(sampleEventsBlockHeight);
  });
});
