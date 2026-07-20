// =============================================================================
// Chapter 01 — Demo
// =============================================================================
// Runs a self-contained tour of every primitive from chapter 01. No network,
// no filesystem; only pure byte operations. Invoked by `npm run demo`.
// =============================================================================

import { BitCursor, BitWriter, toHex, toAsciiDebug } from './bits.js';
import {
  encodeU8Frame,
  encodeU16BeFrame,
  encodeU32LeFrame,
  cobsEncode,
  cobsDecode,
  splitOnDelim,
  DEFAULT_DELIM,
} from './framing.js';
import { crc8, crc16Ccitt, crc32, internetChecksum, hamming74EncodeNibble, hamming74Decode, rs73Encode, rs73IsValid, rs73CorrectOne } from './error-coding.js';

export function demo(): void {
  // -------------------------------------------------------------------------
  // BitCursor / BitWriter
  // -------------------------------------------------------------------------
  const w = new BitWriter();
  w.writeBits(0b101, 3);   // 3 bits
  w.writeBit(1);           // 1 bit
  w.writeBits(0b1100, 4);  // 4 bits
  // Layout: 101 1 1100 → 1011 1100 = 0xBC
  const packed = w.bytes();
  console.log('[01] bits packed =', toHex(packed));

  const c = new BitCursor(packed);
  console.log('[01] bits read  =', c.readBits(3), c.readBit(), c.readBits(4));

  // -------------------------------------------------------------------------
  // Framing
  // -------------------------------------------------------------------------
  const payload = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]); // "Hello"
  console.log('[01] u8 frame    =', toHex(encodeU8Frame(payload)));
  console.log('[01] u16be frame =', toHex(encodeU16BeFrame(payload)));
  console.log('[01] u32le frame =', toHex(encodeU32LeFrame(payload)));

  // Delimiter-based
  const lines = splitOnDelim(new TextEncoder().encode('line1\nline2\nline3'), DEFAULT_DELIM);
  console.log('[01] delim lines =', lines.length);

  // COBS round-trip with an embedded zero
  const embedded = new Uint8Array([0xaa, 0x00, 0xbb, 0x00, 0xcc]);
  const enc = cobsEncode(embedded);
  const dec = cobsDecode(enc);
  console.log('[01] cobs round  =', toHex(dec), '(input had', toHex(embedded), ')');

  // -------------------------------------------------------------------------
  // Error detection
  // -------------------------------------------------------------------------
  console.log('[01] crc8  =', crc8(payload).toString(16));
  console.log('[01] crc16 =', crc16Ccitt(payload).toString(16));
  console.log('[01] crc32 =', crc32(payload).toString(16));
  console.log('[01] inet  =', internetChecksum(payload).toString(16));

  // -------------------------------------------------------------------------
  // Hamming(7,4)
  // -------------------------------------------------------------------------
  const cw = hamming74EncodeNibble(0b1011);
  const corrupted = cw ^ 0b0000010; // flip one bit
  const fixed = hamming74Decode(corrupted);
  console.log('[01] hamming  cw =', cw.toString(2).padStart(7, '0'));
  console.log('[01] hamming bad =', corrupted.toString(2).padStart(7, '0'));
  console.log('[01] hamming fix = data=' + fixed.data.toString(2).padStart(4, '0') + ' bit=' + fixed.correctedBit);

  // -------------------------------------------------------------------------
  // RS(7,3)
  // -------------------------------------------------------------------------
  const rs = rs73Encode([3, 5, 2]);
  console.log('[01] rs73 encode =', rs.map((b) => b.toString(2).padStart(3, '0')).join(' '));
  const noisy = rs.slice();
  noisy[2]! ^= 6; // flip all bits in byte 2
  const corrected = rs73CorrectOne(noisy);
  console.log('[01] rs73 valid  =', rs73IsValid(rs));
  console.log('[01] rs73 bad    =', rs73IsValid(noisy));
  console.log('[01] rs73 fixed  =', corrected ? corrected.slice(0, 3) : 'uncorrectable');

  console.log('[01] ascii debug =', toAsciiDebug(payload));
}
