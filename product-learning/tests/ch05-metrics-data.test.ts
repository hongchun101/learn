import { describe, it, expect } from 'vitest';
import {
  funnelStepRates,
  funnelEndToEnd,
  funnelWorstStep,
  averageRetention,
  dayNRetention,
  rollingAverage,
  ltvCac,
  aarrr,
  ruleOf40,
  burnMultiple,
  magicNumber,
  walkMetrics,
  metricsByCategory,
  categoryCounts,
  isBalanced,
  heartIndex,
  gqmCoverage,
  meanStd,
  zScores,
  detectAnomalies,
  ewma,
  ewmaAnomaly,
  weeklyBaseline,
  expectedReward,
  type Funnel,
  type Cohort,
  type MetricNode,
  type HeartScore,
  type Gqm,
  demo as ch05Demo,
} from '../src/05-metrics-data/index.js';

describe('05 — funnel & cohort', () => {
  const funnel: Funnel = {
    steps: [
      { name: 'visit', users: 10000 },
      { name: 'signup', users: 3000 },
      { name: 'paid', users: 200 },
    ],
  };
  it('funnelEndToEnd = last / first', () => {
    expect(funnelEndToEnd(funnel)).toBeCloseTo(0.02, 6);
  });
  it('funnelStepRates have 100% at first step', () => {
    expect(funnelStepRates(funnel)[0]?.rate).toBe(1);
  });
  it('funnelWorstStep is the largest drop', () => {
    // visit→signup = 70% drop, signup→paid = 93% drop → paid
    expect(funnelWorstStep(funnel)?.name).toBe('paid');
  });
  it('funnelWorstStep empty funnel returns null', () => {
    expect(funnelWorstStep({ steps: [] })).toBeNull();
    expect(funnelWorstStep({ steps: [{ name: 'a', users: 1 }] })).toBeNull();
  });

  const cohort: Cohort = {
    id: 'c',
    startDate: '2026-01-01',
    size: 100,
    retention: [
      { day: 0, retention: 1 },
      { day: 1, retention: 0.5 },
      { day: 2, retention: 0.3 },
    ],
  };
  it('averageRetention', () => {
    expect(averageRetention(cohort)).toBeCloseTo(0.6, 6);
  });
  it('dayNRetention', () => {
    expect(dayNRetention(cohort, 1)).toBe(0.5);
    expect(dayNRetention(cohort, 99)).toBe(0);
  });
  it('rollingAverage', () => {
    const r = rollingAverage(cohort, 2);
    expect(r.length).toBe(2);
    expect(r[0]?.retention).toBeCloseTo(0.75, 6);
  });
});

describe('05 — LTV/CAC & AARRR', () => {
  it('ltvCac basic', () => {
    const r = ltvCac({ arpu: 50, grossMargin: 0.8, monthlyChurn: 0.05, cac: 200 });
    expect(r.ltv).toBe(800);
    expect(r.ratio).toBe(4);
    expect(r.paybackMonths).toBe(5);
  });
  it('ltvCac rejects bad inputs', () => {
    expect(() => ltvCac({ arpu: -1, grossMargin: 0.8, monthlyChurn: 0.05, cac: 200 })).toThrow();
  });
  it('aarrr multiplies conversions', () => {
    const r = aarrr({ acquisition: 1, activation: 0.5, retention: 0.4, referral: 0.2, revenue: 0.1 });
    expect(r).toBeCloseTo(0.004, 6);
  });
  it('ruleOf40', () => {
    expect(ruleOf40(0.5, -0.1)).toBe(false);
    expect(ruleOf40(0.3, 0.2)).toBe(true);
  });
  it('burnMultiple', () => {
    expect(burnMultiple(2_000_000, 1_000_000)).toBe(2);
  });
  it('magicNumber', () => {
    expect(magicNumber(1_000_000, 500_000)).toBe(2);
  });
});

