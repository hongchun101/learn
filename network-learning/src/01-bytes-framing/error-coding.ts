// =============================================================================
// Chapter 01 — Error Detection and Correction
// =============================================================================
// Goal: every physical and many data-link layers can corrupt bits. Two
// strategies:
//
//   * Error DETECTION — append a checksum/CRC so the receiver can detect
//     corruption. The receiver asks for retransmission.
//
//   * Error CORRECTION — add structured redundancy (e.g. Hamming, Reed-Solomon,
//     LDPC, Turbo codes) so the receiver can recover the original bits up to
//     some number of errors, without retransmission.
//
// This file implements:
//   * CRC-8 / CRC-16-CCITT / CRC-32 (IEEE) — the polynomials used by Ethernet,
//     gzip, PNG, HDLC, USB, etc.
//   * Even-parity bit.
//   * Internet checksum (RFC 1071) used by IPv4/ICMP/TCP/UDP.
//   * Hamming(7,4) — 4 data bits → 7 code bits, single-error correction.
//   * Reed-Solomon RS(7,3) over GF(2^3) — 3 data bytes → 7 code bytes, can
//     correct up to 2 byte errors per codeword. Small enough to inspect by
//     hand; same construction as production RS(255, k) codes in DVB, QR, etc.
//
// References:
//   * Williams, "Painless Guide to CRC Error Detection Algorithms".
//   * Hamming, "Error detecting and error correcting codes", Bell System Tech
//     Journal, 1950.
//   * RFC 1071 — Computing the Internet Checksum.
// =============================================================================

// -----------------------------------------------------------------------------
// Cyclic Redundancy Check (CRC)
// -----------------------------------------------------------------------------

/** CRC-8 polynomial used by ATM HEC, SMBus, etc. (x^8 + x^2 + x + 1, reflected: 0x07). */
const CRC8_POLY = 0x07;

/** CRC-16-CCITT polynomial used by HDLC, PPP, Bluetooth, etc. (x^16 + x^12 + x^5 + 1). */
const CRC16_CCITT_POLY = 0x1021;

/** CRC-32 polynomial used by Ethernet, gzip, zlib, PNG, etc. (reflected: 0xEDB88320). */
const CRC32_IEEE_POLY = 0xedb88320;

/** Compute CRC-8 with polynomial 0x07, init 0x00, no reflection, no XOR-out. */
export function crc8(data: Uint8Array, init = 0x00): number {
  let crc = init;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i]!;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x80 ? ((crc << 1) ^ CRC8_POLY) & 0xff : (crc << 1) & 0xff;
    }
  }
  return crc & 0xff;
}

/** Compute CRC-16-CCITT (XMODEM variant: init 0x0000, no XOR-out). */
export function crc16Ccitt(data: Uint8Array, init = 0x0000): number {
  let crc = init;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i]! << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ CRC16_CCITT_POLY) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc & 0xffff;
}

/** Compute CRC-32 IEEE (the one used by Ethernet, gzip, PNG). */
export function crc32(data: Uint8Array, init = 0xffffffff): number {
  let crc = init;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i]!;
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? (crc >>> 1) ^ CRC32_IEEE_POLY : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Convenience: verify a CRC-32 appended to the end of a message (big-endian). */
export function verifyCrc32(messageAndCrc: Uint8Array): boolean {
  if (messageAndCrc.length < 4) return false;
  const msg = messageAndCrc.subarray(0, messageAndCrc.length - 4);
  const expected = new DataView(
    messageAndCrc.buffer,
    messageAndCrc.byteOffset + messageAndCrc.length - 4,
    4,
  ).getUint32(0, false);
  return crc32(msg) === expected;
}

// -----------------------------------------------------------------------------
// Parity
// -----------------------------------------------------------------------------

/** Even-parity bit: 1 if `data` has an odd number of set bits, else 0. */
export function evenParityBit(data: Uint8Array): 0 | 1 {
  let count = 0;
  for (let i = 0; i < data.length; i++) {
    let b = data[i]!;
    while (b) {
      count += b & 1;
      b >>>= 1;
    }
  }
  return (count & 1) as 0 | 1;
}

// -----------------------------------------------------------------------------
// Internet Checksum (RFC 1071)
// -----------------------------------------------------------------------------

/**
 * 16-bit one's-complement checksum as used in IPv4 header, ICMP, TCP, UDP.
 * The caller is responsible for assembling the pseudo-header + body per
 * RFC 1071 / 1624.
 */
