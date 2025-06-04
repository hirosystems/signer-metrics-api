import crypto from 'node:crypto';
// import * as secp from '@noble/secp256k1';
import { ModifiedSlot, NewNakamotoBlockMessage, toU32BeBytes } from './common';

let secp: typeof import('@noble/secp256k1');

async function getSecp() {
  if (!secp) secp = await import('@noble/secp256k1');
  return secp;
}
getSecp().catch(error => {
  console.error(`Failed to load secp256k1: ${error}`, error);
  throw error;
});

/** Get the digest to sign that authenticates this chunk data and metadata */
function authDigest(slot: ModifiedSlot): Buffer {
  const hasher = crypto.createHash('sha512-256');
  hasher.update(toU32BeBytes(slot.slot_id));
  hasher.update(toU32BeBytes(slot.slot_version));

  // Calculate the hash of the chunk bytes. This is the SHA512/256 hash of the data
  const dataHash = crypto.hash('sha512-256', Buffer.from(slot.data, 'hex'), 'buffer');
  hasher.update(dataHash);

  return hasher.digest();
}

export function recoverChunkSlotPubkey(slot: ModifiedSlot): { pubkey: string; pubkeyHash: string; } {
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

export function recoverBlockSignerPubkeys(block: NewNakamotoBlockMessage): string[] {
  const sigHash = Buffer.from(block.signer_signature_hash.replace(/^0x/, ''), 'hex');
  
  return block.signer_signature.map((signerSig) => {
    const signerSigBuff = Buffer.from(signerSig.replace(/^0x/, ''), 'hex');
    const recid = signerSigBuff[0]; // recovery ID (first byte of the signature)
    const sig = signerSigBuff.subarray(1); // actual signature (remaining 64 bytes)

    const pubkey = secp.Signature
      .fromCompact(sig)
      .addRecoveryBit(recid)
      .recoverPublicKey(sigHash);

    return pubkey.toHex();
  });
}

/*

// Rust ported:

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
