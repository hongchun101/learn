// =============================================================================
// Chapter 01 — Product Manager Fundamentals
// =============================================================================
// Goal: every product decision can be modeled as one of a small set of
// primitives — a problem statement, a value proposition, a target user, a
// hypothesis, a success metric, an experiment, and a feature.
//
// This file defines the data model used across the rest of the curriculum.
// The values are deliberately serializable (plain JSON) so a learner can
// paste them into a doc, a Linear ticket, or a PRD.
// =============================================================================

/** A named product role (used to scope decisions to a function). */
export type ProductRole =
  | 'pm'
  | 'designer'
  | 'engineer'
  | 'data'
  | 'growth'
  | 'marketing'
  | 'sales'
  | 'cs';

/** Lifecycle stage of a product or a single feature. */
export type LifecycleStage =
  | 'idea'
  | 'discovery'
  | 'build'
  | 'launch'
  | 'growth'
  | 'maturity'
  | 'decline'
  | 'sunset';

/** A problem statement in the standard "JTBD / outcome-driven" form. */
export interface ProblemStatement {
  /** The user or segment that has the problem. */
  readonly who: string;
  /** The pain or job-to-be-done they are trying to accomplish. */
  readonly what: string;
  /** Why current alternatives fail or why the pain is worth solving. */
  readonly whyNow: string;
  /** The smallest measurable outcome that proves the problem is solved. */
  readonly successMetric: string;
}

/** A value proposition, expressed as the classic "for [user], our [product] …". */
export interface ValueProposition {
  /** Who is it for — narrow, specific segment. */
  readonly targetUser: string;
  /** What job does it do / what value does it create. */
  readonly job: string;
  /** Why is it better than the alternatives. */
  readonly differentiator: string;
}

/** A user segment. */
export interface UserSegment {
  readonly id: string;
  readonly name: string;
  readonly characteristics: ReadonlyArray<string>;
  /** Estimated size in active users. */
  readonly sizeEstimate: number;
  /** Relative value (e.g. LTV, willingness-to-pay). */
  readonly valueScore: number;
}

/** A falsifiable hypothesis tied to a metric. */
export interface Hypothesis {
  readonly id: string;
  /** "We believe that [user] experiences [problem] when [context]." */
  readonly belief: string;
  /** "If we [intervention], we will see [metric move] by [amount]." */
  readonly prediction: string;
  /** Minimum sample size before the test can conclude. */
  readonly minimumSampleSize: number;
}

/** A success metric — North Star or sub-metric. */
export interface Metric {
  readonly id: string;
  readonly name: string;
  /** e.g. "ratio", "count", "duration", "currency". */
  readonly unit: 'count' | 'ratio' | 'duration' | 'currency';
  /** Whether the metric is the North Star (true) or a sub-metric. */
  readonly isNorthStar: boolean;
  /** Direction we want this metric to move. */
  readonly desiredDirection: 'up' | 'down';
  /** Optional baseline value at the start of the period. */
  readonly baseline?: number;
  /** Optional target value. */
  readonly target?: number;
}

/** A small unit of work a PM owns. */
export interface Feature {
  readonly id: string;
  readonly title: string;
  /** Free-text problem statement. */
  readonly problem: string;
  /** Hypothesis this feature is testing. */
  readonly hypothesisId: string;
  /** Primary metric. */
  readonly primaryMetricId: string;
  /** Lifecycle stage. */
  readonly stage: LifecycleStage;
  /** RICE / ICE / WSJF score. */
  readonly priorityScore: number;
  /** Optional team owner. */
  readonly owner?: ProductRole;
}

/** A staged experiment used to validate a hypothesis cheaply. */
export interface Experiment {
  readonly id: string;
  readonly hypothesisId: string;
  /** Type of experiment. */
  readonly kind: 'interview' | 'concierge' | 'fake-door' | 'ab-test' | 'pilot' | 'launch';
  /** Fraction of traffic to expose (0..1); 0 = none / qualitative. */
  readonly trafficFraction: number;
  /** Statistical confidence required to call it (e.g. 0.95). */
  readonly confidence: number;
  /** Estimated minimum runtime in days. */
  readonly minDurationDays: number;
  /** Cost in engineering-weeks, used for ICE / WSJF. */
  readonly costWeeks: number;
}

/** Decision log entry — the discipline of writing decisions down. */
export interface DecisionLogEntry {
  readonly id: string;
  /** The decision taken. */
  readonly decision: string;
  /** What we considered and rejected. */
  readonly alternatives: ReadonlyArray<string>;
  /** Why we picked this one. */
  readonly rationale: string;
  /** What we expect to happen (the metric move we are betting on). */
  readonly expectedImpact: string;
  /** What we will look at to know we were wrong. */
  readonly invalidationSignal: string;
  /** When the decision was made. */
  readonly decidedAt: string;
}
