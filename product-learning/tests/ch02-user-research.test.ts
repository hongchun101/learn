import { describe, it, expect } from 'vitest';
import {
  buildScreener,
  screen,
  stratifiedSample,
  sampleSizeForProportion,
  saturationPoint,
  defaultInterviewGuide,
  sentimentBreakdown,
  cohensKappa,
  synthesizePersonas,
  susScore,
  nps,
  cronbachsAlpha,
  worstDropOff,
  describe as statsDescribe,
  twoProportionZ,
  probabilityBBeatsA,
  type Recruit,
  type Observation,
  type StudyDesign,
  type SurveyResponse,
  type ScreenQuestion,
  demo as ch02Demo,
} from '../src/02-user-research/index.js';

describe('02 — recruitment', () => {
  const recruits: Recruit[] = [
    { id: 'r1', segment: 'a', experienceLevel: 3, usageLevel: 3, timezone: 'UTC' },
    { id: 'r2', segment: 'a', experienceLevel: 4, usageLevel: 4, timezone: 'UTC' },
    { id: 'r3', segment: 'b', experienceLevel: 2, usageLevel: 2, timezone: 'EST' },
    { id: 'r4', segment: 'b', experienceLevel: 5, usageLevel: 5, timezone: 'EST' },
  ];

  it('stratifiedSample picks equal numbers per segment until n reached', () => {
    const out = stratifiedSample(recruits, 2);
    expect(out.length).toBe(2);
    expect(new Set(out.map((r) => r.segment)).size).toBe(2);
  });

  it('stratifiedSample handles n larger than the pool', () => {
    const out = stratifiedSample(recruits, 99);
    expect(out.length).toBe(recruits.length);
  });

  it('stratifiedSample with n=0 returns []', () => {
    expect(stratifiedSample(recruits, 0)).toEqual([]);
  });

  it('sampleSizeForProportion follows Cochran', () => {
    // p=0.5, m=0.05, z=1.96 → ceil(1.96²·0.25/0.0025) = ceil(384.16) = 385
    expect(sampleSizeForProportion(0.5, 0.05, 1.96)).toBe(385);
  });

  it('sampleSizeForProportion rejects bad inputs', () => {
    expect(() => sampleSizeForProportion(-0.1, 0.05, 1.96)).toThrow();
    expect(() => sampleSizeForProportion(0.5, 0, 1.96)).toThrow();
  });
  it('screen filters by answers', () => {
    const screener: ScreenQuestion[] = [
      { id: 'exp', prompt: 'Do you have experience?', qualifyingAnswer: true },
    ];
    const answers = new Map<string, ReadonlyMap<string, boolean>>([
      ['r1', new Map([['exp', true]])],
      ['r2', new Map([['exp', false]])],
      ['r3', new Map([['exp', true]])],
      ['r4', new Map([['exp', true]])],
    ]);
    const out = screen(recruits, screener, answers);
    expect(out.map((r) => r.id)).toEqual(['r1', 'r3', 'r4']);
  });

  it('buildScreener pulls from the library', () => {
    const library: Record<string, ScreenQuestion> = {
      experienceLevel: { id: 'experienceLevel', prompt: 'p', qualifyingAnswer: true },
    };
    const design: StudyDesign = {
      id: 's1',
      question: 'q',
      kind: 'interview',
      sampleSize: 5,
      inclusion: ['experienceLevel'],
      exclusion: [],
    };
    const s = buildScreener(design, library);
    expect(s).toHaveLength(1);
    expect(s[0]?.id).toBe('experienceLevel');
  });
});

describe('02 — interview & coding', () => {
  it('defaultInterviewGuide has 5 phases in order', () => {
    const g = defaultInterviewGuide('topic');
    expect(g.map((x) => x.phase)).toEqual(['rapport', 'context', 'present-state', 'past-behavior', 'wrap']);
  });

  it('sentimentBreakdown counts', () => {
    const obs: Observation[] = [
      { id: 'a', participantId: 'p1', quote: 'q', sentiment: 'frustrated', theme: 't1' },
      { id: 'b', participantId: 'p1', quote: 'q', sentiment: 'delighted', theme: 't2' },
    ];
    const b = sentimentBreakdown(obs);
    expect(b.frustrated).toBe(1);
    expect(b.delighted).toBe(1);
  });

  it('cohensKappa = 1 for perfect agreement', () => {
    expect(cohensKappa(['a', 'b', 'c'], ['a', 'b', 'c'])).toBeCloseTo(1, 6);
  });

  it('cohensKappa ≈ 0 for random', () => {
    // A=["a","a","b","b"], B=["a","b","a","b"] → p_o=0.5, p_e=0.5, kappa=0
    expect(cohensKappa(['a', 'a', 'b', 'b'], ['a', 'b', 'a', 'b'])).toBeCloseTo(0, 6);
  });

  it('synthesizePersonas partitions into 4 quadrants', () => {
    const rs: Recruit[] = [
      { id: 'a', segment: 'x', experienceLevel: 5, usageLevel: 5, timezone: 'UTC' },
      { id: 'b', segment: 'x', experienceLevel: 1, usageLevel: 1, timezone: 'UTC' },
    ];
    const obs: Observation[] = [
      { id: 'o1', participantId: 'a', quote: 'q', sentiment: 'neutral', theme: 't1' },
      { id: 'o2', participantId: 'b', quote: 'q', sentiment: 'frustrated', theme: 't2' },
    ];
    const personas = synthesizePersonas(rs, obs, 1);
    expect(personas.length).toBe(2);
  });
});

