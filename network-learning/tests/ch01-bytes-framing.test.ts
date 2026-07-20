import { describe, it, expect } from 'vitest';
import {
  BitCursor,
  BitWriter,
  getBit,
  setBit,
  toHex,
  fromHex,
  toAsciiDebug,
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
  demo as ch01Demo,
} from '../src/01-bytes-framing/index.js';

function bytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

describe('01 — bits', () => {
  it('getBit / setBit operate MSB-first', () => {
    let b = 0b10110010;
    expect(getBit(b, 0)).toBe(1);
    expect(getBit(b, 1)).toBe(0);
    expect(getBit(b, 7)).toBe(0);
    b = setBit(b, 1, 1);
    expect(b).toBe(0b11110010);
  });

  it('BitWriter packs bits MSB-first', () => {
    const w = new BitWriter();
    w.writeBits(0b101, 3);
    w.writeBit(1);
    w.writeBits(0b1100, 4);
    // 101 1 1100 = 10111100 = 0xBC
    expect(toHex(w.bytes())).toBe('bc');
  });

  it('BitCursor reads bits in the same order written', () => {
    const w = new BitWriter();
    w.writeBits(0b101, 3);
    w.writeBit(0);
    w.writeBits(0b11110000, 8);
    const buf = w.bytes();
    expect(buf.length).toBe(2); // 12 bits round up to 2 bytes
    const c = new BitCursor(buf);
    expect(c.readBits(3)).toBe(0b101);
    expect(c.readBit()).toBe(0);
    expect(c.readBits(8)).toBe(0b11110000);
    expect(c.remaining()).toBe(4); // 4 unused bits at the tail of byte 1
  });

  it('BitCursor throws on over-read', () => {
    const c = new BitCursor(new Uint8Array([0x00]));
    c.readBits(8);
    expect(() => c.readBit()).toThrow(/not enough bits/);
  });

  it('readBitsLsbFirst reads from the LSB side', () => {
    // 0b00010001 → bit 4 (from MSB) = 1, bit 0 (from MSB) = 1
    const c = new BitCursor(new Uint8Array([0b00010001]));
    expect(c.readBitsLsbFirst(4)).toBe(0b0001);
    expect(c.readBitsLsbFirst(4)).toBe(0b0001);
  });

  it('toHex / fromHex roundtrip and strict', () => {
    expect(toHex(new Uint8Array([0xde, 0xad, 0xbe, 0xef]))).toBe('deadbeef');
    expect(toHex(new Uint8Array([0x01, 0x02]), ':')).toBe('01:02');
    expect(toHex(fromHex('de:ad:be:ef'))).toBe('deadbeef');
    expect(() => fromHex('xyz')).toThrow();
    expect(() => fromHex('abc')).toThrow();
  });

  it('toAsciiDebug escapes non-printable bytes', () => {
    expect(toAsciiDebug(new Uint8Array([0x48, 0x00, 0x69]))).toBe('H\\x00i');
  });
});

