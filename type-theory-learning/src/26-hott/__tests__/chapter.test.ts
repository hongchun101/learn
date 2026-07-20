import { describe, it, expect } from 'vitest';
import { concat, refl, transport } from '../paths';

describe('26 HoTT paths', () => {
  it('refl reflexive path', () => {
    const p = refl(7);
    expect(p.lies(0.3)).toBe(7);
  });

  it('concat refls is refl', () => {
    const p = concat(refl(1), refl(1));
    expect(p.lies(0.3)).toBe(1);
  });

  it('transport through path', () => {
    const p = {
      from: 1,
      to: 5,
      lies: (t: number) => 1 + (5 - 1) * t,
    };
    expect(transport(p, (n: number) => n * n, 1)).toBe(25);
  });
});
