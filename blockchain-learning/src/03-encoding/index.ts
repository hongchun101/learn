// =============================================================================
// Chapter 03 — Encoding and Serialization
// =============================================================================
// Goal: every binary encoding a chain engineer will touch.
//
// Concepts covered:
//   * Hex (lowercase, with or without 0x prefix). Delegated to @scure/base.
//   * Base58 (Bitcoin addresses) and Base58Check (BIP-13).
//   * Bech32 / Bech32m (BIP-173 / BIP-350) — SegWit and Taproot v1+
//     addresses.
//   * Varint / compact-size — Bitcoin block length encoding.
//   * RLP — Ethereum's universal byte encoding (transactions, trie nodes).
//   * SSZ — Eth2 consensus simple serialize, with merkleization.
//   * CBOR (RFC 8949) — used by Polygon Edge, IOTA, Chainlink; we expose a
//     minimal encoder/decoder for the subset chains need.
//
// References:
//   - BIP-13 (Base58Check), BIP-173 (Bech32), BIP-350 (Bech32m)
//   - Yellow Paper Appendix D (RLP)
//   - SSZ spec: https://ethereum.org/en/developers/docs/data-structures-and-encoding/ssz/
// =============================================================================

import { hex as scureHex, base58, base64, bech32, bech32m } from '@scure/base';
import { sha256, sha256d } from '../01-cryptography/hashes.js';
import { DeterministicRng, seedFrom } from '../_rng.js';

// --- Hex --------------------------------------------------------------------

export function toHex(bytes: Uint8Array, withPrefix = false): string {
  const h = scureHex.encode(bytes);
  return withPrefix ? `0x${h}` : h;
}

export function fromHex(s: string): Uint8Array {
  return scureHex.decode(s.startsWith('0x') ? s.slice(2) : s);
}

// --- Base58 (delegated) ------------------------------------------------------

export { base58 };

// --- Base58Check (BIP-13) ---------------------------------------------------

const BASE58_VERSIONS: Record<string, number> = {
  P2PKH: 0x00,
  P2SH: 0x05,
  XPUB: 0x0488b21e,
  XPRV: 0x0488ade4,
};

export function base58CheckEncode(versionByte: number, payload: Uint8Array): string {
  const versioned = new Uint8Array(1 + payload.length);
  versioned[0] = versionByte;
  versioned.set(payload, 1);
  const checksum = sha256d(versioned).subarray(0, 4);
  const out = new Uint8Array(versioned.length + checksum.length);
  out.set(versioned, 0);
  out.set(checksum, versioned.length);
  return base58.encode(out);
}

export function base58CheckDecode(address: string): { version: number; payload: Uint8Array } {
  const raw = base58.decode(address);
  if (raw.length < 5) throw new Error('Base58Check too short');
  const checksum = raw.subarray(raw.length - 4);
  const body = raw.subarray(0, raw.length - 4);
  const expected = sha256d(body).subarray(0, 4);
  if (!equalBytes(checksum, expected)) {
    throw new Error('Base58Check checksum mismatch');
  }
  return { version: body[0] ?? 0, payload: body.subarray(1) };
}

export { BASE58_VERSIONS };

// --- Bech32 / Bech32m (BIP-173 / BIP-350) -----------------------------------

export { bech32, bech32m };

/** 8-bit ↔ 5-bit conversion used by bech32 addresses. */
export function convertBits(data: Uint8Array, from: number, to: number, pad = true): Uint8Array {
  let acc = 0;
  let bits = 0;
  const out: number[] = [];
  const maxv = (1 << to) - 1;
  const maxAcc = (1 << (from + to - 1)) - 1;
  for (let i = 0; i < data.length; i++) {
    const byte = data[i] ?? 0;
    acc = ((acc << from) | byte) & maxAcc;
    bits += from;
    while (bits >= to) {
      bits -= to;
      out.push((acc >> bits) & maxv);
    }
  }
  if (pad) {
    if (bits > 0) out.push((acc << (to - bits)) & maxv);
  } else if (bits >= from || (acc << (to - bits)) & maxv) {
    throw new Error('convertBits: trailing bits');
  }
  return Uint8Array.from(out);
}