describe('01 — framing', () => {
  it('u8 frame roundtrip', () => {
    const f = encodeU8Frame(new Uint8Array([1, 2, 3]));
    expect(f).toEqual(new Uint8Array([3, 1, 2, 3]));
    const { payload, consumed } = decodeU8Frame(f);
    expect(payload).toEqual(new Uint8Array([1, 2, 3]));
    expect(consumed).toBe(4);
  });

  it('u8 frame rejects oversized payload', () => {
    expect(() => encodeU8Frame(new Uint8Array(0x101))).toThrow();
  });

  it('u8 frame rejects truncated buffer', () => {
    expect(() => decodeU8Frame(new Uint8Array([5, 1, 2]))).toThrow(/truncated/);
  });

  it('u16 BE frame roundtrip', () => {
    const f = encodeU16BeFrame(new Uint8Array([0xaa, 0xbb]));
    expect(f[0]).toBe(0);
    expect(f[1]).toBe(2);
    const { payload, consumed } = decodeU16BeFrame(f);
    expect(payload).toEqual(new Uint8Array([0xaa, 0xbb]));
    expect(consumed).toBe(4);
  });

  it('u32 LE frame roundtrip', () => {
    const f = encodeU32LeFrame(new Uint8Array([0x01, 0x02, 0x03]));
    // LE: 03 00 00 00
    expect(Array.from(f.subarray(0, 4))).toEqual([3, 0, 0, 0]);
    const { payload, consumed } = decodeU32LeFrame(f);
    expect(payload).toEqual(new Uint8Array([0x01, 0x02, 0x03]));
    expect(consumed).toBe(7);
  });

  it('splitOnDelim splits on \\n and keeps the trailing partial', () => {
    const buf = bytes('a\nb\nc');
    const parts = splitOnDelim(buf);
    expect(parts.length).toBe(3);
    expect(new TextDecoder().decode(parts[0])).toBe('a\n');
    expect(new TextDecoder().decode(parts[1])).toBe('b\n');
    expect(new TextDecoder().decode(parts[2])).toBe('c');
  });

  it('withDelim appends a single byte', () => {
    expect(withDelim(bytes('hi'))).toEqual(bytes('hi\n'));
  });

  it('COBS roundtrip with no zero bytes', () => {
    const enc = cobsEncode(new Uint8Array([0x11, 0x22, 0x33]));
    expect(enc.includes(0x00)).toBe(true); // sentinel
    expect(enc[enc.length - 1]).toBe(0x00);
    expect(cobsDecode(enc)).toEqual(new Uint8Array([0x11, 0x22, 0x33]));
  });

  it('COBS roundtrip with embedded zeros', () => {
    const enc = cobsEncode(new Uint8Array([0x00, 0x11, 0x00, 0x22]));
    expect(cobsDecode(enc)).toEqual(new Uint8Array([0x00, 0x11, 0x00, 0x22]));
  });

  it('COBS roundtrip with 254-byte run (forces an extra code byte)', () => {
    const data = new Uint8Array(254).fill(0xab);
    const enc = cobsEncode(data);
    expect(cobsDecode(enc)).toEqual(data);
  });

  it('COBS empty input encodes to 0x01 0x00', () => {
    expect(Array.from(cobsEncode(new Uint8Array([])))).toEqual([0x01, 0x00]);
  });

  it('COBS rejects missing sentinel', () => {
    expect(() => cobsDecode(new Uint8Array([0x01, 0xff]))).toThrow(/sentinel/);
  });
});

describe('01 — error detection', () => {
  it('crc8 of "123456789" is 0xF4', () => {
    // Well-known CRC-8 test vector.
    expect(crc8(bytes('123456789'))).toBe(0xf4);
  });

  it('crc16-ccitt of "123456789" is 0x31C3 (XMODEM variant, init 0)', () => {
    expect(crc16Ccitt(bytes('123456789'))).toBe(0x31c3);
  });

  it('crc32 of "123456789" is 0xCBF43926', () => {
    // IEEE 802.3 / PNG / gzip standard test vector.
    expect(crc32(bytes('123456789'))).toBe(0xcbf43926);
  });

  it('verifyCrc32 accepts valid trailer and rejects corruption', () => {
    const msg = bytes('hello');
    const crc = crc32(msg);
    const trailer = new Uint8Array(4);
    new DataView(trailer.buffer).setUint32(0, crc, false);
    const full = new Uint8Array(msg.length + 4);
    full.set(msg);
    full.set(trailer, msg.length);
    expect(verifyCrc32(full)).toBe(true);

    full[2]! ^= 0x80;
    expect(verifyCrc32(full)).toBe(false);
  });

  it('evenParityBit is 1 for odd set-bit count', () => {
    expect(evenParityBit(new Uint8Array([0b00000001]))).toBe(1);
    expect(evenParityBit(new Uint8Array([0b00000011]))).toBe(0);
    expect(evenParityBit(new Uint8Array([0x00, 0x01, 0x02, 0x03]))).toBe(0);
  });

  it('internetChecksum of an empty buffer is 0xFFFF', () => {
    expect(internetChecksum(new Uint8Array([]))).toBe(0xffff);
  });

  it('internetChecksum of a correct IPv4-style header is zero', () => {
    // Construct a 20-byte "header" with checksum field = 0, then put a
    // correctly-computed checksum in and verify it sums to zero.
    const hdr = new Uint8Array(20);
    hdr[0] = 0x45;
    hdr[1] = 0x00;
    hdr[2] = 0x00;
    hdr[3] = 0x14; // total length = 20
    // source / dest addresses etc. left zero for this test.
    const cksum = internetChecksum(hdr);
    hdr[10] = (cksum >> 8) & 0xff;
    hdr[11] = cksum & 0xff;
    expect(internetChecksum(hdr)).toBe(0);
  });
});

