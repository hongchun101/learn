import { describe, it, expect } from 'vitest';
import { packSigma, first, second } from '../sigmas';

describe('11 Pi/Sigma', () => {
  it('Sigma packs a pair (a, b(a))', () => {
    const s = packSigma(3, (n: number) => n * 2);
    expect(first(s)).toBe(3);
    expect(second(s)).toBe(6);
  });

  it('Pi unfolds under application', () => {
    const f = (n: number) => n + 1;
    expect(f(3)).toBe(4);
  });
});
