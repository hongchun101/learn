/**
 * 模块 8：函数式编程模式
 *
 * 内容包括：
 *  - `Option<T>`（又称 `Maybe<T>`）
 *  - `Either<E, A>` 以及一套简明的 `Result` API
 *  - `pipe` 与 `flow` —— 类型安全的组合
 *  - 柯里化与偏函数应用
 *  - `Lens<S, A>`，用于不可变更新
 *  - 基于 `WeakMap` 的 `Memoize<T>`
 *  - `Lazy<T>`、thunk、defer
 *  - 在部分数据上的全函数（total function）
 *
 * 这只是函数式模式的一个概览，使用与 UI 或后端模块相同的原语来表达。
 * 保持精简 —— 只有在真正需要时再引入 `fp-ts`。
 */

import { assertNever } from '../01-basics/index.js';
import type { Result } from '../01-basics/index.js';

// ---------------------------------------------------------------------------
// 1. `Option<T>`
// ---------------------------------------------------------------------------

export type Option<T> = { readonly kind: 'some'; readonly value: T } | { readonly kind: 'none' };

export const some = <T>(value: T): Option<T> => ({ kind: 'some', value });
export const none: Option<never> = { kind: 'none' };

export function mapOption<T, U>(o: Option<T>, f: (t: T) => U): Option<U> {
  return o.kind === 'some' ? some(f(o.value)) : none;
}

export function flatMapOption<T, U>(o: Option<T>, f: (t: T) => Option<U>): Option<U> {
  return o.kind === 'some' ? f(o.value) : none;
}

export function unwrapOption<T>(o: Option<T>, fallback: T): T {
  return o.kind === 'some' ? o.value : fallback;
}

// `fromNullable` 是一个简单但命名贴切的边界转换。
export const fromNullable = <T>(value: T | null | undefined): Option<T> =>
  value === null || value === undefined ? none : some(value);

// ---------------------------------------------------------------------------
// 2. `Either<E, A>` —— 用于承载比 `Result` 更丰富的错误原因
// ---------------------------------------------------------------------------

export type Either<E, A> = { readonly kind: 'left'; readonly left: E } | { readonly kind: 'right'; readonly right: A };

export const left = <E>(e: E): Either<E, never> => ({ kind: 'left', left: e });
export const right = <A>(a: A): Either<never, A> => ({ kind: 'right', right: a });

export function mapEither<E, A, B>(e: Either<E, A>, f: (a: A) => B): Either<E, B> {
  return e.kind === 'right' ? right(f(e.right)) : e;
}

export function flatMapEither<E, A, B>(e: Either<E, A>, f: (a: A) => Either<E, B>): Either<E, B> {
  return e.kind === 'right' ? f(e.right) : e;
}

// 将 Result<T,E> 转换为 Either<E,T>
export function resultToEither<T, E>(r: Result<T, E>): Either<E, T> {
  return r.ok ? right(r.value) : left(r.error);
}

// ---------------------------------------------------------------------------
// 3. `pipe` 与 `flow` —— 类型安全的组合
// ---------------------------------------------------------------------------

export function pipe<A>(a: A): A;
export function pipe<A, B>(a: A, f: (x: A) => B): B;
export function pipe<A, B, C>(a: A, f1: (x: A) => B, f2: (x: B) => C): C;
export function pipe<A, B, C, D>(a: A, f1: (x: A) => B, f2: (x: B) => C, f3: (x: C) => D): D;
export function pipe<A, B, C, D, E>(
  a: A,
  f1: (x: A) => B,
  f2: (x: B) => C,
  f3: (x: C) => D,
  f4: (x: D) => E,
): E;
export function pipe(value: unknown, ...fns: ReadonlyArray<(x: unknown) => unknown>): unknown {
  return fns.reduce((v, f) => f(v), value);
}

export function flow<A extends readonly ((x: never) => never)[]>(...fns: A): (...args: never[]) => unknown {
  return (...args: never[]) => fns.reduce<unknown>((v, f, i) => (i === 0 ? args[0] : f(v as never)), undefined);
}

// ---------------------------------------------------------------------------
// 4. 柯里化
// ---------------------------------------------------------------------------

