// =============================================================================
// Chapter 03 — Estimation
// =============================================================================
// Goal: estimation is a project-management discipline, not a guess. This
// file implements three named techniques: PERT, Wideband Delphi, and
// reference-class forecasting. Each is deterministic given the input.
// =============================================================================

/** PERT = (O + 4M + P) / 6, with σ = (P - O) / 6. */
export interface PertEstimate {
  /** Optimistic. */
  readonly optimistic: number;
  /** Most likely. */
  readonly mostLikely: number;
  /** Pessimistic. */
  readonly pessimistic: number;
}

export interface PertResult {
  readonly expected: number;
  /** 1 standard deviation. */
  readonly sigma: number;
  /** 1-sigma high and low. */
  readonly low: number;
  readonly high: number;
}

export function pert(e: PertEstimate): PertResult {
  const expected = (e.optimistic + 4 * e.mostLikely + e.pessimistic) / 6;
  const sigma = (e.pessimistic - e.optimistic) / 6;
  return { expected, sigma, low: expected - sigma, high: expected + sigma };
}

/** Wideband Delphi — average across rounds, drop the most extreme per round. */
export function widebandDelphi(
  rounds: ReadonlyArray<ReadonlyArray<number>>,
): { mean: number; spread: number } {
  if (rounds.length === 0 || rounds[0]?.length === 0) {
    return { mean: 0, spread: 0 };
  }
  const last = rounds[rounds.length - 1]!;
  const sorted = [...last].sort((a, b) => a - b);
  const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  const spread = sorted[sorted.length - 1]! - sorted[0]!;
  return { mean, spread };
}

/** Reference-class forecast: 90% CI based on a prior class of projects. */
export interface ReferenceClass {
  /** "P10" — the 10th percentile of prior outcomes. */
  readonly p10: number;
  readonly p50: number;
  /** "P90" — the 90th percentile. */
  readonly p90: number;
}

export function referenceClassForecast(
  rc: ReferenceClass,
  /** How aggressive we want to be: 0 = p50, 1 = p90. */
  aggressiveness = 0.5,
): number {
  if (aggressiveness < 0 || aggressiveness > 1) {
    throw new Error('aggressiveness must be in [0,1]');
  }
  return rc.p50 + (rc.p90 - rc.p50) * aggressiveness;
}

/** Convert days → calendar weeks given weekends and holidays. */
export function calendarWeeks(
  workingDays: number,
  workdaysPerWeek = 5,
  holidays: ReadonlyArray<number> = [],
): number {
  if (workdaysPerWeek <= 0) throw new Error('workdaysPerWeek must be > 0');
  const effective = Math.max(0, workingDays - holidays.length);
  return effective / workdaysPerWeek;
}
