// =============================================================================
// Chapter 03 — Demo
// =============================================================================
import {
  shannonCapacity,
  shannonCapacityDb,
  nyquistRate,
  freeSpacePathLoss,
  linkMarginDb,
  spectralEfficiency,
  requiredSnrDb,
  SHANNON_LIMIT_DB,
  MODULATION_BPS,
  REQUIRED_EBN0_DB,
  nrzEncode,
  nrziEncode,
  manchesterEncode,
  manchesterDecode,
  encode8b10bStream,
  decode8b10bStream,
} from './shannon.js';
import { toHex } from '../01-bytes-framing/bits.js';

export function demo(): void {
  // -------------------------------------------------------------------------
  // Shannon, Nyquist, SNR
  // -------------------------------------------------------------------------
  const cap = shannonCapacity(20e6, 100); // 20 MHz, S/N = 100 (~20 dB)
  const capDb = shannonCapacityDb(20e6, 20);
  console.log(`[03] Shannon capacity (20 MHz, S/N=100): ${cap.toFixed(1)} bps (≈ ${capDb.toFixed(1)} bps)`);
  console.log(`[03] Spectral efficiency at S/N=100: ${spectralEfficiency(100).toFixed(2)} b/s/Hz`);
  console.log(`[03] Nyquist rate for 4 kHz voice: ${nyquistRate(4000)} samples/sec`);
  console.log(`[03] Shannon limit: ${SHANNON_LIMIT_DB} dB Eb/N0`);

  // -------------------------------------------------------------------------
  // Free-space path loss + link budget
  // -------------------------------------------------------------------------
  const fspl = freeSpacePathLoss(1000, 2.4e9);
  const margin = linkMarginDb({
    txPowerDbm: 20,
    txAntennaGainDbi: 2,
    rxAntennaGainDbi: 2,
    pathLossDb: fspl,
    rxSensitivityDbm: -90,
  });
  console.log(`[03] FSPL @ 1 km, 2.4 GHz: ${fspl.toFixed(1)} dB`);
  console.log(`[03] link margin: ${margin.toFixed(1)} dB`);

  // -------------------------------------------------------------------------
  // Modulation table
  // -------------------------------------------------------------------------
  for (const [name, bps] of Object.entries(MODULATION_BPS)) {
    const snr = requiredSnrDb(name as keyof typeof MODULATION_BPS);
    const required = REQUIRED_EBN0_DB[name] ?? 0;
    console.log(`[03] ${name.padEnd(8)} ${bps} b/sym  Shannon SNR ${snr.toFixed(1)} dB  practical Eb/N0 ≈ ${required} dB`);
  }

  // -------------------------------------------------------------------------
  // Line coding
  // -------------------------------------------------------------------------
  const bits = [1, 0, 1, 1, 0, 0, 1, 0];
  console.log('[03] NRZ     :', nrzEncode(bits).join(''));
  console.log('[03] NRZI    :', nrziEncode(bits).join(''));
  console.log('[03] Manch   :', manchesterEncode(bits).join(''));
  console.log('[03] Manch-1 :', (manchesterDecode(manchesterEncode(bits)) ?? []).join(''));

  // -------------------------------------------------------------------------
  // 8b/10b
  // -------------------------------------------------------------------------
  const payload = [0x55, 0xaa, 0x00, 0xff, 0x12, 0x34];
  const symbols = encode8b10bStream(payload);
  console.log('[03] 8b/10b symbols:', symbols.map((s) => s.toString(2).padStart(10, '0')).join(' '));
  const decoded = decode8b10bStream(symbols);
  console.log('[03] 8b/10b roundtrip:', decoded.map((b) => '0x' + b.toString(16).padStart(2, '0')).join(' '));

  // Disjoint property: every 10b symbol has at most 5 zeros or at most 5 ones
  // (running disparity is bounded).
  const maxZero = Math.max(...symbols.map((s) => 10 - popcount(s)));
  const maxOne = Math.max(...symbols.map(popcount));
  console.log(`[03] 8b/10b DC balance: max zeros in a symbol = ${maxZero}, max ones = ${maxOne}`);

  console.log('[03] hex:', toHex(new Uint8Array(payload.map((b) => b & 0xff))));
}

function popcount(n: number): number {
  let c = 0;
  while (n) {
    c += n & 1;
    n >>>= 1;
  }
  return c;
}
