// =============================================================================
// Chapter 02 — Endianness, Signed Integers, and Fixed-Point
// =============================================================================
// Goal: every wire format must decide two things up front: how multi-byte
// numbers are laid out (big-endian vs little-endian) and how signed numbers
// are represented (two's complement vs sign-magnitude vs zig-zag). This
// module provides canonical, allocation-free helpers for the common cases
// plus signed varint, fixed-point Q-formats, and IEEE 754 half-precision.
//
// Common conventions by protocol family:
//   * Network order = big-endian: TCP, UDP, IP, DNS, TLS record, HTTP/1.1,
//     HTTP/2, gRPC, SIP, BGP, OSPF, RADIUS, Kerberos.
//   * Little-endian: USB, PCI, PCIe, most file systems, modern CPU ISAs.
//   * Mixed: Protobuf (LE on the wire), RISC-V (LE), some SCADA protocols
//     where the spec lets the field dictate.
// =============================================================================

// -----------------------------------------------------------------------------
// Unsigned integers (u8 / u16 / u32 / u64)
// -----------------------------------------------------------------------------

/** Write a u16 in big-endian (network) order. */
export function u16Be(value: number): Uint8Array {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
    throw new RangeError('u16 out of range');
  }
  return new Uint8Array([(value >>> 8) & 0xff, value & 0xff]);
}

/** Write a u32 in big-endian order. */
export function u32Be(value: number): Uint8Array {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
    throw new RangeError('u32 out of range');
  }
  return new Uint8Array([(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff]);
}

/** Write a u32 in little-endian order. */
export function u32Le(value: number): Uint8Array {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
    throw new RangeError('u32 out of range');
  }
  return new Uint8Array([value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]);
}

/** Read a u16 in big-endian order from a DataView. */
export function readU16Be(view: DataView, offset = 0): number {
  return view.getUint16(offset, false);
}

/** Read a u32 in big-endian order from a DataView. */
export function readU32Be(view: DataView, offset = 0): number {
  return view.getUint32(offset, false);
}

/** Read a u32 in little-endian order from a DataView. */
export function readU32Le(view: DataView, offset = 0): number {
  return view.getUint32(offset, true);
}

// -----------------------------------------------------------------------------
// u64 — JavaScript numbers are IEEE-754 doubles, safe up to 2^53. We use
// bigint for the actual range.
// -----------------------------------------------------------------------------

