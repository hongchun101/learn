/**
 * Module 18 — Error Handling Patterns & Async Error Flows
 *
 * Topics:
 *  - Throwing vs `Result<T, E>`: when to reach for each
 *  - Designing error unions: kind fields, branded errors
 *  - `Result<T, E>` as a monad: `map`, `flatMap`, `mapError`, `unwrap`
 *  - Composing `Result`s: `all`, `allSettled`, `first`
 *  - Async error flows: `Promise<Result<T, E>>` vs `try/catch`
 *  - `tryAsync` and `trySync` adapters
 *  - Stack-trace preservation
 *  - The "errors as values" discipline
 *  - `assertNever` and exhaustive error matching
 *  - Error boundaries in async iterators
 *  - Saga pattern with error propagation
 *
 * This is the module that distinguishes "knows the syntax" from "designs
 * production-grade error handling." Most TS codebases get this wrong;
 * 50K-tier engineers get it right.
 */

import { assertNever } from '../01-basics/index.js';

// ---------------------------------------------------------------------------
// 1. The two valid error-handling strategies
// ---------------------------------------------------------------------------
//
//   (a) `throw new Error(...)` — control flow leaves the function, the
//       caller has no static obligation to handle the failure.
//   (b) `Result<T, E>` — the function returns a tagged union; the caller
//       has a static obligation to handle the failure before using T.
//
// Strategy (a) is right for: unrecoverable bugs, "should never happen,"
// deep infrastructure. Strategy (b) is right for: domain failures, network
// errors, validation, anything the caller can recover from.
//
// The two are not mutually exclusive. A function can throw on programmer
// error and return Result on domain error.

// ---------------------------------------------------------------------------
// 2. Designing error unions
// ---------------------------------------------------------------------------
//
// An error union has a `kind` discriminant; each member carries the
// data the caller needs to handle that specific failure. The union's
// full set is the type of the function's `E` parameter.

export type AppError =
  | { readonly kind: 'NotFound'; readonly path: string }
  | { readonly kind: 'Permission'; readonly resource: string }
  | { readonly kind: 'Validation'; readonly issues: ReadonlyArray<{ path: string; message: string }> }
  | { readonly kind: 'Network'; readonly cause: string }
  | { readonly kind: 'Conflict'; readonly resource: string };

// `assertNever` makes switch over AppError exhaustive:
export function describeError(e: AppError): string {
  switch (e.kind) {
    case 'NotFound':
      return `not found: ${e.path}`;
    case 'Permission':
      return `permission denied: ${e.resource}`;
    case 'Validation':
      return `validation failed: ${e.issues.length} issue(s)`;
    case 'Network':
      return `network: ${e.cause}`;
    case 'Conflict':
      return `conflict: ${e.resource}`;
    default:
      return assertNever(e);
  }
}

// ---------------------------------------------------------------------------
// 3. `Result<T, E>` monad
// ---------------------------------------------------------------------------
//
// A small but complete `Result` library: `ok`, `err`, `map`, `flatMap`,
// `mapError`, `unwrap`, `unwrapOr`, `all`, `allSettled`.

export type Result<T, E> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

export function map<T, U, E>(r: Result<T, E>, f: (t: T) => U): Result<U, E> {
  return r.ok ? ok(f(r.value)) : r;
}

export function flatMap<T, U, E>(r: Result<T, E>, f: (t: T) => Result<U, E>): Result<U, E> {
  return r.ok ? f(r.value) : r;
}

export function mapError<T, E, F>(r: Result<T, E>, f: (e: E) => F): Result<T, F> {
  return r.ok ? r : err(f(r.error));
}

export function unwrap<T, E>(r: Result<T, E>): T {
  if (r.ok) return r.value;
  throw r.error instanceof Error ? r.error : new Error(JSON.stringify(r.error));
}

export function unwrapOr<T, E>(r: Result<T, E>, fallback: T): T {
  return r.ok ? r.value : fallback;
}

// `all`: short-circuits on the first error.
export function all<T, E>(items: readonly Result<T, E>[]): Result<readonly T[], E> {
  const out: T[] = [];
  for (const r of items) {
    if (!r.ok) return r;
    out.push(r.value);
  }
  return ok(out);
}

// `allSettled`: collects both values and errors.
export function allSettled<T, E>(items: readonly Result<T, E>[]): { values: T[]; errors: E[] } {
  const values: T[] = [];
  const errors: E[] = [];
  for (const r of items) {
    if (r.ok) values.push(r.value);
    else errors.push(r.error);
  }
  return { values, errors };
}

// `first`: returns the first success or the array of errors.
export function first<T, E>(items: readonly Result<T, E>[]): Result<T, readonly E[]> {
  const errors: E[] = [];
  for (const r of items) {
    if (r.ok) return r;
    errors.push(r.error);
  }
  return err(errors);
}

// ---------------------------------------------------------------------------
// 4. Async error flows
// ---------------------------------------------------------------------------
//
// For async code, two strategies:
//   (a) `async function f(): Promise<T>` — throws, caller uses try/catch.
//   (b) `async function f(): Promise<Result<T, E>>` — never throws (in
//       the sense of "I caught all known errors"); caller uses `.then`
//       and inspects `.ok`.
//
// Strategy (b) is more disciplined because the call site can't forget
// the error path. We provide two adapters:

export async function tryAsync<T>(p: Promise<T>): Promise<Result<T, unknown>> {
  try {
    return ok(await p);
  } catch (cause) {
    return err(cause);
  }
}

