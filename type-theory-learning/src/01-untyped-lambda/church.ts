// @ts-nocheck
// Church encodings of booleans, pairs, naturals, lists, and the Y combinator.
//
// All definitions are pure untyped lambda calculus. The chapter demonstrates
// that "data" can be encoded as behavioural descriptions.
//
//   2 ≡ λf. λx. f (f x)
//   + ≡ λm. λn. λf. λx. m f (n f x)
//   cons ≡ λh. λt. λf. f h t
//   Y   ≡ λg. (λx. g (x x)) (λx. g (x x))

import { app, lam, v } from './ast';
import type { Term } from './ast';

// Boolean
export const tru = lam('t', lam('f', v('t')));
export const fls = lam('t', lam('f', v('f')));
export const and = (p: Term, q: Term): Term => app(app(p, q), p);
export const or = (p: Term, q: Term): Term => app(app(p, p), q);
export const not = (p: Term): Term => app(app(p, fls), tru);
export const ite = (p: Term, a: Term, b: Term): Term => app(app(p, a), b);

// Church numerals:  n f x = f^n(x)
export const zero = lam('f', lam('x', v('x')));
export const succ: (n: Term) => Term = (n) =>
  lam('f', lam('x', app(v('f'), app(app(n, v('f')), v('x')))));
export const isZero = (n: Term): Term => app(app(n, lam('_', fls)), tru);
export const add = (m: Term, n: Term): Term => lam('f', lam('x', app(app(m, v('f')), app(app(n, v('f')), v('x')))));
export const mul = (m: Term, n: Term): Term => lam('f', app(m, app(n, v('f'))));
export const exp = (m: Term, n: Term): Term => app(n, m);

// Pairs
export const pair = (a: Term, b: Term): Term => lam('f', app(app(v('f'), a), b));
export const fst = (p: Term): Term => app(p, tru);
export const snd = (p: Term): Term => app(p, fls);

// Lists
export const nil = lam('c', lam('n', v('n')));
export const cons = (h: Term, t: Term): Term => lam('c', lam('n', app(app(v('c'), h), t)));
export const head = (l: Term): Term => app(l, lam('h', lam('_', v('h'))));
export const tail = (l: Term): Term => app(l, lam('_', lam('t', v('t'))));
export const isNil = (l: Term): Term => app(l, lam('_', lam('_', fls)), tru);
// fix-with-Nil case: `head`/`tail` only safe on non-nil; tests `case`-split with `isNil`.

// Y combinator: Y g = g (Y g)
export const Y: Term = lam(
  'g',
  app(
    lam('x', app(v('g'), app(v('x'), v('x')))),
    lam('x', app(v('g'), app(v('x'), v('x')))),
  ),
);
