// =============================================================================
// Chapter 05 — Metric Trees, HEART, AARRR framework
// =============================================================================
// Goal: every metric should be a node in a tree, with one North Star at
// the root. A "balanced" tree has at least one metric of each HEART
// category; a "broken" tree has only lagging or only leading.
// =============================================================================

import type { MetricNode } from './models.js';

/** Walk a metric tree depth-first. */
export function* walkMetrics(root: MetricNode): Generator<MetricNode> {
  yield root;
  for (const c of root.drivers) yield* walkMetrics(c);
}

/** All nodes matching a category. */
export function metricsByCategory(
  root: MetricNode,
  category: MetricNode['category'],
): ReadonlyArray<MetricNode> {
  return [...walkMetrics(root)].filter((m) => m.category === category);
}

/** Count nodes per category. */
export function categoryCounts(
  root: MetricNode,
): Readonly<Record<MetricNode['category'], number>> {
  const counts: Record<MetricNode['category'], number> = {
    'north-star': 0,
    lagging: 0,
    leading: 0,
    guardrail: 0,
  };
  for (const m of walkMetrics(root)) counts[m.category]++;
  return counts;
}

/** A "balanced" metric tree has at least one of each category. */
export function isBalanced(root: MetricNode): boolean {
  const c = categoryCounts(root);
  return c['north-star'] >= 1 && c.lagging >= 1 && c.leading >= 1 && c.guardrail >= 1;
}

/** HEART categories: Happiness, Engagement, Adoption, Retention, Task success. */
export type HeartCategory = 'happiness' | 'engagement' | 'adoption' | 'retention' | 'task-success';

export const HEART_DESCRIPTIONS: Readonly<Record<HeartCategory, string>> = {
  happiness: 'Subjective satisfaction, e.g. NPS, CSAT',
  engagement: 'Depth of use, e.g. sessions/user/week',
  adoption: 'New-user activation, e.g. % who complete onboarding',
  retention: 'Return rate over time, e.g. D30 retention',
  'task-success': 'Efficiency & effectiveness, e.g. time-on-task, error rate',
};

export interface HeartScore {
  readonly category: HeartCategory;
  /** 0..1 normalized score. */
  readonly score: number;
  /** Optional target. */
  readonly target: number;
}

export function heartIndex(scores: ReadonlyArray<HeartScore>): number {
  if (scores.length === 0) return 0;
  const total = scores.reduce((a, b) => a + Math.min(b.score, b.target) / b.target, 0);
  return total / scores.length;
}

/** Goal-Question-Metric — the Andersen & Cisco framework. */
export interface Gqm {
  readonly goal: string;
  readonly question: string;
  readonly metric: string;
  /** Whether we can answer the question from the metric alone. */
  readonly answerable: boolean;
}

export function gqmCoverage(items: ReadonlyArray<Gqm>): { answered: number; total: number; coverage: number } {
  const total = items.length;
  const answered = items.filter((g) => g.answerable).length;
  return { answered, total, coverage: total === 0 ? 0 : answered / total };
}
