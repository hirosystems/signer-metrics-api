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

export interface StackerDbChunk {
  contract_id: {
    issuer: [number, number[]];
    name: string;
  };
  modified_slots: ModifiedSlot[];
}

export interface NewNakamotoBlockMessage {
  index_block_hash: string;
  block_height: number;
  block_hash: string;
  signer_signature: string[];
  signer_bitvec: string;
  signer_signature_hash: string;
}

/** Convert a u32 integer into a 4 byte big-endian buffer */
export function toU32BeBytes(num: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeUInt32BE(num, 0);
  return buf;
}

export function getEnumName<T extends Record<string | number, string | number>, V extends T[keyof T]>(
  enumObj: T,
  value: V
): Extract<keyof T, string> {
  const key = Object.keys(enumObj).find((key) => enumObj[key] === value) as Extract<keyof T, string> | undefined;
  if (!key) {
    throw new Error(`Value ${value} is not a valid enum value.`);
  }
  return key;
}

export class BufferCursor {
  buffer: Buffer;

  constructor(buffer: Buffer) {
    this.buffer = buffer;
  }

  readU8(): number {
    const val = this.buffer.readUInt8(0);
    this.buffer = this.buffer.subarray(1);
    return val;
  }

  readU8Enum<T extends Record<string | number, string | number>>(enumObj: T): T[keyof T] {
    const value = this.readU8();
    if (Object.values(enumObj).includes(value)) {
      return value as T[keyof T];
    } else {
      throw new Error(`Invalid enum value: ${value}, valid values are: ${Object.values(enumObj).join(', ')}`);
    }
  }

  readU16BE(): number {
    const val = this.buffer.readUInt16BE(0);
    this.buffer = this.buffer.subarray(2);
    return val;
  }

  readU32BE(): number {
    const val = this.buffer.readUInt32BE(0);
    this.buffer = this.buffer.subarray(4);
    return val;
  }

  readU64BE(): bigint {
    const val = this.buffer.readBigUInt64BE(0);
    this.buffer = this.buffer.subarray(8);
    return val;
  }

  readBytes(len: number): Buffer {
    const val = this.buffer.subarray(0, len);
    this.buffer = this.buffer.subarray(len);
    return val;
  }

  readBitVec(): string {
    const bitVecLength = this.readU16BE();
    const dataVecLength = this.readU32BE();
    const bitVecBytes = this.readBytes(dataVecLength);
    return Array.from({ length: bitVecLength }, (_, i) =>
      (bitVecBytes[Math.floor(i / 8)] & (1 << (i % 8))) !== 0 ? "1" : "0"
    ).join('');
  }

  readArray<T>(readArrayItem: (reader: this) => T): T[] {
    return Array.from({ length: this.readU32BE() }, () => readArrayItem(this));
  }

  /** Used for silly encodings like `write(myString.as_bytes().to_vec())` which forces a u32 vec length prefix */
  readVecString(): string {
    const length = this.readU32BE();
    const bytes = this.readBytes(length);
    return bytes.toString('utf8');
  }

}

export class BufferWriter {
  buffer: Buffer;
  constructor() {
    this.buffer = Buffer.alloc(0);
  }

  writeU8(val: number): void {
    const buf = Buffer.alloc(1);
    buf.writeUInt8(val, 0);
    this.buffer = Buffer.concat([this.buffer, buf]);
  }

  writeU16BE(val: number): void {
    const buf = Buffer.alloc(2);
    buf.writeUInt16BE(val, 0);
    this.buffer = Buffer.concat([this.buffer, buf]);
  }

  writeU32BE(val: number): void {
    const buf = Buffer.alloc(4);
    buf.writeUInt32BE(val, 0);
    this.buffer = Buffer.concat([this.buffer, buf]);
  }

  writeU64BE(val: bigint): void {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64BE(val, 0);
    this.buffer = Buffer.concat([this.buffer, buf]);
  }

  writeBytes(bytes: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, bytes]);
  }

  writeBitVec(bitVec: string): void {
    this.writeU16BE(bitVec.length);
    this.writeU32BE(Math.ceil(bitVec.length / 8));
    const bitVecBytes = Buffer.alloc(Math.ceil(bitVec.length / 8));
    for (let i = 0; i < bitVec.length; i++) {
      if (bitVec[i] === '1') {
        bitVecBytes[Math.floor(i / 8)] |= 1 << (i % 8);
      }
    }
    this.writeBytes(bitVecBytes);
  }
}
