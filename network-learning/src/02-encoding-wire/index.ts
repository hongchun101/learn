// =============================================================================
// Chapter 02 — Endianness, Encoding, and Wire Formats
// =============================================================================
// Goal: a "wire format" is the contract between sender and receiver. Once
// you can speak fluently about bits and bytes, the next decision is how to
// lay structured data on a byte stream.
//
// Concepts covered:
//   * Endianness: big-endian (network order) vs little-endian. Helpers for
//     u8/u16/u32/u64, i16/i32 in two's complement.
//   * Signed: zig-zag (Protobuf) and signed LEB128 (DWARF / WASM).
//   * Varints: LEB128, SQLite varint, BER length.
//   * Fixed-point: Q-format for DSP and embedded protocols.
//   * Half-precision: IEEE 754 binary16.
//   * Structured: TLV, KLV (SMPTE-style), Protobuf-style tag reader.
// =============================================================================

export {
  u16Be,
  u32Be,
  u32Le,
  readU16Be,
  readU32Be,
  readU32Le,
  u64Be,
  readU64Be,
  i16Be,
  i32Le,
  readI32Be,
  readI32Le,
  zigzag32,
  unzigzag32,
  zigzag64,
  unzigzag64,
  encodeQ,
  decodeQ,
  f16Be,
  readF16Be,
} from './endianness.js';

export {
  encodeUvarint,
  decodeUvarint,
  encodeSvarint,
  decodeSvarint,
  encodeSqliteVarint,
  decodeSqliteVarint,
  encodeBerLength,
  decodeBerLength,
} from './varint.js';

export {
  encodeTlvU8,
  encodeTlvU8List,
  decodeTlvU8,
  parseTlvU8,
  encodeKlvU16,
  decodeKlvU16,
  parseKlvU16,
  readTag,
  skipField,
  WireType,
} from './klv.js';
export type { TlvEntry, KlvEntry } from './klv.js';

export { demo } from './demo.js';
