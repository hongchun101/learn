// =============================================================================
// Chapter 01 — Prioritization Frameworks
// =============================================================================
// Goal: A PM must rank many candidate features against each other. The
// industry has converged on a handful of scoring frameworks. This file
// implements them as pure functions, so a learner can apply them
// deterministically to the same input and see how the rank changes.
//
// References:
//   * Intercom, "RICE scoring", https://www.intercom.com/blog/rice-simple-prioritization-for-product-managers/
//   * Sean McBride, "ICE scoring", https://www.growthhackers.com/growth-tools/ice-impact-confidence-ease-prioritization-framework
//   * Donald Reinertsen, "Weighted Shortest Job First", 2009.
// =============================================================================

import type { Feature } from './models.js';

/** RICE = (Reach × Impact × Confidence) / Effort. */
export interface RiceInputs {
  /** Users reached per period (e.g. per quarter). */
  readonly reach: number;
  /** Impact on a 0.25/0.5/1/2/3 scale (0.25 = minimal, 3 = massive). */
  readonly impact: number;
  /** Confidence as a percentage, 0..100. */
  readonly confidence: number;
  /** Effort in person-weeks. */
  readonly effort: number;
}

/** ICE = (Impact + Confidence + Ease) / 3, each on 1..10. */
export interface IceInputs {
  readonly impact: number;
  readonly confidence: number;
  /** Ease — higher is easier, on the same 1..10 scale. */
  readonly ease: number;
}

/** WSJF inputs — a SAFe-flavoured economic prioritization. */
export interface WsjfInputs {
  /** Business value of the feature. */
  readonly businessValue: number;
  /** Time criticality — does the value decay? 0..1 normalized. */
  readonly timeCriticality: number;
  /** Risk reduction — does this reduce the risk of future work? 0..1. */
  readonly riskReduction: number;
  /** Job size — larger means more cost. */
  readonly jobSize: number;
}

/** Compute the RICE score from raw inputs. */
export function riceScore(i: RiceInputs): number {
  if (i.effort <= 0) {
    throw new Error('rice: effort must be > 0');
  }
  return (i.reach * i.impact * (i.confidence / 100)) / i.effort;
}

/** Compute the ICE score. */
export function iceScore(i: IceInputs): number {
  return (i.impact + i.confidence + i.ease) / 3;
}

/** Cost-of-delay-divided-by-size — the SAFe/WSJF form. */
export function wsjfScore(i: WsjfInputs): number {
  if (i.jobSize <= 0) {
    throw new Error('wsjf: jobSize must be > 0');
  }
  const cod = i.businessValue + i.timeCriticality + i.riskReduction;
  return cod / i.jobSize;
}

/**
 * Convert a raw RICE score into a discrete 1..5 priority bucket for board
 * decks, where 5 = must-do, 1 = drop.
 */
export function riceToBucket(score: number): 1 | 2 | 3 | 4 | 5 {
  if (score >= 100) return 5;
  if (score >= 30) return 4;
  if (score >= 10) return 3;
  if (score >= 3) return 2;
  return 1;
}

/** Sort features by RICE score descending. Stable: ties preserve input order. */
export function rankByRice<T extends Feature>(items: ReadonlyArray<T>, scores: ReadonlyMap<string, number>): T[] {
  return items
    .map((f, idx) => ({ f, idx, s: scores.get(f.id) ?? 0 }))
    .sort((a, b) => b.s - a.s || a.idx - b.idx)
    .map((x) => x.f);
}

