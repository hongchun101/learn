/**
 * Module 8: Functional Patterns
 *
 * Covers:
 *  - `Option<T>` (a.k.a. `Maybe<T>`)
 *  - `Either<E, A>` and a small `Result` API
 *  - `pipe` and `flow` — type-safe composition
 *  - Currying and partial application
 *  - `Lens<S, A>` for immutable updates
 *  - `Memoize<T>` with weak maps
 *  - `Lazy<T>`, thunk, defer
 *  - Total functions over partial data
 *
 * This is a taste of functional patterns, expressed with the same primitives
 * a UI or backend module would use. Keep this minimal — pull in `fp-ts` only
 * if you actually need it.
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

// `fromNullable` is a small but well-named boundary.
export const fromNullable = <T>(value: T | null | undefined): Option<T> =>
  value === null || value === undefined ? none : some(value);

// ---------------------------------------------------------------------------
// 2. `Either<E, A>` — for richer error reasons than `Result`
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

// Convert from Result<T,E> to Either<E,T>
export function resultToEither<T, E>(r: Result<T, E>): Either<E, T> {
  return r.ok ? right(r.value) : left(r.error);
}

// ---------------------------------------------------------------------------
// 3. `pipe` and `flow` — type-safe composition
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
// 4. Currying
// ---------------------------------------------------------------------------

// Generic curry for binary functions.
export function curry2<A, B, C>(fn: (a: A, b: B) => C): (a: A) => (b: B) => C {
  return (a) => (b) => fn(a, b);
}

// Generic curry for ternary functions.
export function curry3<A, B, C, D>(fn: (a: A, b: B, c: C) => D): (a: A) => (b: B) => (c: C) => D {
  return (a) => (b) => (c) => fn(a, b, c);
}

// ---------------------------------------------------------------------------
// 5. Lenses — typed field accessors with immutable updates
// ---------------------------------------------------------------------------

export interface Lens<S, A> {
  get(s: S): A;
  set(s: S, a: A): S;
}

export function lens<S, A>(get: (s: S) => A, set: (s: S, a: A) => S): Lens<S, A> {
  return { get, set };
}

// `compose` two lenses — `lensA` reads/writes `A` inside `S`, `lensB` reads/writes
// `B` inside `A`, the result reads/writes `B` inside `S`.
export function composeLens<S, A, B>(outer: Lens<S, A>, inner: Lens<A, B>): Lens<S, B> {
  return lens(
    (s) => inner.get(outer.get(s)),
    (s, b) => outer.set(s, inner.set(outer.get(s), b)),
  );
}

// ---------------------------------------------------------------------------
// 6. Memoize — with WeakMap when key is an object
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
// 7. Lazy evaluation
// ---------------------------------------------------------------------------

export type Lazy<T> = { readonly value: T };

// Lazy<T> memoizes the result on first access. Uses a sentinel for undefined.
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
// 8. Total functions over partial data
// ---------------------------------------------------------------------------

// `first` returns `some(x)` if `pred(x)`, else `none`.
export const first = <T>(items: readonly T[], pred: (item: T) => boolean): Option<T> => {
  for (const x of items) if (pred(x)) return some(x);
  return none;
};

// `findIndex` — find an item's index; returns Option for totalness.
export const findIndex = <T>(items: readonly T[], pred: (item: T) => boolean): Option<number> => {
  for (let i = 0; i < items.length; i++) {
    if (pred(items[i]!)) return some(i);
  }
  return none;
};

// ---------------------------------------------------------------------------
// 9. Foldable — reduce with a typed initial value
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
// 10. Exhaustiveness utility re-export
// ---------------------------------------------------------------------------

export { assertNever };

if (import.meta.url === `file:///${process.argv[1]}`) {
  const o = fromNullable(42);
  console.info('option =', o);
  console.info('first hit =', first([1, 2, 3], (x) => x > 1));
  console.info('foldLeft =', foldLeft([1, 2, 3], 0, (a, b) => a + b));
}
