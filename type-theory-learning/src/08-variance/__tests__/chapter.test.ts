import { describe, it, expect } from 'vitest';
import { varianceAtPosition } from '../variance';
import { addCm, addM, m, cm } from '../phantom';

describe('08 variance', () => {
  it('functions are (parametric — neither covariant nor contravariant)', () => {
    const t = { kind: 'fun' as const, param: { kind: 'var' as const, name: 'α' }, body: { kind: 'var' as const, name: 'β' } };
    const r = varianceAtPosition('funBody', t);
    expect(r).toBe('covariant');
  });

  it('phantom-marked length compiles and works', () => {
    const total = addM(m(2), m(3));
    expect(total.value).toBe(5);
  });

  it('phantom refuses mismatched unit at compile-time', () => {
    const total = addCm(cm(20), cm(50));
    expect(total.value).toBe(70);
  });
});
