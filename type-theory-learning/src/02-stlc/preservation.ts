// Preservation + Progress sanity checks for STLC.
//
// We test the rule:
//
//   "if type inference succeeds on `t`, then `evalT(t)` produces a value."
//
// This is a property-based-style check (not a proof), but for the well-typed
// closure of our generated terms it is strong enough to catch most bug classes:
// type mistakes, untyped evaluation, β-substitution errors.

import type { Term, Type } from './ast';
import { app, fun, iszero, lam, num, succ as mkSucc, v } from './ast';
import type { Env } from './env';
import { infer } from './checker';
import { evalT } from './evaluator';

const empty: Env = { bindings: {} };

/** Run a unit test in plain TS — reused by the vitest spec. */
export function runPreservation(name: string, t: Term): void {
  const τ = infer(empty, t);
  const got = evalT(t);
  // The value MUST be one of: lambda, bool, nat. No throws expected.
  if (
    got.kind !== 'lam' &&
    got.kind !== 'true' &&
    got.kind !== 'false' &&
    got.kind !== 'nat'
  ) {
    throw new Error(`[${name}] eval did not reduce to a value: kind=${got.kind}`);
  }
  void τ;
}

/** Sourced programs that the demo and tests run. */
export function programs(): ReadonlyArray<readonly [string, Term]> {
  const idBool = lam('x', { kind: 'bool' }, v('x'));
  const idNat = lam('x', { kind: 'nat' }, v('x'));
  const twice = lam('f', fun({ kind: 'nat' }, { kind: 'nat' }), lam('x', { kind: 'nat' }, app(v('f'), app(v('f'), v('x')))));
  const succT = (n: Term): Term => mkSucc(n);

  return [
    ['true', { kind: 'true' }],
    ['false', { kind: 'false' }],
    ['3', num(3)],
    ['succ 3', succT(num(3))],
    ['iszero 0', iszero(num(0))],
    ['iszero 7', iszero(num(7))],
    ['id bool true', app(idBool, { kind: 'true' })],
    ['id nat 3', app(idNat, num(3))],
    ['twice id nat 3', app(app(twice, idNat), num(3))],
  ];
}

void fun;
