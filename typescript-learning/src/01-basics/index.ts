/**
 * Module 1: Type System Fundamentals
 *
 * Covers:
 *  - Primitive types, literal types, widening vs. narrowing
 *  - Union and intersection types
 *  - Type guards (typeof, instanceof, in, equality, custom predicates)
 *  - Discriminated unions (tagged unions) - the workhorse of TS domain modeling
 *  - Exhaustiveness checking with `assertNever`
 */

// ---------------------------------------------------------------------------
// 1. Literal types and `as const`
// ---------------------------------------------------------------------------
// `const` gives a literal type that doesn't widen.
// The three examples below demonstrate widening vs. literal types.
// We export them so consumers and tests can observe the type assertions.
export const literalHello = 'hello'; // type: "hello"
export let widenedHello = 'hello'; // type: string (widened)
export let narrowed: 'hello' | 'world' = 'hello';

// `as const` produces readonly deeply-literal types.
export const config = {
  api: { baseUrl: 'https://api.example.com', timeoutMs: 3000 },
  features: { retry: true, debug: false },
} as const;
export type Config = typeof config;
export const cfgCheck: Config['api']['baseUrl'] = 'https://api.example.com';

// ---------------------------------------------------------------------------
// 2. Discriminated unions (the single most useful TS pattern)
// ---------------------------------------------------------------------------

export type Result<T, E = Error> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

// Constructors are durable public API: keep them named.
export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

// Custom throw — different exception types, not just `throw r.error`.
export function unwrap<T, E>(r: Result<T, E>): T {
  if (r.ok) return r.value;
  throw r.error instanceof Error ? r.error : new Error(String(r.error));
}

// `map` is the algebraic Functor map: signature is the contract, keep it named.
export function map<T, U, E>(r: Result<T, E>, f: (t: T) => U): Result<U, E> {
  return r.ok ? ok(f(r.value)) : r;
}

// ---------------------------------------------------------------------------
// 3. Exhaustiveness checking — the type system's safety net
// ---------------------------------------------------------------------------

export type Shape =
  | { kind: 'circle'; radius: number }
  | { kind: 'rect'; width: number; height: number }
  | { kind: 'triangle'; base: number; height: number };

// Public contract: callers may call assertNever(x) inside their default branch.
export function assertNever(x: never): never {
  throw new Error(`Unhandled discriminated union member: ${JSON.stringify(x)}`);
}

export function area(s: Shape): number {
  switch (s.kind) {
    case 'circle':
      return Math.PI * s.radius * s.radius;
    case 'rect':
      return s.width * s.height;
    case 'triangle':
      return (s.base * s.height) / 2;
    default:
      return assertNever(s); // compile error if a new kind is added without a case
  }
}

// ---------------------------------------------------------------------------
// 4. User-defined type guards
// ---------------------------------------------------------------------------

export interface User {
  readonly id: string;
  readonly email: string;
  readonly role: 'admin' | 'member';
}

// Type guard — narrowing contract: this MUST stay as a function.
export function isUser(x: unknown): x is User {
  if (typeof x !== 'object' || x === null) return false;
  const r = x as Record<string, unknown>;
  return (
    typeof r['id'] === 'string' &&
    typeof r['email'] === 'string' &&
    (r['role'] === 'admin' || r['role'] === 'member')
  );
}

// ---------------------------------------------------------------------------
// 5. `in` operator narrowing
// ---------------------------------------------------------------------------

export type Event =
  | { type: 'login'; userId: string }
  | { type: 'logout'; userId: string }
  | { type: 'purchase'; userId: string; sku: string; amount: number };

export function handleEvent(e: Event): string {
  if ('sku' in e) return `${e.userId} bought ${e.sku} for ${e.amount}`;
  if ('userId' in e) return `auth event: ${e.type}`;
  return assertNever(e);
}

// Demo entry point
if (import.meta.url === `file:///${process.argv[1]}`) {
  console.info('area(circle r=2) =', area({ kind: 'circle', radius: 2 }));
  console.info('unwrap(ok(7)) =', unwrap(ok(7)));
  console.info('handleEvent =', handleEvent({ type: 'purchase', userId: 'u1', sku: 'X', amount: 9.99 }));
}
