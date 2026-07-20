import { describe, it, expect } from 'vitest';
import { app, lam, v } from '../../01-untyped-lambda/ast';
import { normalizesWithin } from '../sn';
import { crConverge } from '../cr';

describe('29 metatheory', () => {
  it('simply-typed terms normalize', () => {
    const t = app(lam('x', v('x')), lam('y', v('y')));
    expect(normalizesWithin(t, 200)).toBe(true);
  });

  it('Omega is non-normalizing', () => {
    const t = app(lam('x', app(v('x'), v('x'))), lam('x', app(v('x'), v('x'))));
    expect(normalizesWithin(t, 30)).toBe(false);
  });

  it('Church-Rosser: (λx.x)((λy.y) z) ≡ (λx.x) z', () => {
    const a = app(lam('x', v('x')), app(lam('y', v('y')), v('z')));
    const b = app(lam('x', v('x')), v('z'));
    expect(crConverge(a, b, 1000)).toBe(true);
  });
});