describe('01 — hamming(7,4)', () => {
  it('encode then decode roundtrips every nibble 0..=15', () => {
    for (let n = 0; n < 16; n++) {
      const cw = hamming74EncodeNibble(n);
      const r = hamming74Decode(cw);
      expect(r.data).toBe(n);
      expect(r.correctedBit).toBeNull();
    }
  });

  it('corrects every single-bit error at positions 0..=6', () => {
    for (let n = 0; n < 16; n++) {
      const cw = hamming74EncodeNibble(n);
      for (let bit = 0; bit < 7; bit++) {
        const corrupted = cw ^ (1 << bit);
        const r = hamming74Decode(corrupted);
        expect(r.data).toBe(n);
        expect(r.correctedBit).toBe(bit);
      }
    }
  });

  it('detects (and mis-corrects) some 2-bit errors — still produces a data nibble', () => {
    // Two-bit errors are detected (syndrome != 0) but the correction is wrong.
    // We assert only that the syndrome is non-zero, not that the data is right.
    const cw = hamming74EncodeNibble(0b1010);
    const corrupted = cw ^ 0b0000011; // 2 bit errors
    const r = hamming74Decode(corrupted);
    expect(r.correctedBit).not.toBeNull();
  });
});

describe('01 — reed-solomon rs(7,3)', () => {
  it('encoder produces a valid codeword (all-zero syndromes)', () => {
    for (let a = 0; a < 8; a++) {
      for (let b = 0; b < 8; b++) {
        for (let c = 0; c < 8; c++) {
          const cw = rs73Encode([a, b, c]);
          expect(cw.length).toBe(7);
          expect(rs73IsValid(cw)).toBe(true);
          expect(rs73Syndromes(cw)).toEqual([0, 0, 0, 0]);
        }
      }
    }
  });

  it('corrects a single byte error anywhere in the codeword', () => {
    for (let pos = 0; pos < 7; pos++) {
      const cw = rs73Encode([1, 2, 3]);
      const noisy = cw.slice();
      const orig = noisy[pos]!;
      noisy[pos] = (orig ^ 5) & 0x7; // flip up to 3 bits at pos
      expect(rs73IsValid(noisy)).toBe(false);
      const fixed = rs73CorrectOne(noisy);
      expect(fixed).not.toBeNull();
      expect(fixed).toEqual(cw);
    }
  });

  it('refuses to correct when syndrome indicates >= 2 errors', () => {
    const cw = rs73Encode([4, 5, 6]);
    const noisy = cw.slice();
    noisy[0] = (noisy[0]! ^ 3) & 0x7;
    noisy[1] = (noisy[1]! ^ 3) & 0x7;
    expect(rs73CorrectOne(noisy)).toBeNull();
  });
});

describe('01 — demo runs end-to-end without throwing', () => {
  it('executes the demo', () => {
    expect(() => ch01Demo()).not.toThrow();
  });
});
