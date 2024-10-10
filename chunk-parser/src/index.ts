import fs from 'node:fs';
import { recoverPubkey } from './recover-slot-pubkey';
import { parseSignerMessage } from './signer-message';
import { StackerDbChunk } from './common';

const fullEventsJson = JSON.parse(fs.readFileSync('../testing/sample-events.json', 'utf8'));
const eventSamples: StackerDbChunk[] = fullEventsJson
  .filter((e: any) => e[2] === '/stackerdb_chunks')
  .map((e: any) => e[3]);

const stackerDbChunkMessages = eventSamples.map((event) => {
  return event.modified_slots.map((slot) => ({
    contract: event.contract_id.name,
    ...slot,
  }));
}).flat();

const parsedMessages = stackerDbChunkMessages.map(msg => { 
  return {
    pubkey: recoverPubkey(msg).pubkey,
    parsedData: parseSignerMessage(Buffer.from(msg.data, 'hex')), 
    ...msg 
  };
});

parsedMessages.forEach(msg => {
  console.log(msg.parsedData);
});
