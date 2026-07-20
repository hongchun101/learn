// =============================================================================
// Chapter 01 — Demo
// =============================================================================
// Self-contained tour of the chapter's primitives. Pure functions only — no
// network, no filesystem. Invoked by `npm run demo`.
// =============================================================================

import {
  riceScore,
  iceScore,
  wsjfScore,
  riceToBucket,
  circlesTotal,
  isReadyToBuild,
  riskiestUnknown,
  buildJobStatement,
  rankSegments,
  bottomUpSizing,
  arrOpportunity,
  paretoTop,
  disciplineScore,
  classifyReversibility,
  type Feature,
  type FourRisks,
  type ProblemStatement,
  type UserSegment,
  type DecisionLogEntry,
} from './index.js';

export function demo(): void {
  // -------------------------------------------------------------------------
  // 1. Problem statement → job statement
  // -------------------------------------------------------------------------
  const problem: ProblemStatement = {
    who: 'engineering manager at a 50-person startup',
    what: 'wastes 4 hours per week chasing status updates across Slack, Linear and email',
    whyNow: 'manual coordination breaks as the team crosses ~40 people',
    successMetric: 'reduce weekly status-update time to under 30 minutes',
  };
  console.log('[01] job statement =', buildJobStatement(problem).functional);

  // -------------------------------------------------------------------------
  // 2. RICE / ICE / WSJF on three candidate features
  // -------------------------------------------------------------------------
  const features: Feature[] = [
    {
      id: 'F1',
      title: 'Status digest email',
      problem: 'waste time chasing status',
      hypothesisId: 'H1',
      primaryMetricId: 'M1',
      stage: 'build',
      priorityScore: 0,
    },
    {
      id: 'F2',
      title: 'Slack bot to ask "what blocked you today?"',
      problem: 'waste time chasing status',
      hypothesisId: 'H1',
      primaryMetricId: 'M1',
      stage: 'build',
      priorityScore: 0,
    },
    {
      id: 'F3',
      title: 'Auto-generated weekly standup doc',
      problem: 'waste time chasing status',
      hypothesisId: 'H1',
      primaryMetricId: 'M1',
      stage: 'discovery',
      priorityScore: 0,
    },
  ];

  const rice: Record<string, number> = {
    F1: riceScore({ reach: 200, impact: 2, confidence: 80, effort: 2 }),
    F2: riceScore({ reach: 200, impact: 1, confidence: 60, effort: 1 }),
    F3: riceScore({ reach: 200, impact: 3, confidence: 50, effort: 4 }),
  };
  console.log('[01] RICE buckets  =', features.map((f) => `${f.id}:${riceToBucket(rice[f.id] ?? 0)}`).join(' '));
  console.log('[01] RICE F2       =', rice['F2']);

  const ice: Record<string, number> = {
    F1: iceScore({ impact: 7, confidence: 8, ease: 6 }),
    F2: iceScore({ impact: 5, confidence: 6, ease: 9 }),
    F3: iceScore({ impact: 9, confidence: 5, ease: 3 }),
  };
  console.log('[01] ICE F1/F2/F3  =', ice['F1'], ice['F2'], ice['F3']);

  const wsjf: Record<string, number> = {
    F1: wsjfScore({ businessValue: 5, timeCriticality: 0.4, riskReduction: 0.2, jobSize: 2 }),
    F2: wsjfScore({ businessValue: 3, timeCriticality: 0.2, riskReduction: 0.1, jobSize: 1 }),
    F3: wsjfScore({ businessValue: 8, timeCriticality: 0.6, riskReduction: 0.3, jobSize: 4 }),
  };
  console.log('[01] WSJF F1/F2/F3 =', wsjf['F1'], wsjf['F2'], wsjf['F3']);

  // -------------------------------------------------------------------------
  // 3. 4 risks — feature is "ready to build" only when no risk is unknown/low
  // -------------------------------------------------------------------------
  const risks: FourRisks = { value: 'med', usability: 'unknown', feasibility: 'high', viability: 'med' };
  console.log('[01] readyToBuild  =', isReadyToBuild(risks));
  console.log('[01] next discovery=', riskiestUnknown(risks));

  // -------------------------------------------------------------------------
  // 4. CIRCLES on a single feature
  // -------------------------------------------------------------------------
  const total = circlesTotal({
    customer: 8,
    identify: 7,
    relativeAdvantage: 9,
    competition: 6,
    leverage: 8,
    engagement: 7,
    acceptability: 6,
    scope: 9,
  });
  console.log('[01] CIRCLES total =', total.toFixed(2));

  // -------------------------------------------------------------------------
  // 5. Segment ranking & bottom-up sizing
  // -------------------------------------------------------------------------
  const segments: UserSegment[] = [
    { id: 'S1', name: 'startups', characteristics: ['<100 eng', 'scaling'], sizeEstimate: 5000, valueScore: 50 },
    { id: 'S2', name: 'mid-market', characteristics: ['100-1000 eng'], sizeEstimate: 2000, valueScore: 200 },
    { id: 'S3', name: 'enterprise', characteristics: ['>1000 eng'], sizeEstimate: 500, valueScore: 800 },
  ];
  console.log('[01] segments rank =', rankSegments(segments, { size: 0.5, value: 0.5 }).map((r) => r.segment.id).join(','));
  console.log('[01] bottom-up    =', bottomUpSizing(segments, 0.1));

  // ARR opportunity: SOM=2000, ARPU=$200/mo, capture=0.05 → $24k/yr per customer.
  console.log('[01] ARR (som=2000,arpu=200,cap=0.05) =', arrOpportunity({ tam: 100_000, sam: 10_000, som: 2_000 }, 200, 0.05));

  // -------------------------------------------------------------------------
  // 6. Pareto — top 20% of customers by value
  // -------------------------------------------------------------------------
  const customers = [
    { name: 'A', value: 100 },
    { name: 'B', value: 60 },
    { name: 'C', value: 25 },
    { name: 'D', value: 10 },
    { name: 'E', value: 5 },
  ];
  console.log('[01] pareto 20%   =', paretoTop(customers, (c) => c.value, 0.2).map((c) => c.name).join(','));

  // -------------------------------------------------------------------------
  // 7. Decision log — reversibility & invalidation discipline
  // -------------------------------------------------------------------------
  const log: DecisionLogEntry[] = [
    {
      id: 'D1',
      decision: 'ship Slack bot behind a 10% feature flag',
      alternatives: ['ship to all', 'do another interview round'],
      rationale: 'cheapest reversible test of the value hypothesis',
      expectedImpact: '+5% activation on the engaged cohort',
      invalidationSignal: 'engagement < control after 7 days at 10%',
      decidedAt: '2026-01-10',
    },
    {
      id: 'D2',
      decision: 'migrate billing to Stripe',
      alternatives: ['keep Paddle', 'self-host'],
      rationale: 'Stripe Tax removes a class of compliance work',
      expectedImpact: '~$200k/yr saved in finance overhead',
      invalidationSignal: 'Stripe Tax rollout slips beyond Q3',
      decidedAt: '2026-02-01',
    },
  ];
  console.log('[01] discipline   =', disciplineScore(log).toFixed(2));
  console.log('[01] D1 reversible=', classifyReversibility(log[0]!));
  console.log('[01] D2 reversible=', classifyReversibility(log[1]!));
}
