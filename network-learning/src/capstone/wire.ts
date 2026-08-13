// =============================================================================
// Capstone — Wire format (chapters 01 + 02)
// =============================================================================
// Tiny length-prefixed TLV wire format carrying the capstone's `Op` records.
// Each frame is `[length:u16 BE][bytes...]` where `bytes` is a sequence of
// TLV entries:
//   * type 0x01 = key (varint length + bytes, UTF-8)
//   * type 0x02 = value (varint length + bytes)
//   * type 0x03 = idempotency key (16 bytes)
//   * type 0x04 = trace id (16 bytes)
//   * type 0x05 = client ts (u32 BE, HLC physical component)
//   * type 0x06 = flags (u8)
//
// TLV means we can add new fields without breaking older clients.
// =============================================================================

import { encodeUvarint, decodeUvarint } from '../02-encoding-wire/varint.js';
import { encodeU16BeFrame, decodeU16BeFrame } from '../01-bytes-framing/framing.js';

export const TLV_KEY = 0x01;
export const TLV_VALUE = 0x02;
export const TLV_IDEMP = 0x03;
export const TLV_TRACE = 0x04;
export const TLV_TS = 0x05;
export const TLV_FLAGS = 0x06;

export const FLAG_PUT = 0x01;
export const FLAG_GET = 0x02;

export interface Op {
  kind: 'put' | 'get';
  key: string;
  value?: Uint8Array;
  idempotencyKey: Uint8Array; // 16 bytes
  traceId: Uint8Array; // 16 bytes
  clientTs: number; // u32 BE
}

function encodeTlv(type: number, value: Uint8Array): Uint8Array {
  const len = encodeUvarint(value.length);
  const out = new Uint8Array(1 + len.length + value.length);
  out[0] = type;
  out.set(len, 1);
  out.set(value, 1 + len.length);
  return out;
}

function decodeTlv(buf: Uint8Array, offset: number): { type: number; value: Uint8Array; next: number } | null {
  if (offset >= buf.length) return null;
  const type = buf[offset]!;
  const lenRes = decodeUvarint(buf, offset + 1);
  const len = lenRes.value;
  const next = offset + 1 + lenRes.bytesRead + len;
  const value = buf.slice(offset + 1 + lenRes.bytesRead, next);
  return { type, value, next };
}

function u32BeBytes(n: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, n >>> 0, false);
  return out;
}

function readU32BeBytes(b: Uint8Array): number {
  return new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(0, false);
}

export function encodeOp(op: Op): Uint8Array {
  const parts: Uint8Array[] = [];
  parts.push(encodeTlv(TLV_KEY, new TextEncoder().encode(op.key)));
  if (op.value !== undefined) parts.push(encodeTlv(TLV_VALUE, op.value));
  parts.push(encodeTlv(TLV_IDEMP, op.idempotencyKey));
  parts.push(encodeTlv(TLV_TRACE, op.traceId));
  parts.push(encodeTlv(TLV_TS, u32BeBytes(op.clientTs)));
  parts.push(encodeTlv(TLV_FLAGS, new Uint8Array([op.kind === 'put' ? FLAG_PUT : FLAG_GET])));

  const total = parts.reduce((s, p) => s + p.length, 0);
  const body = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    body.set(p, o);
    o += p.length;
  }
  return encodeU16BeFrame(body);
}

export interface DecodeError {
  error: string;
}

export function decodeOp(frame: Uint8Array): Op | DecodeError {
  const dec = decodeU16BeFrame(frame);
  if (dec.payload.length === 0) return { error: 'empty frame' };
  const fields: Record<number, Uint8Array> = {};
  let offset = 0;
  while (offset < dec.payload.length) {
    const t = decodeTlv(dec.payload, offset);
    if (!t) return { error: 'truncated TLV' };
    fields[t.type] = t.value;
    offset = t.next;
  }
  const keyB = fields[TLV_KEY];
  const idempB = fields[TLV_IDEMP];
  const traceB = fields[TLV_TRACE];
  const tsB = fields[TLV_TS];
  const flagsB = fields[TLV_FLAGS];
  if (!keyB || !idempB || !traceB || !tsB || !flagsB) {
    return { error: 'missing required TLV' };
  }
  const valueB = fields[TLV_VALUE];
  const flag = flagsB[0]!;
  const kind: 'put' | 'get' = flag === FLAG_PUT ? 'put' : 'get';
  return {
    kind,
    key: new TextDecoder().decode(keyB),
    value: valueB,
    idempotencyKey: idempB,
    traceId: traceB,
    clientTs: readU32BeBytes(tsB),
  };
}