export function encodeBech32m(prefix: string, data5bit: Uint8Array, versionByte: number): string {
  return bech32m.encode(prefix, [versionByte, ...data5bit]);
}

export function decodeBech32m(address: string): { prefix: string; words: Uint8Array } {
  const { prefix, words } = bech32m.decode(address as `${string}1${string}`);
  return { prefix, words: Uint8Array.from(words) };
}

export { encodeBech32, decodeBech32 } from './bech32-wrap.js';

// --- Base64 (delegated) -----------------------------------------------------

export { base64 };

// --- Compact-size / varint --------------------------------------------------

export function encodeVarint(n: number | bigint): Uint8Array {
  const v = typeof n === 'bigint' ? n : BigInt(n);
  if (v < 0n) throw new Error('varint requires non-negative');
  if (v < 0xfdn) return new Uint8Array([Number(v)]);
  if (v <= 0xffffn) {
    const out = new Uint8Array(3);
    out[0] = 0xfd;
    out[1] = Number((v >> 8n) & 0xffn);
    out[2] = Number(v & 0xffn);
    return out;
  }
  if (v <= 0xffffffffn) {
    const out = new Uint8Array(5);
    out[0] = 0xfe;
    out[1] = Number((v >> 24n) & 0xffn);
    out[2] = Number((v >> 16n) & 0xffn);
    out[3] = Number((v >> 8n) & 0xffn);
    out[4] = Number(v & 0xffn);
    return out;
  }
  const out = new Uint8Array(9);
  out[0] = 0xff;
  for (let i = 0; i < 8; i++) {
    out[i + 1] = Number((v >> BigInt(8 * (7 - i))) & 0xffn);
  }
  return out;
}

export function decodeVarint(buf: Uint8Array, offset = 0): { value: bigint; length: number } {
  const first = buf[offset];
  if (first === undefined) throw new Error('varint: empty');
  if (first < 0xfd) return { value: BigInt(first), length: 1 };
  if (first === 0xfd) {
    return {
      value: (BigInt(buf[offset + 1]!) << 8n) | BigInt(buf[offset + 2]!),
      length: 3,
    };
  }
  if (first === 0xfe) {
    return {
      value:
        (BigInt(buf[offset + 1]!) << 24n) |
        (BigInt(buf[offset + 2]!) << 16n) |
        (BigInt(buf[offset + 3]!) << 8n) |
        BigInt(buf[offset + 4]!),
      length: 5,
    };
  }
  let v = 0n;
  for (let i = 0; i < 8; i++) {
    v = (v << 8n) | BigInt(buf[offset + 1 + i]!);
  }
  return { value: v, length: 9 };
}

// --- RLP (Yellow Paper Appendix D) ------------------------------------------

export function rlpEncode(value: Uint8Array | Uint8Array[]): Uint8Array {
  if (Array.isArray(value)) {
    const items = value.map(rlpEncode);
    let total = 0;
    for (const it of items) total += it.length;
    const lenBuf = encodeLen(0xc0, total);
    return concat(lenBuf, ...items);
  }
  if (value.length === 1 && (value[0] ?? 0) < 0x80) return value;
  return concat(encodeLen(0x80, value.length), value);
}

function encodeLen(prefix: 0x80 | 0xc0, len: number): Uint8Array {
  if (len < 56) return new Uint8Array([prefix + len]);
  const bytes = bigintToBytes(BigInt(len));
  return concat(new Uint8Array([prefix + 55 + bytes.length]), bytes);
}

