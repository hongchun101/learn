// =============================================================================
// Chapter 07 — Risk Register & Launch Checklist
// =============================================================================
// Goal: a launch without a risk register is a launch you can't triage.
// This file implements risk = probability × impact, a launch readiness
// check, and a release-tier model (canary / blue-green / big-bang).
// =============================================================================

export interface Risk {
  readonly id: string;
  readonly description: string;
  /** Probability, 0..1. */
  readonly probability: number;
  /** Impact, 1..5. */
  readonly impact: 1 | 2 | 3 | 4 | 5;
  /** Owner. */
  readonly owner: string;
}

export interface ScoredRisk extends Risk {
  readonly score: number;
}

export function scoreRisk(r: Risk): ScoredRisk {
  return { ...r, score: r.probability * r.impact };
}

export function riskRanking(risks: ReadonlyArray<Risk>): ReadonlyArray<ScoredRisk> {
  return [...risks].map(scoreRisk).sort((a, b) => b.score - a.score);
}

/** A launch-readiness check item. */
export interface LaunchCheck {
  readonly id: string;
  readonly name: string;
  readonly done: boolean;
  readonly owner: string;
}

export function launchReadiness(checks: ReadonlyArray<LaunchCheck>): { ready: boolean; doneCount: number; totalCount: number } {
  const totalCount = checks.length;
  const doneCount = checks.filter((c) => c.done).length;
  return { ready: totalCount > 0 && doneCount === totalCount, doneCount, totalCount };
}

/** Release tier — risk vs. reversibility. */
export type ReleaseTier = 'feature-flag' | 'canary' | 'blue-green' | 'big-bang';

/** Recommend a release tier based on impact + reversibility. */
export function recommendReleaseTier(
  /** Whether we can flip the feature off quickly. */
  reversible: boolean,
  /** Customer-visible scope. */
  scope: 'single-tenant' | 'multi-tenant' | 'global',
): ReleaseTier {
  if (scope === 'global' && !reversible) return 'big-bang'; // forced
  if (!reversible) return 'canary';
  if (scope === 'multi-tenant') return 'blue-green';
  return 'feature-flag';
}

/** A simple on-call schedule and acknowledgement tracker. */
export interface OncallSlot {
  readonly week: string;
  readonly primary: string;
  readonly secondary: string;
}

export function oncallCoverage(slots: ReadonlyArray<OncallSlot>, weeks: number): { covered: number; total: number } {
  return { covered: slots.length, total: weeks };
}
