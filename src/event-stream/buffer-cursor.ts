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
      throw new Error(
        `Invalid enum value: ${value}, valid values are: ${Object.values(enumObj).join(', ')}`
      );
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
      (bitVecBytes[Math.floor(i / 8)] & (1 << i % 8)) !== 0 ? '1' : '0'
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

  readU8LengthPrefixedString(): string {
    const length = this.readU8();
    const bytes = this.readBytes(length);
    return bytes.toString('utf8');
  }
}
