// =============================================================================
// Chapter 05 — Data-Driven Decisions & Metric Systems
// =============================================================================
// Goal: a metric system is a tree. The North Star is the root; sub-metrics
// are children. A good system is balanced — neither all "lagging" outputs
// nor all "leading" inputs. This file encodes metric trees, HEART
// (Google's framework for UX metrics), AARRR (Acquisition, Activation,
// Retention, Referral, Revenue), the LTV/CAC math, cohort retention, and
// funnel drop-off analysis.
//
// References:
//   * Google, "HEART framework", 2010.
//   * Dave McClure, "Startup Metrics for Pirates", 2007 (AARRR).
//   * Amplitude / Mixpanel cohort retention recipes.
// =============================================================================

export type MetricDirection = 'up' | 'down';
export type MetricCategory = 'north-star' | 'lagging' | 'leading' | 'guardrail';

export interface MetricNode {
  readonly id: string;
  readonly name: string;
  readonly unit: 'count' | 'ratio' | 'duration' | 'currency' | 'percent';
  readonly direction: MetricDirection;
  readonly category: MetricCategory;
  /** Sub-metrics that drive this one. */
  readonly drivers: ReadonlyArray<MetricNode>;
}

export interface CohortDay {
  /** Day index from acquisition. */
  readonly day: number;
  /** Fraction of the cohort that is still active, 0..1. */
  readonly retention: number;
}

export interface Cohort {
  readonly id: string;
  readonly startDate: string;
  readonly size: number;
  readonly retention: ReadonlyArray<CohortDay>;
}

export interface FunnelStep {
  readonly name: string;
  readonly users: number;
}

export interface Funnel {
  readonly steps: ReadonlyArray<FunnelStep>;
}
