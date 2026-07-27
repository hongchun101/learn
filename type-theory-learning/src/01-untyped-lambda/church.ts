// @ts-nocheck
// 布尔值、有序对、自然数、列表以及 Y 组合子的 Church 编码。
//
// 所有定义都是纯无类型 lambda 演算。本章演示如何将"数据"编码为
// 行为描述。
//
//   2 ≡ λf. λx. f (f x)
//   + ≡ λm. λn. λf. λx. m f (n f x)
//   cons ≡ λh. λt. λf. f h t
//   Y   ≡ λg. (λx. g (x x)) (λx. g (x x))

import { app, lam, v } from './ast';
import type { Term } from './ast';

// 布尔值
export const tru = lam('t', lam('f', v('t')));
export const fls = lam('t', lam('f', v('f')));
export const and = (p: Term, q: Term): Term => app(app(p, q), p);
export const or = (p: Term, q: Term): Term => app(app(p, p), q);
export const not = (p: Term): Term => app(app(p, fls), tru);
export const ite = (p: Term, a: Term, b: Term): Term => app(app(p, a), b);

// Church 数：  n f x = f^n(x)
export const zero = lam('f', lam('x', v('x')));
export const succ: (n: Term) => Term = (n) =>
  lam('f', lam('x', app(v('f'), app(app(n, v('f')), v('x')))));
export const isZero = (n: Term): Term => app(app(n, lam('_', fls)), tru);
export const add = (m: Term, n: Term): Term => lam('f', lam('x', app(app(m, v('f')), app(app(n, v('f')), v('x')))));
export const mul = (m: Term, n: Term): Term => lam('f', app(m, app(n, v('f'))));
export const exp = (m: Term, n: Term): Term => app(n, m);

// 有序对
export const pair = (a: Term, b: Term): Term => lam('f', app(app(v('f'), a), b));
export const fst = (p: Term): Term => app(p, tru);
export const snd = (p: Term): Term => app(p, fls);

// 列表
export const nil = lam('c', lam('n', v('n')));
export const cons = (h: Term, t: Term): Term => lam('c', lam('n', app(app(v('c'), h), t)));
export const head = (l: Term): Term => app(l, lam('h', lam('_', v('h'))));
export const tail = (l: Term): Term => app(l, lam('_', lam('t', v('t'))));
export const isNil = (l: Term): Term => app(l, lam('_', lam('_', fls)), tru);
// 处理 Nil 的情形：`head`/`tail` 仅在非 nil 时安全；测试用 `isNil` 进行 `case` 拆分。

// Y 组合子：Y g = g (Y g)
export const Y: Term = lam(
  'g',
  app(
    lam('x', app(v('g'), app(v('x'), v('x')))),
    lam('x', app(v('g'), app(v('x'), v('x')))),
  ),
);
