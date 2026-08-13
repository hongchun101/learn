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

// -----------------------------------------------------------------------------
// STUDY (read alongside docs/STUDY/ch01-bytes-framing.md)
// -----------------------------------------------------------------------------
// Prerequisites: none. This is the first chapter.
// Why it matters: every later chapter is a sequence of bytes on a wire. If
// you cannot read a hex dump you cannot debug a packet capture, decode an
// RFC example, or implement a custom protocol. The bit, framing, and CRC
// primitives here are the substrate for everything else.
// Key invariants:
//   * BitCursor reads MSB-first within each byte — same as the wire order.
//   * CRC-32 (IEEE, poly 0xEDB88320 reflected) detects every single-bit
//     error and any odd number of bit errors under 32 bits.
//   * Hamming(7,4) corrects any single-bit error and detects any double-bit
//     error (minimum distance 3).
//   * RS(7,3) over GF(2^3) corrects up to 2 byte errors per 7-byte codeword.
// Common pitfalls:
//   * Off-by-one bit: readBits(12) is not readBits(8) + readBits(4).
//   * Internet checksum is one's-complement; do not flip bits at the end.
//   * TLV "length" is the value length, not the record length.
//   * COBS encodes the payload only; the trailing 0x00 is the sentinel.
// Interview-ready summary: I can wax a hex dump, name the framing family
// (length-prefixed / delimiter / self-synchronizing), pick a CRC, and
// correct a single-bit error by hand with Hamming.


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
