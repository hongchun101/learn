/**
 * Module 2: Generics
 *
 * Covers:
 *  - Generic functions, classes, interfaces
 *  - Constraints: `extends` keyword, `keyof`, conditional constraints
 *  - Default type parameters
 *  - Variance: covariance, contravariance, bivariance, invariance
 *  - The bivariance hack and `--strictFunctionTypes` / `strictFunctionTypes`
 *  - Inferring from call sites, manual specification, contextual typing
 *  - Higher-kinded types via type-level simulation (we can't truly do HKT in TS)
 *  - Phantom types
 */

// ---------------------------------------------------------------------------
// 1. Generic interface with constraints
// ---------------------------------------------------------------------------

export interface Repository<T extends { id: string }> {
  findById(id: string): Promise<T | undefined>;
  save(entity: T): Promise<T>;
  delete(id: string): Promise<void>;
}

// `keyof` constraint — keys of T whose value extends V.
export function pick<T extends object, K extends keyof T>(obj: T, keys: readonly K[]): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const k of keys) out[k] = obj[k];
  return out;
}

// Mapped type derived from a generic — strict lookup with keyof.
export function get<T extends object, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}

// ---------------------------------------------------------------------------
// 2. Default type parameters and `noUncheckedIndexedAccess` aware API
// ---------------------------------------------------------------------------

export interface ApiResponse<TData, TError = ApiError> {
  status: number;
  data: TData | null;
  error: TError | null;
}

export interface ApiError {
  code: string;
  message: string;
}

export async function fetchJson<TData, TError = ApiError>(
  url: string,
  init: RequestInit = {},
): Promise<ApiResponse<TData, TError>> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const error = (await res.json().catch(() => ({ code: 'UNKNOWN', message: res.statusText }))) as TError;
    return { status: res.status, data: null, error };
  }
  const data = (await res.json()) as TData;
  return { status: res.status, data, error: null };
}

// ---------------------------------------------------------------------------
// 3. Variance: function parameters are contravariant, returns are covariant
// ---------------------------------------------------------------------------

// Produces a `Box<T>` for any T — covariant in T.
export interface Box<out T> {
  readonly value: T;
}

export const box = <T>(value: T): Box<T> => ({ value });
// A consumer is contravariant: it consumes T.
export interface Consumer<in T> {
  consume(value: T): void;
}

export const stringConsumer: Consumer<string> = { consume: (v) => console.info('got', v) };
// `Consumer<unknown>` is NOT assignable to `Consumer<string>` (contravariance).
//   const wider: Consumer<unknown> = stringConsumer; // compile error
// A `Consumer<Animal>` IS assignable to `Consumer<Dog>` (consumers get less specific).
const narrower: Consumer<'a' | 'b' | 'c'> = stringConsumer;
void narrower;

// ---------------------------------------------------------------------------
// 4. Method bivariance vs. strict function types
// ---------------------------------------------------------------------------

// With `strictFunctionTypes: true`, this assignment FAILS:
//   let f: (x: Animal) => void = (x: Dog) => void; // would be unsound, error.
// Methods declared with method shorthand are bivariant for legacy reasons.
export interface Animal {
  name: string;
}
export interface Dog extends Animal {
  bark(): void;
}

// ---------------------------------------------------------------------------
// 5. Phantom types — carry a type-level tag that has no runtime presence
// ---------------------------------------------------------------------------

// Common use case: branded IDs / state machines.
export type Brand<T, B extends string> = T & { readonly __brand: B };

export type UserId = Brand<string, 'UserId'>;
export type OrderId = Brand<string, 'OrderId'>;

export const userId = (s: string): UserId => s as UserId;
export const orderId = (s: string): OrderId => s as OrderId;

// Compile-time error: cannot pass OrderId where UserId expected.
// const _bad: UserId = orderId('o-1');

// ---------------------------------------------------------------------------
// 6. Conditional inference — building a "Last" type via conditional types
// ---------------------------------------------------------------------------

export type Last<T extends readonly unknown[]> = T extends readonly [...unknown[], infer L] ? L : never;

export type _LastNum = Last<[1, 2, 3]>; // number
export type _LastStr = Last<['a', 'b', 'c']>; // "c"

// ---------------------------------------------------------------------------
// 7. Tuple-style rest in generic positions
// ---------------------------------------------------------------------------

export function tuple<T extends readonly unknown[]>(...args: T): T {
  return args;
}

// ---------------------------------------------------------------------------
// 8. Type-level sort (illustrates full power of conditional + infer)
// ---------------------------------------------------------------------------

export type Length<T extends readonly unknown[]> = T['length'];

export type GreaterThan<A extends number, B extends number> = BuildTuple<A> extends [
  ...BuildTuple<B>,
 ...infer _,
]
  ? _['length'] extends 0
    ? false
    : true
  : false;

type BuildTuple<L extends number, Acc extends unknown[] = []> = Acc['length'] extends L
  ? Acc
  : BuildTuple<L, [unknown, ...Acc]>;

// Compile-time check: 5 > 3 is true, 2 > 4 is false.
type _GtCheck1 = GreaterThan<5, 3>; // true
type _GtCheck2 = GreaterThan<2, 4>; // false
void (0 as unknown as _GtCheck1);
void (0 as unknown as _GtCheck2);
