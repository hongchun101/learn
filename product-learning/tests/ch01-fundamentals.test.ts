import { describe, it, expect } from 'vitest';
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
  isConsistentSizing,
  bottomUpSizing,
  arrOpportunity,
  paretoTop,
  disciplineScore,
  classifyReversibility,
  rankByRice,
  type Feature,
  type FourRisks,
  type ProblemStatement,
  type UserSegment,
  type DecisionLogEntry,
  demo as ch01Demo,
} from '../src/01-fundamentals/index.js';

describe('01 — RICE / ICE / WSJF', () => {
  it('RICE matches the documented formula', () => {
    // (100 * 2 * 1.0) / 4 = 50
    expect(riceScore({ reach: 100, impact: 2, confidence: 100, effort: 4 })).toBeCloseTo(50, 6);
    // (50 * 0.5 * 0.5) / 2 = 6.25
    expect(riceScore({ reach: 50, impact: 0.5, confidence: 50, effort: 2 })).toBeCloseTo(6.25, 6);
  });

  it('RICE rejects zero effort', () => {
    expect(() => riceScore({ reach: 1, impact: 1, confidence: 100, effort: 0 })).toThrow();
  });

  it('ICE averages the three axes', () => {
    expect(iceScore({ impact: 6, confidence: 8, ease: 10 })).toBeCloseTo(8, 6);
  });

  it('WSJF = (BV + TC + RR) / size', () => {
    expect(wsjfScore({ businessValue: 3, timeCriticality: 0.5, riskReduction: 0.5, jobSize: 2 })).toBeCloseTo(2, 6);
  });

  it('riceToBucket partitions cleanly', () => {
    expect(riceToBucket(150)).toBe(5);
    expect(riceToBucket(50)).toBe(4);
    expect(riceToBucket(15)).toBe(3);
    expect(riceToBucket(5)).toBe(2);
    expect(riceToBucket(1)).toBe(1);
  });
});

describe('01 — 4 risks', () => {
  it('isReadyToBuild is false when any risk is unknown or low', () => {
    expect(isReadyToBuild({ value: 'high', usability: 'high', feasibility: 'high', viability: 'high' })).toBe(true);
    expect(isReadyToBuild({ value: 'low', usability: 'high', feasibility: 'high', viability: 'high' })).toBe(false);
    expect(isReadyToBuild({ value: 'high', usability: 'unknown', feasibility: 'high', viability: 'high' })).toBe(false);
  });

  it('riskiestUnknown returns the first unknown in priority order', () => {
    const r: FourRisks = { value: 'med', usability: 'unknown', feasibility: 'high', viability: 'med' };
    expect(riskiestUnknown(r)).toBe('usability');
    const r2: FourRisks = { value: 'unknown', usability: 'unknown', feasibility: 'unknown', viability: 'unknown' };
    expect(riskiestUnknown(r2)).toBe('value');
    const r3: FourRisks = { value: 'high', usability: 'high', feasibility: 'high', viability: 'high' };
    expect(riskiestUnknown(r3)).toBeNull();
  });
});

describe('01 — CIRCLES, JTBD, segments', () => {
  it('circlesTotal weights scope and relativeAdvantage highest', () => {
    const max = circlesTotal({ customer: 10, identify: 10, relativeAdvantage: 10, competition: 10, leverage: 10, engagement: 10, acceptability: 10, scope: 10 });
    const min = circlesTotal({ customer: 0, identify: 0, relativeAdvantage: 0, competition: 0, leverage: 0, engagement: 0, acceptability: 0, scope: 0 });
    expect(max).toBeCloseTo(10, 6);
    expect(min).toBe(0);
  });

  it('buildJobStatement returns all three dimensions', () => {
    const p: ProblemStatement = {
      who: 'user',
      what: 'do the thing',
      whyNow: 'urgent',
      successMetric: 'reduce clicks',
    };
    const j = buildJobStatement(p);
    expect(j.functional.toLowerCase()).toContain('when do the thing');
    expect(j.emotional).toMatch(/feel/);
    expect(j.social).toMatch(/seen/);
  });

  it('rankSegments orders by weighted score', () => {
    const segs: UserSegment[] = [
      { id: 'a', name: 'a', characteristics: [], sizeEstimate: 1000, valueScore: 10 },
      { id: 'b', name: 'b', characteristics: [], sizeEstimate: 100, valueScore: 1000 },
    ];
    const r = rankSegments(segs, { size: 0, value: 1 });
    expect(r[0]?.segment.id).toBe('b');
    const r2 = rankSegments(segs, { size: 1, value: 0 });
    expect(r2[0]?.segment.id).toBe('a');
  });
});