describe('05 — metric tree & HEART', () => {
  const tree: MetricNode = {
    id: 'NS',
    name: 'North Star',
    unit: 'count',
    direction: 'up',
    category: 'north-star',
    drivers: [
      { id: 'A', name: 'a', unit: 'ratio', direction: 'up', category: 'leading', drivers: [] },
      { id: 'B', name: 'b', unit: 'ratio', direction: 'up', category: 'lagging', drivers: [] },
      { id: 'C', name: 'c', unit: 'duration', direction: 'down', category: 'guardrail', drivers: [] },
    ],
  };
  it('walkMetrics yields root + children', () => {
    expect([...walkMetrics(tree)].map((n) => n.id)).toEqual(['NS', 'A', 'B', 'C']);
  });
  it('metricsByCategory filters', () => {
    expect(metricsByCategory(tree, 'leading').map((n) => n.id)).toEqual(['A']);
  });
  it('categoryCounts', () => {
    const c = categoryCounts(tree);
    expect(c['north-star']).toBe(1);
    expect(c.leading).toBe(1);
    expect(c.lagging).toBe(1);
    expect(c.guardrail).toBe(1);
  });
  it('isBalanced requires one of each', () => {
    expect(isBalanced(tree)).toBe(true);
    const unbalanced: MetricNode = { ...tree, drivers: [] };
    expect(isBalanced(unbalanced)).toBe(false);
  });
  it('heartIndex averages normalized scores', () => {
    const scores: HeartScore[] = [
      { category: 'happiness', score: 0.5, target: 0.5 },
      { category: 'engagement', score: 2, target: 4 },
    ];
    expect(heartIndex(scores)).toBeCloseTo(0.75, 6);
  });
  it('gqmCoverage', () => {
    const items: Gqm[] = [
      { goal: 'a', question: 'q', metric: 'm', answerable: true },
      { goal: 'a', question: 'q', metric: 'm', answerable: false },
    ];
    expect(gqmCoverage(items).coverage).toBe(0.5);
  });
});

describe('05 — anomaly detection', () => {
  it('meanStd', () => {
    const r = meanStd([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(r.mean).toBe(5);
    expect(r.std).toBeCloseTo(2.138, 3);
  });
  it('zScores center around 0', () => {
    const z = zScores([1, 2, 3, 4, 5]);
    expect(z[2]).toBeCloseTo(0, 6);
  });
  it('detectAnomalies flags the 50 in mostly-10 series', () => {
    const a = detectAnomalies([10, 10, 11, 10, 10, 50, 10, 10], 2);
    expect(a.length).toBeGreaterThan(0);
    expect(a[0]?.value).toBe(50);
  });
  it('ewma smooths', () => {
    const e = ewma([10, 20, 10, 20], 0.5);
    expect(e[0]).toBe(10);
    expect(e[1]).toBe(15);
  });
  it('ewmaAnomaly detects spike', () => {
    const a = ewmaAnomaly([10, 10, 10, 10, 10, 50], 0.3, 1.5);
    expect(a.isAnomaly).toBe(true);
  });
  it('weeklyBaseline averages per weekday', () => {
    const w = weeklyBaseline([
      { day: 0, value: 10 },
      { day: 0, value: 20 },
      { day: 1, value: 30 },
    ]);
    expect(w[0]?.mean).toBe(15);
    expect(w[1]?.mean).toBe(30);
  });
  it('expectedReward is mean of Beta', () => {
    expect(expectedReward(7, 3)).toBeCloseTo(0.7, 6);
  });
});

describe('05 — demo runs end-to-end without throwing', () => {
  it('demo() prints and returns', () => {
    const captured: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => {
      captured.push(args.map(String).join(' '));
    };
    try {
      ch05Demo();
    } finally {
      console.log = orig;
    }
    expect(captured.length).toBeGreaterThan(5);
    for (const line of captured) {
      expect(line.startsWith('[05]')).toBe(true);
    }
  });
});
