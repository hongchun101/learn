// η-encodings for products and sums in STLC.
//
//   pair  ≡  λa. λb. λf. f a b
//   fst   ≡  λp. p (λa. λb. a)
//   snd   ≡  λp. p (λa. λb. b)
//   inl   ≡  λa. λx. λl. λr. l a     (where x: τ₁ + τ₂)
//   inr   ≡  λb. λx. λl. λr. r b
//   case  ≡  λsc. λx. λl. λr. sc l r
//
// We expose them as TypeScript renderings into Ch02's AST.

import type { Term, Type } from './ast';
import { app, fun, pair as pairT } from './ast';

export function etaPair(a: Term, b: Term): Term {
  return {
    kind: 'lam',
    param: 'f',
    paramType: fun({ kind: 'pair' } as Type, { kind: 'pair' } as Type), // placeholder: ch02 lacks proper pair
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
