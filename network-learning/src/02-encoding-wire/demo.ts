// =============================================================================
// Chapter 02 — Demo
// =============================================================================
// Self-contained tour of every encoding from chapter 02. Pure functions, no
// I/O. Invoked by `npm run demo`.
// =============================================================================

import { toHex } from '../01-bytes-framing/bits.js';
import {
  u16Be,
  u32Be,
  u32Le,
  i32Le,
  readU32Be,
  readI32Le,
  zigzag32,
  unzigzag32,
  encodeQ,
  decodeQ,
  f16Be,
  readF16Be,
} from './endianness.js';
import {
  encodeUvarint,
  decodeUvarint,
  encodeSvarint,
  decodeSvarint,
  encodeBerLength,
  decodeBerLength,
} from './varint.js';
import { encodeTlvU8List, parseTlvU8, encodeKlvU16, parseKlvU16, readTag, skipField, WireType } from './klv.js';

export function demo(): void {
  // -------------------------------------------------------------------------
  // Endianness, signed, zig-zag
  // -------------------------------------------------------------------------
  console.log('[02] u16be(0x1234) =', toHex(u16Be(0x1234)));
  console.log('[02] u32be(0xdeadbeef) =', toHex(u32Be(0xdeadbeef)));
  console.log('[02] u32le(0xdeadbeef) =', toHex(u32Le(0xdeadbeef)));
  console.log('[02] i32le(-1) =', toHex(i32Le(-1)));

  const view = new DataView(new Uint8Array(u32Be(0xcafebabe)).buffer);
  console.log('[02] readU32Be(0xcafebabe) =', '0x' + readU32Be(view).toString(16));
  console.log('[02] readI32Le(-1) =', readI32Le(new DataView(i32Le(-1).buffer)));

  for (const v of [-2, -1, 0, 1, 2, 1000, -1000]) {
    const z = zigzag32(v);
    console.log(`[02] zigzag(${v}) = ${z}, unzigzag = ${unzigzag32(z)}`);
  }

  // -------------------------------------------------------------------------
  // Q-format fixed point
  // -------------------------------------------------------------------------
  const rawQ = encodeQ(3.14159, 16);
  console.log('[02] Q16(3.14159) =', rawQ, '→', decodeQ(rawQ, 16));

  // -------------------------------------------------------------------------
  // Half-precision float
  // -------------------------------------------------------------------------
  console.log('[02] f16be(1.0) =', toHex(f16Be(1.0)));
  console.log('[02] f16be roundtrip =', readF16Be(f16Be(0.5)));

  // -------------------------------------------------------------------------
  // Varint
  // -------------------------------------------------------------------------
  for (const v of [0, 1, 127, 128, 300, 16384, 0xffffffff]) {
    const enc = encodeUvarint(v);
    const dec = decodeUvarint(enc);
    console.log(`[02] uvarint(${v}) = ${toHex(enc)} → ${dec.value} (${dec.bytesRead} bytes)`);
  }
  for (const v of [-123456, -1, 0, 1, 123456]) {
    const enc = encodeSvarint(v);
    const dec = decodeSvarint(enc);
    console.log(`[02] svarint(${v}) = ${toHex(enc)} → ${dec.value}`);
  }
  for (const v of [5, 200, 0xffff, 0x10000]) {
    const enc = encodeBerLength(v);
    const dec = decodeBerLength(enc);
    console.log(`[02] berlen(${v}) = ${toHex(enc)} → ${dec.length} (${dec.bytesRead} header bytes)`);
  }

  // -------------------------------------------------------------------------
  // TLV
  // -------------------------------------------------------------------------
  const tlv = encodeTlvU8List([
    { type: 0x01, value: new Uint8Array([0xaa, 0xbb]) },
    { type: 0x05, value: new TextEncoder().encode('hello') },
    { type: 0xff, value: new Uint8Array([0x00]) },
  ]);
  console.log('[02] tlv bytes =', toHex(tlv));
  const parsed = parseTlvU8(tlv);
  console.log('[02] parsed types =', Array.from(parsed.keys()));

  // -------------------------------------------------------------------------
  // KLV (SMPTE-like)
  // -------------------------------------------------------------------------
  const klv = encodeKlvU16({ key: 0x0602, value: new Uint8Array(300).fill(0x7f) });
  const kp = parseKlvU16(klv);
  console.log('[02] klv 0x0602 length =', kp.get(0x0602)?.length);

  // -------------------------------------------------------------------------
  // Protobuf-style tag reader
  // -------------------------------------------------------------------------
  // field 1, wire type 2 (length-delimited) — tag = (1 << 3) | 2 = 0x0a
  // field 2, wire type 0 (varint)            — tag = (2 << 3) | 0 = 0x10
  // field 1, wire type 0 (varint)            — tag = (1 << 3) | 0 = 0x08
  // then payload: uvarint 5 + uvarint 1500 + bytes "hi" (length-prefixed)
  const buf = new Uint8Array([
    0x0a, 0x03, 0x68, 0x69, 0x00, // field 1, length-delimited, "hi\0"
    0x10, 0xee, 0x02,             // field 2, varint 300
    0x08, 0x05,                   // field 1, varint 5
  ]);
  let off = 0;
  while (off < buf.length) {
    const { fieldNumber, wireType, bytesRead } = readTag(buf, off);
    off += bytesRead;
    const next = skipField(buf, off, wireType as WireType);
    console.log(`[02] pb field ${fieldNumber} wireType ${wireType} (${next - off} bytes)`);
    off = next;
  }
}
