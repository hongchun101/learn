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

// -----------------------------------------------------------------------------
// STUDY (read alongside docs/STUDY/ch03-link-physical.md)
// -----------------------------------------------------------------------------
// Prerequisites: comfortable with algebra and log10. No code from chapter 1
// is required, but the bit packing will feel familiar.
// Why it matters: every physical-layer decision — at the radio, on the
// backplane, in the optical module — is a trade-off between SNR, bandwidth,
// and complexity. This chapter turns the textbook formulas into runnable
// code so you can reason about a real link budget by hand.
// Key invariants:
//   * Shannon capacity is the hard upper bound: C = B * log2(1 + S/N).
//   * The Shannon limit is -1.59 dB Eb/N0; real codes approach within 0.1 dB.
//   * 8b/10b guarantees DC balance and a run length ≤ 5; both PCIe and
//     1000BASE-X rely on it for clock recovery.
// Common pitfalls:
//   * Mixing dB and dBm. dB is a ratio; dBm is referenced to 1 mW.
//   * Confusing required SNR with required Eb/N0; convert with the
//     bits/symbol and the coding rate.
//   * Manchester long runs of identical symbols are a violation.
// Interview-ready summary: I can compute a real link budget on paper,
// explain the bits-per-symbol trade-off, and choose a modulation for a
// given SNR margin.

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
