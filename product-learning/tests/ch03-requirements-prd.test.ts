import { describe, it, expect } from 'vitest';
import {
  kanoCategory,
  rankedKano,
  moscowBucket,
  storyPointToDays,
  sprintCapacity,
  validatePrd,
  isPrdReady,
  renderPrdMarkdown,
  givenWhenThen,
  makeStory,
  stakeholderQuadrant,
  uncoveredRequirements,
  orphanMetrics,
  racisViolations,
  pert,
  widebandDelphi,
  referenceClassForecast,
  calendarWeeks,
  type Prd,
  type Stakeholder,
  type Moscow,
  type UserStory,
  type StakeholderQuadrant,
  type RequirementLink,
  type RacisAssignment,
  demo as ch03Demo,
} from '../src/03-requirements-prd/index.js';

describe('03 — Kano & MoSCoW', () => {
  it('classifies Kano pairs', () => {
    expect(kanoCategory({ withAnswer: 'like', withoutAnswer: 'dislike' })).toBe('attractive');
    expect(kanoCategory({ withAnswer: 'expect', withoutAnswer: 'expect' })).toBe('must-be');
    expect(kanoCategory({ withAnswer: 'expect', withoutAnswer: 'dislike' })).toBe('one-dimensional');
    expect(kanoCategory({ withAnswer: 'neutral', withoutAnswer: 'neutral' })).toBe('indifferent');
    expect(kanoCategory({ withAnswer: 'dislike', withoutAnswer: 'like' })).toBe('reverse');
  });

  it('rankedKano sorts must-be first', () => {
    const ranked = rankedKano([
      { id: 'a', pair: { withAnswer: 'neutral', withoutAnswer: 'neutral' } },
      { id: 'b', pair: { withAnswer: 'expect', withoutAnswer: 'expect' } },
    ]);
    expect(ranked[0]?.id).toBe('b');
  });

  it('moscowBucket respects budget', () => {
    const s: UserStory[] = [
      makeStory('A', 'u', 'a', 'a', [givenWhenThen('1', 'g', 'w', 't')], 5),
      makeStory('B', 'u', 'b', 'b', [givenWhenThen('1', 'g', 'w', 't')], 3),
      makeStory('C', 'u', 'c', 'c', [givenWhenThen('1', 'g', 'w', 't')], 8),
    ];
    const m: Record<string, Moscow> = { A: 'must', B: 'should', C: 'could' };
    const budget = moscowBucket(s, new Map(Object.entries(m)), 5);
    expect(budget.map((x) => x.id)).toEqual(['A']);
  });

  it('moscowBucket fills "should" before "could"', () => {
    const s: UserStory[] = [
      makeStory('M', 'u', 'a', 'a', [givenWhenThen('1', 'g', 'w', 't')], 3),
      makeStory('S', 'u', 'b', 'b', [givenWhenThen('1', 'g', 'w', 't')], 2),
      makeStory('C', 'u', 'c', 'c', [givenWhenThen('1', 'g', 'w', 't')], 2),
    ];
    const m: Record<string, Moscow> = { M: 'must', S: 'should', C: 'could' };
    const budget = moscowBucket(s, new Map(Object.entries(m)), 5);
    expect(budget.map((x) => x.id).sort()).toEqual(['M', 'S']);
  });

  it('storyPointToDays respects productivity', () => {
    expect(storyPointToDays(5, 0.5)).toBe(10);
  });

  it('sprintCapacity = team × days × focus', () => {
    expect(sprintCapacity(3, 10, 0.6)).toBe(18);
  });
});