describe('02 — saturation', () => {
  it('detects when theme count stops growing', () => {
    const obs = [
      { id: '1', theme: 'a' },
      { id: '2', theme: 'a' },
      { id: '3', theme: 'b' },
      { id: '4', theme: 'b' },
      { id: '5', theme: 'b' },
      { id: '6', theme: 'b' },
    ];
    // After 2 a's + 1 b, no new theme; plateau at index 3 (b repeated twice).
    expect(saturationPoint(obs)).toBeGreaterThanOrEqual(2);
  });
});

describe('02 — survey metrics', () => {
  it('SUS: 4,2,4,2,4,2,4,2,4,2 → 75', () => {
    expect(susScore([4, 2, 4, 2, 4, 2, 4, 2, 4, 2])).toBeCloseTo(75, 6);
  });

  it('SUS rejects wrong item count', () => {
    expect(() => susScore([1, 2, 3])).toThrow();
  });

  it('NPS buckets: 9-10 promoters, 7-8 passives, 0-6 detractors', () => {
    const r = nps([10, 9, 8, 7, 6, 5, 0]);
    expect(r.promoters).toBe(2);
    expect(r.passives).toBe(2);
    expect(r.detractors).toBe(3);
    // (2-3)/7 * 100 ≈ -14.29
    expect(r.score).toBeCloseTo(-14.2857, 3);
  });

  it('NPS empty = 0', () => {
    const r = nps([]);
    expect(r.score).toBe(0);
  });

  it('Cronbach α on perfectly consistent data is high', () => {
    const ratings = [
      [1, 1, 1],
      [2, 2, 2],
      [3, 3, 3],
      [4, 4, 4],
    ];
    expect(cronbachsAlpha(ratings)).toBeCloseTo(1, 6);
  });

  it('Cronbach α on random data is low', () => {
    const ratings = [
      [1, 5, 1],
      [5, 1, 5],
      [1, 5, 1],
      [5, 1, 5],
    ];
    expect(cronbachsAlpha(ratings)).toBeLessThan(0);
  });

  it('worstDropOff returns the first under-100% question', () => {
    const responses: SurveyResponse[] = [
      { id: '1', participantId: 'p1', answers: { Q1: 1, Q2: 2 } },
      { id: '2', participantId: 'p2', answers: { Q1: 1 } },
    ];
    expect(worstDropOff(responses, ['Q1', 'Q2'])).toBe('Q2');
  });
});

describe('02 — quant / A/B', () => {
  it('describe computes mean, stddev, 95% CI', () => {
    const d = statsDescribe([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(d.mean).toBe(5);
    expect(d.n).toBe(8);
    expect(d.ci95Low).toBeLessThan(d.mean);
    expect(d.ci95High).toBeGreaterThan(d.mean);
  });

  it('describe empty = zero', () => {
    const d = statsDescribe([]);
    expect(d.mean).toBe(0);
    expect(d.n).toBe(0);
  });

  it('twoProportionZ detects significant lift', () => {
    const r = twoProportionZ({ conversionsA: 100, nA: 1000, conversionsB: 200, nB: 1000 });
    expect(r.rateA).toBeCloseTo(0.1, 6);
    expect(r.rateB).toBeCloseTo(0.2, 6);
    expect(r.lift).toBeCloseTo(1.0, 6);
    expect(r.significant95).toBe(true);
    expect(r.pValue).toBeLessThan(0.05);
  });

  it('twoProportionZ with no difference is not significant', () => {
    const r = twoProportionZ({ conversionsA: 100, nA: 1000, conversionsB: 105, nB: 1000 });
    expect(r.significant95).toBe(false);
  });

  it('probabilityBBeatsA is in [0,1] and skews to B when B clearly better', () => {
    const p = probabilityBBeatsA({ conversionsA: 50, nA: 1000, conversionsB: 200, nB: 1000 });
    expect(p).toBeGreaterThan(0.99);
  });
});

describe('02 — demo runs end-to-end without throwing', () => {
  it('demo() prints and returns', () => {
    const captured: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => {
      captured.push(args.map(String).join(' '));
    };
    try {
      ch02Demo();
    } finally {
      console.log = orig;
    }
    expect(captured.length).toBeGreaterThan(5);
    for (const line of captured) {
      expect(line.startsWith('[02]')).toBe(true);
    }
  });
});
