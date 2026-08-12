/**
 * Module 15 — Type Predicates, Assertion Functions & Branded Narrowing
 *
 * Topics:
 *  - Type predicate functions: `x is T` and how they propagate narrowing
 *  - Assertion functions: `asserts x is T` and scope-narrowing
 *  - Filter-style predicates that narrow arrays
 *  - The `asserts` keyword without a type predicate (just narrowing)
 *  - Branded types with smart constructors and `asserts`
 *  - Discriminated unions, exhaustiveness via `assertNever`
 *  - The interplay of `in`, `typeof`, `instanceof`, equality
 *  - Type guards on `this` (in methods)
 *  - Custom Error classes as guards
 *  - Common narrowing pitfalls and how to avoid them
 *
 * Narrowing is the heart of safe TypeScript. Every senior TS interview
 * includes at least one of these questions.
 */

// ---------------------------------------------------------------------------
// 1. Type predicate functions
// ---------------------------------------------------------------------------
//
// A type predicate is a function whose return type annotation has the
// special form `x is T`. At call sites, when the function returns truthy,
// TS narrows the parameter to `T`.

interface Fish {
  readonly kind: 'fish';
  swim(): void;
}
interface Bird {
  readonly kind: 'bird';
  fly(): void;
}
type Pet = Fish | Bird;

// Type predicate: narrows `Pet` to `Fish` when the function returns true.
export function isFish(p: Pet): p is Fish {
  return p.kind === 'fish';
}

export function move(p: Pet): string {
  if (isFish(p)) return p.swim() ?? 'swimming';
  return p.fly() ?? 'flying';
}

// ---------------------------------------------------------------------------
// 2. Generic type predicates
// ---------------------------------------------------------------------------
//
// The classic filter helper — `Array#filter` accepts a type predicate and
// the result type widens to the predicate's `T`.

export function isNotNullish<T>(x: T | null | undefined): x is T {
  return x !== null && x !== undefined;
}

export function compact<T>(items: readonly (T | null | undefined)[]): T[] {
  return items.filter(isNotNullish);
}

// ---------------------------------------------------------------------------
// 3. `asserts x is T` — narrowing for the rest of the scope
// ---------------------------------------------------------------------------
//
// Assertion functions are like type predicates but they THROW when the
// condition fails and the caller doesn't have to write `if (asserted(x))`.
// After the call, `x` is narrowed to the asserted type.

export function assertIsString(x: unknown): asserts x is string {
  if (typeof x !== 'string') throw new TypeError(`expected string, got ${typeof x}`);
}

export function firstChar(s: unknown): string {
  assertIsString(s);
  // s is now `string`; no nullish check needed.
  return s.charAt(0);
}

// `asserts cond` without a type — narrows to truthy.
export function assertTrue(cond: unknown, msg = 'expected truthy'): asserts cond {
  if (!cond) throw new Error(msg);
}

// ---------------------------------------------------------------------------
// 4. Branded types and smart constructors
// ---------------------------------------------------------------------------
//
// A branded type is `T & { readonly __brand: K }`. At runtime it's just T;
// at compile time the brand prevents accidental cross-type use.

export type Brand<T, K extends string> = T & { readonly __brand: K };

export type UserId = Brand<string, 'UserId'>;
export type OrderId = Brand<string, 'OrderId'>;

// Smart constructor: the only way to obtain a UserId.
export function makeUserId(s: string): UserId {
  if (!/^u_[A-Za-z0-9]+$/.test(s)) throw new Error(`bad UserId: ${s}`);
  return s as UserId;
}

// Assertion form: assert a runtime value IS a UserId.
export function assertUserId(s: string): asserts s is UserId {
  if (!/^u_[A-Za-z0-9]+$/.test(s)) throw new Error(`not a UserId: ${s}`);
}

export function formatOrder(uid: string, oid: string): string {
  // Inside this function, `uid` is unbranded. We assert it to UserId at the
  // boundary, then the rest of the function gets a fully-typed value.
  assertUserId(uid);
  // The brand check: UserId and OrderId are distinct strings at compile time.
  const _ok: UserId = uid;
  void _ok;
  return `user=${uid}, order=${oid}`;
}

// ---------------------------------------------------------------------------
// 5. Exhaustiveness with `assertNever`
// ---------------------------------------------------------------------------
//
// Re-uses the `assertNever` from module 01 in a real dispatcher. The
// dispatcher takes a discriminated union and routes to the correct handler.

export type AppEvent =
  | { readonly type: 'pageview'; readonly path: string }
  | { readonly type: 'click'; readonly target: string }
  | { readonly type: 'purchase'; readonly sku: string; readonly amount: number };
function assertNever(x: never): never {
  throw new Error(`unhandled: ${JSON.stringify(x)}`);
}

export function dispatch(e: AppEvent): string {
  switch (e.type) {
    case 'pageview':
      return `view ${e.path}`;
    case 'click':
      return `clicked ${e.target}`;
    case 'purchase':
      return `bought ${e.sku} for ${e.amount}`;
    default:
      return assertNever(e); // If a new variant is added, this errors.
  }
}

