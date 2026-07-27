// 第 03 章的 Vitest 测试。

import { describe, it, expect } from 'vitest';
import { arithmeticGrammar, render } from '../bnf';
import { checkProof, ProofError } from '../prover';
import type { ProofTree, Rule } from '../judgment';
import { fun } from '../../02-stlc/ast';

const bool = { kind: 'bool' } as const;
const nat = { kind: 'nat' } as const;
const boolToBool = fun(bool, bool);

describe('03 BNF', () => {
  it('renders a textbook grammar', () => {
    const out = render(arithmeticGrammar);
    expect(out).toContain('E ::=');
    expect(out).toContain('n');
  });
});

describe('03 proof checker', () => {
  function identityProof(): ProofTree {
    const varRule: Rule = {
      name: 'VAR',
      premises: [],
      conclusion: { kind: 'hasType', env: [['x', bool]], term: 'x', type: bool },
    };
    const lamRule: Rule = {
      name: 'LAM',
      premises: [{ kind: 'hasType', env: [['x', bool]], term: 'x', type: bool }],
      conclusion: { kind: 'hasType', env: [], term: 'λx:Bool.x', type: boolToBool },
    };
    return { rule: lamRule, subProofs: [{ rule: varRule, subProofs: [] }] };
  }

  it('accepts a well-formed proof of λx:Bool.x : Bool → Bool', () => {
    expect(() => checkProof(identityProof())).not.toThrow();
  });

  it('rejects VAR when variable not in environment', () => {
    const bad: ProofTree = {
      rule: {
        name: 'VAR',
        premises: [],
        conclusion: { kind: 'hasType', env: [], term: 'x', type: bool },
      },
      subProofs: [],
    };
    expect(() => checkProof(bad)).toThrow(ProofError);
  });

  it('rejects LAM whose body type does not match', () => {
    const varRule: Rule = {
      name: 'VAR',
      premises: [],
      conclusion: { kind: 'hasType', env: [['x', bool]], term: 'x', type: nat },
    };
    const lam: ProofTree = {
      rule: {
        name: 'LAM',
        premises: [{ kind: 'hasType', env: [['x', bool]], term: 'x', type: nat }],
        conclusion: { kind: 'hasType', env: [], term: 'λx:Bool.x', type: boolToBool },
      },
      subProofs: [{ rule: varRule, subProofs: [] }],
    };
    expect(() => checkProof(lam)).toThrow(ProofError);
  });

  it('accepts APP proof using two sub-proofs', () => {
    // id : Bool → Bool，应用于 true（Bool），得到 Bool。
    const idApp: ProofTree = {
      rule: {
        name: 'APP',
        premises: [
          { kind: 'hasType', env: [['id', boolToBool]], term: 'id', type: boolToBool },
          { kind: 'hasType', env: [['id', boolToBool]], term: 'true', type: bool },
        ],
        conclusion: { kind: 'hasType', env: [], term: 'id true', type: bool },
      },
      subProofs: [
        identityProof(),
        {
          rule: {
            name: 'TRUE',
            premises: [],
            conclusion: { kind: 'hasType', env: [], term: 'true', type: bool },
          },
          subProofs: [],
        },
      ],
    };
    expect(() => checkProof(idApp)).not.toThrow();
  });
});