/** Write a u64 as a big-endian 8-byte buffer from a bigint. */
export function u64Be(value: bigint): Uint8Array {
  if (value < 0n) throw new RangeError('u64 must be non-negative');
  if (value > 0xffffffffffffffffn) throw new RangeError('u64 overflow');
  const out = new Uint8Array(8);
  let v = value;
  for (let i = 7; i >= 0; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

/** Read a u64 (big-endian) from a Uint8Array as a bigint. */
export function readU64Be(buf: Uint8Array, offset = 0): bigint {
  if (offset + 8 > buf.length) throw new RangeError('u64 out of bounds');
  let v = 0n;
  for (let i = 0; i < 8; i++) v = (v << 8n) | BigInt(buf[offset + i]!);
  return v;
}

// -----------------------------------------------------------------------------
// Signed integers — two's complement (the universal choice on the wire).
// -----------------------------------------------------------------------------

/** Write a signed i16 in two's complement big-endian. */
export function i16Be(value: number): Uint8Array {
  if (!Number.isInteger(value) || value < -0x8000 || value > 0x7fff) {
    throw new RangeError('i16 out of range');
  }
  return u16Be(value & 0xffff);
}

/** Write a signed i32 in two's complement little-endian. */
export function i32Le(value: number): Uint8Array {
  if (!Number.isInteger(value) || value < -0x80000000 || value > 0x7fffffff) {
    throw new RangeError('i32 out of range');
  }
  return u32Le(value >>> 0);
}

/** Read a signed i32 in two's complement big-endian. */
export function readI32Be(view: DataView, offset = 0): number {
  return view.getInt32(offset, false);
}

/** Read a signed i32 in two's complement little-endian. */
export function readI32Le(view: DataView, offset = 0): number {
  return view.getInt32(offset, true);
}

// -----------------------------------------------------------------------------
// ZigZag — maps signed to unsigned so small magnitudes stay small on the wire.
// Used by Protobuf (signed sint32/sint64) and Cap'n Proto. Encodes:
//   0 → 0, -1 → 1, 1 → 2, -2 → 3, 2 → 4, ...
// -----------------------------------------------------------------------------

/** Encode a signed 32-bit integer as an unsigned zig-zag value. */
export function zigzag32(value: number): number {
  if (!Number.isInteger(value)) throw new RangeError('zigzag requires an integer');
  return ((value << 1) ^ (value >> 31)) >>> 0;
}

/** Decode an unsigned zig-zag value back to a signed 32-bit integer. */
export function unzigzag32(value: number): number {
  if (!Number.isInteger(value) || value < 0) throw new RangeError('zigzag requires non-negative int');
  return (value >>> 1) ^ -(value & 1);
}

/** Encode a signed 64-bit integer as an unsigned zig-zag value (bigint). */
export function zigzag64(value: bigint): bigint {
  return (value << 1n) ^ (value >> 63n);
}

/** Decode a zig-zag u64 back to a signed i64. */
export function unzigzag64(value: bigint): bigint {
  return (value >> 1n) ^ -(value & 1n);
}

// -----------------------------------------------------------------------------
// Fixed-point (Q-format) — fractional numbers without a float unit. Q15.16
// stores 16 bits of integer and 16 bits of fraction. Common in DSP firmware,
// avionics (ARINC 664, AFDX), CAN bus, sensor payloads.
// -----------------------------------------------------------------------------

/** Encode `value` as a Q-format integer: `round(value * 2^fractionalBits)`. */
export function encodeQ(value: number, fractionalBits: number): number {
  if (!Number.isFinite(value)) throw new RangeError('value must be finite');
  if (!Number.isInteger(fractionalBits) || fractionalBits < 0 || fractionalBits > 30) {
    throw new RangeError('fractionalBits must be 0..30');
  }
  const scale = 1 << fractionalBits;
  // Math.round handles negative values correctly.
  return Math.round(value * scale);
}

/** Decode a Q-format integer back to a float. */
export function decodeQ(raw: number, fractionalBits: number): number {
  if (!Number.isInteger(fractionalBits) || fractionalBits < 0 || fractionalBits > 30) {
    throw new RangeError('fractionalBits must be 0..30');
  }
  return raw / (1 << fractionalBits);
}

// -----------------------------------------------------------------------------
// IEEE 754 half-precision (16-bit) — used in graphics, ML model exchange,
// some embedded protocols, IEEE 802.11ah S1G.
// =============================================================================

/** Encode a JS number as IEEE 754 binary16 (half precision) big-endian. */
// IEEE 754 binary16 (half precision): 1 sign + 5 exponent + 10 mantissa bits.
// We do the conversion bit-by-bit rather than relying on a host type (Node
// ≥ 22 has DataView.setFloat16, but we want this to run on every engine
// supported by our `target: ES2022` setting).
// -----------------------------------------------------------------------------

const F16_BIAS = 15;

/** Encode a JS number as IEEE 754 binary16 big-endian. */
export function f16Be(value: number): Uint8Array {
  if (!Number.isFinite(value)) {
    // NaN and infinities: exponent all 1s, mantissa non-zero for NaN.
    if (Number.isNaN(value)) return new Uint8Array([0x7e, 0x00]);
    return new Uint8Array([value > 0 ? 0x7c : 0xfc, 0x00]);
  }
  const sign = value < 0 ? 1 : 0;
  const abs = Math.abs(value);

  if (abs === 0) {
    return new Uint8Array([sign << 7, 0x00]);
  }
  // Decompose: value = (1 + m/1024) * 2^e
  const e = Math.floor(Math.log2(abs));
  // Normalize mantissa to [1024, 2048) so the leading 1 is implicit.
  let mant = Math.round((abs / Math.pow(2, e) - 1) * 1024);
  let exp: number;
  if (mant >= 1024) {
    // Rounding pushed the mantissa to 1024 — bump exponent.
    mant = 0;
    exp = e + 1;
  } else {
    exp = e;
  }
  // Convert to f16 exponent.
  const expF16 = exp + F16_BIAS;
  if (expF16 >= 31) return new Uint8Array([(sign << 7) | 0x7c, 0x00]); // overflow → ±Inf
  if (expF16 <= 0) {
    // Subnormal: value = (mant/1024) * 2^(1 - bias)
    const shifted = mant | (1 << 10);
    const r = shifted >> (1 - expF16);
    return new Uint8Array([(sign << 7) | ((r >> 8) & 0x1f), r & 0xff]);
  }
  const hi = (sign << 7) | ((expF16 & 0x1f) << 2) | ((mant >> 8) & 0x03);
  const lo = mant & 0xff;
  return new Uint8Array([hi, lo]);
}

/** Decode IEEE 754 binary16 big-endian to a JS number. */
export function readF16Be(buf: Uint8Array, offset = 0): number {
  if (offset + 2 > buf.length) throw new RangeError('f16 out of bounds');
  const hi = buf[offset]!;
  const lo = buf[offset + 1]!;
  const sign = (hi >> 7) & 1 ? -1 : 1;
  const exp = (hi >> 2) & 0x1f;
  const mant = ((hi & 0x03) << 8) | lo;
  if (exp === 0x1f) {
    if (mant === 0) return sign * Infinity;
    return NaN;
  }
  if (exp === 0) {
    // Subnormal: value = (mant / 1024) * 2^(1 - bias)
    return sign * (mant / 1024) * Math.pow(2, 1 - F16_BIAS);
  }
  return sign * (1 + mant / 1024) * Math.pow(2, exp - F16_BIAS);
}
