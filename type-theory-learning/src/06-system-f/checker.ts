// @ts-nocheck
// Kind-environment based System F checker with bidirectional modes.

import type { Term, Type, Var } from './ast';

export class TypeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TypeError';
  }
}

export interface KindEnv {
  vars: ReadonlySet<Var>;
}
export interface TermEnv {
  bindings: Record<Var, Type>;
}
export interface Env {
  kind: KindEnv;
  term: TermEnv;
}

export const emptyEnv: Env = {
  kind: { vars: new Set() },
  term: { bindings: {} },
};

export function extendKind(env: KindEnv, x: Var): KindEnv {
  return { vars: new Set([...env.vars, x]) };
}
export function extendTerm(env: TermEnv, x: Var, τ: Type): TermEnv {
  return { bindings: { ...env.bindings, [x]: τ } };
}
export function extendEnv(env: Env, x: Var, τ: Type): Env {
  return { kind: env.kind, term: extendTerm(env.term, x, τ) };
}

function typeEq(a: Type, b: Type, env: KindEnv): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'var':
      return a.name === b.name;
    case 'fun':
      return typeEq(a.param, b.param, env) && typeEq(a.body, b.body, env);
    case 'all':
      return typeEq(a.body, (b as { body: Type }).body, extendKind(env, a.var));
  }
}

export function infer(env: Env, t: Term): Type {
  switch (t.kind) {
    case 'var': {
      const τ = env.term.bindings[t.name];
      if (τ === undefined) throw new TypeError(`unbound var ${t.name}`);
      return τ;
    }
    case 'tlam':
      return {
        kind: 'all',
        var: t.var,
        body: infer({ kind: extendKind(env.kind, t.var), term: env.term }, t.body),
      };
    case 'tapp': {
      const τ = infer(env, t.expr);
      if (τ.kind !== 'all') throw new TypeError('tapp of non-forall');
      return substType(τ.var, t.type, τ.body);
    }
    case 'lam': {
      const innerEnv = extendEnv(env, t.param, t.paramType);
      const innerBody = infer(innerEnv, t.body);
      return { kind: 'fun', param: t.paramType, body: innerBody };
    }
    case 'app': {
      const τ1 = infer(env, t.func);
      if (τ1.kind !== 'fun') throw new TypeError('app of non-function');
      check(env, t.arg, τ1.param);
      return τ1.body;
    }
    case 'true':
    case 'false':
      return { kind: 'var', name: 'Bool' };
  }
}

export function check(env: Env, t: Term, expected: Type): Type {
  switch (t.kind) {
    case 'lam': {
      if (expected.kind !== 'fun') throw new TypeError('expected function');
      const out = infer(env, t);
      if (!typeEq(out, expected, env.kind)) throw new TypeError('lam type mismatch');
      return out;
    }
    default:
      return infer(env, t);
  }
}

function substType(x: Var, τ: Type, σ: Type): Type {
  switch (σ.kind) {
    case 'var':
      return σ.name === x ? τ : σ;
    case 'fun':
      return {
        kind: 'fun',
        param: substType(x, τ, σ.param),
        body: substType(x, τ, σ.body),
      };
    case 'all':
      if (σ.var === x) return σ;
      return { kind: 'all', var: σ.var, body: substType(x, τ, σ.body) };
  }
}
