// =============================================================================
// Chapter 03 — Link & Physical Layer Foundations
// =============================================================================
// Goal: every byte on a wire is a symbol that was once a voltage, a photon,
// or a radio wave. This chapter is the math that links symbols to bits:
//
//   * dB, dBm, link budget, free-space path loss.
//   * Shannon-Hartley capacity, Nyquist sampling, spectral efficiency.
//   * Modulation: bits per symbol, Shannon SNR requirement per modulation,
//     the Shannon limit (Eb/N0 ≈ -1.59 dB).
//   * Line coding: NRZ, NRZI, Manchester, 8b/10b.
//
// References:
//   * Shannon, "A Mathematical Theory of Communication", 1948.
//   * Nyquist, "Certain Topics in Telegraph Transmission Theory", 1928.
//   * IEEE 802.3-2018, clauses 36 (1000BASE-X) and 49 (10GBASE-R) for 8b/10b
//     and 64b/66b.
//   * Widmer & Franaszek, "A DC-Balanced, Partitioned-Block, 8B/10B
//     Transmission Code", IBM J. Res. Dev. 27(5), 1983.
// =============================================================================

// -----------------------------------------------------------------------------
// dB helpers
// -----------------------------------------------------------------------------

/** Convert a linear power ratio to decibels. */
export function powerToDb(power: number): number {
  if (power <= 0) throw new RangeError('power ratio must be > 0');
  return 10 * Math.log10(power);
}

/** Convert a linear amplitude ratio to decibels (uses 20 log10). */
export function amplitudeToDb(amplitude: number): number {
  if (amplitude <= 0) throw new RangeError('amplitude ratio must be > 0');
  return 20 * Math.log10(amplitude);
}

/** Convert decibels to a linear power ratio. */
export function dbToPower(db: number): number {
  return 10 ** (db / 10);
}

/** Convert decibels to a linear amplitude ratio. */
export function dbToAmplitude(db: number): number {
  return 10 ** (db / 20);
}

/** Sum powers expressed in dB. */
export function sumDb(...powersDb: number[]): number {
  let total = 0;
  for (const p of powersDb) total += dbToPower(p);
  return powerToDb(total);
}

// -----------------------------------------------------------------------------
// Shannon-Hartley and Nyquist
// -----------------------------------------------------------------------------

/**
 * Channel capacity (Shannon-Hartley). C = B * log2(1 + S/N) bits/sec.
 * This is the hard upper bound; capacity-approaching codes (LDPC, Polar,
 * Turbo) get within a fraction of a dB.
 */
export function shannonCapacity(bandwidthHz: number, snrLinear: number): number {
  if (bandwidthHz <= 0) throw new RangeError('bandwidth must be > 0');
  if (snrLinear <= 0) throw new RangeError('snr must be > 0');
  return bandwidthHz * Math.log2(1 + snrLinear);
}

/** Shannon capacity with S/N given in dB. */
export function shannonCapacityDb(bandwidthHz: number, snrDb: number): number {
  return shannonCapacity(bandwidthHz, dbToPower(snrDb));
}

/** Nyquist sampling rate (≥ 2 × baseband bandwidth). */
export function nyquistRate(bandwidthHz: number): number {
  return 2 * bandwidthHz;
}

/** Spectral efficiency in bits/second/Hz for a given SNR. */
export function spectralEfficiency(snrLinear: number): number {
  if (snrLinear <= 0) throw new RangeError('snr must be > 0');
  return Math.log2(1 + snrLinear);
}

// -----------------------------------------------------------------------------
// Link budget
// -----------------------------------------------------------------------------

export interface LinkBudget {
  txPowerDbm: number;
  txAntennaGainDbi: number;
  rxAntennaGainDbi: number;
  pathLossDb: number;
  rxSensitivityDbm: number;
  systemLossDb?: number;
}

/** Received signal strength in dBm. */
export function receivedPowerDbm(b: LinkBudget): number {
  return b.txPowerDbm + b.txAntennaGainDbi + b.rxAntennaGainDbi - b.pathLossDb - (b.systemLossDb ?? 0);
}

/** Link margin in dB — positive means the link closes. */
export function linkMarginDb(b: LinkBudget): number {
  return receivedPowerDbm(b) - b.rxSensitivityDbm;
}

/** Free-space path loss in dB. */
export function freeSpacePathLoss(distanceMeters: number, frequencyHz: number): number {
  if (distanceMeters <= 0 || frequencyHz <= 0) {
    throw new RangeError('distance and frequency must be > 0');
  }
  const c = 299_792_458;
  return (
    20 * Math.log10(distanceMeters) +
    20 * Math.log10(frequencyHz) +
    20 * Math.log10((4 * Math.PI) / c)
  );
}

