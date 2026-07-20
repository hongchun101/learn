// =============================================================================
// Chapter 02 — Variable-Length Integers (varint)
// =============================================================================
// Goal: many wire formats (Protobuf, SBE, FlatBuffers, Thrift compact, QUIC
// varint, Protocol Buffers, Avro) encode small integers in fewer than 4 bytes.
// The dominant family is LEB128 (Little-Endian Base 128), where the high bit
// of each byte is a continuation flag and the low 7 bits are payload.
//
//   value 0     -> 0x00
//   value 127   -> 0x7f
//   value 128   -> 0x80 0x01
//   value 300   -> 0xac 0x02
//   value 2^32  -> 0x80 0x80 0x80 0x80 0x10
//
// Variants:
//   * LEB128 unsigned (Protobuf uint32, uint64, sint32/sint64 use zig-zag).
//   * LEB128 signed (sibling of zig-zag, encodes the two's complement
//     representation directly — used in DWARF debug info, WebAssembly).
//   * SQLite varint (8 bytes max, but different continuation rule).
//   * BER length (top 2 bits encode length, not continuation).
// =============================================================================

/**
 * Encode a non-negative integer as LEB128. Returns the byte array.
 * Throws if the value does not fit in `maxBytes` bytes (default 10, which
 * covers the full u64 range).
 */
export function encodeUvarint(value: number, maxBytes = 10): Uint8Array {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError('uvarint requires a non-negative integer');
  }
  // uvarint values > 2^53 cannot be represented exactly as JS numbers, so
  // reject anything above MAX_SAFE_INTEGER regardless of the byte budget.
  if (value > Number.MAX_SAFE_INTEGER) {
    throw new RangeError('uvarint value exceeds MAX_SAFE_INTEGER');
  }
  if (value > 2 ** (7 * Math.min(maxBytes, 7)) - 1) {
    throw new RangeError(`value exceeds ${maxBytes}-byte uvarint range`);
  }
  const out: number[] = [];
  let v = value >>> 0;
  while (v >= 0x80) {
    out.push((v & 0x7f) | 0x80);
    v = Math.floor(v / 128); // equivalent to v >>>= 7 for unsigned
  }
  out.push(v & 0x7f);
  return new Uint8Array(out);
}

/** Decode a LEB128 unsigned varint starting at `offset`. Returns [value, bytesRead]. */
export function decodeUvarint(buf: Uint8Array, offset = 0): { value: number; bytesRead: number } {
  if (offset >= buf.length) throw new RangeError('uvarint: empty buffer');
  let result = 0;
  let shift = 0;
  let i = offset;
  while (i < buf.length) {
    const b = buf[i++]!;
    result |= (b & 0x7f) << shift;
    if ((b & 0x80) === 0) {
      return { value: result >>> 0, bytesRead: i - offset };
    }
    shift += 7;
    if (shift >= 35) throw new RangeError('uvarint: value exceeds 5 bytes (>32 bits)');
  }
  throw new RangeError('uvarint: unterminated');
}

/** Encode a signed integer as a signed LEB128 (DWARF / WebAssembly variant). */
export function encodeSvarint(value: number): Uint8Array {
  if (!Number.isInteger(value)) throw new RangeError('svarint requires an integer');
  // Two's-complement LEB128: shift in 7-bit chunks of the negative
  // representation. The last byte's sign bit is replicated into the unused
  // high bits of the final byte.
  const out: number[] = [];
  let v = value;
  while (true) {
    const b = v & 0x7f;
    const signedPart = v >> 7; // arithmetic shift
    // Two's-complement semantically; in JS we use logical shift on the byte
    // boundary. The last byte's high bit must equal the sign bit of `v`.
    if ((signedPart === 0 && (b & 0x40) === 0) || (signedPart === -1 && (b & 0x40) !== 0)) {
      out.push(b);
      return new Uint8Array(out);
    }
    out.push(b | 0x80);
    v = signedPart;
  }
}

