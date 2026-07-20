// =============================================================================
// Chapter 05 — Funnel & Cohort Analysis
// =============================================================================

import type { Funnel, Cohort, CohortDay } from './models.js';

/** Step-to-step conversion rate. */
export function funnelStepRates(funnel: Funnel): ReadonlyArray<{ name: string; rate: number; users: number }> {
  if (funnel.steps.length === 0) return [];
  return funnel.steps.map((s, i) => {
    if (i === 0) return { name: s.name, rate: 1, users: s.users };
    const prev = funnel.steps[i - 1]!;
    const rate = prev.users === 0 ? 0 : s.users / prev.users;
    return { name: s.name, rate, users: s.users };
  });
}

/** End-to-end conversion (last step / first step). */
export function funnelEndToEnd(funnel: Funnel): number {
  if (funnel.steps.length < 2) return 0;
  const first = funnel.steps[0]!;
  const last = funnel.steps[funnel.steps.length - 1]!;
  return first.users === 0 ? 0 : last.users / first.users;
}

/** Worst step — the funnel step with the largest drop relative to the previous one. */
export function funnelWorstStep(
  funnel: Funnel,
): { name: string; dropoff: number; index: number } | null {
  const rates = funnelStepRates(funnel);
  if (rates.length < 2) return null;
  let worst: { name: string; dropoff: number; index: number } | null = null;
  for (let i = 1; i < rates.length; i++) {
    const dropoff = 1 - rates[i]!.rate;
    if (worst === null || dropoff > worst.dropoff) {
      worst = { name: rates[i]!.name, dropoff, index: i };
    }
  }
  return worst;
}

/** Average retention across all observed days. */
export function averageRetention(cohort: Cohort): number {
  if (cohort.retention.length === 0) return 0;
  return cohort.retention.reduce((a, b) => a + b.retention, 0) / cohort.retention.length;
}

/** Day-N retention for a cohort. */
export function dayNRetention(cohort: Cohort, day: number): number {
  return cohort.retention.find((c) => c.day === day)?.retention ?? 0;
}

/** Build a cohort retention table from a list of (cohort, day-N) pairs. */
export function buildCohortTable(
  cohorts: ReadonlyArray<Cohort>,
): ReadonlyMap<string, ReadonlyMap<number, number>> {
  const out = new Map<string, Map<number, number>>();
  for (const c of cohorts) {
    const m = out.get(c.id) ?? new Map<number, number>();
    for (const r of c.retention) m.set(r.day, r.retention);
    out.set(c.id, m);
  }
  return out;
}

/** Quarterly cohort retention for an N-day cycle (e.g. weekly). */
export function rollingAverage(
  cohort: Cohort,
  window = 7,
): ReadonlyArray<CohortDay> {
  if (window <= 0) throw new Error('window must be > 0');
  const out: CohortDay[] = [];
  for (let i = 0; i + window <= cohort.retention.length; i++) {
    const slice = cohort.retention.slice(i, i + window);
    const avg = slice.reduce((a, b) => a + b.retention, 0) / slice.length;
    out.push({ day: cohort.retention[i]!.day, retention: avg });
  }
  return out;
}