// -----------------------------------------------------------------------------
// Modulation tables
// -----------------------------------------------------------------------------

/** Map of common modulations to their bits per symbol. */
export const MODULATION_BPS: Record<string, number> = {
  BPSK: 1,
  QPSK: 2,
  '8PSK': 3,
  '16QAM': 4,
  '32QAM': 5,
  '64QAM': 6,
  '128QAM': 7,
  '256QAM': 8,
  '1024QAM': 10,
};

/** Approximate required Eb/N0 (dB) for a target BER of 1e-6 (uncoded AWGN). */
export const REQUIRED_EBN0_DB: Record<string, number> = {
  BPSK: 10.5,
  QPSK: 10.5,
  '8PSK': 14,
  '16QAM': 14.5,
  '32QAM': 17,
  '64QAM': 18.5,
  '128QAM': 21,
  '256QAM': 22.5,
  '1024QAM': 27,
};

/** Symbol rate for a given bit rate. */
export function symbolRate(bitRateBps: number, bitsPerSymbol: number): number {
  if (bitsPerSymbol <= 0) throw new RangeError('bitsPerSymbol must be > 0');
  return bitRateBps / bitsPerSymbol;
}

/** Required SNR (dB) for a given modulation at the Shannon limit. */
export function requiredSnrDb(modulation: keyof typeof MODULATION_BPS): number {
  const bps = MODULATION_BPS[modulation];
  if (bps === undefined) throw new RangeError(`unknown modulation ${modulation}`);
  return powerToDb(Math.pow(2, bps) - 1);
}

/** Shannon limit: minimum Eb/N0 for any coding scheme. */
export const SHANNON_LIMIT_DB = -1.591_75;

// -----------------------------------------------------------------------------
// Line coding
// -----------------------------------------------------------------------------

/** NRZ: '1' = HIGH, '0' = LOW. */
export function nrzEncode(bits: number[]): number[] {
  return bits.slice();
}

/** NRZI: transition on '1', hold on '0'. */
export function nrziEncode(bits: number[]): number[] {
  const out: number[] = [];
  let level = 0;
  for (const b of bits) {
    if (b === 1) level = 1 - level;
    out.push(level);
  }
  return out;
}

/** Manchester: '0' = low-to-high, '1' = high-to-low (IEEE 802.3). */
export function manchesterEncode(bits: number[]): number[] {
  const out: number[] = [];
  for (const b of bits) {
    if (b === 0) out.push(0, 1);
    else out.push(1, 0);
  }
  return out;
}

/** Decode Manchester; returns null on a violation. */
export function manchesterDecode(symbols: number[]): number[] | null {
  if (symbols.length % 2 !== 0) return null;
  const out: number[] = [];
  for (let i = 0; i < symbols.length; i += 2) {
    const a = symbols[i]!;
    const b = symbols[i + 1]!;
    if (a === 0 && b === 1) out.push(0);
    else if (a === 1 && b === 0) out.push(1);
    else return null;
  }
  return out;
}

// -----------------------------------------------------------------------------
// 8b/10b (IBM / IEEE 802.3 clause 36). Splits each 8-bit byte into a 5-bit
// piece (encoded to 6 bits) and a 3-bit piece (encoded to 4 bits). Two
// variants of every symbol are stored, one with negative running disparity
// and one with positive. We always pick the variant that brings RD toward 0.
// -----------------------------------------------------------------------------

/** 5b/6b tables. Keys: 5-bit value 0..=31. Values: [RD=-1 variant, RD=+1 variant]. */
const ENCODE_5B6B: Record<number, [number, number]> = {
  0b00000: [0b100111, 0b011000], // D0
  0b00001: [0b011101, 0b100010], // D1
  0b00010: [0b101101, 0b010010], // D2
  0b00011: [0b110001, 0b110001], // D3
  0b00100: [0b110101, 0b001010], // D4
  0b00101: [0b101001, 0b101001], // D5
  0b00110: [0b011001, 0b011001], // D6
  0b00111: [0b111000, 0b000111], // D7
  0b01000: [0b111001, 0b000110], // D8
  0b01001: [0b100101, 0b100101], // D9
  0b01010: [0b010101, 0b010101], // D10
  0b01011: [0b110100, 0b110100], // D11
  0b01100: [0b001101, 0b001101], // D12
  0b01101: [0b101100, 0b101100], // D13
  0b01110: [0b011100, 0b011100], // D14
  0b01111: [0b010111, 0b101000], // D15
  0b10000: [0b011011, 0b100100], // D16
  0b10001: [0b100011, 0b100011], // D17
  0b10010: [0b010011, 0b010011], // D18
  0b10011: [0b110010, 0b110010], // D19
  0b10100: [0b001011, 0b001011], // D20
  0b10101: [0b101010, 0b101010], // D21
  0b10110: [0b011010, 0b011010], // D22
  0b10111: [0b111010, 0b000101], // D23
  0b11000: [0b110011, 0b001100], // D24
  0b11001: [0b100110, 0b100110], // D25
  0b11010: [0b010110, 0b010110], // D26
  0b11011: [0b110110, 0b001001], // D27 / K28 base
  0b11100: [0b001110, 0b001110], // D28
  0b11101: [0b101110, 0b010001], // D29
  0b11110: [0b011110, 0b100001], // D30
  0b11111: [0b101011, 0b010100], // D31
};

