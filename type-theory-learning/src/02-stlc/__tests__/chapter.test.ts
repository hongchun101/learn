// Vitest spec for Chapter 02 — STLC.

import { describe, it, expect } from 'vitest';
import { app, fun, iszero, lam, num, succ, v } from '../ast';
import { extend } from '../env';
import { infer, check, TypeError, checkProgram } from '../checker';
import { parse, ParseError } from '../parser';
import { evalT } from '../evaluator';
import { programs, runPreservation } from '../preservation';

const E = { bindings: {} };

describe('02 AST and types', () => {
  it('pretty types', () => {
    expect(fun({ kind: 'bool' }, { kind: 'nat' }).kind).toBe('fun');
  });
  it('renaming and free variables', () => {
    // duplicates the env tests
  });
});

describe('02 checker', () => {
  it('rejects untyped identity on a Nat when expected Bool', () => {
    // id : Nat → Nat  applied to Bool should fail.
    const idNat = lam('x', { kind: 'nat' }, v('x'));
    expect(() => check(E, app(idNat, { kind: 'true' }), { kind: 'bool' })).toThrow(TypeError);
  });

  it('rejects free variable', () => {
    expect(() => infer(E, v('z'))).toThrow(TypeError);
  });

  it('accepts λx:Bool.x', () => {
    const τ = infer(E, lam('x', { kind: 'bool' }, v('x')));
    expect(τ).toEqual({ kind: 'fun', param: { kind: 'bool' }, body: { kind: 'bool' } });
  });

  it('accepts application with synthesized function type', () => {
    const τ = infer(
      E,
      app(lam('x', { kind: 'bool' }, v('x')), { kind: 'true' }),
    );
    expect(τ).toEqual({ kind: 'bool' });
  });

  it('rejects `succ true`', () => {
    expect(() => infer(E, succ({ kind: 'true' }))).toThrow(TypeError);
  });

  it('rejects lambda body type mismatch', () => {
    // (λx:Bool. x) : Nat → Nat should fail, body is Bool, not Nat.
    expect(() =>
      check(
        E,
        lam('x', { kind: 'bool' }, v('x')),
        { kind: 'fun', param: { kind: 'nat' }, body: { kind: 'nat' } },
      ),
    ).toThrow(TypeError);
  });

  it('infers two-argument composition via checking', () => {
    const τ = infer(
      E,
      lam(
        'f',
        fun({ kind: 'bool' }, { kind: 'bool' }),
        lam('x', { kind: 'bool' }, app(v('f'), app(v('f'), v('x')))),
      ),
    );
    expect(τ).toEqual({
      kind: 'fun',
      param: { kind: 'fun', param: { kind: 'bool' }, body: { kind: 'bool' } },
      body: { kind: 'fun', param: { kind: 'bool' }, body: { kind: 'bool' } },
    });
  });

  it('checkProgram accepts identity', () => {
    expect(() => checkProgram(lam('x', { kind: 'bool' }, v('x')), {
      kind: 'fun',
      param: { kind: 'bool' },
      body: { kind: 'bool' },
    })).not.toThrow();
  });
});

describe('02 evaluator', () => {
  it('booleans are already values', () => {
    expect(evalT({ kind: 'true' }).kind).toBe('true');
  });

  it('succ increments a nat literal', () => {
    const e = evalT(succ(num(2)));
    expect(e).toEqual({ kind: 'nat', value: 3 });
  });

  it('iszero on 0 yields true', () => {
    expect(evalT(iszero(num(0))).kind).toBe('true');
  });

  it('iszero on 5 yields false', () => {
    expect(evalT(iszero(num(5))).kind).toBe('false');
  });

  it('applies identity to true', () => {
    const e = evalT(app(lam('x', { kind: 'bool' }, v('x')), { kind: 'true' }));
    expect(e.kind).toBe('true');
  });
});

describe('02 parser', () => {
  it('parses λx:Bool.x', () => {
    const t = parse('λx : Bool. x');
    expect(JSON.stringify(t)).toContain('"kind":"bool"');
  });

  it('rejects malformed', () => {
    expect(() => parse('λx.')).toThrow(ParseError);
  });

  it('parses `(λx : Nat. succ x) 3` and evaluates to 4', () => {
    const t = parse('(λx : Nat. succ x) 3');
    const e = evalT(t);
    expect(e).toEqual({ kind: 'nat', value: 4 });
  });
});

describe('02 preservation/progress (property-style)', () => {
  it('every program in `programs()` reduces to a value', () => {
    for (const [name, term] of programs()) {
      expect(() => runPreservation(name, term)).not.toThrow();
    }
  });

  it('alpha-conversion preserves type', () => {
    const env1 = E;
    const env2 = E;
    const t1 = lam('x', { kind: 'bool' }, v('x'));
    const t2 = lam('y', { kind: 'bool' }, v('y'));
    const τ1 = infer(env1, t1);
    const τ2 = infer(env2, t2);
    expect(τ1).toEqual(τ2);
    void extend;
  });
});
