// =============================================================================
// Chapter 02 — Quantitative User Research
// =============================================================================
// Goal: take survey results and produce the numbers a PM cares about —
// completion time statistics, A/B test conversion lift, confidence
// intervals, and statistical significance using a normal approximation
// for two-proportion z-test.
//
// All functions here are deterministic, no randomness; pass the data in.
// =============================================================================

/** Mean, std dev, and count of a numeric series. */
export interface DescriptiveStats {
  readonly mean: number;
  readonly stddev: number;
  readonly n: number;
  /** 95% CI lower bound. */
  readonly ci95Low: number;
  /** 95% CI upper bound. */
  readonly ci95High: number;
}

export function describe(xs: ReadonlyArray<number>): DescriptiveStats {
  const n = xs.length;
  if (n === 0) {
    return { mean: 0, stddev: 0, n: 0, ci95Low: 0, ci95High: 0 };
  }
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const variance = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, n - 1);
  const stddev = Math.sqrt(variance);
  // 95% CI ≈ mean ± 1.96 · SE
  const se = stddev / Math.sqrt(n);
  return {
    mean,
    stddev,
    n,
    ci95Low: mean - 1.96 * se,
    ci95High: mean + 1.96 * se,
  };
}

/** A 2-proportion z-test for A/B. */
export interface ABTest {
  readonly conversionsA: number;
  readonly nA: number;
  readonly conversionsB: number;
  readonly nB: number;
}

export interface ABResult {
  readonly rateA: number;
  readonly rateB: number;
  readonly lift: number;
  /** Two-sided p-value (normal approximation, no continuity correction). */
  readonly pValue: number;
  readonly significant95: boolean;
}

/** Standard normal CDF — Abramowitz & Stegun 7.1.26 approximation. */
export function normalCdf(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x) / Math.sqrt(2);
  const t = 1 / (1 + p * ax);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return 0.5 * (1 + sign * y);
}

export function twoProportionZ(t: ABTest): ABResult {
  const pA = t.conversionsA / t.nA;
  const pB = t.conversionsB / t.nB;
  const pPool = (t.conversionsA + t.conversionsB) / (t.nA + t.nB);
  const se = Math.sqrt(pPool * (1 - pPool) * (1 / t.nA + 1 / t.nB));
  const z = se === 0 ? 0 : (pB - pA) / se;
  // Two-sided p-value
  const pValue = 2 * (1 - normalCdf(Math.abs(z)));
  const lift = pA === 0 ? 0 : (pB - pA) / pA;
  return {
    rateA: pA,
    rateB: pB,
    lift,
    pValue,
    significant95: pValue < 0.05,
  };
}

/** Bayesian Beta posterior — uniform prior + observed conversions. */
export function betaPosterior(
  conversions: number,
  trials: number,
  alpha = 1,
  beta = 1,
): { alpha: number; beta: number; mean: number; ciLow: number; ciHigh: number } {
  if (trials < conversions || conversions < 0) {
    throw new Error('invalid trial count');
  }
  const postAlpha = alpha + conversions;
  const postBeta = beta + (trials - conversions);
  const mean = postAlpha / (postAlpha + postBeta);
  // 95% credible interval approximation via normal of Beta(α,β) on logit scale
  const variance = (postAlpha * postBeta) / ((postAlpha + postBeta) ** 2 * (postAlpha + postBeta + 1));
  const se = Math.sqrt(variance);
  return {
    alpha: postAlpha,
    beta: postBeta,
    mean,
    ciLow: Math.max(0, mean - 1.96 * se),
    ciHigh: Math.min(1, mean + 1.96 * se),
  };
}

/** Probability that B beats A under the posterior. */
export function probabilityBBeatsA(a: ABTest, alphaA = 1, betaA = 1, alphaB = 1, betaB = 1): number {
  const postA = betaPosterior(a.conversionsA, a.nA, alphaA, betaA);
  const postB = betaPosterior(a.conversionsB, a.nB, alphaB, betaB);
  // Analytical form: P(B > A) = sum_i Beta(postA.alpha, postA.beta+postB.alpha+i) / ...
  // For small integers this is tractable; here we use a 1024-point Monte-Carlo
  // approximation, deterministic via a fixed seed.
  const n = 1024;
  let count = 0;
  const seed = a.conversionsA * 1009 + a.conversionsB * 1013 + a.nA + a.nB;
  for (let i = 0; i < n; i++) {
    const xA = sampleBeta(postA.alpha, postA.beta, seed + i);
    const xB = sampleBeta(postB.alpha, postB.beta, seed + i + 7);
    if (xB > xA) count++;
  }
  return count / n;
}

/** Deterministic Beta sampler (Marsaglia-Tsang Gamma chain, fixed seed). */
function sampleBeta(alpha: number, beta: number, seed: number): number {
  const gA = sampleGamma(alpha, seed);
  const gB = sampleGamma(beta, seed + 1009);
  return gA / (gA + gB);
}

function sampleGamma(shape: number, seed: number): number {
  // Marsaglia-Tsang for shape ≥ 1.
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  let state = seed | 0;
  function next(): number {
    // xorshift32 — fast deterministic PRNG.
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) / 0xffffffff);
  }
  for (let attempt = 0; attempt < 32; attempt++) {
    let x: number;
    do {
      x = normalSample(next);
    } while (x <= -1 / c);
    const v = (1 + c * x) ** 3;
    const u = next();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
  return d; // fallback
}

function normalSample(next: () => number): number {
  // Box-Muller
  const u1 = Math.max(Number.EPSILON, next());
  const u2 = next();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