describe('03 — PRD validation', () => {
  const basePrd: Prd = {
    id: 'P1',
    title: 'X',
    author: 'a',
    status: 'draft',
    problem: 'p',
    goals: ['g'],
    nonGoals: ['ng'],
    successMetrics: [{ id: 'M1', name: 'm', target: 't' }],
    stories: [
      makeStory('S1', 'u', 'i', 's', [givenWhenThen('1', 'g', 'w', 't')], 3),
    ],
    nfrs: [],
    moscow: [{ storyId: 'S1', bucket: 'must' }],
    openQuestions: [],
    changelog: [],
  };

  it('isPrdReady is true for a well-formed PRD', () => {
    expect(isPrdReady(basePrd)).toBe(true);
  });

  it('flags missing problem', () => {
    expect(isPrdReady({ ...basePrd, problem: '' })).toBe(false);
  });

  it('flags stories without acceptance', () => {
    const p = { ...basePrd, stories: [makeStory('S1', 'u', 'i', 's', [])] };
    expect(isPrdReady(p)).toBe(false);
  });

  it('flags MoSCoW referencing missing story', () => {
    const p = { ...basePrd, moscow: [{ storyId: 'NOPE', bucket: 'must' as const }] };
    const issues = validatePrd(p);
    expect(issues.some((i) => i.severity === 'error' && /missing story/.test(i.message))).toBe(true);
  });

  it('renderPrdMarkdown contains problem and goals', () => {
    const md = renderPrdMarkdown(basePrd);
    expect(md).toContain('# X');
    expect(md).toContain('## Problem');
    expect(md).toContain('## Goals');
    expect(md).toContain('## User stories');
  });
});

describe('03 — stakeholders', () => {
  it('classifies 4 quadrants', () => {
    const expectQuadrant = (s: Stakeholder, q: StakeholderQuadrant) => expect(stakeholderQuadrant(s)).toBe(q);
    expectQuadrant({ id: '1', name: 'a', role: 'exec', power: 5, interest: 5 }, 'manage-closely');
    expectQuadrant({ id: '2', name: 'a', role: 'exec', power: 5, interest: 2 }, 'keep-satisfied');
    expectQuadrant({ id: '3', name: 'a', role: 'exec', power: 2, interest: 5 }, 'keep-informed');
    expectQuadrant({ id: '4', name: 'a', role: 'exec', power: 2, interest: 2 }, 'monitor');
  });

  it('uncoveredRequirements finds orphans', () => {
    const links: RequirementLink[] = [{ requirementId: 'R1', stakeholderId: 'S1', rationale: 'x' }];
    expect(uncoveredRequirements(['R1', 'R2'], links)).toEqual(['R2']);
  });

  it('orphanMetrics finds metrics not reached', () => {
    const links: RequirementLink[] = [{ requirementId: 'R1', stakeholderId: 'S1', metricId: 'M1', rationale: 'x' }];
    expect(orphanMetrics(['M1', 'M2'], links)).toEqual(['M2']);
  });

  it('racisViolations catches R==A', () => {
    const a: RacisAssignment = {
      deliverable: 'D1',
      responsible: 'alice',
      accountable: 'alice',
      consulted: [],
      informed: [],
    };
    expect(racisViolations([a]).length).toBeGreaterThan(0);
  });
});

describe('03 — estimation', () => {
  it('PERT formula', () => {
    // (5 + 4·8 + 21) / 6 = 9.67; σ = (21-5)/6 = 2.67
    const p = pert({ optimistic: 5, mostLikely: 8, pessimistic: 21 });
    expect(p.expected).toBeCloseTo(9.6667, 3);
    expect(p.sigma).toBeCloseTo(2.6667, 3);
  });

  it('widebandDelphi averages the last round', () => {
    const r = widebandDelphi([[10, 12, 14, 8], [10, 12, 11, 9]]);
    expect(r.mean).toBeCloseTo(10.5, 6);
    expect(r.spread).toBe(3);
  });

  it('referenceClassForecast interpolates between p50 and p90', () => {
    const r = referenceClassForecast({ p10: 4, p50: 6, p90: 12 }, 0.5);
    expect(r).toBe(9);
  });

  it('calendarWeeks subtracts holidays', () => {
    // 20 days - 2 holidays = 18 / 5 = 3.6
    expect(calendarWeeks(20, 5, [1, 1])).toBeCloseTo(3.6, 6);
  });
});

describe('03 — demo runs end-to-end without throwing', () => {
  it('demo() prints and returns', () => {
    const captured: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => {
      captured.push(args.map(String).join(' '));
    };
    try {
      ch03Demo();
    } finally {
      console.log = orig;
    }
    expect(captured.length).toBeGreaterThan(5);
    for (const line of captured) {
      expect(line.startsWith('[03]')).toBe(true);
    }
  });
});
