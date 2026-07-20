// =============================================================================
// Chapter 06 — Retention, Stickiness, Habit
// =============================================================================
// Goal: a product that retains users is more valuable than one that
// acquires them. The chapter covers DAU/MAU stickiness, retention curves
// (exponential and power-law), and habit formation.
//
// References:
//   * Nir Eyal, "Hooked", 2014.
//   * Empirically observed retention curves (Chen, 2018).
// =============================================================================

/** DAU/MAU ratio. Healthy = 0.2+, > 0.5 = daily use. */
export function stickiness(dau: number, mau: number): number {
  if (mau <= 0) return 0;
  return dau / mau;
}

/** Power-law retention: R(t) = a · t^(-b). Common for consumer social. */
export function powerLawRetention(t: number, a: number, b: number): number {
  if (t <= 0) return 1;
  return a * Math.pow(t, -b);
}

/** Exponential decay: R(t) = e^(-λt). Common for subscription products. */
export function exponentialRetention(t: number, lambda: number): number {
  if (lambda < 0) throw new Error('lambda must be non-negative');
  return Math.exp(-lambda * t);
}

/** Weekly retention curve from daily. */
export function weeklyFromDaily(daily: ReadonlyArray<number>): ReadonlyArray<number> {
  const out: number[] = [];
  for (let i = 6; i < daily.length; i += 7) {
    out.push(daily[i]!);
  }
  return out;
}

/** Habit formation probability — frequency × reward × effort. */
export interface HabitInputs {
  /** How often the user can do the trigger, per week. */
  readonly frequency: number;
  /** Perceived reward, 0..1. */
  readonly reward: number;
  /** Effort, 0..1 (1 = maximal effort). */
  readonly effort: number;
  /** Investment, 0..1. */
  readonly investment: number;
}

export function habitScore(h: HabitInputs): number {
  return h.frequency * h.reward * (1 - h.effort) * (1 + h.investment) / 10;
}

/** Probability a feature survives the "smoke test" (fake door). */
export interface SmokeTest {
  /** Visitors who saw the door. */
  readonly visitors: number;
  /** Visitors who clicked through. */
  readonly clicks: number;
  /** Threshold interest rate, e.g. 5% means "ship it". */
  readonly threshold: number;
}

export function smokeTestResult(t: SmokeTest): { pass: boolean; rate: number } {
  const rate = t.visitors > 0 ? t.clicks / t.visitors : 0;
  return { pass: rate >= t.threshold, rate };
}
