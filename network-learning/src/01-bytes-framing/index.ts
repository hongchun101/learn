// =============================================================================
// Chapter 01 — Bits, Bytes, Framing, and Error Coding
// =============================================================================
// Goal: every network protocol ultimately serializes to a stream of bits on a
// wire. Before you can read a frame you must be able to:
//   * treat a byte as 8 ordered bits
//   * read individual bits with a cursor
//   * pack arbitrary-length bit fields (sub-byte fields, 3-bit, 11-bit, etc.)
//   * split a byte stream into self-delimiting frames
//   * detect (CRC) and correct (Hamming, RS) bit errors
//
// Concepts covered:
//   * Bits: BitCursor / BitWriter, bit ordering, sub-byte fields, hex debug.
//   * Framing: length-prefixed (u8 / u16 BE / u32 LE), delimiter-based,
//     self-synchronizing (COBS).
//   * Error detection: CRC-8, CRC-16-CCITT, CRC-32, parity, Internet checksum.
//   * Error correction: Hamming(7,4) — single-error correction;
//     Reed-Solomon RS(7,3) over GF(2^3) — 2-byte error correction per codeword.
// =============================================================================

export {
  BitCursor,
  BitWriter,
  getBit,
  setBit,
  toHex,
  fromHex,
  toAsciiDebug,
} from './bits.js';

export {
  MAX_U8_LEN,
  MAX_U16_LEN,
  MAX_U32_LEN,
  DEFAULT_DELIM,
  encodeU8Frame,
  decodeU8Frame,
  encodeU16BeFrame,
  decodeU16BeFrame,
  encodeU32LeFrame,
  decodeU32LeFrame,
  splitOnDelim,
  withDelim,
  cobsEncode,
  cobsDecode,
} from './framing.js';

export {
  crc8,
  crc16Ccitt,
  crc32,
  verifyCrc32,
  evenParityBit,
  internetChecksum,
  hamming74EncodeNibble,
  hamming74Decode,
  rs73Encode,
  rs73Syndromes,
  rs73IsValid,
  rs73CorrectOne,
  _internal,
} from './error-coding.js';

export { demo } from './demo.js';