export function internetChecksum(data: Uint8Array): number {
  let sum = 0;
  let i = 0;
  while (i + 1 < data.length) {
    sum += ((data[i]! << 8) | data[i + 1]!) >>> 0;
    i += 2;
  }
  if (i < data.length) sum += data[i]! << 8;
  while (sum > 0xffff) sum = (sum & 0xffff) + (sum >>> 16);
  return ~sum & 0xffff;
}

// -----------------------------------------------------------------------------
// Hamming(7,4) — single-error correction
// -----------------------------------------------------------------------------
// Bit layout (LSB-first when packed into a byte):
//   bit 0 = p0  (parity over d0, d1, d3)
//   bit 1 = p1  (parity over d0, d2, d3)
//   bit 2 = d0
//   bit 3 = p2  (parity over d1, d2, d3)
//   bit 4 = d1
//   bit 5 = d2
//   bit 6 = d3
// -----------------------------------------------------------------------------

/** Encode 4 data bits into 7 code bits. */
export function hamming74EncodeNibble(nibble: number): number {
  if (nibble < 0 || nibble > 0xf || !Number.isInteger(nibble)) {
    throw new RangeError('nibble must be 0..=15');
  }
  const d0 = (nibble >> 0) & 1;
  const d1 = (nibble >> 1) & 1;
  const d2 = (nibble >> 2) & 1;
  const d3 = (nibble >> 3) & 1;
  const p0 = d0 ^ d1 ^ d3;
  const p1 = d0 ^ d2 ^ d3;
  const p2 = d1 ^ d2 ^ d3;
  return ((d3 << 6) | (d2 << 5) | (d1 << 4) | (p2 << 3) | (d0 << 2) | (p1 << 1) | p0) >>> 0;
}

/**
 * Decode a 7-bit codeword, correcting a single-bit error if one occurred.
 * Returns the corrected data nibble and the bit index that was flipped
 * (0..=6), or null if no error was detected.
 */
export function hamming74Decode(codeword: number): { data: number; correctedBit: number | null } {
  if (codeword < 0 || codeword > 0x7f) throw new RangeError('codeword must fit in 7 bits');
  const bit = (n: number, k: number) => (n >> k) & 1;

  const c0 = bit(codeword, 0);
  const c1 = bit(codeword, 1);
  const c2 = bit(codeword, 2);
  const c3 = bit(codeword, 3);
  const c4 = bit(codeword, 4);
  const c5 = bit(codeword, 5);
  const c6 = bit(codeword, 6);

  const s0 = c0 ^ c2 ^ c4 ^ c6;
  const s1 = c1 ^ c2 ^ c5 ^ c6;
  const s2 = c3 ^ c4 ^ c5 ^ c6;
  const syndrome = s0 | (s1 << 1) | (s2 << 2);

  const corrected = syndrome === 0 ? codeword : codeword ^ (1 << (syndrome - 1));
  const data =
    (bit(corrected, 2) << 0) |
    (bit(corrected, 4) << 1) |
    (bit(corrected, 5) << 2) |
    (bit(corrected, 6) << 3);
  return { data, correctedBit: syndrome === 0 ? null : syndrome - 1 };
}

// -----------------------------------------------------------------------------
// Reed-Solomon RS(7,3) over GF(2^3) with primitive polynomial x^3 + x + 1
// -----------------------------------------------------------------------------
// 3 data bytes → 7 code bytes; can correct up to 2 byte errors per codeword.
//   * Generator polynomial: g(x) = (x - α^0)(x - α^1)(x - α^2)(x - α^3)
//   * Codeword polynomial: c(x) = r(x) + d(x) * x^4
//     where r(x) is the remainder of d(x) * x^4 modulo g(x).
//   * The codeword is stored as 7 bytes [c0, c1, c2, c3, c4, c5, c6] with
//     c[i] being the coefficient of x^i. This means the data is in the
//     *high* indices (c4, c5, c6) and the parity in the *low* indices
//     (c0, c1, c2, c3). This matches the byte layout used by most
//     storage systems and is convenient for syndromes (Horner from c0 up).
// -----------------------------------------------------------------------------

const GF3_EXP: number[] = new Array(14).fill(0);
const GF3_LOG: number[] = new Array(8).fill(0);

function initGf3(): void {
  let x = 1;
  for (let i = 0; i < 7; i++) {
    GF3_EXP[i] = x;
    GF3_LOG[x] = i;
    x = (x << 1) ^ (x & 4 ? 0b1011 : 0);
  }
  for (let i = 7; i < 14; i++) GF3_EXP[i] = GF3_EXP[i - 7]!;
}
initGf3();

function gf3Mul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF3_EXP[(GF3_LOG[a]! + GF3_LOG[b]!) % 7]!;
}

