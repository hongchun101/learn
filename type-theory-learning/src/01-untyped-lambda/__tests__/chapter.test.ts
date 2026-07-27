// 第 01 章的 Vitest 测试。
//
// 本章中每一个断言都对应一个被检验的命题。

import { describe, it, expect } from 'vitest';

import { app, equal, lam, pretty, v } from '../ast';
import { alphaEq, free, freshName, subst } from '../subst';
import { parse, ParseError } from '../parser';
import { evalCBV, evalNormalOrder, isRedex, isValue, NonNormalizable, step } from '../evaluator';
import * as C from '../church';

describe('01 syntax', () => {
  it('pretty prints var/lam/app with correct parentheses', () => {
    expect(pretty(v('x'))).toBe('x');
    expect(pretty(lam('x', v('x')))).toBe('λx.x');
    expect(pretty(app(lam('x', v('x')), v('y')))).toBe('(λx.x) y');
    expect(pretty(app(app(v('f'), v('x')), v('y')))).toBe('f x y');
  });

  it('structural equality', () => {
    const t = app(lam('x', v('x')), v('y'));
    expect(equal(t, t)).toBe(true);
    expect(equal(lam('x', v('x')), lam('y', v('y')))).toBe(false);
  });
});

describe('01 free / α-equivalence / substitution', () => {
  it('free variables', () => {
    expect(free(lam('x', v('y')))).toEqual(new Set(['y']));
    expect(free(app(v('x'), lam('y', v('z'))))).toEqual(new Set(['x', 'z']));
  });

  it('α-equivalence normalizes binders', () => {
    const a = lam('x', v('x'));
    const b = lam('y', v('y'));
    expect(alphaEq(a, b)).toBe(true);
    const c = lam('x', v('y'));
    expect(alphaEq(a, c)).toBe(false);
  });

  it('subst shadows properly', () => {
    const t = lam('x', v('x')); // λx.x
    const out = subst('x', v('z'), t); // [x ↦ z] λx.x  = λx.x  (shadow)
    expect(equal(out, t)).toBe(true);
  });

  it('subst captures safely under binder', () => {
    const t = lam('x', v('y')); // λx.y
    const sub = subst('y', v('x'), t); // [y ↦ x] λx.y  ⇒ binder renamed ⇒ λz.x
    expect(free(sub).has('y')).toBe(false);
  });

  it('freshName avoids the set', () => {
    expect(freshName('x', new Set(['x']))).toBe('x0');
    expect(freshName('x', new Set(['y']))).toBe('x');
  });
});

describe('01 parser', () => {
  it('parses λx.x', () => {
    expect(equal(parse('λx.x'), lam('x', v('x')))).toBe(true);
  });

  it('prefers left-associative application', () => {
    const t = parse('f x y');
    expect(equal(t, app(app(v('f'), v('x')), v('y')))).toBe(true);
  });

  it('curries λx.λy.', () => {
    const t = parse('λx.λy. x y');
    expect(equal(t, lam('x', lam('y', app(v('x'), v('y')))))).toBe(true);
  });

  it('rejects malformed input', () => {
    expect(() => parse('(')).toThrow(ParseError);
  });
});

describe('01 evaluation', () => {
  it('isValue identifies lambdas', () => {
    expect(isValue(lam('x', v('x')))).toBe(true);
    expect(isValue(app(lam('x', v('x')), v('y')))).toBe(false);
  });

  it('β step on redex', () => {
    const t = app(lam('x', v('x')), v('y'));
    expect(pretty(step(t))).toBe('y');
    expect(isRedex(t)).toBe(true);
  });

  it('normal-order reduces omega to itself forever (no NF within fuel)', () => {
    const omega = app(lam('x', app(v('x'), v('x'))), lam('x', app(v('x'), v('x'))));
    expect(() => evalNormalOrder(omega, 50)).toThrow(NonNormalizable);
  });

  it('normal-order on I I reduces to I', () => {
    const t = app(lam('x', v('x')), lam('y', v('y')));
    const nf = evalNormalOrder(t);
    expect(equal(nf, lam('y', v('y')))).toBe(true);
  });

  it('call-by-value reduces `(λx.x) ((λy.λz.z) y)` to `λz.z`', () => {
    const t = parse('(λx.x) ((λy.λz.z) y)');
    const nf = evalCBV(t);
    expect(equal(nf, lam('z', v('z')))).toBe(true);
  });
});

describe('01 Church encodings', () => {
  it('tru/false apply correctly', () => {
    const tru = evalNormalOrder(app(app(C.tru, v('a')), v('b')));
    const fls = evalNormalOrder(app(app(C.fls, v('a')), v('b')));
    expect(equal(tru, v('a'))).toBe(true);
    expect(equal(fls, v('b'))).toBe(true);
  });

  it('succ(succ(0)) reduces to λf.λx. f (f (f x))', () => {
    // 绑定语义：把 succ 和 zero 应用进去，与 `3` 比较。
    const t = C.succ(C.succ(C.succ(C.zero)));
    const got = evalNormalOrder(
      app(app(t, lam('n', app(v('n'), v('n')))), v('z')),
      1000,
    );
    // 把 `3` 底层的 f 应用三次。使用 succ（S）和 0（'z'）。
    const expect3 = parse('(λf.λx.f (f (f x)))');
    const want = evalNormalOrder(
      app(app(expect3, lam('n', app(v('n'), v('n')))), v('z')),
      1000,
    );
    expect(equal(got, want)).toBe(true);
  });

  it('succ(0) applied to (λn.n n) and z reduces to (z z)', () => {
    const got = evalNormalOrder(
      app(app(C.succ(C.zero), lam('n', app(v('n'), v('n')))), v('z')),
      500,
    );
    expect(equal(got, app(v('z'), v('z')))).toBe(true);
  });

  it('isZero 0 reduces to TRUE-shaped term', () => {
    const z = evalNormalOrder(C.isZero(C.zero));
    expect(equal(z, C.tru)).toBe(true);
  });

  it('pair fst/snd via direct AST (not raw parser)', () => {
    const p = lam('f', app(app(v('f'), v('a')), v('b')));
    expect(equal(evalNormalOrder(C.fst(p)), v('a'))).toBe(true);
    expect(equal(evalNormalOrder(C.snd(p)), v('b'))).toBe(true);
  });

  it('nil is a value (no head)', () => {
    expect(isValue(C.nil)).toBe(true);
  });

  it('Y combinator unfolding', () => {
    const f = lam('g', lam('x', v('x')));
    const yFix = app(C.Y, f);
    const oneStep = evalNormalOrder(yFix, 50);
  });
});
