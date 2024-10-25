import fs from 'node:fs';
import util from 'node:util';
import { recoverBlockSignerPubkeys, recoverChunkSlotPubkey } from './recover-slot-pubkey';
import { parseSignerMessage } from './signer-message';
import { NewNakamotoBlockMessage, StackerDbChunk } from './common';

const fullEventsJson = JSON.parse(fs.readFileSync('../testing/sample-events.json', 'utf8'));
const eventSamples: (StackerDbChunk | NewNakamotoBlockMessage)[] = fullEventsJson
  .filter((e: any) => e[2] === '/stackerdb_chunks' || e[2] === '/new_block')
  .map((e: any) => e[3]);

for (const event of eventSamples) {
  if ('signer_signature_hash' in event) {
    parseNakamotoBlock(event);
  } else if ('modified_slots' in event) {
    parseStackerDbChunk(event);
  }
}

function parseNakamotoBlock(block: NewNakamotoBlockMessage) {
  const signerPubkeys = recoverBlockSignerPubkeys(block);
  const blockData = {
    blockHeight: block.block_height,
    blockHash: block.block_hash,
    indexBlockHash: block.index_block_hash,
    signerSignatures: block.signer_signature,
    signerPubKeys: signerPubkeys,
  };
  const log = util.inspect(blockData, { showHidden: false, depth: null, colors: true })
  console.log(log);
}

function parseStackerDbChunk(chunk: StackerDbChunk) {
  const slots = chunk.modified_slots.map((slot) => ({
    contract: chunk.contract_id.name,
    ...slot,
  })).flat();

  const parsedMessages = slots.map(msg => { 
    return {
      pubkey: recoverChunkSlotPubkey(msg).pubkey,
      contract: msg.contract,
      sig: msg.sig,
      ...parseSignerMessage(Buffer.from(msg.data, 'hex')), 
    };
  });

  parsedMessages.forEach(msg => {
    const log = util.inspect(msg, { showHidden: false, depth: null, colors: true })
    console.log(log);
  });
}
