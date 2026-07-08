/**
 * Module 12: Performance & Compiler Internals
 *
 * Covers:
 *  - `const` type parameter (TS 5.0+) — capture the most specific literal type
 *  - Control-flow analysis and narrowing
 *  - Assertion functions: `asserts`, `asserts x is T`
 *  - `satisfies` operator: keep narrow inference while matching a contract
 *  - The "as" escape hatch (use sparingly, with reasons)
 *  - TS compiler internals: structural typing, type erasure, soundness
 *  - Common gotchas: `null` vs `undefined`, optional vs `| undefined`,
 *    `exactOptionalPropertyTypes`
 *  - Performance: type instantiation depth, TS server memory
 */
// (no value imports needed for this module)

// ---------------------------------------------------------------------------
// 1. `const` type parameter (TS 5.0+)
// ---------------------------------------------------------------------------

// Without `const`, `args` would be inferred as `string[]`, and the literal
// types would be lost.
export function tuple<const T extends readonly unknown[]>(...args: T): T {
  return args;
}

export const tConst1 = tuple('a', 'b', 'c'); // type: readonly ["a", "b", "c"]
export const tConst2 = tuple(1, true, 'x'); // type: readonly [1, true, "x"]

// `const` modifier is per-parameter:
//   function f<const T>(x: T) { ... }
//   function g<T>(x: T) { ... }  // T is widened

// ---------------------------------------------------------------------------
// 2. Assertion functions
// ---------------------------------------------------------------------------

// `asserts cond` — narrows the rest of the scope.
export function assertDefined<T>(value: T | null | undefined, msg = 'expected defined'): asserts value is T {
  if (value === null || value === undefined) throw new Error(msg);
}

// `asserts value is T` — narrows to a specific type.
export function assertIsString(x: unknown): asserts x is string {
  if (typeof x !== 'string') throw new TypeError('not a string');
}

// Demo:
export function demo(x: unknown): string {
  assertIsString(x);
  return x.toUpperCase(); // x is `string` here
}

// ---------------------------------------------------------------------------
// 3. `satisfies` operator (TS 4.9+)
// ---------------------------------------------------------------------------

interface Color {
  readonly hex: `#${string}`;
  readonly name: string;
}

// Without `satisfies`, you'd have to pick: type-narrow literals OR match a contract.
// `satisfies` does both: validates against `Color` AND keeps the literal type.
export const palettes = {
  red: { hex: '#ff0000', name: 'Red' },
  green: { hex: '#00ff00', name: 'Green' },
  blue: { hex: '#0000ff', name: 'Blue' },
} as const satisfies Record<string, Color>;

// `palettes.red.hex` is the literal '#ff0000', not `string`.
// `palettes.red` is checked against `Color`.

// ---------------------------------------------------------------------------
// 4. `keyof` with `typeof` for safe lookup
// ---------------------------------------------------------------------------

const config = {
  api: 'https://api.example.com',
  retries: 3,
  debug: false,
} as const;

type Config = typeof config;
type ConfigKey = keyof Config; // "api" | "retries" | "debug"

function getConfig<K extends ConfigKey>(key: K): Config[K] {
  return config[key];
}

export const apiUrl: 'https://api.example.com' = getConfig('api');

// ---------------------------------------------------------------------------
// 5. Control flow analysis
// ---------------------------------------------------------------------------

