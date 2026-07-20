import { describe, it, expect } from 'vitest';
import { fun, tv, app, lam, tlam, tapp, v, tru } from '../ast';
import { infer, emptyEnv, extendKind } from '../checker';

const E = emptyEnv;

describe('06 System F', () => {
  it('infers id : ∀α. α → α', () => {
    const id = tlam('α', lam('x', tv('α'), v('x')));
    const τ = infer(E, id);
    expect(τ.kind).toBe('all');
  });

  it('id [Bool] applied to true has type Bool', () => {
    const id = tlam('α', lam('x', tv('α'), v('x')));
    const specialised = tapp(id, tv('Bool'));
    const applied = app(specialised, tru);
    const τ = infer(E, applied);
    expect(τ).toEqual(tv('Bool'));
  });

  it('kinds are tracked', () => {
    expect(extendKind(E.kind, 'α').vars.has('α')).toBe(true);
  });
  void fun;
  void lam;
  void v;
});
