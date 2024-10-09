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

  readU8Enum<T extends Record<string, number>>(enumObj: T): T[keyof T] {
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

  readBitVec(): boolean[] {
    const len = this.readU16BE();
    const byteLen = Math.ceil(len / 8);
    const bitVecBytes = this.readBytes(byteLen);
    return Array.from({ length: len }, (_, i) =>
      (bitVecBytes[Math.floor(i / 8)] & (1 << (i % 8))) !== 0
    );
  }

  readArray<T>(readArrayItem: (reader: this) => T): T[] {
    return Array.from({ length: this.readU32BE() }, () => readArrayItem(this));
  }

  readUtf8String(): string {
    const len = this.readU8();
    const bytes = this.readBytes(len);
    return bytes.toString('utf8');
  }

  /** Used for silly encodings like `write(myString.as_bytes().to_vec())` which forces a u32 vec length prefix */
  readVecString(): string {
    const length = this.readU32BE();
    const bytes = this.readBytes(length);
    return bytes.toString('utf8');
  }

}
