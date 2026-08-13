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

// -----------------------------------------------------------------------------
// STUDY (read alongside docs/STUDY/ch02-encoding-wire.md)
// -----------------------------------------------------------------------------
// Prerequisites: Chapter 01.
// Why it matters: a wire format is a contract. Once you commit to big- vs
// little-endian, varint vs fixed, TLV vs Protobuf-style, you cannot change
// it without breaking every deployment. This chapter teaches you to read
// the contract and pick the right primitive for each field.
// Key invariants:
//   * Network order = big-endian. TCP, UDP, IP, DNS, TLS, HTTP, BGP, RADIUS
//     are big-endian on the wire. USB, PCI, PCIe, most file systems are LE.
//   * Protobuf sint32 uses zig-zag; signed LEB128 sign-extends in two's
//     complement. Do not confuse them.
//   * TLV length is the value length; the record is `type + length + value`.
//   * BER length < 128 fits in one byte (short form); ≥ 128 uses long form
//     with top 2 bits = 0b10.
// Common pitfalls:
//   * Mixing signed/unsigned varint encodings.
//   * Confusing KLV (BER length) with TLV (fixed-width length).
//   * Using `number` for u64 — JavaScript numbers are only safe up to 2^53.
//   * Treating binary16 as if it were binary32; precision is 10 mantissa
//     bits, not 23.
// Interview-ready summary: I can encode any structured record in three
// different wire formats, pick the right one for a workload, and decode
// a Protobuf-style tag stream by hand.


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