/** 3b/4b tables (data variant; K28.7 uses 0b0111/0b1000 instead). */
const ENCODE_3B4B: Record<number, [number, number]> = {
  0b000: [0b1011, 0b0100],
  0b001: [0b1001, 0b1001],
  0b010: [0b0101, 0b0101],
  0b011: [0b1100, 0b0011],
  0b100: [0b1101, 0b0010],
  0b101: [0b1010, 0b1010],
  0b110: [0b0110, 0b0110],
  0b111: [0b1110, 0b0001], // data D.x=7
};

/** Count the number of 1 bits in n. */
function popcount(n: number): number {
  let c = 0;
  while (n) {
    c += n & 1;
    n >>>= 1;
  }
  return c;
}

/** Compute the disparity (ones - zeros) of an n-bit symbol. */
function disparityOf(symbol: number, bits: number): number {
  return 2 * popcount(symbol) - bits;
}

function clampRd(rd: number): -1 | 0 | 1 {
  if (rd > 0) return 1;
  if (rd < 0) return -1;
  return 0;
}

/** Result of a single 8b/10b encode. */
export interface Encoded10B {
  symbol: number;
  runningDisparity: -1 | 0 | 1;
}

/**
 * Encode a single 8-bit byte as a 10-bit symbol, tracking running disparity.
 * `isControl` is reserved for K-character support; the data-only mapping
 * already round-trips all 256 bytes below.
 */
export function encode8b10b(byte: number, rd: -1 | 0 | 1 = -1, isControl = false): Encoded10B {
  if (byte < 0 || byte > 0xff) throw new RangeError('byte must be 0..=255');
  void isControl;
  const low5 = byte & 0x1f;
  const high3 = (byte >> 5) & 0x07;
  const sixT = ENCODE_5B6B[low5];
  const fourT = ENCODE_3B4B[high3];
  if (!sixT || !fourT) throw new Error('invalid byte for 8b/10b');

  // Pick the 6b variant that opposes the current RD.
  const pickSix = rd <= 0 ? sixT[0]! : sixT[1]!;
  const rdAfterSix = disparityOf(pickSix, 6);

  // Pick the 4b variant: if RD after the 6b part is non-zero, oppose it.
  // If zero, tie-break to the negative variant.
  const pickFour = rdAfterSix <= 0 ? fourT[0]! : fourT[1]!;
  const rdAfter = rdAfterSix + disparityOf(pickFour, 4);

  const symbol = (pickFour << 6) | pickSix;
  return { symbol, runningDisparity: clampRd(rdAfter) };
}

/** Encode a sequence of bytes to 10-bit symbols. */
export function encode8b10bStream(bytes: readonly number[]): number[] {
  const out: number[] = [];
  let rd: -1 | 0 | 1 = -1;
  for (const b of bytes) {
    const enc = encode8b10b(b, rd);
    out.push(enc.symbol);
    rd = enc.runningDisparity;
  }
  return out;
}

/** Decode a sequence of 10-bit symbols back to bytes (data only). */
export function decode8b10bStream(symbols: readonly number[]): number[] {
  const sixDecode = new Map<number, number>();
  for (const [k, v] of Object.entries(ENCODE_5B6B)) {
    sixDecode.set(v[0]!, Number(k));
    sixDecode.set(v[1]!, Number(k));
  }
  const fourDecode = new Map<number, number>();
  for (const [k, v] of Object.entries(ENCODE_3B4B)) {
    fourDecode.set(v[0]!, Number(k));
    fourDecode.set(v[1]!, Number(k));
  }
  const out: number[] = [];
  for (const s of symbols) {
    const six = s & 0x3f;
    const four = (s >> 6) & 0xf;
    const low5 = sixDecode.get(six);
    const high3 = fourDecode.get(four);
    if (low5 === undefined || high3 === undefined) throw new Error('invalid 10b symbol');
    out.push((high3 << 5) | low5);
  }
  return out;
}
