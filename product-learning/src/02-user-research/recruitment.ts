// =============================================================================
// Chapter 02 — Recruitment, Sampling & Saturation
// =============================================================================
// Goal: produce a defensible recruitment plan, the screen questions that
// implement it, and a saturation detector for the qualitative analysis.
//
// Reference: Nielsen Norman Group, "How Many Test Users Do We Need?", 2000.
// =============================================================================

import type { Recruit, StudyDesign } from './models.js';

/** A screen question used to filter recruits. */
export interface ScreenQuestion {
  readonly id: string;
  readonly prompt: string;
  /** Whether a "yes" answer qualifies (true) or disqualifies (false). */
  readonly qualifyingAnswer: boolean;
}

/** Build a screener from a study design. */
export function buildScreener(
  design: StudyDesign,
  library: Readonly<Record<string, ScreenQuestion>>,
): ScreenQuestion[] {
  const all = new Set([...design.inclusion, ...design.exclusion]);
  return [...all]
    .map((k) => library[k])
    .filter((q): q is ScreenQuestion => Boolean(q));
}

/** Filter a pool of recruits against a screener. */
export function screen<T extends Recruit>(
  recruits: ReadonlyArray<T>,
  screener: ReadonlyArray<ScreenQuestion>,
  answers: ReadonlyMap<string, ReadonlyMap<string, boolean>>,
): T[] {
  return recruits.filter((r) => {
    for (const q of screener) {
      const participantAnswers = answers.get(r.id);
      const a = participantAnswers?.get(q.id);
      if (a === undefined) return false;
      if (a !== q.qualifyingAnswer) return false;
    }
    return true;
  });
}

/**
 * Pick a sample that balances segment diversity against total sample size.
 * If the design demands N participants and there are S segments, allocate
 * ⌈N/S⌉ slots per segment (rounding up) until N is reached.
 */
export function stratifiedSample<T extends Recruit>(
  recruits: ReadonlyArray<T>,
  n: number,
): T[] {
  if (n <= 0) return [];
  const bySegment = new Map<string, T[]>();
  for (const r of recruits) {
    const bucket = bySegment.get(r.segment) ?? [];
    bucket.push(r);
    bySegment.set(r.segment, bucket);
  }
  const segments = [...bySegment.keys()];
  if (segments.length === 0) return [];

  const perSegment = Math.ceil(n / segments.length);
  const out: T[] = [];
  for (const seg of segments) {
    const bucket = bySegment.get(seg) ?? [];
    for (let i = 0; i < perSegment && out.length < n; i++) {
      const pick = bucket[i];
      if (pick) out.push(pick);
    }
    if (out.length >= n) break;
  }
  return out;
}

/** Estimate the sample size needed for a proportion with a given CI width. */
export function sampleSizeForProportion(
  /** p̂ — prior estimate of the proportion, 0..1. */
  p: number,
  /** Margin of error (e.g. 0.05 for ±5%). */
  margin: number,
  /** Z-score for the desired confidence (1.96 for 95%, 2.58 for 99%). */
  z: number,
): number {
  if (p < 0 || p > 1 || margin <= 0 || z <= 0) {
    throw new Error('invalid inputs');
  }
  // Cochran: n = z² · p · (1-p) / e²
  return Math.ceil((z * z * p * (1 - p)) / (margin * margin));
}

/**
 * Saturation detector — when do we have "enough" interviews?
 * Counts the cumulative distinct themes per interview; returns the
 * interview index at which the running count stops growing for 2
 * consecutive interviews.
 */
export function saturationPoint<T extends { theme: string }>(
  observations: ReadonlyArray<T>,
): number {
  const seen = new Set<string>();
  let prev = 0;
  let plateau = 0;
  for (let i = 0; i < observations.length; i++) {
    seen.add(observations[i]!.theme);
    if (seen.size === prev) {
      plateau++;
      if (plateau >= 2) return i - 1;
    } else {
      plateau = 0;
    }
    prev = seen.size;
  }
  return observations.length - 1;
}
