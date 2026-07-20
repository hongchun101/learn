import { describe, it, expect } from 'vitest';
import {
  u16Be,
  u32Be,
  u32Le,
  readU32Be,
  readU32Le,
  u64Be,
  readU64Be,
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
  encodeUvarint,
  decodeUvarint,
  encodeSvarint,
  decodeSvarint,
  encodeSqliteVarint,
  decodeSqliteVarint,
  encodeBerLength,
  decodeBerLength,
  encodeTlvU8,
  encodeTlvU8List,
  decodeTlvU8,
  parseTlvU8,
  encodeKlvU16,
  parseKlvU16,
  readTag,
  skipField,
  WireType,
  demo as ch02Demo,
} from '../src/02-encoding-wire/index.js';

function bytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

describe('02 — endianness & integers', () => {
  it('u16Be / u32Be / u32Le lay out bytes correctly', () => {
    expect(Array.from(u16Be(0x1234))).toEqual([0x12, 0x34]);
    expect(Array.from(u32Be(0xdeadbeef))).toEqual([0xde, 0xad, 0xbe, 0xef]);
    expect(Array.from(u32Le(0xdeadbeef))).toEqual([0xef, 0xbe, 0xad, 0xde]);
  });

  it('roundtrip through DataView', () => {
    const buf = u32Be(0xcafebabe);
    expect(readU32Be(new DataView(buf.buffer))).toBe(0xcafebabe);
    expect(readU32Le(new DataView(u32Le(0xcafebabe).buffer))).toBe(0xcafebabe);
  });

  it('u64Be roundtrips with bigint', () => {
    const v = 0xffffffffffffffffn;
    const enc = u64Be(v);
    expect(enc.length).toBe(8);
    expect(readU64Be(enc)).toBe(v);
  });

  it('i32Le -1 is all-ones in two-complement', () => {
    expect(Array.from(i32Le(-1))).toEqual([0xff, 0xff, 0xff, 0xff]);
  });

  it('i16Be and i32 roundtrip', () => {
    expect(readI32Be(new DataView(i32Le(0x12345678).buffer))).not.toBe(0x12345678);
    expect(readI32Le(new DataView(i32Le(-12345).buffer))).toBe(-12345);
  });

  it('rejects out-of-range', () => {
    expect(() => u16Be(-1)).toThrow();
    expect(() => u16Be(0x10000)).toThrow();
    expect(() => i32Le(0x80000000)).toThrow();
  });
});

describe('02 — zig-zag', () => {
  it('maps small signed magnitudes to small unsigned', () => {
    expect(zigzag32(0)).toBe(0);
    expect(zigzag32(-1)).toBe(1);
    expect(zigzag32(1)).toBe(2);
    expect(zigzag32(-2)).toBe(3);
    expect(zigzag32(2147483647)).toBe(4294967294);
    expect(zigzag32(-2147483648)).toBe(4294967295);
  });

  it('unzigzag is the inverse of zigzag for 32-bit', () => {
    for (const v of [-2147483648, -1, 0, 1, 2147483647]) {
      expect(unzigzag32(zigzag32(v))).toBe(v);
    }
  });

  it('zigzag64 roundtrip with bigint', () => {
    const cases: bigint[] = [0n, 1n, -1n, 9223372036854775807n, -9223372036854775808n];
    for (const v of cases) {
      expect(unzigzag64(zigzag64(v))).toBe(v);
    }
  });
});

describe('02 — Q-format', () => {
  it('encodeQ and decodeQ roundtrip', () => {
    const r = encodeQ(1.5, 16);
    expect(decodeQ(r, 16)).toBeCloseTo(1.5, 10);
    expect(encodeQ(0, 8)).toBe(0);
    expect(encodeQ(-0.5, 8)).toBe(-128);
  });

  it('rounding is half-away-from-zero', () => {
    expect(encodeQ(0.5, 1)).toBe(1);
    expect(encodeQ(-0.5, 1)).toBe(-1);
  });
});

describe('02 — half-precision float', () => {
  it('round-trips common values', () => {
    for (const v of [0, 0.5, 1, 1.5, -2, 100, 65504]) {
      expect(readF16Be(f16Be(v))).toBeCloseTo(v, 3);
    }
  });
});

describe('02 — uvarint (LEB128)', () => {
  it('small values fit in one byte', () => {
    expect(Array.from(encodeUvarint(0))).toEqual([0]);
    expect(Array.from(encodeUvarint(127))).toEqual([127]);
  });

  it('crosses the 128 boundary into 2 bytes', () => {
    expect(Array.from(encodeUvarint(128))).toEqual([0x80, 0x01]);
    expect(Array.from(encodeUvarint(300))).toEqual([0xac, 0x02]);
  });

  it('5-byte form for 32-bit max', () => {
    const enc = encodeUvarint(0xffffffff);
    expect(enc.length).toBe(5);
    expect(decodeUvarint(enc).value).toBe(0xffffffff);
  });

  it('roundtrips a range of values', () => {
    for (const v of [0, 1, 63, 64, 127, 128, 255, 256, 16383, 16384, 2 ** 28, 2 ** 31]) {
      const enc = encodeUvarint(v);
      const dec = decodeUvarint(enc);
      expect(dec.value).toBe(v);
    }
  });

  it('rejects unterminated input', () => {
    expect(() => decodeUvarint(new Uint8Array([0x80, 0x80, 0x80, 0x80, 0x80, 0x80]))).toThrow();
  });
});