// ---------------------------------------------------------------------------
// 6. `in` operator narrowing
// ---------------------------------------------------------------------------
//
// `in` narrows unions by checking property existence. Useful when the
// discriminator field differs across members.

export interface Car {
  readonly wheels: 4;
  readonly engine: 'gas' | 'electric';
}
export interface Boat {
  readonly sails: number;
  readonly hull: 'wood' | 'fiberglass';
}
export type Vehicle = Car | Boat;

export function describeVehicle(v: Vehicle): string {
  if ('engine' in v) return `car with ${v.wheels} wheels, ${v.engine}`;
  if ('sails' in v) return `boat with ${v.sails} sails, ${v.hull}`;
  return assertNever(v);
}

// ---------------------------------------------------------------------------
// 7. `instanceof` narrowing with custom error classes
// ---------------------------------------------------------------------------
//
// Use tagged Error subclasses so the caller can `instanceof` them away.

export class NotFoundError extends Error {
  constructor(public readonly path: string) {
    super(`NotFound: ${path}`);
    this.name = 'NotFoundError';
  }
}
export class PermissionError extends Error {
  constructor(public readonly resource: string) {
    super(`Permission denied: ${resource}`);
    this.name = 'PermissionError';
  }
}

export function isNotFound(e: unknown): e is NotFoundError {
  return e instanceof NotFoundError;
}

export function explain(e: unknown): string {
  if (isNotFound(e)) return `404: ${e.path}`;
  if (e instanceof PermissionError) return `403: ${e.resource}`;
  if (e instanceof Error) return `error: ${e.message}`;
  return 'unknown';
}

// ---------------------------------------------------------------------------
// 8. Equality narrowing
// ---------------------------------------------------------------------------
//
// TS narrows unions by equality on literal members.

type Status = 'idle' | 'running' | 'done';
export function statusLabel(s: Status): string {
  if (s === 'idle') return '...';
  if (s === 'running') return '...';
  if (s === 'done') return 'OK';
  return assertNever(s);
}

// ---------------------------------------------------------------------------
// 9. Method-scope `this` typing with `this:` parameter
// ---------------------------------------------------------------------------
//
// Inside a class method, a `this: T` parameter pins the static type of
// `this` to T. Useful when methods are unbound and called on a different
// `this`.

export class Counter {
  private count = 0;
  // Without `this: Counter`, an unbound `counter.inc` call has `this: any`.
  inc(this: Counter, by = 1): number {
    this.count += by;
    return this.count;
  }
}

// ---------------------------------------------------------------------------
// 10. `asserts this` — narrowing `this` in a class
// ---------------------------------------------------------------------------
//
// A method that asserts `this` lets a chained method narrow the receiver
// to a refined type.

export class ListNode<T> {
  constructor(
    public readonly value: T,
    public next: ListNode<T> | null = null,
  ) {}
}

export class NonEmptyListNode<T> extends ListNode<T> {
  declare next: ListNode<T>; // narrowed: not null

  static from<T>(node: ListNode<T>): NonEmptyListNode<T> {
    if (node.next === null) {
      // The runtime check is enough; we throw if the precondition fails.
      throw new Error('next is null');
    }
    return node as NonEmptyListNode<T>;
  }
}

// ---------------------------------------------------------------------------
// 11. Common narrowing pitfalls
// ---------------------------------------------------------------------------
//
// Pitfall 1: `as` after narrowing erases the guard. Don't.
// Pitfall 2: type predicates inside callbacks lose narrowing. Extract.
// Pitfall 3: optional chaining breaks `in` narrowing; check first.

// The common mistakes — for context, not as code to ship:
//   1. `as` after a guard erases narrowing. Stop using it as a shortcut.
//   2. Type predicates defined inside callbacks don't narrow; extract them.
//   3. Optional chaining on the discriminant breaks `in` narrowing — check
//      the discriminant first, then access nested members.

// The right way: separate the branches; never use `as` to bypass a guard.

// ---------------------------------------------------------------------------
// 12. Negative type predicate: `x is not T`
// ---------------------------------------------------------------------------
//
// TS does NOT support `x is not T` directly. The workaround is to invert:
//   function isNotString(x: unknown): x is Exclude<typeof x, string>
// which is the same as: `if (typeof x === 'string') return false; return true;`

export function isNotString(x: unknown): x is Exclude<unknown, string> {
  return typeof x !== 'string';
}

// ---------------------------------------------------------------------------
// Demo runner
// ---------------------------------------------------------------------------

if (import.meta.url === `file:///${process.argv[1]}`) {
  const pet: Pet = { kind: 'fish', swim: () => 'splash' };
  console.info('move =', move(pet));

  console.info('firstChar =', firstChar('hello'));

  console.info('dispatch =', dispatch({ type: 'click', target: 'btn' }));

  console.info('explain =', explain(new NotFoundError('users/u1')));

  const uid = makeUserId('u_42');
  console.info('uid =', uid);
  void uid;
}
