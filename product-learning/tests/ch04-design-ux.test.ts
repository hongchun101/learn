import { describe, it, expect } from 'vitest';
import {
  walkIa,
  nodeCount,
  maxDepth,
  nodeDepth,
  cardSortAgreement,
  fanOutViolations,
  orphanPages,
  canReach,
  happyPath,
  walkFlow,
  deadEnds,
  unrecoveredErrors,
  stepCount,
  relativeLuminance,
  contrastRatio,
  evaluateContrast,
  runFormChecks,
  isTouchTargetCompliant,
  groupByHeuristic,
  worstHeuristics,
  auditScore,
  type IaNode,
  type UserFlow,
  type HeuristicFinding,
  type FormField,
  demo as ch04Demo,
} from '../src/04-design-ux/index.js';

describe('04 — information architecture', () => {
  const tree: IaNode = {
    id: 'root',
    label: 'r',
    children: [
      { id: 'a', label: 'a', children: [{ id: 'a1', label: 'a1', children: [] }] },
      { id: 'b', label: 'b', children: [] },
    ],
  };

  it('walks every node', () => {
    const ids = [...walkIa(tree)].map((n) => n.id);
    expect(ids).toEqual(['root', 'a', 'a1', 'b']);
  });

  it('counts nodes', () => {
    expect(nodeCount(tree)).toBe(4);
  });

  it('max depth', () => {
    expect(maxDepth(tree)).toBe(2);
  });

  it('nodeDepth finds a node', () => {
    expect(nodeDepth(tree, 'a1')).toBe(2);
    expect(nodeDepth(tree, 'root')).toBe(0);
    expect(nodeDepth(tree, 'nope')).toBe(-1);
  });

  it('cardSortAgreement is 0 when all match, 1 when all disagree', () => {
    expect(
      cardSortAgreement(
        [{ id: '1', group: 'A' }],
        [{ id: '1', group: 'A' }],
      ),
    ).toBe(0);
    expect(
      cardSortAgreement(
        [{ id: '1', group: 'A' }],
        [{ id: '1', group: 'B' }],
      ),
    ).toBe(1);
  });

  it('fanOutViolations flags parents with too many children', () => {
    const big: IaNode = {
      id: 'p',
      label: 'p',
      children: Array.from({ length: 9 }, (_, i) => ({ id: `c${i}`, label: 'c', children: [] })),
    };
    expect(fanOutViolations(big)).toEqual([{ parentId: 'p', childCount: 9 }]);
    expect(fanOutViolations(big, 10)).toEqual([]);
  });

  it('orphanPages finds pages with no inbound', () => {
    const orphans = orphanPages(['home', 'about', 'x'], [{ from: 'home', to: 'about' }]);
    // home has no inbound link, about is reached, x has no inbound link
    expect(orphans).toEqual(['home', 'x']);
  });

  it('canReach is true/false correctly', () => {
    const links = [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
    ];
    expect(canReach(links, 'a', 'c')).toBe(true);
    expect(canReach(links, 'a', 'z')).toBe(false);
  });
});

describe('04 — user flow', () => {
  const flow: UserFlow = {
    id: 'F1',
    name: 'add task',
    entry: 'home',
    steps: [
      { state: 'home', action: { kind: 'click', target: 'add' }, next: 'form' },
      { state: 'form', action: { kind: 'submit', form: 't' }, next: 'saved' },
    ],
    happyPath: ['form', 'saved'],
  };

  it('happyPath includes entry and all happy states', () => {
    expect(happyPath(flow)).toEqual(['home', 'form', 'saved']);
  });

  it('walkFlow follows the path until dead end', () => {
    expect(walkFlow(flow)).toEqual(['home', 'form', 'saved']);
  });

  it('deadEnds returns nodes with no outgoing step', () => {
    expect(deadEnds(flow)).toContain('saved');
  });

  it('unrecoveredErrors detects self-loops on error', () => {
    const f: UserFlow = {
      id: 'F',
      name: 'f',
      entry: 'a',
      steps: [
        { state: 'a', action: { kind: 'click', target: 'x' }, next: 'b' },
        { state: 'b', action: { kind: 'error', message: 'oh' }, next: 'b' },
      ],
      happyPath: ['b'],
    };
    expect(unrecoveredErrors(f).length).toBe(1);
  });

  it('stepCount returns total steps', () => {
    expect(stepCount(flow)).toBe(2);
  });
});

describe('04 — accessibility', () => {
  it('relativeLuminance of black is 0, white is 1', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#ffffff')).toBe(1);
  });

  it('contrast black-on-white = 21', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
  });

  it('evaluateContrast flags low contrast', () => {
    const c = evaluateContrast({ foreground: '#888888', background: '#ffffff' });
    expect(c.aaNormal).toBe(false);
  });

  it('evaluateContrast passes high contrast', () => {
    const c = evaluateContrast({ foreground: '#000000', background: '#ffffff' });
    expect(c.aaNormal).toBe(true);
    expect(c.aaaNormal).toBe(true);
  });

  it('runFormChecks detects missing labels', () => {
    const fields: FormField[] = [
      { id: 'a', label: '', type: 'text', required: false },
      { id: 'b', label: 'name', type: 'text', required: true },
    ];
    const r = runFormChecks(fields);
    expect(r[0]?.failures.length).toBeGreaterThan(0);
    expect(r[1]?.failures.length).toBe(0);
  });

  it('isTouchTargetCompliant per platform', () => {
    expect(isTouchTargetCompliant(44, 'ios')).toBe(true);
    expect(isTouchTargetCompliant(43, 'ios')).toBe(false);
    expect(isTouchTargetCompliant(48, 'android')).toBe(true);
    expect(isTouchTargetCompliant(47, 'android')).toBe(false);
  });
});

describe('04 — heuristic evaluation', () => {
  it('groupByHeuristic buckets findings', () => {
    const findings: HeuristicFinding[] = [
      { heuristic: 'consistency', severity: 'minor', screen: 'a', description: 'd' },
      { heuristic: 'consistency', severity: 'major', screen: 'b', description: 'd' },
      { heuristic: 'visibility', severity: 'critical', screen: 'c', description: 'd' },
    ];
    const g = groupByHeuristic(findings);
    expect(g.get('consistency')?.length).toBe(2);
    expect(g.get('visibility')?.length).toBe(1);
  });

  it('worstHeuristics ranks by score', () => {
    const findings: HeuristicFinding[] = [
      { heuristic: 'consistency', severity: 'major', screen: 'a', description: 'd' },
      { heuristic: 'visibility', severity: 'critical', screen: 'b', description: 'd' },
    ];
    const w = worstHeuristics(findings, 1);
    expect(w[0]?.heuristic).toBe('visibility');
  });

  it('auditScore sums severity weights', () => {
    const f: HeuristicFinding[] = [
      { heuristic: 'visibility', severity: 'critical', screen: 'a', description: 'd' },
      { heuristic: 'consistency', severity: 'minor', screen: 'b', description: 'd' },
    ];
    expect(auditScore(f)).toBe(4); // 3 + 1
  });
});

describe('04 — demo runs end-to-end without throwing', () => {
  it('demo() prints and returns', () => {
    const captured: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => {
      captured.push(args.map(String).join(' '));
    };
    try {
      ch04Demo();
    } finally {
      console.log = orig;
    }
    expect(captured.length).toBeGreaterThan(5);
    for (const line of captured) {
      expect(line.startsWith('[04]')).toBe(true);
    }
  });
});