export function trySync<T>(fn: () => T): Result<T, unknown> {
  try {
    return ok(fn());
  } catch (cause) {
    return err(cause);
  }
}

// Narrowing the cause: convert `unknown` to AppError where possible.
export function toAppError(cause: unknown): AppError {
  if (cause instanceof Error) {
    if (cause.name === 'NotFoundError') return { kind: 'NotFound', path: cause.message };
    if (cause.name === 'PermissionError') return { kind: 'Permission', resource: cause.message };
    return { kind: 'Network', cause: cause.message };
  }
  return { kind: 'Network', cause: String(cause) };
}

// ---------------------------------------------------------------------------
// 5. Stack-trace preservation
// ---------------------------------------------------------------------------
//
// When you `try { await p } catch (e) { throw new AppError(e) }`, the
// new error's stack starts at the catch site, losing the original.
// The fix: pass the original as `cause`.

export function withCause<T>(e: T, cause: unknown): T & { readonly cause: unknown } {
  return { ...(e as object), cause } as T & { cause: unknown };
}

// ---------------------------------------------------------------------------
// 6. Error boundaries in async iterators
// ---------------------------------------------------------------------------
//
// An async generator can `throw` to the consumer's `try { for await }`.
// Map that to a typed error in the consumer:

export async function* safeAsyncMap<T, U, E>(
  source: AsyncIterable<T>,
  f: (v: T) => Promise<Result<U, E>>,
): AsyncGenerator<Result<U, E>, void, void> {
  for await (const v of source) {
    yield await f(v);
  }
}

// ---------------------------------------------------------------------------
// 7. Saga with typed error propagation
// ---------------------------------------------------------------------------
//
// The pattern from module 11 (`runSaga`) extended: each step's result
// is a Result, and the saga runner decides whether to continue or
// short-circuit on error.

export type SagaStep<T> = Promise<Result<T, AppError>>;
export type SagaState = { readonly stepsRun: number; readonly value: unknown };

export function* checkoutSaga(userId: string): Generator<SagaStep<unknown>, void, unknown> {
  // The yield's return type is the generator's `TNext` parameter — here
  // `unknown`. A real saga uses the runner's typed Result forwarding; the
  // demo keeps the unknown surface to make that explicit.
  const raw = yield Promise.resolve(ok({ userId, items: [] as readonly string[] }));
  if (raw && typeof raw === 'object' && 'ok' in raw && (raw as { ok: unknown }).ok === true) {
    const value = (raw as { ok: true; value: unknown }).value;
    void value;
  }
}

export async function runSagaWithErrors<T>(
  gen: Generator<SagaStep<unknown>, T, unknown>,
): Promise<Result<T, AppError>> {
  let last: unknown = undefined;
  while (true) {
    const { value, done } = gen.next(last);
    if (done) return ok(value as T);
    try {
      const r = await value;
      if (!r.ok) return r;
      last = r.value;
    } catch (cause) {
      return err(toAppError(cause));
    }
  }
}

// ---------------------------------------------------------------------------
// 8. The "errors as values" discipline
// ---------------------------------------------------------------------------
//
// 1. Throw only for unrecoverable / programmer errors.
// 2. For everything else, return Result.
// 3. Never `as` away an error type; if the conversion is impossible,
//    fix the types at the source.
// 4. Document the error set in the JSDoc of every public function:
//    @throws {RangeError} when x is negative
//    @returns {Result<User, NotFound | Network>}
// 5. At the boundary (HTTP handler, CLI entry, UI event), translate
//    Result.errors to a user-facing format.
// 6. Use `assertNever` on errors at the dispatch site so missing cases
//    are caught at compile time.

// ---------------------------------------------------------------------------
// 9. Composing `Result`s in practice
// ---------------------------------------------------------------------------
//
// A small "load user" example showing the discipline end-to-end:

export interface User {
  readonly id: string;
  readonly email: string;
}

export function validateUserId(id: string): Result<string, AppError> {
  if (!id) return err({ kind: 'Validation', issues: [{ path: 'id', message: 'empty' }] });
  if (id.length > 64) return err({ kind: 'Validation', issues: [{ path: 'id', message: 'too long' }] });
  return ok(id);
}

export function loadUser(id: string, repo: { findById: (id: string) => Promise<User | null> }): Promise<Result<User, AppError>> {
  return (async () => {
    const validated = validateUserId(id);
    if (!validated.ok) return validated;
    const u = await tryAsync(repo.findById(validated.value));
    if (!u.ok) return err(toAppError(u.error));
    if (u.value === null) return err({ kind: 'NotFound', path: `users/${id}` });
    return ok(u.value);
  })();
}

// ---------------------------------------------------------------------------
// Demo runner
// ---------------------------------------------------------------------------

if (import.meta.url === `file:///${process.argv[1]}`) {
  console.info('all =', all([ok(1), ok(2), ok(3)]));
  console.info('allSettled =', allSettled([ok(1), err('x'), ok(3)]));
  console.info('first =', first([err('a'), ok(2), err('c')]));

  void (async () => {
    const r = await tryAsync(Promise.reject(new Error('boom')));
    console.info('tryAsync =', r.ok ? 'ok' : r.error);
    const r2 = await loadUser('', { findById: async () => null });
    console.info('loadUser =', r2.ok ? 'ok' : r2.error.kind);
  })();
}