// TS narrows on assignments, conditionals, and type guards.
export function stringify(v: unknown): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return v.toString();
  if (Array.isArray(v)) return v.map(stringify).join(',');
  if (v && typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

// `in` narrowing for tagged unions (see also module 01).
export function handleInput(x: { kind: 'a'; a: number } | { kind: 'b'; b: string }): string {
  if (x.kind === 'a') return `a=${x.a}`;
  return `b=${x.b}`;
}

// ---------------------------------------------------------------------------
// 6. `exactOptionalPropertyTypes` — the strictest interpretation of `?`
// ---------------------------------------------------------------------------

// With this on:
//   interface R { x?: number }
//   const r1: R = {};            // ok
//   const r2: R = { x: undefined }; // ERROR — must omit, not assign undefined
//   const r3: R = { x: 1 };      // ok

// If you want to allow undefined as a value, write:
//   interface R { x?: number | undefined }

// ---------------------------------------------------------------------------
// 7. Performance: control-flow + narrowing
// ---------------------------------------------------------------------------

// Common slowdown: chained `as` casts break narrowing, forcing TS to walk
// the union repeatedly. Let the type guard do the work.

interface Slow {
  kind: 'slow';
  data: string;
}
interface Fast {
  kind: 'fast';
  data: number;
}
type Maybe = Slow | Fast;

export function getData(m: Maybe): string {
  if (m.kind === 'slow') return m.data;
  return m.data.toString();
}

// ---------------------------------------------------------------------------
// 8. Discriminated tuple types
// ---------------------------------------------------------------------------

// `Promise.all` infers a tuple type from the input tuple.
//   const [a, b] = await Promise.all([fetchA(), fetchB()]);
//   // a: Awaited<ReturnType<typeof fetchA>>  b: ...

// ---------------------------------------------------------------------------
// 9. Type-only import correctness with isolatedModules
// ---------------------------------------------------------------------------

// The right way:
import type { Result as _R } from '../01-basics/index.js';
export type UseResult = _R<number, Error>;

// ---------------------------------------------------------------------------
// 10. Compiler internals: structural typing and erasure
// ---------------------------------------------------------------------------

// TypeScript is STRUCTURAL, not nominal. Two types with the same shape are
// interchangeable — that's why `Brand<T, K>` exists (it adds a phantom
// property to make the type nominally distinct).
//
// Erasure: at runtime, types don't exist. Branded types and phantom types
// are zero-cost.

// ---------------------------------------------------------------------------
// 11. Recursive type depth limits
// ---------------------------------------------------------------------------

// TS 5.x raises the limit, but deeply recursive conditional types can still
// hit "Type instantiation is excessively deep and possibly infinite".
// Mitigations:
//   - Use bounded recursion (e.g. trim the tuple type at each step).
//   - Hoist helper types out of the recursive case.
//   - Cache via mapped types.

// Example of a bounded recursion:
type Reverse<T extends readonly unknown[]> = T extends readonly [infer H, ...infer R]
  ? R extends readonly unknown[]
    ? [...Reverse<R>, H]
    : []
  : [];

export const reverseExample: Reverse<[1, 2, 3, 4, 5]> = [5, 4, 3, 2, 1];

// ---------------------------------------------------------------------------
// 12. Soundness gotchas
// ---------------------------------------------------------------------------

// `as` doesn't validate anything. Prefer guards/schemas at boundaries.
// A common foot-gun: indexing with a `string` returns `T` (not `T | undefined`)
//   without `noUncheckedIndexedAccess`.
//   With it on, indexing always returns `T | undefined`.

// ---------------------------------------------------------------------------
// 13. `Object.freeze`, `Object.keys`, and readonly
// ---------------------------------------------------------------------------

// `as const` is the type-level freeze; `Object.freeze` is the runtime freeze.
export const frozen = Object.freeze({ a: 1, b: 'x' });
// frozen.a = 2; // TypeError at runtime, type error at compile time.

// `Object.keys` returns `string[]`, not `(keyof T)[]` — use a typed wrapper:
export function typedKeys<T extends object>(o: T): (keyof T)[] {
  return Object.keys(o) as (keyof T)[];
}

// ---------------------------------------------------------------------------
// 14. `Readonly<T>` and `ReadonlyArray<T>`
// ---------------------------------------------------------------------------

// `Readonly<T>` makes all properties readonly (shallow).
// `ReadonlyArray<T>` is the immutable array view.
export const readonlyArr: ReadonlyArray<number> = [1, 2, 3];
// readonlyArr.push(4); // compile error: push does not exist on ReadonlyArray

// ---------------------------------------------------------------------------
// 15. `Map` / `Set` typing
// ---------------------------------------------------------------------------

export const stringNumberMap: Map<string, number> = new Map();
stringNumberMap.set('a', 1);
export const mapGetResult: number | undefined = stringNumberMap.get('a');

// ---------------------------------------------------------------------------
// 16. `Record<K, V>` and `Partial<Record<K, V>>`
// ---------------------------------------------------------------------------

export type Flags = Record<'dark' | 'compact' | 'experimental', boolean>;
export const featureFlags: Flags = { dark: true, compact: false, experimental: false };

// ---------------------------------------------------------------------------
// 17. `Awaited<T>` and `ReturnType<T>` — built-in
// ---------------------------------------------------------------------------

export type AsyncReturn = Awaited<ReturnType<typeof fetch>>;

// ---------------------------------------------------------------------------
// Demo
// ---------------------------------------------------------------------------

if (import.meta.url === `file:///${process.argv[1]}`) {
  console.info('stringify(1) =', stringify(1));
  console.info('typedKeys =', typedKeys({ a: 1, b: 2 }));
}