function bigintToBytes(n: bigint): Uint8Array {
  let h = n.toString(16);
  if (h.length % 2 !== 0) h = '0' + h;
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(h.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export interface DecodedRlp {
  data: Uint8Array | DecodedRlp[];
  consumed: number;
}

export function rlpDecode(buf: Uint8Array): DecodedRlp {
  return rlpDecodeAt(buf, 0);
}

function rlpDecodeAt(buf: Uint8Array, offset: number): DecodedRlp {
  const prefix = buf[offset];
  if (prefix === undefined) throw new Error('rlp: out of bounds');
  if (prefix < 0x80) return { data: new Uint8Array([prefix]), consumed: 1 };
  if (prefix < 0xb8) {
    const len = prefix - 0x80;
    return { data: buf.subarray(offset + 1, offset + 1 + len), consumed: 1 + len };
  }
  if (prefix < 0xc0) {
    const lenBytes = prefix - 0xb7;
    const len = Number(readBigEndian(buf, offset + 1, lenBytes));
    return {
      data: buf.subarray(offset + 1 + lenBytes, offset + 1 + lenBytes + len),
      consumed: 1 + lenBytes + len,
    };
  }
  if (prefix < 0xf8) {
    return rlpDecodeList(buf, offset + 1, prefix - 0xc0);
  }
  const lenBytes = prefix - 0xf7;
  const total = Number(readBigEndian(buf, offset + 1, lenBytes));
  return rlpDecodeList(buf, offset + 1 + lenBytes, total);
}

function rlpDecodeList(buf: Uint8Array, start: number, total: number): DecodedRlp {
  const items: DecodedRlp[] = [];
  let cursor = start;
  const end = start + total;
  while (cursor < end) {
    const item = rlpDecodeAt(buf, cursor);
    items.push(item);
    cursor += item.consumed;
  }
  return { data: items, consumed: 1 + total };
}

function readBigEndian(buf: Uint8Array, start: number, len: number): bigint {
  let v = 0n;
  for (let i = 0; i < len; i++) {
    v = (v << 8n) | BigInt(buf[start + i]!);
  }
  return v;
}

// --- SSZ --------------------------------------------------------------------

export function sszUint256(n: bigint): Uint8Array {
  if (n < 0n || n >= (1n << 256n)) throw new Error('uint256 out of range');
  const out = new Uint8Array(32);
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(n & 0xffn);
    n >>= 8n;
  }
  return out;
}

/** SSZ Merkleization (SHA-256 of pairs). */
export function sszMerkleize(chunks: Uint8Array[]): Uint8Array {
  if (chunks.length === 0) throw new Error('no chunks');
  let level = chunks;
  while (level.length > 1) {
    const next: Uint8Array[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const l = level[i]!;
      const r = i + 1 < level.length ? level[i + 1]! : l;
      const combined = new Uint8Array(l.length + r.length);
      combined.set(l, 0);
      combined.set(r, l.length);
      next.push(sha256(combined));
    }
    level = next;
  }
  return level[0]!;
}

export function sszHashTreeRoot(values: bigint[]): Uint8Array {
  return sszMerkleize(values.map(sszUint256));
}

// --- CBOR (RFC 8949 minimal subset) ----------------------------------------

export function cborEncode(value: unknown): Uint8Array {
  if (typeof value === 'boolean') return new Uint8Array([0xe0 | (value ? 21 : 20)]);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('cbor: non-finite');
    return cborWriteInteger(Math.trunc(value));
  }
  if (typeof value === 'bigint') return cborWriteBig(value);
  if (typeof value === 'string') return cborWriteText(value);
  if (value instanceof Uint8Array) return cborWriteBytestring(value);
  if (Array.isArray(value)) return cborWriteArray(value);
  if (value === null || value === undefined) return new Uint8Array([0xe0 | 22]);
  throw new Error(`cborEncode: unsupported type ${typeof value}`);
}

function cborWriteInteger(n: number): Uint8Array {
  return cborUInt(n >= 0 ? n : -1 - n, n >= 0 ? 0x00 : 0x20);
}

function cborWriteBig(n: bigint): Uint8Array {
  return cborUIntBig(n >= 0n ? n : -1n - n, n >= 0n ? 0x00 : 0x20);
}

