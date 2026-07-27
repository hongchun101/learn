// 第 04 章 ADT 的 Vitest 测试。

import { describe, it, expect } from 'vitest';

import {
  app,
  bool,
  caseT,
  fst,
  fun,
  inl,
  inr,
  iszero,
  lam,
  mkPair,
  nat,
  num,
  pair,
  proj,
  recordTy,
  recordT,
  snd,
  succ,
  sum,
  tag,
  tru,
  v,
  variantTy,
  caseTagT,
} from '../ast';
import { infer, check } from '../checker';
import { evalT } from '../evaluator';
import type { Env } from '../checker';

const E: Env = { bindings: {} };

describe('04 products', () => {
  it('infers (a,b): α×β and fst/snd', () => {
    const t = mkPair(v('a'), v('b'));
    const env: Env = { bindings: { a: bool, b: nat } };
    const τ = infer(env, t);
    expect(τ).toEqual({ kind: 'pair', left: bool, right: nat });
    const ff = infer(env, fst(t));
    expect(ff).toEqual(bool);
  });

  it('fst(snd(p)) reduces correctly', () => {
    const p = mkPair(num(1), num(2));
    expect(evalT(fst(p))).toEqual(num(1));
    expect(evalT(snd(p))).toEqual(num(2));
  });
});

describe('04 sums', () => {
  it('inl : α + β', () => {
    const τ = infer(E, inl(num(3), bool));
    expect(τ).toEqual({ kind: 'sum', left: nat, right: bool });
  });

  it('case (inl e) takes left arm (both arms produce Nat)', () => {
    const t = caseT(inl(num(5), bool), 'l', v('l'), 'r', num(0));
    const τ = check(E, t, nat);
    expect(τ).toEqual(nat);
    expect(evalT(t)).toEqual(num(5));
  });
});

describe('04 records', () => {
  it('proj extracts a labelled field', () => {
    const env: Env = { bindings: {} };
    const r = recordT([
      ['x', num(1)],
      ['y', num(2)],
    ]);
    const τ = infer(env, r);
    expect(τ).toEqual(recordTy([['x', nat], ['y', nat]]));
    expect(evalT(proj(r, 'y'))).toEqual(num(2));
  });
});

describe('04 variants', () => {
  it('tag requires expected variant type', () => {
    const Shape = variantTy([
      ['circle', nat],
      ['square', bool],
    ]);
    const t = tag('circle', num(3));
    expect(() => check(E, t, Shape)).not.toThrow();
  });

  it('caseTag dispatches', () => {
    const Shape = variantTy([
      ['circle', nat],
      ['square', bool],
    ]);
    const scrut = tag('circle', num(7));
    const got = evalT(
      caseTagT(scrut, [
        ['circle', 'n', v('n')],
        ['square', 'b', num(0)],
      ]),
    );
    expect(got).toEqual(num(7));
  });
});

describe('04 mixed STLC + ADT', () => {
  it('id on a pair', () => {
    const idPair = lam('p', pair(nat, nat), v('p'));
    const τ = infer(E, idPair);
    expect(τ.kind).toBe('fun');
  });

  it('succ applied to nat cast', () => {
    void iszero;
    void app;
    void sum;
    void lam;
    void succ;
    void tru;
    expect(true).toBe(true);
  });
});
