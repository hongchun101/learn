// =============================================================================
// Chapter 02 — TLV, KLV, and Structured Encodings
// =============================================================================
// Goal: most wire formats are not just a stream of integers. They are
// structured as a sequence of fields. The three dominant styles:
//
//   * TLV (Type-Length-Value): a discriminator, a length, then a payload.
//     Used by: TLS 1.3 extensions, LDAP, X.509, ASN.1 BER, RADIUS attributes,
//     many telecom protocols (3GPP, MAP), IKEv2, USB descriptors.
//
//   * KLV (Key-Length-Value): synonymous with TLV in most contexts but the
//     "key" is usually a globally-unique OID / 16-bit SMPTE label. Used in
//     SMPTE ST 336 (MPEG-TS metadata), MISB-ST 0601 (UAS Datalink),
//     STANAG 4609 (NATO GMTI), AIS, ADS-B, Copernicus Sentinel products,
//     inertial sensor payloads.
//
//   * Field-tagged: a tag (often varint) + wire type + value, as in
//     Protobuf, FlatBuffers, Cap'n Proto, Thrift compact.
//
// In this file we provide:
//   * A canonical u8-keyed TLV codec (encoder + decoder + lookup).
//   * A 16-bit-keyed KLV codec (SMPTE-style) with BER-style length.
//   * A Protobuf-style tag-wirtype reader (read-only; we do not implement
//     Protobuf descriptors — that belongs in a chapter on schema languages).
// =============================================================================

/** A single TLV record. */
export interface TlvEntry {
  type: number;
  value: Uint8Array;
}

/** Encode a single TLV record: [type:u8][length:u8 BE][value:bytes]. */
export function encodeTlvU8(entry: TlvEntry): Uint8Array {
  if (!Number.isInteger(entry.type) || entry.type < 0 || entry.type > 0xff) {
    throw new RangeError('type must be 0..=255');
  }
  if (entry.value.length > 0xff) throw new RangeError('value too long for u8 length TLV');
  const out = new Uint8Array(2 + entry.value.length);
  out[0] = entry.type;
  out[1] = entry.value.length;
  out.set(entry.value, 2);
  return out;
}

/** Encode a sequence of TLV records back-to-back. */
export function encodeTlvU8List(entries: readonly TlvEntry[]): Uint8Array {
  const parts = entries.map(encodeTlvU8);
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

/** Decode a single TLV record from `buf` at `offset`. Returns the record + bytes consumed. */
export function decodeTlvU8(buf: Uint8Array, offset = 0): { entry: TlvEntry; bytesRead: number } {
  if (offset + 2 > buf.length) throw new RangeError('tlv: truncated');
  const type = buf[offset]!;
  const length = buf[offset + 1]!;
  if (offset + 2 + length > buf.length) throw new RangeError('tlv: value truncated');
  return {
    entry: { type, value: buf.slice(offset + 2, offset + 2 + length) },
    bytesRead: 2 + length,
  };
}

/**
 * Parse a buffer of concatenated TLV records into a map (later records
 * with the same type replace earlier ones, matching many real protocols).
 */
export function parseTlvU8(buf: Uint8Array): Map<number, Uint8Array> {
  const out = new Map<number, Uint8Array>();
  let off = 0;
  while (off < buf.length) {
    const { entry, bytesRead } = decodeTlvU8(buf, off);
    out.set(entry.type, entry.value);
    off += bytesRead;
  }
  return out;
}

// -----------------------------------------------------------------------------
// KLV — SMPTE-style: [key:u16 BE][BER length][value:bytes]
// Used for streaming metadata. The "key" is often an OID/UL (Universally
// Labeled) per SMPTE ST 336 / 335.
// -----------------------------------------------------------------------------

export interface KlvEntry {
  key: number;
  value: Uint8Array;
}

/** Encode a single KLV record. */
export function encodeKlvU16(entry: KlvEntry): Uint8Array {
  if (!Number.isInteger(entry.key) || entry.key < 0 || entry.key > 0xffff) {
    throw new RangeError('key must be 0..=65535');
  }
  const len = encodeBerLength(entry.value.length);
  const out = new Uint8Array(2 + len.length + entry.value.length);
  out[0] = (entry.key >>> 8) & 0xff;
  out[1] = entry.key & 0xff;
  out.set(len, 2);
  out.set(entry.value, 2 + len.length);
  return out;
}

/** Decode a single KLV record. */
export function decodeKlvU16(buf: Uint8Array, offset = 0): { entry: KlvEntry; bytesRead: number } {
  if (offset + 2 > buf.length) throw new RangeError('klv: truncated key');
  const key = ((buf[offset]! << 8) | buf[offset + 1]!) >>> 0;
  const { length, bytesRead: lenBytes } = decodeBerLength(buf, offset + 2);
  if (offset + 2 + lenBytes + length > buf.length) throw new RangeError('klv: value truncated');
  return {
    entry: { key, value: buf.slice(offset + 2 + lenBytes, offset + 2 + lenBytes + length) },
    bytesRead: 2 + lenBytes + length,
  };
}

/** Parse a buffer of concatenated KLV records into a map. */
export function parseKlvU16(buf: Uint8Array): Map<number, Uint8Array> {
  const out = new Map<number, Uint8Array>();
  let off = 0;
  while (off < buf.length) {
    const { entry, bytesRead } = decodeKlvU16(buf, off);
    out.set(entry.key, entry.value);
    off += bytesRead;
  }
  return out;
}

// -----------------------------------------------------------------------------
// Protobuf-style wire format: [tag:uvarint][value]
// Wire types: 0=varint, 1=64-bit, 2=length-delimited, 5=32-bit.
// We only implement the READER; writing is the schema compiler's job.
// -----------------------------------------------------------------------------

export const enum WireType {
  Varint = 0,
  Fixed64 = 1,
  LengthDelimited = 2,
  /** Wire type 3 (start group) and 4 (end group) are deprecated in Protobuf. */
  DeprecatedStartGroup = 3,
  DeprecatedEndGroup = 4,
  Fixed32 = 5,
}

/** Read a Protobuf-style tag and return the field number, wire type, and bytes consumed. */
export function readTag(buf: Uint8Array, offset = 0): { fieldNumber: number; wireType: WireType; bytesRead: number } {
  const { value: tag, bytesRead } = decodeUvarint(buf, offset);
  const wireType = (tag & 0x7) as WireType;
  const fieldNumber = tag >>> 3;
  if (fieldNumber === 0) throw new RangeError('protobuf: field number must be > 0');
  return { fieldNumber, wireType, bytesRead };
}

/** Skip one field of the given wire type. Returns the new offset. */
export function skipField(buf: Uint8Array, offset: number, wireType: WireType): number {
  switch (wireType) {
    case WireType.Varint: {
      const { bytesRead } = decodeUvarint(buf, offset);
      return offset + bytesRead;
    }
    case WireType.Fixed64:
      return offset + 8;
    case WireType.LengthDelimited: {
      const { value: length, bytesRead } = decodeUvarint(buf, offset);
      return offset + bytesRead + length;
    }
    case WireType.Fixed32:
      return offset + 4;
    case WireType.DeprecatedStartGroup:
    case WireType.DeprecatedEndGroup:
      throw new RangeError('protobuf: deprecated group wire types not supported');
    default:
      throw new RangeError(`protobuf: unknown wire type ${wireType}`);
  }
}

// Re-export from sibling modules so callers can `import { ... } from './klv.js'`.
import { decodeUvarint, encodeBerLength, decodeBerLength } from './varint.js';