function cborUInt(n: number, prefix: number): Uint8Array {
  if (n < 24) return new Uint8Array([prefix | n]);
  if (n < 0x100) return new Uint8Array([prefix | 24, n]);
  if (n < 0x10000) return new Uint8Array([prefix | 25, (n >> 8) & 0xff, n & 0xff]);
  return new Uint8Array([prefix | 26, (n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]);
}

function cborUIntBig(n: bigint, prefix: number): Uint8Array {
  if (n < 24n) return new Uint8Array([prefix | Number(n)]);
  let hex = n.toString(16);
  if (hex.length % 2 !== 0) hex = '0' + hex;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return concat(new Uint8Array([prefix | 27, bytes.length]), bytes);
}

function cborWriteText(s: string): Uint8Array {
  return cborPrefixWith(0x60, new TextEncoder().encode(s));
}

function cborWriteBytestring(b: Uint8Array): Uint8Array {
  return cborPrefixWith(0x40, b);
}

function cborWriteArray(items: unknown[]): Uint8Array {
  const enc = items.map(cborEncode);
  return concat(cborLengthHeader(0x80, items.length), ...enc);
}

function cborPrefixWith(prefix: number, payload: Uint8Array): Uint8Array {
  return concat(cborLengthHeader(prefix, payload.length), payload);
}

function cborLengthHeader(prefix: number, len: number): Uint8Array {
  if (len < 24) return new Uint8Array([prefix | len]);
  if (len < 0x100) return new Uint8Array([prefix | 24, len]);
  if (len < 0x10000) return new Uint8Array([prefix | 25, (len >> 8) & 0xff, len & 0xff]);
  return new Uint8Array([prefix | 26, (len >>> 24) & 0xff, (len >>> 16) & 0xff, (len >>> 8) & 0xff, len & 0xff]);
}

// =============================================================================
// helpers
// =============================================================================

function concat(...parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return false;
  }
  return true;
}

// =============================================================================
// demo
// =============================================================================

export interface Chapter03DemoResult {
  hexWith: string;
  hexSans: string;
  base58check: { encoded: string; roundTrip: boolean };
  bech32m: string;
  varint: { tiny: number[]; big: number[] };
  rlp: { encoded: number[]; decoded: unknown[] };
  sszRoot: string;
  cbor: { string: number[]; array: number[] };
}

export function demo(): Chapter03DemoResult {
  const rng = new DeterministicRng(seedFrom('ch03-demo'));
  const raw = rng.next(20);

  const hexWith = toHex(raw, true);
  const hexSans = toHex(raw, false);

  const fake = base58CheckEncode(0x00, raw);
  const back = base58CheckDecode(fake);

  const taproot = raw.length >= 32 ? raw.subarray(0, 32) : concat(raw, new Uint8Array(32 - raw.length));
  const tapBits = convertBits(taproot, 8, 5, true);
  const tapAddr = encodeBech32m('bc', tapBits, 1);

  const tiny = encodeVarint(0xfc);
  const big = encodeVarint(0x10000);

  const rlpList = rlpEncode([new Uint8Array([0x01]), new Uint8Array([0x02, 0x03])]);
  const decoded = rlpDecode(rlpList);

  const root = sszHashTreeRoot([1n, 2n, 3n]);

  const cborString = cborEncode('hello');
  const cborArray = cborEncode([1, 2, 3]);

  return {
    hexWith,
    hexSans,
    base58check: { encoded: fake, roundTrip: equalBytes(back.payload, raw) },
    bech32m: tapAddr,
    varint: { tiny: Array.from(tiny), big: Array.from(big) },
    rlp: { encoded: Array.from(rlpList), decoded: rlpToString(decoded) as unknown[] },
    sszRoot: scureHex.encode(root),
    cbor: { string: Array.from(cborString), array: Array.from(cborArray) },
  };
}

function rlpToString(d: DecodedRlp): unknown {
  if (Array.isArray(d.data)) {
    return d.data.map(rlpToString);
  }
  return Array.from(d.data);
}
