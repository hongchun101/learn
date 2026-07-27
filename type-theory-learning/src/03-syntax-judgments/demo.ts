// 第 03 章的 demo。

import { arithmeticGrammar, render } from './bnf';
import type { ProofTree, Rule } from './judgment';
import { checkProof } from './prover';
import { fun } from '../02-stlc/ast';

export function runDemo(): void {
  // BNF 渲染。
  console.log('[bnf]\n' + render(arithmeticGrammar));

  // 一个在 Bool 上的 identity 证明：  ⊦ λx:Bool. x  :  Bool → Bool
  const bool = { kind: 'bool' } as const;

  const varRule: Rule = {
    name: 'VAR',
    premises: [],
    conclusion: { kind: 'hasType', env: [['x', bool]], term: 'x', type: bool },
  };
  const lamRule: Rule = {
    name: 'LAM',
    premises: [
      { kind: 'hasType', env: [['x', bool]], term: 'x', type: bool },
    ],
    conclusion: {
      kind: 'hasType',
      env: [],
      term: 'λx:Bool.x',
      type: fun(bool, bool),
    },
  };
  const proof: ProofTree = { rule: lamRule, subProofs: [{ rule: varRule, subProofs: [] }] };
  checkProof(proof);
  console.log('[proof]  ⊢ λx:Bool.x : Bool → Bool  ✓');
  console.log('[ok]  Chapter 03 demo finished');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runDemo();
}
