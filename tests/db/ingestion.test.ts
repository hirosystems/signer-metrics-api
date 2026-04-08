import { describe, test, before, after } from 'node:test';
import * as assert from 'node:assert';
import { PgStore } from '../../src/pg/pg-store.ts';
import * as fs from 'node:fs';
import * as readline from 'node:readline/promises';
import * as zlib from 'node:zlib';
import { EventStreamHandler } from '../../src/event-stream/event-stream.ts';
import { Message } from '@stacks/node-publisher-client';

describe('End-to-end ingestion tests', () => {
  const sampleEventsLastMsgId = '5402-0'; // last msgID in the stackerdb-sample-events.tsv.gz events dump
  const sampleEventsBlockHeight = 505; // last block height in the stackerdb-sample-events.tsv.gz events dump

  let db: PgStore;
  before(async () => {
    db = await PgStore.connect();
  });

  after(async () => {
    await db.close();
  });

  test('db chaintip starts at 1', async () => {
    const chainTip = await db.getChainTip(db.sql);
    assert.equal(chainTip.block_height, 1);
  });

  test('ingest msgs from sample events', async () => {
    const eventStreamHandler = new EventStreamHandler({ db });
    const payloadDumpFile = './tests/db/dumps/stackerdb-sample-events.tsv.gz';
    const rl = readline.createInterface({
      input: fs.createReadStream(payloadDumpFile).pipe(zlib.createGunzip()),
      crlfDelay: Infinity,
    });
    let lastMsgId = '';
    for await (const line of rl) {
      const [id, timestamp, path, payload] = line.split('\t');
      await eventStreamHandler.handleMsg(id, timestamp, {
        path,
        payload: JSON.parse(payload),
      } as Message);
      lastMsgId = id;
    }
    rl.close();
    assert.equal(`${lastMsgId}-0`, sampleEventsLastMsgId);
    await eventStreamHandler.threadedParser.close();
  });

  test('validate blocks ingested', async () => {
    const chainTip = await db.getChainTip(db.sql);
    assert.equal(chainTip.block_height, sampleEventsBlockHeight);
  });

  test('validate cycle signer data', async () => {
    const signerData = await db.getSignersForCycle({
      sql: db.sql,
      cycleNumber: 6,
      limit: 10,
      offset: 0,
    });
    assert.ok(signerData);
    assert.equal(signerData.length, 3);

    assert.equal(signerData[0].signer_key,
      '0x028efa20fa5706567008ebaf48f7ae891342eeb944d96392f719c505c89f84ed8d'
    );
    assert.equal(signerData[0].last_metadata_server_version,
      'stacks-signer 0.0.1 (:dd1ebe64603f54dae48558a5d82d9bd885e97a01, debug build, linux [aarch64])'
    );
    assert.equal(signerData[0].stacked_amount, '4125240000000000');
    assert.equal(signerData[0].slot_index, 1);
    assert.equal(signerData[0].stacked_amount_percentage, 50);
    assert.equal(signerData[0].stacked_amount_rank, 1);
    assert.equal(signerData[0].weight, 4);
    assert.equal(signerData[0].weight_percentage, 50);

    assert.equal(signerData[1].signer_key,
      '0x023f19d77c842b675bd8c858e9ac8b0ca2efa566f17accf8ef9ceb5a992dc67836'
    );
    assert.equal(signerData[1].last_metadata_server_version,
      'stacks-signer 0.0.1 (:dd1ebe64603f54dae48558a5d82d9bd885e97a01, debug build, linux [aarch64])'
    );
    assert.equal(signerData[1].stacked_amount, '2750160000000000');
    assert.equal(signerData[1].slot_index, 0);
    assert.equal(signerData[1].stacked_amount_percentage, 33.333);
    assert.equal(signerData[1].stacked_amount_rank, 2);
    assert.equal(signerData[1].weight, 3);
    assert.equal(signerData[1].weight_percentage, 37.5);

    assert.equal(signerData[2].signer_key,
      '0x029fb154a570a1645af3dd43c3c668a979b59d21a46dd717fd799b13be3b2a0dc7'
    );
    assert.equal(signerData[2].last_metadata_server_version,
      'stacks-signer 0.0.1 (:dd1ebe64603f54dae48558a5d82d9bd885e97a01, debug build, linux [aarch64])'
    );
    assert.equal(signerData[2].stacked_amount, '1375080000000000');
    assert.equal(signerData[2].slot_index, 2);
    assert.equal(signerData[2].stacked_amount_percentage, 16.667);
    assert.equal(signerData[2].stacked_amount_rank, 3);
    assert.equal(signerData[2].weight, 1);
    assert.equal(signerData[2].weight_percentage, 12.5);
  });

  test('validate cycle single signer data', async () => {
    const signerData = await db.getSignerForCycle(
      6,
      '0x028efa20fa5706567008ebaf48f7ae891342eeb944d96392f719c505c89f84ed8d'
    );
    assert.ok(signerData);
    assert.equal(signerData?.slot_index, 1);
    assert.equal(signerData?.stacked_amount, '4125240000000000');
    assert.equal(signerData?.stacked_amount_percentage, 50);
    assert.equal(signerData?.stacked_amount_rank, 1);
    assert.equal(signerData?.weight, 4);
    assert.equal(signerData?.weight_percentage, 50);
    assert.equal(signerData?.signer_key,
      '0x028efa20fa5706567008ebaf48f7ae891342eeb944d96392f719c505c89f84ed8d'
    );
  });

  test('validate current cycle signer weight percentages', async () => {
    const signerWeightPercentage = await db.getCurrentCycleSignersWeightPercentage();
    assert.ok(signerWeightPercentage);
    assert.ok(signerWeightPercentage.length > 0);
    for (let i = 1; i < signerWeightPercentage.length; i++) {
      assert.ok(signerWeightPercentage[i - 1].weight >= signerWeightPercentage[i].weight);
    }
    const totalWeight = signerWeightPercentage.reduce((sum, row) => sum + row.weight, 0);
    // DB values are rounded to 3 decimals, so allow a tiny tolerance around 100.
    assert.ok(Math.abs(totalWeight - 100) <= 0.01);
  });
});
