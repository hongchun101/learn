// =============================================================================
// Chapter 01 — Mental Models & Decision Heuristics
// =============================================================================
// Goal: PM work is dominated by decisions under uncertainty. The
// "principles" people quote are usually one of a small set of recurring
// patterns. This file encodes the most-cited models as pure functions so
// the curriculum can reason about them concretely.
//
// Models covered:
//   * Jobs-to-be-Done (JTBD) — outcome-driven framing.
//   * Opportunity Solution Tree (OST) — Teresa Torres.
//   * The 4 Risks (risk of: value, usability, feasibility, viability) — Marty Cagan.
//   * CIRCLES framework — McKinsey / product-strategy staple.
//   * 80/20, MVP / walking skeleton, RICE.
//
// References:
//   * Christensen, "Competing Against Luck", 2016 (JTBD).
//   * Torres, "Continuous Discovery Habits", 2021 (OST).
//   * Cagan, "Inspired", 2017 (4 risks).
// =============================================================================

import type { ProblemStatement, UserSegment, Hypothesis, Experiment } from './models.js';

/** Result of applying the CIRCLES checklist to a candidate feature. */
export interface CirclesScore {
  readonly customer: number;
  readonly identify: number;
  readonly relativeAdvantage: number;
  readonly competition: number;
  readonly leverage: number;
  readonly engagement: number;
  readonly acceptability: number;
  readonly scope: number;
}

/** Weighted CIRCLES total, max ≈ 10. */
export function circlesTotal(c: CirclesScore): number {
  return (
    c.customer * 0.15 +
    c.identify * 0.05 +
    c.relativeAdvantage * 0.2 +
    c.competition * 0.1 +
    c.leverage * 0.1 +
    c.engagement * 0.1 +
    c.acceptability * 0.1 +
    c.scope * 0.2
  );
}

/** A single node in an Opportunity Solution Tree. */
export interface OstNode {
  readonly id: string;
  /** Outcome / opportunity / solution / assumption. */
  readonly kind: 'outcome' | 'opportunity' | 'solution' | 'assumption';
  readonly label: string;
  /** Children of this node in the tree. */
  readonly children: ReadonlyArray<OstNode>;
}

/** The 4 risks — every feature should be checked against all four. */
export interface FourRisks {
  /** Will the user actually want this if we build it? */
  readonly value: 'unknown' | 'low' | 'med' | 'high';
  /** Can the user figure out how to use it? */
  readonly usability: 'unknown' | 'low' | 'med' | 'high';
  /** Can engineering build it? */
  readonly feasibility: 'unknown' | 'low' | 'med' | 'high';
  /** Does it work for the business? */
  readonly viability: 'unknown' | 'low' | 'med' | 'high';
}

/** A feature is "ready to build" only when no risk is "unknown" or "low". */
export function isReadyToBuild(r: FourRisks): boolean {
  return (
    r.value !== 'unknown' && r.value !== 'low' &&
    r.usability !== 'unknown' && r.usability !== 'low' &&
    r.feasibility !== 'unknown' && r.feasibility !== 'low' &&
    r.viability !== 'unknown' && r.viability !== 'low'
  );
}

/** Pick the riskiest unknown for the next discovery experiment. */
export function riskiestUnknown(r: FourRisks): keyof FourRisks | null {
  const order: ReadonlyArray<keyof FourRisks> = ['value', 'usability', 'feasibility', 'viability'];
  for (const k of order) {
    if (r[k] === 'unknown') return k;
  }
  return null;
}

/** JTBD — pull a structured "job statement" out of a free-text problem. */
export interface JobStatement {
  /** Verb-led job (e.g. "manage my team's onboarding"). */
  readonly functional: string;
  /** Emotional dimension (e.g. "feel in control"). */
  readonly emotional: string;
  /** Social dimension (e.g. "be seen as a good manager"). */
  readonly social: string;
}

/** Build a job statement from a problem and a target user. */
export function buildJobStatement(p: ProblemStatement): JobStatement {
  return {
    functional: `When ${p.what.toLowerCase()}, I want to ${p.successMetric.toLowerCase()}, so I can move on.`,
    emotional: `I want to feel that ${p.what.toLowerCase()} is no longer a recurring tax.`,
    social: `I want to be seen as the person who solved ${p.what.toLowerCase()} for the team.`,
  };
}

/** Pick the smallest experiment that could de-risk a hypothesis. */
export function pickCheapestExperiment(
  h: Hypothesis,
  candidates: ReadonlyArray<Experiment>,
): Experiment | null {
  if (candidates.length === 0) return null;
  // Cost-weighted: prefer the smallest trafficFraction × minDurationDays × costWeeks.
  const eligible = candidates.filter((c) => c.hypothesisId === h.id);
  if (eligible.length === 0) return null;
  const ranked = eligible
    .map((c) => ({
      c,
      // weight: cost (weeks) is the dominant factor; duration & traffic are cheaper proxies
      w: c.costWeeks + c.trafficFraction * 0.5 + c.minDurationDays * 0.05,
    }))
    .sort((a, b) => a.w - b.w);
  return ranked[0]?.c ?? null;
}

/** Score a user segment for product-market-fit. */
export interface PmfScore {
  readonly segment: UserSegment;
  /** Composite 0..1 score; higher is better. */
  readonly score: number;
}

/** Normalize size & value to [0,1] and combine. */
export function rankSegments(
  segments: ReadonlyArray<UserSegment>,
  weights: { size: number; value: number },
): PmfScore[] {
  if (weights.size + weights.value <= 0) {
    throw new Error('weights must sum to a positive number');
  }
  const maxSize = Math.max(...segments.map((s) => s.sizeEstimate), 1);
  const maxValue = Math.max(...segments.map((s) => s.valueScore), 1);
  const wSum = weights.size + weights.value;
  return segments
    .map((segment) => {
      const sizeN = segment.sizeEstimate / maxSize;
      const valueN = segment.valueScore / maxValue;
      const score = (sizeN * weights.size + valueN * weights.value) / wSum;
      return { segment, score };
    })
    .sort((a, b) => b.score - a.score);
}
