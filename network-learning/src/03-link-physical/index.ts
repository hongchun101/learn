// =============================================================================
// Chapter 03 — Link and Physical Layer
// =============================================================================
// Goal: every byte on a wire is a symbol that was once a voltage, a photon,
// or a radio wave. This chapter is the math that links symbols to bits:
//
//   * dB, dBm, link budget, free-space path loss.
//   * Shannon-Hartley capacity, Nyquist sampling, spectral efficiency.
//   * Modulation: bits per symbol, Shannon SNR requirement per modulation,
//     the Shannon limit (Eb/N0 ≈ -1.59 dB).
//   * Line coding: NRZ, NRZI, Manchester, 8b/10b (used by PCIe, SATA, USB 3,
//     DisplayPort, Thunderbolt, Fibre Channel, 1000BASE-X).
// =============================================================================

export {
  powerToDb,
  amplitudeToDb,
  dbToPower,
  dbToAmplitude,
  sumDb,
  shannonCapacity,
  shannonCapacityDb,
  nyquistRate,
  spectralEfficiency,
  receivedPowerDbm,
  linkMarginDb,
  freeSpacePathLoss,
  symbolRate,
  requiredSnrDb,
  SHANNON_LIMIT_DB,
  MODULATION_BPS,
  REQUIRED_EBN0_DB,
  nrzEncode,
  nrziEncode,
  manchesterEncode,
  manchesterDecode,
  encode8b10b,
  encode8b10bStream,
  decode8b10bStream,
} from './shannon.js';
export type { LinkBudget, Encoded10B } from './shannon.js';
export { demo } from './demo.js';
