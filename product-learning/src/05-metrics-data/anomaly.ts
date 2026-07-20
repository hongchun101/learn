// =============================================================================
// Chapter 05 — Anomaly Detection & Alerting
// =============================================================================
// Goal: the data team gets paged when a metric moves outside its expected
// range. This file implements the standard z-score detector, an EWMA
// control chart, and a SEASONAL-aware threshold.
/** Mean & sample standard deviation of a series. */
export function meanStd(xs: ReadonlyArray<number>): { mean: number; std: number } {
  if (xs.length < 2) return { mean: xs.length === 1 ? xs[0]! : 0, std: 0 };
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const std = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1));
  return { mean, std };
}

/** Z-score per point. */
export function zScores(xs: ReadonlyArray<number>): ReadonlyArray<number> {
  const { mean, std } = meanStd(xs);
  if (std === 0) return xs.map(() => 0);
  return xs.map((x) => (x - mean) / std);
}

/** Anomalies: points where |z| > threshold. */
export function detectAnomalies(
  xs: ReadonlyArray<number>,
  threshold = 2.5,
): ReadonlyArray<{ index: number; value: number; z: number }> {
  const zs = zScores(xs);
  return xs
    .map((x, i) => ({ index: i, value: x, z: zs[i]! }))
    .filter((p) => Math.abs(p.z) > threshold);
}

/** EWMA — exponentially weighted moving average. */
export function ewma(xs: ReadonlyArray<number>, alpha = 0.3): ReadonlyArray<number> {
  if (xs.length === 0) return [];
  const out: number[] = [xs[0]!];
  for (let i = 1; i < xs.length; i++) {
    out.push(alpha * xs[i]! + (1 - alpha) * out[i - 1]!);
  }
  return out;
}

/** Anomaly if last EWMA deviates from current by more than k * stdev of recent residuals. */
export function ewmaAnomaly(
  xs: ReadonlyArray<number>,
  alpha = 0.3,
  k = 3,
): { isAnomaly: boolean; residual: number; threshold: number } {
  const e = ewma(xs, alpha);
  if (e.length < 2) return { isAnomaly: false, residual: 0, threshold: 0 };
  const residuals = xs.slice(1).map((x, i) => x - e[i]!);
  const { std } = meanStd(residuals);
  const threshold = k * std;
  const lastResidual = xs[xs.length - 1]! - e[e.length - 1]!;
  return { isAnomaly: Math.abs(lastResidual) > threshold, residual: lastResidual, threshold };
}

/** Day-of-week seasonality — a quick weekly baseline. */
export function weeklyBaseline(
  series: ReadonlyArray<{ day: number; value: number }>,
): Readonly<Record<number, { mean: number; std: number }>> {
  const buckets = new Map<number, number[]>();
  for (const p of series) {
    const bucket = buckets.get(p.day) ?? [];
    bucket.push(p.value);
    buckets.set(p.day, bucket);
  }
  const out: Record<number, { mean: number; std: number }> = {};
  for (const [day, vals] of buckets) {
    out[day] = meanStd(vals);
  }
  return out;
}

/** Bandit — expected reward from a Beta posterior, used in growth-trigger logic. */
export function expectedReward(alpha: number, beta: number): number {
  if (alpha <= 0 || beta <= 0) throw new Error('alpha and beta must be > 0');
  return alpha / (alpha + beta);
}
