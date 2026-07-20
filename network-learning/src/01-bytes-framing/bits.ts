// =============================================================================
// Chapter 01 — Bits, Bytes, and Bit-Level Operations
// =============================================================================
// Goal: every network protocol ultimately serializes to a stream of bits on a
// wire. Before you can read a frame you must be able to:
//   * treat a byte as 8 ordered bits
//   * read individual bits with a cursor
//   * pack arbitrary-length bit fields (sub-byte fields, 3-bit, 11-bit, etc.)
//   * convert between bytes and printable forms for debugging
//
// All of the public functions in this file are pure and total. They are the
// building blocks for every later chapter (framing, encoding, link coding).
// =============================================================================

/** A read/write cursor over a Uint8Array buffer. */
export class BitCursor {
  private readonly bytes: Uint8Array;
  private bitPos = 0;

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
  }

  /** Total number of bits remaining in the cursor. */
  remaining(): number {
    return this.bytes.length * 8 - this.bitPos;
  }

  /** Current absolute bit position. */
  position(): number {
    return this.bitPos;
  }

  /** Seek to an absolute bit position. */
  seek(bit: number): void {
    if (bit < 0 || bit > this.bytes.length * 8) {
      throw new RangeError(`bit position ${bit} out of range`);
    }
    this.bitPos = bit;
  }

  /**
   * Read `n` bits (1..=32) starting at the current cursor and advance the
   * cursor. Bits are read MSB-first within each byte — i.e. the same order in
   * which they appear on a wire.
   */
  readBits(n: number): number {
    if (n <= 0 || n > 32) throw new RangeError(`n must be in 1..=32, got ${n}`);
    if (this.remaining() < n) throw new RangeError('not enough bits left');

    let value = 0;
    for (let i = 0; i < n; i++) {
      const byteIndex = (this.bitPos + i) >>> 3;
      const bitInByte = 7 - ((this.bitPos + i) & 7);
      const bit = (this.bytes[byteIndex]! >> bitInByte) & 1;
      value = (value << 1) | bit;
    }
    this.bitPos += n;
    return value >>> 0;
  }

  /** Convenience for one bit. */
  readBit(): 0 | 1 {
    return this.readBits(1) as 0 | 1;
  }

  /**
   * Read `n` bits starting at the current cursor but pack them LSB-first
   * (i.e. the first bit read goes into bit 0 of the result). This matches
   * the "valueless trailing bits" pattern in IETF compact representations
   * (e.g. RLP, MPLS shim header) and some radio packet formats.
   */
  readBitsLsbFirst(n: number): number {
    if (n <= 0 || n > 32) throw new RangeError(`n must be in 1..=32, got ${n}`);
    if (this.remaining() < n) throw new RangeError('not enough bits left');

    let value = 0;
    for (let i = 0; i < n; i++) {
      const byteIndex = (this.bitPos + i) >>> 3;
      const bitInByte = (this.bitPos + i) & 7;
      const bit = (this.bytes[byteIndex]! >> bitInByte) & 1;
      value |= bit << i;
    }
    this.bitPos += n;
    return value >>> 0;
  }
}

/**
 * Bit-packed writer. Grows the underlying buffer on demand.
 *
 * Bits are written MSB-first within each byte. The cursor tracks the current
 * bit offset; call `bytes()` to obtain a tight copy of the written data.
 */
export class BitWriter {
  private buf: number[] = [];
  private bitCount = 0;

  /** Number of bits written so far. */
  lengthBits(): number {
    return this.bitCount;
  }

  /** Write `n` bits of `value` MSB-first into the buffer. */
  writeBits(value: number, n: number): void {
    if (n <= 0 || n > 32) throw new RangeError(`n must be in 1..=32, got ${n}`);
    if (value < 0) throw new RangeError('value must be non-negative');
    if (value >= 1 << n && !(n === 32 && value === 0xffffffff)) {
      throw new RangeError(`value ${value} does not fit in ${n} bits`);
    }

    for (let i = n - 1; i >= 0; i--) {
      this.writeOneBit(((value >> i) & 1) as 0 | 1);
    }
  }

  /** Write a single bit. */
  writeBit(bit: 0 | 1 | boolean): void {
    this.writeOneBit(bit ? 1 : 0);
  }

  private writeOneBit(bit: 0 | 1): void {
    const byteIndex = this.bitCount >>> 3;
    const bitInByte = 7 - (this.bitCount & 7);
    if (byteIndex >= this.buf.length) this.buf.push(0);
    this.buf[byteIndex] = (this.buf[byteIndex] ?? 0) | (bit << bitInByte);
    this.bitCount++;
  }

  /** Return a Uint8Array containing the bytes written so far, padded with zero bits. */
  bytes(): Uint8Array {
    const byteLen = Math.ceil(this.bitCount / 8);
    const out = new Uint8Array(byteLen);
    for (let i = 0; i < this.buf.length; i++) out[i] = this.buf[i]!;
    return out;
  }
}

/** Get bit `i` of byte `b` (MSB-first, 0-indexed from the high bit). */
export function getBit(b: number, i: number): 0 | 1 {
  if (i < 0 || i > 7) throw new RangeError(`bit index must be in 0..=7, got ${i}`);
  return ((b >> (7 - i)) & 1) as 0 | 1;
}

/** Set bit `i` of byte `b` to `v` and return the modified byte. */
export function setBit(b: number, i: number, v: 0 | 1 | boolean): number {
  if (i < 0 || i > 7) throw new RangeError(`bit index must be in 0..=7, got ${i}`);
  const mask = 1 << (7 - i);
  return v ? b | mask : b & ~mask;
}

/**
 * Convert a `Uint8Array` to a hex string. Used pervasively in protocol
 * debuggers and is itself a tiny wire format ("the canonical debug encoding").
 */
export function toHex(bytes: Uint8Array, sep = ''): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    if (i > 0) out += sep;
    out += bytes[i]!.toString(16).padStart(2, '0');
  }
  return out;
}

/** Parse a hex string (with or without separators) into bytes. Strict: rejects non-hex chars. */
export function fromHex(s: string): Uint8Array {
  if (!/^[0-9a-fA-F\s:.-]*$/.test(s)) throw new Error('hex string contains non-hex characters');
  const cleaned = s.replace(/[^0-9a-fA-F]/g, '');
  if (cleaned.length % 2 !== 0) throw new Error('hex string must have even length');
  const out = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < cleaned.length; i += 2) {
    out[i / 2] = Number.parseInt(cleaned.slice(i, i + 2), 16);
  }
  return out;
}

/** Convert bytes to a printable 7-bit-ASCII string (escapes the rest). */
export function toAsciiDebug(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) {
    if (b >= 0x20 && b <= 0x7e) out += String.fromCharCode(b);
    else out += `\\x${b.toString(16).padStart(2, '0')}`;
  }
  return out;
}
