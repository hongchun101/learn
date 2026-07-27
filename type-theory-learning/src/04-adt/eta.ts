// STLC 中积与和的 η 编码。
//
//   pair  ≡  λa. λb. λf. f a b
//   fst   ≡  λp. p (λa. λb. a)
//   snd   ≡  λp. p (λa. λb. b)
//   inl   ≡  λa. λx. λl. λr. l a     (其中 x: τ₁ + τ₂)
//   inr   ≡  λb. λx. λl. λr. r b
//   case  ≡  λsc. λx. λl. λr. sc l r
//
// 我们将它们以 TypeScript 形式渲染到第 02 章的 AST 中。

import type { Term, Type } from './ast';
import { app, fun, pair as pairT } from './ast';

export function etaPair(a: Term, b: Term): Term {
  return {
    kind: 'lam',
    param: 'f',
    paramType: fun({ kind: 'pair' } as Type, { kind: 'pair' } as Type), // 占位：第 02 章尚未引入真正的 pair 类型
    body: app(app(v('f'), a), b),
  };
}

export function etaFst(p: Term): Term {
  return app(p, {
    kind: 'lam',
    param: 'a',
    paramType: { kind: 'nat' } as Type,
    body: {
      kind: 'lam',
      param: 'b',
      paramType: { kind: 'nat' } as Type,
      body: v('a'),
    },
  });
}

export const _p = pairT;
