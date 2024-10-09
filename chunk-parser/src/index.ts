import eventSamples from './event-samples.json' with { type: 'json' };
import crypto from 'node:crypto';
import * as secp from '@noble/secp256k1';

interface ModifiedSlot {
  /** Slot identifier (unique for each DB instance) */
  slot_id: number; // u32
  /** Slot version (a lamport clock) */
  slot_version: number; // u32
  /** Chunk data (use the sha512_256 hashed of this for generating a signature) */
  data: string; // hex string
  /** signature over the above */
  sig: string; // hex string (65 bytes)
}

/** Convert a u32 integer into a 4 byte big-endian buffer */
function toU32BeBytes(num: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeUInt32BE(num, 0);
  return buf;
}

/** Get the digest to sign that authenticates this chunk data and metadata */
function authDigest(slot: ModifiedSlot): Buffer {
  const hasher = crypto.createHash('sha512-256');
  hasher.update(toU32BeBytes(slot.slot_id));
  hasher.update(toU32BeBytes(slot.slot_version));

  // Calculate the hash of the chunk bytes. This is the SHA512/256 hash of the data
  const dataHash = crypto.hash('sha512-256', slot.data, 'buffer');
  hasher.update(dataHash);

  return hasher.digest();
}

function recoverPubkey(slot: ModifiedSlot): { pubkey: string; pubkeyHash: string; } {
  const digest = authDigest(slot);
  const sigBuff = Buffer.from(slot.sig, 'hex');

  const recid = sigBuff[0]; // recovery ID (first byte of the signature)
  const sig = sigBuff.subarray(1); // actual signature (remaining 64 bytes)

  const pubkey = secp.Signature
    .fromCompact(sig)
    .addRecoveryBit(recid)
    .recoverPublicKey(digest);

  return { 
    pubkey: pubkey.toHex(),
    pubkeyHash: crypto.hash('ripemd160', pubkey.toRawBytes(), 'hex'),
  };
}

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

/*

// Rust ported

    /// Calculate the hash of the chunk bytes.  This is the SHA512/256 hash of the data.
    pub fn data_hash(&self) -> Sha512Trunc256Sum {
        Sha512Trunc256Sum::from_data(&self.data)
    }

    /// Create an owned SlotMetadata describing the metadata of this slot.
    pub fn get_slot_metadata(&self) -> SlotMetadata {
        SlotMetadata {
            slot_id: self.slot_id,
            slot_version: self.slot_version,
            data_hash: self.data_hash(),
            signature: self.sig,
        }
    }

    /// Get the digest to sign that authenticates this chunk data and metadata
    fn auth_digest(&self) -> Sha512Trunc256Sum {
        let mut hasher = Sha512_256::new();
        hasher.update(self.slot_id.to_be_bytes());
        hasher.update(self.slot_version.to_be_bytes());
        hasher.update(self.data_hash.0);
        Sha512Trunc256Sum::from_hasher(hasher)
    }

    pub fn recover_pk(&self) -> Result<StacksPublicKey, Error> {
        let digest = self.get_slot_metadata().auth_digest();
        StacksPublicKey::recover_to_pubkey(digest.as_bytes(), &self.sig)
            .map_err(|ve| Error::VerifyingError(ve.to_string()))
    }

*/
