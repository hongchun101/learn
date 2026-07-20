import { describe, it, expect } from 'vitest';
import { rowHas, rowProject, rowUnion } from '../infer';
import type { Row } from '../ast';

function open(parts: ReadonlyArray<readonly [string, import('../ast').Type]>, tail?: string): Row {
  let r: Row = tail ? { kind: 'open_var', name: tail } : { kind: 'closed' };
  for (let i = parts.length - 1; i >= 0; i--) {
    const [lbl, ty] = parts[i]!;
    r = { kind: 'open', row: r, label: lbl, field: ty };
  }
  return r;
}

describe('09 row polymorphism', () => {
  it('union is symmetric for non-overlapping rows', () => {
    const a = open([['a', { kind: 'int' }]]);
    const b = open([['b', { kind: 'bool' }]]);
    expect(rowHas(rowUnion(a, b), 'a')).toBe(true);
    expect(rowHas(rowUnion(a, b), 'b')).toBe(true);
  });

  it('projection looks up a label', () => {
    const r = open([
      ['x', { kind: 'int' }],
      ['y', { kind: 'bool' }],
    ]);
    expect(rowProject(r, 'y')!.kind).toBe('bool');
    expect(rowProject(r, 'missing')).toBeUndefined();
  });
});
