import { describe, it, expect } from 'vitest';
import {
  parseDay,
  criticalPath,
  onCriticalPath,
  slack,
  cycleFits,
  burnup,
  velocity,
  averageVelocity,
  velocityStd,
  sprintsToComplete,
  carryOverRate,
  predictability,
  decisionScore,
  rankOptions,
  consensus,
  meetingCost,
  slantScore,
  scoreRisk,
  riskRanking,
  launchReadiness,
  recommendReleaseTier,
  type Task,
  type Sprint,
  type Risk,
  type LaunchCheck,
  type DecisionMatrix,
  type WorkingBackwardsDoc,
  demo as ch07Demo,
} from '../src/07-pm-collaboration/index.js';

describe('07 — scheduling', () => {
  const tasks: Task[] = [
    { id: 'T1', title: 'a', owner: 'a', estimateDays: 3, status: 'done', dependsOn: [], startAt: '2026-01-01' },
    { id: 'T2', title: 'b', owner: 'a', estimateDays: 5, status: 'in-progress', dependsOn: ['T1'], startAt: '2026-01-04' },
    { id: 'T3', title: 'c', owner: 'a', estimateDays: 4, status: 'in-progress', dependsOn: ['T1'], startAt: '2026-01-04' },
    { id: 'T4', title: 'd', owner: 'a', estimateDays: 2, status: 'todo', dependsOn: ['T2', 'T3'], startAt: '2026-01-09' },
  ];

  it('parseDay returns a timestamp', () => {
    expect(parseDay('2026-01-01')).toBeGreaterThan(0);
  });

  it('criticalPath computes earliest start/finish', () => {
    const cp = criticalPath(tasks);
    expect(cp.get('T1')?.earliestStart).toBeGreaterThan(0);
    expect(cp.get('T4')?.earliestStart).toBeGreaterThan(cp.get('T2')!.earliestStart);
  });

  it('criticalPath throws on cycle', () => {
    const cyclic: Task[] = [
      { id: 'A', title: 'a', owner: 'a', estimateDays: 1, status: 'todo', dependsOn: ['B'], startAt: '2026-01-01' },
      { id: 'B', title: 'b', owner: 'a', estimateDays: 1, status: 'todo', dependsOn: ['A'], startAt: '2026-01-01' },
    ];
    expect(() => criticalPath(cyclic)).toThrow(/cycle/);
  });

  it('onCriticalPath identifies longest path', () => {
    expect(onCriticalPath(tasks)).toContain('T4');
  });

  it('slack returns room before target', () => {
    const target = parseDay('2026-01-20');
    const s = slack(tasks, target);
    expect(s.get('T4')).toBeGreaterThanOrEqual(0);
  });

  it('cycleFits checks capacity and weeks', () => {
    expect(cycleFits({ weeks: 2, capacity: 50 }, 30, 15).fits).toBe(true);
    expect(cycleFits({ weeks: 1, capacity: 50 }, 30, 15).fits).toBe(false);
  });

  it('burnup accumulates', () => {
    const bu = burnup(100, [
      { day: 1, done: 5 },
      { day: 2, done: 8 },
    ]);
    expect(bu[1]?.totalDone).toBe(13);
    expect(bu[1]?.remaining).toBe(87);
  });
});

describe('07 — velocity & predictability', () => {
  const sprints: Sprint[] = [
    { id: 's1', committedPoints: 30, completedPoints: 25, teamSize: 4, carryOver: 5 },
    { id: 's2', committedPoints: 32, completedPoints: 30, teamSize: 4, carryOver: 3 },
    { id: 's3', committedPoints: 35, completedPoints: 32, teamSize: 4, carryOver: 3 },
  ];
  it('velocity returns completed points', () => {
    expect(velocity(sprints[0]!)).toBe(25);
  });
  it('averageVelocity', () => {
    expect(averageVelocity(sprints)).toBe(29);
    expect(averageVelocity(sprints, 1)).toBe(32);
  });
  it('velocityStd', () => {
    expect(velocityStd(sprints)).toBeGreaterThan(0);
  });
  it('sprintsToComplete uses recent velocity', () => {
    expect(sprintsToComplete(90, sprints)).toBe(4);
  });
  it('sprintsToComplete infinite when velocity is 0', () => {
    expect(sprintsToComplete(100, [{ id: 'a', committedPoints: 10, completedPoints: 0, teamSize: 1, carryOver: 0 }])).toBe(Number.POSITIVE_INFINITY);
  });
  it('carryOverRate', () => {
    expect(carryOverRate(sprints)).toBeGreaterThan(0);
  });
  it('predictability', () => {
    const p = predictability(sprints);
    expect(p).toBeGreaterThan(0.8);
  });
});

