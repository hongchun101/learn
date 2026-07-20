// Bidirectional type checker with product, sum, record, variant.

import type { Term, Type, Var } from './ast';
import { typeEq } from './ast';

export class TypeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TypeError';
  }
}

export interface Env {
  bindings: Record<Var, Type>;
}
export const emptyEnv: Env = { bindings: {} };
export function extend(env: Env, x: Var, τ: Type): Env {
  return { bindings: { ...env.bindings, [x]: τ } };
}
export function lookup(env: Env, x: Var): Type | undefined {
  return env.bindings[x];
}

function look(env: Env, x: Var): Type {
  const τ = lookup(env, x);
  if (τ === undefined) throw new TypeError(`unbound ${x}`);
  return τ;
}

export function infer(env: Env, t: Term): Type {
  switch (t.kind) {
    case 'var':
      return look(env, t.name);
    case 'lam': {
      const inner = infer(extend(env, t.param, t.paramType), t.body);
      return { kind: 'fun', param: t.paramType, body: inner };
    }
    case 'app': {
      const τ1 = infer(env, t.func);
      if (τ1.kind !== 'fun') throw new TypeError('app of non-function');
      check(env, t.arg, τ1.param);
      return τ1.body;
    }
    case 'true':
    case 'false':
      return { kind: 'bool' };
    case 'nat':
      return { kind: 'nat' };
    case 'succ':
      check(env, t.expr, { kind: 'nat' });
      return { kind: 'nat' };
    case 'iszero':
      check(env, t.expr, { kind: 'nat' });
      return { kind: 'bool' };
    case 'pair': {
      return { kind: 'pair', left: infer(env, t.left), right: infer(env, t.right) };
    }
    case 'fst': {
      const τ = infer(env, t.expr);
      if (τ.kind !== 'pair') throw new TypeError('fst of non-pair');
      return τ.left;
    }
    case 'snd': {
      const τ = infer(env, t.expr);
      if (τ.kind !== 'pair') throw new TypeError('snd of non-pair');
      return τ.right;
    }
    case 'inl':
      return { kind: 'sum', left: infer(env, t.expr), right: t.ofRight };
    case 'inr':
      return { kind: 'sum', left: t.ofLeft, right: infer(env, t.expr) };
    case 'case': {
      // Without an expected type, we infer using a default expected `Bool`. Tests
      // should call `check(env, case, τ)` with the desired result type.
      return checkCase(env, t, { kind: 'bool' });
    }
    case 'record': {
      const fields: Array<[string, Type]> = [];
      for (const [k, sub] of t.fields) fields.push([k, infer(env, sub)]);
      return { kind: 'record', fields };
    }
    case 'proj': {
      const τ = infer(env, t.expr);
      if (τ.kind !== 'record') throw new TypeError('proj of non-record');
      const f = τ.fields.find(([k]) => k === t.label);
      if (!f) throw new TypeError(`no field ${t.label}`);
      return f[1];
    }
    case 'tag':
      throw new TypeError('tag requires expected variant type (use check)');
    case 'caseTag':
      return checkCaseTag(env, t, { kind: 'bool' });
  }
}

export function check(env: Env, t: Term, expected: Type): Type {
  switch (t.kind) {
    case 'lam': {
      if (expected.kind !== 'fun') throw new TypeError('expected function');
      if (!typeEq(t.paramType, expected.param)) throw new TypeError('lam param mismatch');
      const out = check(extend(env, t.param, expected.param), t.body, expected.body);
      void out;
      return expected;
    }
    case 'tag': {
      if (expected.kind !== 'variant') throw new TypeError('tag requires variant type');
      const alt = expected.alts.find(([k]) => k === t.tag);
      if (!alt) throw new TypeError(`no alt ${t.tag} in expected type`);
      check(env, t.expr, alt[1]);
      return expected;
    }
    case 'case':
      return checkCase(env, t, expected);
    case 'caseTag':
      return checkCaseTag(env, t, expected);
    default: {
      const got = infer(env, t);
      if (!typeEq(expected, got)) {
        throw new TypeError(`expected ${JSON.stringify(expected)} but got ${JSON.stringify(got)}`);
      }
      return got;
    }
  }
}

function checkCase(env: Env, t: Term & { kind: 'case' }, expected: Type): Type {
  const τ = infer(env, t.scrut);
  if (τ.kind !== 'sum') throw new TypeError('case of non-sum');
  const a = check(extend(env, t.leftVar, τ.left), t.leftBranch, expected);
  const b = check(extend(env, t.rightVar, τ.right), t.rightBranch, expected);
  if (!typeEq(a, b)) throw new TypeError('case arms do not agree');
  return expected;
}

function checkCaseTag(
  env: Env,
  t: Term & { kind: 'caseTag' },
  expected: Type,
): Type {
  const τ = infer(env, t.scrut);
  if (τ.kind !== 'variant') throw new TypeError('caseTag of non-variant');
  for (const [label, varName, arm] of t.alts) {
    const a = τ.alts.find(([k]) => k === label);
    if (!a) throw new TypeError(`unknown alt ${label}`);
    const out = check(extend(env, varName, a[1]), arm, expected);
    if (!typeEq(out, expected)) throw new TypeError('caseTag arm mismatch');
  }
  return expected;
}