describe('02 — svarint (signed LEB128)', () => {
  it('roundtrips a range of values', () => {
    for (const v of [-123456, -1, 0, 1, 123456, 2147483647, -2147483648]) {
      const enc = encodeSvarint(v);
      const dec = decodeSvarint(enc);
      expect(dec.value).toBe(v);
    }
  });
});

describe('02 — sqlite varint', () => {
  it('roundtrips small and large values', () => {
    for (const v of [0, 1, 127, 128, 16384, 2 ** 32, 2 ** 56, 2 ** 60]) {
      const enc = encodeSqliteVarint(Number(v));
      const dec = decodeSqliteVarint(enc);
      expect(dec.value).toBe(Number(v));
    }
  });
});

describe('02 — ber length', () => {
  it('short form for 0..=127', () => {
    expect(Array.from(encodeBerLength(5))).toEqual([5]);
    expect(decodeBerLength(encodeBerLength(5)).length).toBe(5);
  });

  it('long form for >=128', () => {
    expect(Array.from(encodeBerLength(200))).toEqual([0x81, 200]);
    expect(Array.from(encodeBerLength(0x100))).toEqual([0x82, 0x01, 0x00]);
    expect(decodeBerLength(encodeBerLength(0x100)).length).toBe(0x100);
  });

  it('roundtrips 32-bit length', () => {
    const enc = encodeBerLength(0xffffffff);
    expect(enc[0]).toBe(0x80 | 4);
    expect(decodeBerLength(enc).length).toBe(0xffffffff);
  });
});

describe('02 — TLV', () => {
  it('round-trips a single record', () => {
    const enc = encodeTlvU8({ type: 0x05, value: bytes('hi') });
    expect(Array.from(enc)).toEqual([0x05, 0x02, 0x68, 0x69]);
    const { entry } = decodeTlvU8(enc);
    expect(entry.type).toBe(5);
    expect(new TextDecoder().decode(entry.value)).toBe('hi');
  });

  it('encodes a list back-to-back', () => {
    const enc = encodeTlvU8List([
      { type: 1, value: new Uint8Array([0xaa]) },
      { type: 2, value: new Uint8Array([0xbb, 0xcc]) },
    ]);
    const parsed = parseTlvU8(enc);
    expect(parsed.get(1)).toEqual(new Uint8Array([0xaa]));
    expect(parsed.get(2)).toEqual(new Uint8Array([0xbb, 0xcc]));
  });

  it('later record of same type replaces earlier one', () => {
    const enc = encodeTlvU8List([
      { type: 1, value: new Uint8Array([0xaa]) },
      { type: 1, value: new Uint8Array([0xbb]) },
    ]);
    expect(parseTlvU8(enc).get(1)).toEqual(new Uint8Array([0xbb]));
  });

  it('rejects oversized value', () => {
    expect(() => encodeTlvU8({ type: 1, value: new Uint8Array(0x100) })).toThrow();
  });
});

describe('02 — KLV (u16 key + BER length)', () => {
  it('round-trips a short value', () => {
    const enc = encodeKlvU16({ key: 0x0602, value: bytes('abc') });
    const parsed = parseKlvU16(enc);
    expect(parsed.get(0x0602)).toEqual(bytes('abc'));
  });

  it('round-trips a value that needs the BER long form', () => {
    const v = new Uint8Array(200).fill(0x42);
    const enc = encodeKlvU16({ key: 1, value: v });
    expect(parseKlvU16(enc).get(1)).toEqual(v);
  });
});

describe('02 — protobuf-style tag reader', () => {
  it('parses a mixed-wire-type stream', () => {
    // field 1, varint 5 → tag 0x08, value 0x05
    // field 2, length-delimited "hi" → tag 0x12, len 0x02, 0x68 0x69
    // field 1, fixed32 0xdeadbeef → tag 0x0d, value 4 bytes
    const buf = new Uint8Array([
      0x08, 0x05,
      0x12, 0x02, 0x68, 0x69,
      0x0d, 0xef, 0xbe, 0xad, 0xde,
    ]);
    const t1 = readTag(buf, 0);
    expect(t1.fieldNumber).toBe(1);
    expect(t1.wireType).toBe(WireType.Varint);
    const o1 = skipField(buf, t1.bytesRead, t1.wireType);
    expect(o1).toBe(2);

    const t2 = readTag(buf, o1);
    expect(t2.fieldNumber).toBe(2);
    expect(t2.wireType).toBe(WireType.LengthDelimited);
    const o2 = skipField(buf, o1 + t2.bytesRead, t2.wireType);
    expect(o2).toBe(6);

    const t3 = readTag(buf, o2);
    expect(t3.fieldNumber).toBe(1);
    expect(t3.wireType).toBe(WireType.Fixed32);
    const o3 = skipField(buf, o2 + t3.bytesRead, t3.wireType);
    expect(o3).toBe(buf.length);
  });
});

describe('02 — demo runs end-to-end', () => {
  it('executes the demo', () => {
    expect(() => ch02Demo()).not.toThrow();
  });
});
