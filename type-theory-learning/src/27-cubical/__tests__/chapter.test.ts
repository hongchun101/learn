import { describe, it, expect } from 'vitest';
import { pathFromCoe, pathOfTuples } from '../cubical';

describe('27 cubical paths', () => {
  it('pathFromCoe endpoints', () => {
    const p = pathFromCoe(1, 5, (i) => 1 + (5 - 1) * i);
    expect(p.coe(0)).toBe(1);
    expect(p.coe(1)).toBe(5);
  });

  it('product path', () => {
    const p = pathOfTuples(pathFromCoe(1, 2, (i) => 1 + i), pathFromCoe('a', 'b', (i) => (i < 0.5 ? 'a' : 'b')));
    expect(p.coe(1)).toEqual([2, 'b']);
  });
});
