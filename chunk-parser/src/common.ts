export interface ModifiedSlot {
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
export function toU32BeBytes(num: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeUInt32BE(num, 0);
  return buf;
}
