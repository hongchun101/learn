// =============================================================================
// Chapter 02 — Survey Design & Analysis
// =============================================================================
// Goal: a survey instrument must be valid, reliable, and free of leading
// questions. This file implements a few standard checks: a Likert scale
// with reverse-coded items, the System Usability Scale (SUS), Net
// Promoter Score (NPS), and basic reliability statistics (Cronbach's α).
// =============================================================================

import type { SurveyResponse } from './models.js';

/** A Likert item. `reverse` flips the scoring. */
export interface LikertItem {
  readonly id: string;
  readonly prompt: string;
  readonly reverse: boolean;
}

/** Score a single Likert response — value in 1..5, optionally reversed. */
export function scoreLikert(value: number, reverse: boolean): number {
  if (value < 1 || value > 5 || !Number.isInteger(value)) {
    throw new Error('Likert value must be an integer in [1,5]');
  }
  return reverse ? 6 - value : value;
}

/** System Usability Scale (Brooke, 1996) — 10 items, 1..5 Likert. */
export function susScore(items: ReadonlyArray<number>): number {
  if (items.length !== 10) {
    throw new Error('SUS requires exactly 10 items');
  }
  // Odd items: contribution = value - 1; even items: 5 - value.
  let total = 0;
  for (let i = 0; i < 10; i++) {
    const v = items[i]!;
    if (v < 1 || v > 5) throw new Error('SUS items must be in [1,5]');
    total += i % 2 === 0 ? v - 1 : 5 - v;
  }
  return total * 2.5;
}

/** Net Promoter Score — answers 0..10, computed as %promoters − %detractors. */
export interface NpsResult {
  readonly promoters: number;
  readonly passives: number;
  readonly detractors: number;
  readonly score: number;
}

export function nps(answers: ReadonlyArray<number>): NpsResult {
  if (answers.length === 0) {
    return { promoters: 0, passives: 0, detractors: 0, score: 0 };
  }
  let promoters = 0;
  let passives = 0;
  let detractors = 0;
  for (const a of answers) {
    if (a >= 9) promoters++;
    else if (a >= 7) passives++;
    else detractors++;
  }
  const n = answers.length;
  return {
    promoters,
    passives,
    detractors,
    score: ((promoters - detractors) / n) * 100,
  };
}

/** Cronbach's α — a measure of internal consistency, target ≥ 0.7. */
export function cronbachsAlpha(items: ReadonlyArray<ReadonlyArray<number>>): number {
  if (items.length < 2) throw new Error('need at least 2 participants');
  const k = items[0]?.length ?? 0;
  if (k < 2) throw new Error('need at least 2 items');
  for (const row of items) {
    if (row.length !== k) throw new Error('all participants must answer the same number of items');
  }
  // Item variances
  const itemVars: number[] = [];
  for (let j = 0; j < k; j++) {
    const col = items.map((r) => r[j]!);
    const mean = col.reduce((a, b) => a + b, 0) / col.length;
    itemVars.push(col.reduce((a, b) => a + (b - mean) ** 2, 0) / col.length);
  }
  // Total-score variance
  const totals = items.map((r) => r.reduce((a, b) => a + b, 0));
  const tMean = totals.reduce((a, b) => a + b, 0) / totals.length;
  const tVar = totals.reduce((a, b) => a + (b - tMean) ** 2, 0) / totals.length;
  if (tVar === 0) return 0;
  return (k / (k - 1)) * (1 - itemVars.reduce((a, b) => a + b, 0) / tVar);
}

/** Drop-off analysis: which question has the worst completion rate. */
export function worstDropOff(
  responses: ReadonlyArray<SurveyResponse>,
  questionOrder: ReadonlyArray<string>,
): string | null {
  if (responses.length === 0 || questionOrder.length === 0) return null;
  const seen = new Map<string, number>();
  for (const r of responses) {
    for (const q of questionOrder) {
      if (q in r.answers) seen.set(q, (seen.get(q) ?? 0) + 1);
    }
  }
  let worst: string | null = null;
  let worstRate = 1.0;
  for (const q of questionOrder) {
    const rate = (seen.get(q) ?? 0) / responses.length;
    if (rate < worstRate) {
      worstRate = rate;
      worst = q;
    }
  }
  return worst;
}
