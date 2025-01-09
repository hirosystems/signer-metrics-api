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
        bitVecBytes[Math.floor(i / 8)] |= 1 << i % 8;
      }
    }
    this.writeBytes(bitVecBytes);
  }
}
