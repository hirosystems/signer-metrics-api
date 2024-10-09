import eventSamples from './event-samples.json' with { type: 'json' };
import { recoverPubkey } from './recover-slot-pubkey';

const stackerDbChunkMessages = eventSamples.map((event) => {
  return event.modified_slots.map((slot) => ({
    contract: event.contract_id.name,
    ...slot,
  }));
}).flat();

const pubKeys = stackerDbChunkMessages.map(msg => {
  return {
    pubkey: recoverPubkey(msg).pubkey,
    ...msg
  };
});

console.log(pubKeys);

