// =============================================================================
// Chapter 05 — Demo
// =============================================================================

import {
  funnelStepRates,
  funnelEndToEnd,
  funnelWorstStep,
  averageRetention,
  ltvCac,
  aarrr,
  ruleOf40,
  burnMultiple,
  isBalanced,
  heartIndex,
  gqmCoverage,
  detectAnomalies,
  ewmaAnomaly,
  expectedReward,
  type Funnel,
  type Cohort,
  type MetricNode,
  type HeartScore,
  type Gqm,
} from './index.js';

export function demo(): void {
  // 1. Funnel
  const funnel: Funnel = {
    steps: [
      { name: 'visit', users: 10000 },
      { name: 'signup', users: 3000 },
      { name: 'activate', users: 900 },
      { name: 'paid', users: 200 },
    ],
  };
  console.log('[05] funnel e2e    =', (funnelEndToEnd(funnel) * 100).toFixed(2) + '%');
  console.log('[05] funnel worst  =', funnelWorstStep(funnel)?.name);
  console.log('[05] funnel rates  =', funnelStepRates(funnel).map((r) => `${r.name}:${(r.rate * 100).toFixed(1)}%`).join(' '));

  // 2. Cohort
  const cohort: Cohort = {
    id: '2026-W01',
    startDate: '2026-01-06',
    size: 1000,
    retention: [
      { day: 0, retention: 1.0 },
      { day: 1, retention: 0.6 },
      { day: 7, retention: 0.3 },
      { day: 30, retention: 0.15 },
    ],
  };
  console.log('[05] avg retention =', (averageRetention(cohort) * 100).toFixed(1) + '%');
  console.log('[05] D7 retention  =', (cohort.retention[2]!.retention * 100).toFixed(0) + '%');

  // 3. LTV/CAC
  const ltv = ltvCac({ arpu: 50, grossMargin: 0.8, monthlyChurn: 0.05, cac: 200 });
  console.log('[05] LTV/CAC       =', ltv.ltv.toFixed(0), '/', ltv.ratio.toFixed(2), 'payback=' + ltv.paybackMonths.toFixed(1) + 'mo');

  // 4. AARRR
  const a = aarrr({ acquisition: 1.0, activation: 0.3, retention: 0.4, referral: 0.1, revenue: 0.07 });
  console.log('[05] AARRR e2e     =', (a * 100).toFixed(3) + '%');

  // 5. Rule of 40
  console.log('[05] rule-of-40 60%/−10% =', ruleOf40(0.6, -0.1));
  console.log('[05] rule-of-40 30%/5%   =', ruleOf40(0.3, 0.05));

  // 6. Burn multiple
  console.log('[05] burn multiple 2M/1M =', burnMultiple(2_000_000, 1_000_000).toFixed(2));

  // 7. Metric tree
  const tree: MetricNode = {
    id: 'NS',
    name: 'Weekly Active Teams',
    unit: 'count',
    direction: 'up',
    category: 'north-star',
    drivers: [
      { id: 'D1', name: 'Activation rate', unit: 'ratio', direction: 'up', category: 'leading', drivers: [] },
      { id: 'D2', name: 'D7 retention', unit: 'ratio', direction: 'up', category: 'leading', drivers: [] },
      { id: 'D3', name: 'ARPU', unit: 'currency', direction: 'up', category: 'lagging', drivers: [] },
      { id: 'D4', name: 'p95 latency', unit: 'duration', direction: 'down', category: 'guardrail', drivers: [] },
    ],
  };
  console.log('[05] balanced tree  =', isBalanced(tree));

  // 8. HEART
  const heart: HeartScore[] = [
    { category: 'happiness', score: 0.42, target: 0.5 },
    { category: 'engagement', score: 4.2, target: 4 },
    { category: 'adoption', score: 0.6, target: 0.7 },
    { category: 'retention', score: 0.3, target: 0.4 },
    { category: 'task-success', score: 0.85, target: 0.9 },
  ];
  console.log('[05] HEART index   =', (heartIndex(heart) * 100).toFixed(0) + '%');

  // 9. GQM
  const gqm: Gqm[] = [
    { goal: 'retain users', question: 'are users returning?', metric: 'D7 retention', answerable: true },
    { goal: 'monetize', question: 'are users paying?', metric: 'ARPU', answerable: true },
    { goal: 'delight', question: 'are users happy?', metric: '?', answerable: false },
  ];
  console.log('[05] gqm coverage  =', gqmCoverage(gqm).coverage);

  // 10. Anomalies
  const series = [10, 11, 9, 10, 11, 10, 50, 11, 9, 10, 11, 10];
  const anomalies = detectAnomalies(series, 2.0);
  console.log('[05] anomalies     =', anomalies.map((a) => a.index).join(','));
  console.log('[05] ewma anomaly  =', ewmaAnomaly(series, 0.3, 2).isAnomaly);

  // 11. Beta
  console.log('[05] expected rew  =', expectedReward(7, 3).toFixed(2));
}
