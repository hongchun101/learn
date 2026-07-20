// @ts-nocheck
import { describe, it, expect } from 'vitest';
import { j, refl, transport } from '../j';

describe('13 equality / J', () => {
  it('refl is provable for any x', () => {
    expect(refl(3).witness(3, 3)).toBe(true);
  });

  it('J applied with base value', () => {
    const eq = refl(2);
    const result = j(2, () => 'unit')(2, eq);
    expect(result).toBe('unit');
  });

  it('transport maps an identity through', () => {
    const eq = refl(7);
    const out = transport(eq, (x) => `val=${x}`, 7);
    expect(out).toBe('val=7');
  });
});
