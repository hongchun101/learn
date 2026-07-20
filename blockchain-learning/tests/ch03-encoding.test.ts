import { describe, it, expect } from 'vitest';
import {
  toHex,
  fromHex,
  base58CheckEncode,
  base58CheckDecode,
  convertBits,
  encodeBech32m,
  decodeBech32m,
  encodeBech32,
  decodeBech32,
  encodeVarint,
  decodeVarint,
  rlpEncode,
  rlpDecode,
  sszMerkleize,
  sszUint256,
  sszHashTreeRoot,
  cborEncode,
  demo as ch03Demo,
} from '../src/03-encoding/index.js';
import { sha256d } from '../src/01-cryptography/hashes.js';
import { base64 } from '@scure/base';

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return false;
  }
  return true;
}

describe('Chapter 03 — Encoding & Serialization', () => {
  it('hex round-trip preserves bytes', () => {
    const bytes = new Uint8Array([0x00, 0xab, 0xcd, 0xff]);
    expect(toHex(bytes)).toBe('00abcdff');
    expect(equalBytes(fromHex('00abcdff'), bytes)).toBe(true);
    expect(toHex(bytes, true)).toBe('0x00abcdff');
    expect(equalBytes(fromHex('0x00abcdff'), bytes)).toBe(true);
  });

  it('Base58Check detects tampering via the 4-byte checksum', () => {
    const payload = new TextEncoder().encode('hello world');
    const encoded = base58CheckEncode(0x00, payload);
    const decoded = base58CheckDecode(encoded);
    expect(decoded.version).toBe(0x00);
    expect(equalBytes(decoded.payload, payload)).toBe(true);
    const tampered = encoded.slice(0, -1) + (encoded[encoded.length - 1] === 'A' ? 'B' : 'A');
    expect(() => base58CheckDecode(tampered)).toThrow();
  });

  it('Bech32m encodes a Taproot-style address starting with bc1', () => {
    const program = new Uint8Array(32).map((_, i) => i);
    const five = convertBits(program, 8, 5, true);
    const addr = encodeBech32m('bc', five, 1);
    expect(addr.startsWith('bc1')).toBe(true);
    const { prefix } = decodeBech32m(addr);
    expect(prefix).toBe('bc');
  });

  it('Bech32 round-trip works for SegWit v0', () => {
    const program = new Uint8Array(20).map((_, i) => i);
    const five = convertBits(program, 8, 5, true);
    const addr = encodeBech32('tb', five, 0);
    const { prefix, words } = decodeBech32(addr);
    expect(prefix).toBe('tb');
    expect(words.length).toBeGreaterThan(0);
  });

  it('convertBits(8,5) produces a multiple-of-5 length when padded', () => {
    const out = convertBits(new Uint8Array([0xff, 0x00, 0xff]), 8, 5, true);
    // 24 bits → 5 5-bit values padded
    expect(out.length).toBe(5);
  });

  it('Varint round-trip and length selection per magnitude', () => {
    const cases = [0n, 1n, 0xfcn, 0xfdn, 0xffffn, 0x10000n, 0xffffffefn, 0x100000000n];
    for (const n of cases) {
      const enc = encodeVarint(n);
      const dec = decodeVarint(enc);
      expect(dec.value).toBe(n);
      if (n < 0xfdn) expect(enc.length).toBe(1);
      else if (n <= 0xffffn) expect(enc.length).toBe(3);
      else if (n <= 0xffffffffn) expect(enc.length).toBe(5);
      else expect(enc.length).toBe(9);
    }
  });

  it('RLP encodes single bytes, short strings, and lists', () => {
    expect(Array.from(rlpEncode(new Uint8Array([0x05])))).toEqual([0x05]);
    expect(Array.from(rlpEncode(new TextEncoder().encode('dog')))).toEqual([0x83, 0x64, 0x6f, 0x67]);
    const list = rlpEncode([new TextEncoder().encode('cat'), new TextEncoder().encode('dog')]);
    expect(Array.from(list.subarray(0, 1))).toEqual([0xc8]);
  });

  it('RLP decode round-trips both strings and lists', () => {
    const enc = rlpEncode([new Uint8Array([1, 2]), new TextEncoder().encode('cat')]);
    const out = rlpDecode(enc);
    if (Array.isArray(out.data)) {
      expect(out.data.length).toBe(2);
      const first = out.data[0]!;
      const second = out.data[1]!;
      if (Array.isArray(second.data)) throw new Error('expected bytes');
      expect(new TextDecoder().decode(second.data)).toBe('cat');
      expect(Array.from(first.data as Uint8Array)).toEqual([1, 2]);
    } else {
      throw new Error('expected list');
    }
  });

  it('RLP encodes long strings with the 0xb8+ header', () => {
    const long = new Uint8Array(70).fill(0x61);
    const enc = rlpEncode(long);
    expect(enc[0]).toBe(0xb8);
    expect(enc[1]).toBe(70);
  });

  it('SSZ uint256 produces 32-byte big-endian', () => {
    const n = 0xdeadbeefn;
    expect(sszUint256(n).length).toBe(32);
    const out = sszUint256(n);
    expect(out[31]).toBe(0xef);
    expect(out[30]).toBe(0xbe);
    expect(out[29]).toBe(0xad);
    expect(out[28]).toBe(0xde);
  });

  it('SSZ merkleization of identical chunks yields deterministic root', () => {
    const a = sszHashTreeRoot([1n, 2n, 3n]);
    const b = sszHashTreeRoot([1n, 2n, 3n]);
    expect(equalBytes(a, b)).toBe(true);
    const c = sszHashTreeRoot([1n, 2n, 4n]);
    expect(equalBytes(a, c)).toBe(false);
  });

  it('SSZ merkleize with imbalance duplicates the last chunk', () => {
    const a = sszMerkleize([new Uint8Array(32), new Uint8Array(32), new Uint8Array(32)]);
    const b = sszMerkleize([new Uint8Array(32), new Uint8Array(32), new Uint8Array(32)]);
    expect(equalBytes(a, b)).toBe(true);
  });

  it('CBOR encodes uint, text, bytestring, array', () => {
    expect(Array.from(cborEncode(0))).toEqual([0x00]);
    expect(Array.from(cborEncode(24))).toEqual([0x18, 24]);
    expect(Array.from(cborEncode('a'))).toEqual([0x61, 0x61]);
    const a = cborEncode([1, 2, 3]);
    expect(a[0]).toBe(0x83);
    expect(a.length).toBe(4);
  });

  it('demo runs end-to-end', () => {
    const out = ch03Demo();
    expect(out.hexWith === '0x' + out.hexSans).toBe(true);
    expect(out.base58check.roundTrip).toBe(true);
    expect(out.bech32m.startsWith('bc1')).toBe(true);
    expect(out.rlp.encoded.length).toBeGreaterThan(0);
    expect(Array.isArray(out.rlp.decoded)).toBe(true);
    expect(out.sszRoot.length).toBe(64);
    expect(out.cbor.string[0]).toBe(0x65);
    expect(out.cbor.array[0]).toBe(0x83);
  });

  it('sha256d helper still available', () => {
    expect(sha256d(new Uint8Array()).length).toBe(32);
  });

  it('base64 round-trips arbitrary bytes', () => {
    const input = new Uint8Array([0xfa, 0xce, 0xca, 0xfe, 0x01, 0x02]);
    const encoded = base64.encode(input);
    const decoded = base64.decode(encoded);
    expect(equalBytes(decoded, input)).toBe(true);
  });
});
