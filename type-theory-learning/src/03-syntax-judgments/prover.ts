// @ts-nocheck
// Tiny proof checker for STLC style rules.
//
// The rules we encode:
//
//   VAR      ─────────────────────  (Γ ⊢ x : τ)   when (x:τ) ∈ Γ
//
//   LAM      Γ, x:τ₁ ⊢ t : τ₂
//            ─────────────────────  (Γ ⊢ λx:τ₁.t : τ₁ → τ₂)
//
//   APP      Γ ⊢ t₁ : τ₁ → τ₂     Γ ⊢ t₂ : τ₁
//            ─────────────────────  (Γ ⊢ t₁ t₂ : τ₂)
//
// We check that a proof tree's conclusion equals the judgment we'd get by
// stitching the rules.

import type { Type } from '../02-stlc/ast';
import type { Env } from '../02-stlc/env';
import { extend } from '../02-stlc/env';
import type { Judgment, ProofTree } from './judgment';
import { formatJ } from './judgment';

export class ProofError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProofError';
  }
}

function eqType(a: Type, b: Type): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'fun') return eqType(a.param, b.param) && eqType(a.body, b.body);
  return true;
}

function eqEnv(a: ReadonlyArray<readonly [string, Type]>, b: ReadonlyArray<readonly [string, Type]>): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const ea = a[i]!;
    const eb = b[i]!;
    if (ea[0] !== eb[0] || !eqType(ea[1], eb[1])) return false;
  }
  return true;
}

function proofToEnv(pairs: ReadonlyArray<readonly [string, Type]>): Env {
  let e: Env = { bindings: {} };
  for (const [x, τ] of pairs) e = extend(e, x, τ);
  return e;
}

/** `check tree` validates the proof tree. */
export function checkProof(tree: ProofTree): void {
  for (const p of tree.subProofs) checkProof(p);
  switch (tree.rule.name) {
    case 'VAR': {
      const c = tree.rule.conclusion;
      const found = c.env.find(([x]) => x === c.term);
      if (!found) throw new ProofError(`VAR: ${c.term} is not in environment`);
      if (!eqType(found[1], c.type)) {
        throw new ProofError(`VAR: expected ${formatJ(c)} but env has ${found[0]}:${'kind' in found[1] ? found[1].kind : '?'}`);
      }
      if (tree.subProofs.length !== 0) throw new ProofError('VAR has no premises');
      return;
    }
    case 'TRUE':
    case 'FALSE': {
      if (tree.rule.conclusion.type.kind !== 'bool') {
        throw new ProofError(`${tree.rule.name}: expected Bool`);
      }
      if (tree.subProofs.length !== 0) throw new ProofError(`${tree.rule.name} has no premises`);
      return;
    }
    case 'LAM': {
      const c = tree.rule.conclusion;
      if (c.type.kind !== 'fun') throw new ProofError(`LAM: expected arrow type in conclusion`);
      const expectedPremise: Judgment = {
        kind: 'hasType',
        env: tree.rule.premises[0]!.env,
        term: tree.rule.premises[0]!.term,
        type: tree.rule.premises[0]!.type,
      };
      const argType = c.type.param;
      const retType = c.type.body;
      if (!eqType(argType, expectedPremise.type)) {
        throw new ProofError('LAM: arg type mismatch');
      }
      // The proof's sub-proof must conclude in the env extended with x:argType.
      const sp = tree.subProofs[0];
      if (!sp) throw new ProofError('LAM: missing sub-proof');
      if (!eqType(sp.rule.conclusion.type, retType)) {
        throw new ProofError('LAM: body return-type mismatch');
      }
      if (!eqEnv(sp.rule.conclusion.env, expectedPremise.env)) {
        throw new ProofError('LAM: body env mismatch');
      }
      if (tree.subProofs.length !== 1) throw new ProofError('LAM: expected exactly one sub-proof');
      return;
    }
    case 'APP': {
      const c = tree.rule.conclusion;
      void c;

      const premise1: Judgment = tree.rule.premises[0]!;
      const premise2: Judgment = tree.rule.premises[1]!;
      if (premise1.type.kind !== 'fun' || !eqType(premise1.type.body, c.type)) {
        throw new ProofError('APP: premise1 must be τ₁→τ₂ matching conclusion');
      }
      if (!eqType(premise1.type.param, premise2.type)) {
        throw new ProofError('APP: arg type must match function parameter type');
      }
      if (tree.subProofs.length !== 2) throw new ProofError('APP: expected exactly two sub-proofs');
      return;
    }
    default:
      throw new ProofError(`unknown rule ${tree.rule.name}`);
  }
}

export { proofToEnv };