// 二元函数的通用柯里化。
export function curry2<A, B, C>(fn: (a: A, b: B) => C): (a: A) => (b: B) => C {
  return (a) => (b) => fn(a, b);
}

// 三元函数的通用柯里化。
export function curry3<A, B, C, D>(fn: (a: A, b: B, c: C) => D): (a: A) => (b: B) => (c: C) => D {
  return (a) => (b) => (c) => fn(a, b, c);
}

// ---------------------------------------------------------------------------
// 5. Lenses —— 带类型的字段访问器，支持不可变更新
// ---------------------------------------------------------------------------

export interface Lens<S, A> {
  get(s: S): A;
  set(s: S, a: A): S;
}

export function lens<S, A>(get: (s: S) => A, set: (s: S, a: A) => S): Lens<S, A> {
  return { get, set };
}

// `compose` 两个 lens —— `lensA` 在 `S` 内读写 `A`，`lensB` 在 `A` 内读写
// `B`，结果就是在 `S` 内读写 `B`。
export function composeLens<S, A, B>(outer: Lens<S, A>, inner: Lens<A, B>): Lens<S, B> {
  return lens(
    (s) => inner.get(outer.get(s)),
    (s, b) => outer.set(s, inner.set(outer.get(s), b)),
  );
}

// ---------------------------------------------------------------------------
// 6. Memoize —— 当键是对象时使用 WeakMap
// ---------------------------------------------------------------------------

export function memoize1<A extends readonly unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const cache = new Map<string, R>();
  return (...args: A): R => {
    const key = JSON.stringify(args);
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    const v = fn(...args);
    cache.set(key, v);
    return v;
  };
}

export function memoizeWeak<A extends object, R>(fn: (arg: A) => R): (arg: A) => R {
  const cache = new WeakMap<A, R>();
  return (arg: A): R => {
    const hit = cache.get(arg);
    if (hit !== undefined) return hit;
    const v = fn(arg);
    cache.set(arg, v);
    return v;
  };
}

// ---------------------------------------------------------------------------
// 7. 惰性求值
// ---------------------------------------------------------------------------

export type Lazy<T> = { readonly value: T };

// Lazy<T> 在首次访问时记忆结果。对 undefined 使用哨兵值处理。
export const lazy = <T>(fn: () => T): Lazy<T> => {
  let computed = false;
  let memo: T;
  return {
    get value() {
      if (!computed) {
        memo = fn();
        computed = true;
      }
      return memo;
    },
  };
};

// ---------------------------------------------------------------------------
// 8. 在部分数据上的全函数
// ---------------------------------------------------------------------------

// `first` 在 `pred(x)` 为真时返回 `some(x)`，否则返回 `none`。
export const first = <T>(items: readonly T[], pred: (item: T) => boolean): Option<T> => {
  for (const x of items) if (pred(x)) return some(x);
  return none;
};

// `findIndex` —— 查找元素的索引；为保证全函数性，返回 Option。
export const findIndex = <T>(items: readonly T[], pred: (item: T) => boolean): Option<number> => {
  for (let i = 0; i < items.length; i++) {
    if (pred(items[i]!)) return some(i);
  }
  return none;
};

// ---------------------------------------------------------------------------
// 9. Foldable —— 使用带类型的初始值进行归约
// ---------------------------------------------------------------------------

export const foldLeft = <T, B>(items: readonly T[], init: B, fn: (acc: B, item: T) => B): B => {
  let acc = init;
  for (const x of items) acc = fn(acc, x);
  return acc;
};

export const foldRight = <T, B>(items: readonly T[], init: B, fn: (acc: B, item: T) => B): B => {
  let acc = init;
  for (let i = items.length - 1; i >= 0; i--) acc = fn(acc, items[i]!);
  return acc;
};

// ---------------------------------------------------------------------------
// 10. 穷尽性工具的再导出
// ---------------------------------------------------------------------------

export { assertNever };

if (import.meta.url === `file:///${process.argv[1]}`) {
  const o = fromNullable(42);
  console.info('option =', o);
  console.info('first hit =', first([1, 2, 3], (x) => x > 1));
  console.info('foldLeft =', foldLeft([1, 2, 3], 0, (a, b) => a + b));
}
