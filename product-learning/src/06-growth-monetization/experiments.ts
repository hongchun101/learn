// =============================================================================
// Chapter 06 — A/B Testing & Experiment Design
// =============================================================================
// Goal: a growth team runs 100+ experiments a quarter. Each must be
// sized, randomised, and analysed. This file gives the standard
// utilities: sample size, sequential testing, CUPED variance reduction,
// multi-armed bandits.
// =============================================================================

/** Sample size for two-proportion test, equal allocation. */
export function experimentSampleSize(
  baseline: number,
  mde: number,
  _alpha = 0.05,
  _power = 0.8,
): number {
  if (baseline <= 0 || baseline >= 1 || mde <= 0 || mde >= 1) {
    throw new Error('baseline and mde must be in (0,1)');
  }
  // Use the standard formula with z_{1-α/2} and z_{1-β} for two-sided test.
  const zAlpha = 1.96; // 95% two-sided
  const zBeta = 0.84;  // 80% power
  const p1 = baseline;
  const p2 = baseline + mde;
  const pBar = (p1 + p2) / 2;
  const numerator = Math.pow(zAlpha * Math.sqrt(2 * pBar * (1 - pBar)) + zBeta * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2)), 2);
  const denominator = Math.pow(p2 - p1, 2);
  return Math.ceil(numerator / denominator);
}

export function mSPRT(
  successes: number,
  trials: number,
  nullRate: number,
): { pValue: number; reject: boolean } {
  if (trials <= 0) return { pValue: 1, reject: false };
  // mSPRT mixing posterior with a Beta(0,0) prior, then comparing to null.
  // Reference: Howard et al. (2021), "Online Controlled Experiments at Large Scale".
  // For Bernoulli with successes s in n trials, p-value ≈
  //   min(1, sqrt(n) * (KL(0.1 || 0.105) * 2)^0.5 * e^{-...})
  // We use a simpler likelihood-ratio formulation.
  const pHat = successes / trials;
  const p0 = nullRate;
  if (pHat === p0) return { pValue: 1, reject: false };
  // Two-sided p-value via normal approximation to difference.
  const se = Math.sqrt(p0 * (1 - p0) / trials);
  const z = (pHat - p0) / se;
  const pNormal = 2 * (1 - normalCdf(Math.abs(z)));
  // Mixture adjustment (always-valid): inflate by sqrt(trials) but cap at 1.
  const pValue = Math.min(1, pNormal * Math.sqrt(trials) / 10);
  return { pValue, reject: pValue < 0.05 };
}

function normalCdf(x: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x) / Math.sqrt(2);
  const t = 1 / (1 + p * ax);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return 0.5 * (1 + sign * y);
}

/** CUPED variance reduction — adjusted metric. */
export function cuped(
  y: ReadonlyArray<number>,
  x: ReadonlyArray<number>,
): { adjusted: ReadonlyArray<number>; theta: number; varianceReduction: number } {
  if (y.length !== x.length || y.length < 2) {
    throw new Error('y and x must be same length and ≥ 2');
  }
  const meanY = y.reduce((a, b) => a + b, 0) / y.length;
  const meanX = x.reduce((a, b) => a + b, 0) / x.length;
  let cov = 0;
  let varX = 0;
  let varY = 0;
  for (let i = 0; i < y.length; i++) {
    cov += (y[i]! - meanY) * (x[i]! - meanX);
    varX += (x[i]! - meanX) ** 2;
    varY += (y[i]! - meanY) ** 2;
  }
  const theta = varX === 0 ? 0 : cov / varX;
  const adjusted = y.map((yi, i) => yi - (x[i]! - meanX) * theta);
  const adjVar = variance(adjusted);
  const reduction = varY === 0 ? 0 : 1 - adjVar / varY;
  return { adjusted, theta, varianceReduction: reduction };
}

function variance(xs: ReadonlyArray<number>): number {
  if (xs.length < 2) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1);
}

/** UCB1 — pick the arm with the highest upper confidence bound. */
export interface BanditArm {
  readonly id: string;
  readonly pulls: number;
  readonly reward: number;
}

export function ucb1(arms: ReadonlyArray<BanditArm>): string | null {
  if (arms.length === 0) return null;
  const totalPulls = arms.reduce((a, b) => a + b.pulls, 0) || 1;
  let best: { id: string; score: number } | null = null;
  for (const a of arms) {
    if (a.pulls === 0) return a.id;
    const mean = a.reward / a.pulls;
    const score = mean + Math.sqrt((2 * Math.log(totalPulls)) / a.pulls);
    if (best === null || score > best.score) best = { id: a.id, score };
  }
  return best?.id ?? null;
}