/** Decode a signed LEB128 varint. */
export function decodeSvarint(buf: Uint8Array, offset = 0): { value: number; bytesRead: number } {
  let result = 0;
  let shift = 0;
  let i = offset;
  while (i < buf.length) {
    const b = buf[i++]!;
    result |= (b & 0x7f) << shift;
    shift += 7;
    if ((b & 0x80) === 0) {
      // Sign-extend if the sign bit of the final byte is set.
      if (shift < 32 && (b & 0x40) !== 0) result |= -(1 << shift);
      return { value: result | 0, bytesRead: i - offset };
    }
  }
  throw new RangeError('svarint: unterminated');
}

// -----------------------------------------------------------------------------
// SQLite varint — 1 to 9 bytes. Bytes 0..7 carry 7 bits each; byte 8 carries 8.
// The 9-byte form is rare and only needed for very large row IDs (≥ 2^56).

export function encodeSqliteVarint(value: number): Uint8Array {

  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError('sqlite varint requires a non-negative integer');
  }
  const out: number[] = [];
  let v = value;
  while (v >= 0x80) {
    out.push((v & 0x7f) | 0x80);
    v = Math.floor(v / 128);
  }
  // 9-byte form: when the residual value is >= 8 bits.
  if (v >= 0x80) {
    out.push((v & 0x7f) | 0x80);
    v = v >>> 7; // up to 1 byte left (8 bits)
  }
  out.push(v & 0xff); // final byte uses all 8 bits
  return new Uint8Array(out);
}

/** Decode a SQLite varint. */
export function decodeSqliteVarint(buf: Uint8Array, offset = 0): { value: number; bytesRead: number } {
  let result = 0;
  let i = offset;
  let multiplier = 1;
  for (let n = 0; n < 8; n++) {
    if (i >= buf.length) throw new RangeError('sqlite varint: unterminated');
    const b = buf[i++]!;
    // The first byte carries the least-significant 7 bits, the second
    // carries bits 7..13, etc. Use multiplication to stay within JS number
    // precision (up to 2^53).
    result += (b & 0x7f) * multiplier;
    if ((b & 0x80) === 0) return { value: result, bytesRead: i - offset };
    multiplier *= 128;
  }
  // Ninth byte: all 8 bits, multiplied to position 56.
  if (i >= buf.length) throw new RangeError('sqlite varint: unterminated');
  const last = buf[i++]!;
  result += last * multiplier;
  return { value: result, bytesRead: i - offset };
}

// -----------------------------------------------------------------------------
// BER length — 1 to 127 = short form; long form uses top 2 bits = 0b10 to
// indicate "next byte is length-of-length, then that many bytes of length".
// -----------------------------------------------------------------------------


/** Encode a non-negative integer as a BER length. */
export function encodeBerLength(value: number): Uint8Array {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError('ber length requires a non-negative integer');
  }
  if (value <= 0x7f) return new Uint8Array([value]);
  // Long form: 0b10000000 | n, then n bytes of big-endian length.
  const bytes: number[] = [];
  let v = value;
  while (v > 0) {
    bytes.unshift(v & 0xff);
    v = Math.floor(v / 256);
  }
  if (bytes.length > 0x7f) throw new RangeError('ber length too large for one octet');
  return new Uint8Array([0x80 | bytes.length, ...bytes]);
}

/** Decode a BER length. Returns the length value and the number of header bytes consumed. */
export function decodeBerLength(buf: Uint8Array, offset = 0): { length: number; bytesRead: number } {
  if (offset >= buf.length) throw new RangeError('ber length: empty');
  const first = buf[offset]!;
  if ((first & 0x80) === 0) return { length: first, bytesRead: 1 };
  const n = first & 0x7f;
  if (n === 0) throw new RangeError('ber length: indefinite form not supported');
  if (offset + 1 + n > buf.length) throw new RangeError('ber length: truncated');
  let value = 0;
  for (let i = 0; i < n; i++) value = value * 256 + buf[offset + 1 + i]!;
  return { length: value, bytesRead: 1 + n };
}