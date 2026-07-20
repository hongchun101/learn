import { describe, it, expect } from 'vitest';
import { emptyUses, use, unusedOk } from '../usage';

describe('20 linear / affine usage', () => {
  it('linear tracks a single use', () => {
    const s1 = use(emptyUses, 'x', 'linear');
    expect(unusedOk('linear', s1.uses.get('x') ?? 0)).toBe(true);
  });

  it('linear throws on second use', () => {
    expect(() => {
      const s = use(emptyUses, 'x', 'linear');
      use(s, 'x', 'linear');
    }).toThrow();
  });

  it('affine permits 0 or 1 uses', () => {
    expect(unusedOk('affine', 1)).toBe(true);
    expect(unusedOk('affine', 0)).toBe(true);
    expect(unusedOk('affine', 2)).toBe(false);
  });
});