describe('01 — opportunity sizing & decision discipline', () => {
  it('isConsistentSizing enforces SAM ≤ TAM and SOM ≤ SAM', () => {
    expect(isConsistentSizing({ tam: 100, sam: 50, som: 10 })).toBe(true);
    expect(isConsistentSizing({ tam: 50, sam: 100, som: 10 })).toBe(false);
    expect(isConsistentSizing({ tam: 100, sam: 50, som: 60 })).toBe(false);
  });

  it('bottomUpSizing sums size × value × multiplier', () => {
    const segs: UserSegment[] = [
      { id: 'a', name: 'a', characteristics: [], sizeEstimate: 100, valueScore: 10 },
      { id: 'b', name: 'b', characteristics: [], sizeEstimate: 50, valueScore: 20 },
    ];
    expect(bottomUpSizing(segs, 0.1)).toBeCloseTo((100 * 10 + 50 * 20) * 0.1, 6);
  });

  it('arrOpportunity = SOM × ARPU × capture', () => {
    expect(arrOpportunity({ tam: 1000, sam: 500, som: 200 }, 100, 0.5)).toBe(10_000);
  });

  it('arrOpportunity rejects bad inputs', () => {
    expect(() => arrOpportunity({ tam: 1000, sam: 500, som: 200 }, -1, 0.5)).toThrow();
    expect(() => arrOpportunity({ tam: 1000, sam: 500, som: 200 }, 100, 1.5)).toThrow();
  });

  it('paretoTop returns the minimum set covering fraction of total', () => {
    const items = [
      { name: 'A', value: 80 },
      { name: 'B', value: 15 },
      { name: 'C', value: 3 },
      { name: 'D', value: 2 },
    ];
    const top = paretoTop(items, (x) => x.value, 0.5);
    // Need to cover ≥ 50 of 100; A alone = 80.
    expect(top.map((x) => x.name)).toEqual(['A']);
  });

  it('disciplineScore rewards entries that set an invalidation signal', () => {
    const log: DecisionLogEntry[] = [
      { id: '1', decision: 'x', alternatives: [], rationale: 'y', expectedImpact: 'z', invalidationSignal: 'metric drops 5%', decidedAt: '2026-01-01' },
      { id: '2', decision: 'x', alternatives: [], rationale: 'y', expectedImpact: 'z', invalidationSignal: '', decidedAt: '2026-01-02' },
    ];
    expect(disciplineScore(log)).toBeCloseTo(0.5, 6);
    expect(disciplineScore([])).toBe(0);
  });

  it('classifyReversibility flags irreversible keywords', () => {
    const d: DecisionLogEntry = {
      id: '1',
      decision: 'do a full billing migration to a new provider',
      alternatives: [],
      rationale: '',
      expectedImpact: '',
      invalidationSignal: '',
      decidedAt: '2026-01-01',
    };
    expect(classifyReversibility(d)).toBe('irreversible');
  });
});

describe('01 — feature ranking with RICE/ICE/WSJF', () => {
  const features: Feature[] = [
    { id: 'F1', title: 'a', problem: '', hypothesisId: 'H1', primaryMetricId: 'M1', stage: 'build', priorityScore: 0 },
    { id: 'F2', title: 'b', problem: '', hypothesisId: 'H1', primaryMetricId: 'M1', stage: 'build', priorityScore: 0 },
    { id: 'F3', title: 'c', problem: '', hypothesisId: 'H1', primaryMetricId: 'M1', stage: 'build', priorityScore: 0 },
  ];
  it('rankByRice orders by RICE score, ties stable', () => {
    const scores: Record<string, number> = { F1: 10, F2: 30, F3: 30 };
    const ranked = rankByRice(features, new Map(Object.entries(scores)));
    // Both F2 and F3 are tied at 30; stable sort keeps F2 first by input order.
    expect(ranked[0]?.id).toBe('F2');
    expect(ranked[1]?.id).toBe('F3');
    expect(ranked[2]?.id).toBe('F1');
  });
});

describe('01 — demo runs end-to-end without throwing', () => {
  it('demo() prints and returns', () => {
    const captured: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => {
      captured.push(args.map(String).join(' '));
    };
    try {
      ch01Demo();
    } finally {
      console.log = orig;
    }
    expect(captured.length).toBeGreaterThan(5);
    // sanity: every line is prefixed with [01]
    for (const line of captured) {
      expect(line.startsWith('[01]')).toBe(true);
    }
  });
});