describe('07 — decisions', () => {
  const m: DecisionMatrix = {
    criteria: [
      { id: 'cost', weight: 0.5 },
      { id: 'speed', weight: 0.5 },
    ],
    options: [
      { id: 'A', name: 'A', scores: { cost: 5, speed: 3 } },
      { id: 'B', name: 'B', scores: { cost: 3, speed: 5 } },
    ],
  };
  it('decisionScore = Σ w·score', () => {
    expect(decisionScore(m, 'A')).toBeCloseTo(4, 6);
    expect(decisionScore(m, 'B')).toBeCloseTo(4, 6);
  });
  it('rankOptions sorts by score', () => {
    const r = rankOptions(m);
    expect(r[0]?.id).toBe('A');
  });
  it('consensus reaches threshold', () => {
    // 2/3 = 0.667 > 0.66 (default)
    expect(consensus(['yes', 'yes', 'no'])).toBe(true);
    // 2/4 = 0.5 < 0.66
    expect(consensus(['yes', 'yes', 'no', 'no'])).toBe(false);
    expect(consensus(['yes', 'yes', 'yes', 'no'], 0.5)).toBe(true);
    expect(consensus([], 0.5)).toBe(false);
  });
  it('meetingCost', () => {
    expect(meetingCost(8, 60, 100)).toBe(800);
  });
  it('slantScore counts customer vs internal words', () => {
    const wb: WorkingBackwardsDoc = {
      headline: 'h',
      summary: 's',
      problem: 'customer is wasting time',
      solution: 'a tool for the customer',
      quote: 'customer testimonial',
      successMetrics: [],
    };
    const s = slantScore(wb);
    expect(s.customer).toBeGreaterThan(0);
  });
});

describe('07 — risk & launch', () => {
  it('scoreRisk = p × i', () => {
    const r = scoreRisk({ id: '1', description: 'd', probability: 0.5, impact: 4, owner: 'a' });
    expect(r.score).toBe(2);
  });
  it('riskRanking sorts', () => {
    const rs: Risk[] = [
      { id: '1', description: 'd', probability: 0.1, impact: 5, owner: 'a' },
      { id: '2', description: 'd', probability: 0.9, impact: 1, owner: 'a' },
    ];
    expect(riskRanking(rs)[0]?.id).toBe('2');
  });
  it('launchReadiness', () => {
    const checks: LaunchCheck[] = [
      { id: '1', name: 'a', done: true, owner: 'a' },
      { id: '2', name: 'b', done: false, owner: 'a' },
    ];
    const r = launchReadiness(checks);
    expect(r.ready).toBe(false);
    expect(r.doneCount).toBe(1);
  });
  it('launchReadiness ready with all done', () => {
    expect(launchReadiness([{ id: '1', name: 'a', done: true, owner: 'a' }]).ready).toBe(true);
  });
  it('launchReadiness not ready with empty', () => {
    expect(launchReadiness([]).ready).toBe(false);
  });
  it('recommendReleaseTier', () => {
    expect(recommendReleaseTier(true, 'single-tenant')).toBe('feature-flag');
    expect(recommendReleaseTier(false, 'multi-tenant')).toBe('canary');
    expect(recommendReleaseTier(false, 'global')).toBe('big-bang');
  });
});

describe('07 — demo runs end-to-end without throwing', () => {
  it('demo() prints and returns', () => {
    const captured: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => {
      captured.push(args.map(String).join(' '));
    };
    try {
      ch07Demo();
    } finally {
      console.log = orig;
    }
    expect(captured.length).toBeGreaterThan(5);
    for (const line of captured) {
      expect(line.startsWith('[07]')).toBe(true);
    }
  });
});
