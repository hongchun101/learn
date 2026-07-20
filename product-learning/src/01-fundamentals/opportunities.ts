// =============================================================================
// Chapter 01 — Opportunity Sizing & Decision Discipline
// =============================================================================
// Goal: a PM's superpower is making reversible decisions quickly and
// irreversible ones slowly. This file turns that into code:
//   * TAM / SAM / SOM top-down sizing with a sanity check.
//   * A small decision log type and a helper to summarize it.
//   * "Move fast when the cost of being wrong is small."
// =============================================================================

import type { DecisionLogEntry, UserSegment } from './models.js';

/** Top-down market sizing. */
export interface MarketSizing {
  /** Total addressable market — everyone who could ever buy. */
  readonly tam: number;
  /** Serviceable addressable market — the slice you can actually reach. */
  readonly sam: number;
  /** Serviceable obtainable market — the slice you can win in N years. */
  readonly som: number;
}

/** Sanity check: SAM ≤ TAM, SOM ≤ SAM. */
export function isConsistentSizing(s: MarketSizing): boolean {
  return s.sam <= s.tam && s.som <= s.sam && s.som >= 0;
}

/** Bottom-up sizing: sum(valueScore × sizeEstimate) for selected segments. */
export function bottomUpSizing(
  segments: ReadonlyArray<UserSegment>,
  multiplier: number,
): number {
  if (multiplier < 0) {
    throw new Error('multiplier must be non-negative');
  }
  return segments.reduce((acc, s) => acc + s.sizeEstimate * s.valueScore, 0) * multiplier;
}

/** Convert a market size into ARR for a given ARPU and capture rate. */
export function arrOpportunity(
  s: MarketSizing,
  arpu: number,
  captureRate: number,
): number {
  if (arpu < 0 || captureRate < 0 || captureRate > 1) {
    throw new Error('arpu must be ≥ 0 and captureRate in [0,1]');
  }
  return s.som * arpu * captureRate;
}

/** 80/20 — pick the top N% by Pareto contribution. */
export function paretoTop<T>(
  items: ReadonlyArray<T>,
  by: (t: T) => number,
  fraction: number,
): T[] {
  if (fraction < 0 || fraction > 1) {
    throw new Error('fraction must be in [0,1]');
  }
  const sorted = [...items].sort((a, b) => by(b) - by(a));
  const total = sorted.reduce((acc, t) => acc + by(t), 0);
  if (total === 0) return [];
  const target = total * fraction;
  const out: T[] = [];
  let acc = 0;
  for (const t of sorted) {
    out.push(t);
    acc += by(t);
    if (acc >= target) break;
  }
  return out;
}

/** Decision-log summary — what % of decisions we set up to invalidate. */
export function disciplineScore(entries: ReadonlyArray<DecisionLogEntry>): number {
  if (entries.length === 0) return 0;
  const withInvalidation = entries.filter((e) => e.invalidationSignal.trim().length > 0).length;
  return withInvalidation / entries.length;
}

/** "Reversible?" — a quick classification of a decision's blast radius. */
export type DecisionReversibility = 'reversible' | 'costly' | 'irreversible';

export function classifyReversibility(
  entry: DecisionLogEntry,
  irreversibleKeywords: ReadonlyArray<string> = ['migration', 'delete', 'kill', 'rebrand', 'pivot', 'shutdown'],
): DecisionReversibility {
  const text = entry.decision.toLowerCase();
  if (irreversibleKeywords.some((k) => text.includes(k))) {
    return 'irreversible';
  }
  if (entry.expectedImpact.length > 200) {
    return 'costly';
  }
  return 'reversible';
}