/**
 * Compute the generator polynomial g(x) of degree 4 for RS(7,3) over GF(2^3).
 * Returns coefficients in ascending order of x: [g0, g1, g2, g3, g4] where
 * g[i] is the coefficient of x^i. The result is monic (g[4] === 1).
 */
function rs73Generator(): number[] {
  // Start with g(x) = 1, then multiply by (x - α^j) for j=0..3.
  const g = [1, 0, 0, 0, 0];
  for (let j = 0; j < 4; j++) {
    const root = GF3_EXP[j]!;
    for (let k = 4; k > 0; k--) g[k] = (g[k - 1]! ^ gf3Mul(g[k]!, root)) & 0x7;
    g[0] = gf3Mul(g[0]!, root);
  }
  return g;
}

const RS73_G = rs73Generator();

/**
 * Encode 3 data bytes (each 0..=7) into a 7-byte codeword.
 * Layout: [r0, r1, r2, r3, d0, d1, d2] — parity in low positions, data in
 * high positions. Equivalently, the polynomial c(x) = r(x) + d(x) * x^4
 * evaluated coefficient-wise.
 */
export function rs73Encode(data: readonly [number, number, number]): number[] {
  if (data.some((b) => !Number.isInteger(b) || b < 0 || b > 7)) {
    throw new RangeError('each data byte must be an integer in 0..=7');
  }
  // Build d(x) * x^4 as a degree-6 polynomial. Place d[i] at position i+4
  // so that c4 = d0, c5 = d1, c6 = d2. The low 4 positions start at zero
  // and will end up holding r0..r3.
  const poly = [0, 0, 0, 0, 0, 0, 0];
  poly[4] = data[0]!;
  poly[5] = data[1]!;
  poly[6] = data[2]!;

  // Polynomial long division of poly[0..6] by g(x) of degree 4.
  // At each step the leading coefficient (at the current i) is XORed against
  // the generator (suitably shifted) so that the leading coefficient becomes
  // zero. After the loop, positions 4..6 are zeroed; positions 0..3 hold r.
  for (let i = 6; i >= 4; i--) {
    const coef = poly[i]!;
    if (coef !== 0) {
      for (let j = 0; j < 5; j++) poly[i - 4 + j]! ^= gf3Mul(RS73_G[j]!, coef);
    }
  }
  return [poly[0]!, poly[1]!, poly[2]!, poly[3]!, data[0]!, data[1]!, data[2]!];
}

/** Compute the 4 syndromes of a 7-byte codeword. All-zero means the codeword is valid. */
export function rs73Syndromes(cw: readonly number[]): number[] {
  if (cw.length !== 7) throw new RangeError('codeword must be 7 bytes');
  const s: number[] = [];
  for (let j = 0; j < 4; j++) {
    const root = GF3_EXP[j]!;
    // Horner: c(root) = c0 + root * (c1 + root * (c2 + ... + root * c6))
    let acc = 0;
    for (let i = 6; i >= 0; i--) acc = gf3Mul(acc, root) ^ cw[i]!;
    s.push(acc);
  }
  return s;
}

/** True if the codeword has no errors. */
export function rs73IsValid(cw: readonly number[]): boolean {
  return rs73Syndromes(cw).every((s) => s === 0);
}

/**
 * Correct a single byte error. Returns the corrected codeword, or null if
 * the error pattern is not consistent with exactly 1 error.
 *
 * For one error at position `i` with magnitude `e`:
 *   S_j = e * α^(i*j) for j=0..3
 * Hence S0 = e and S_j / S0 = α^(i*j). In particular S1 / S0 = α^i and
 * S1^2 = S0 * S2 must hold for the 1-error case.
 */
export function rs73CorrectOne(cw: readonly number[]): number[] | null {
  const syn = rs73Syndromes(cw);
  if (syn.every((s) => s === 0)) return cw.slice();
  const [s0, s1, s2, s3] = syn as [number, number, number, number];
  if (s0 === 0) return null; // >= 2 errors (otherwise S0 = e_i would be nonzero)
  if (gf3Mul(s1, s1) !== gf3Mul(s0, s2) || gf3Mul(s2, s2) !== gf3Mul(s1, s3)) {
    return null;
  }
  const i = (GF3_LOG[s1]! - GF3_LOG[s0]! + 7) % 7;
  const e = s0;
  const out = cw.slice();
  out[i] = (out[i]! ^ e) & 0x7;
  return out;
}

// Re-exported for tests that want to inspect tables.
export const _internal = { gf3Mul, GF3_EXP, GF3_LOG, RS73_G };
