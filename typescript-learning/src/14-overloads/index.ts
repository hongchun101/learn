/**
 * Module 14 — Overloads, Call Signatures, `this` typing, advanced generics
 *
 * Topics:
 *  - Function overloads: when and how to declare them
 *  - Constructor overloads
 *  - `this` parameter typing (F-bounded polymorphism)
 *  - Method signatures vs call signatures
 *  - Index signatures and `Record` vs index access types
 *  - `this` types and `ThisType<T>` in object literals
 *  - Generic constraints with multiple type parameters
 *  - Bivariance, strict function types, and the "method bivariance" loophole
 *  - Conditional types with `infer` for tuple/function shape extraction
 *  - Distributive conditional types
 *
 * These are the patterns that show up in every senior TS interview. They
 * separate "knows the syntax" from "can design a type system for a real
 * library."
 */

// ---------------------------------------------------------------------------
// 1. Function overloads
// ---------------------------------------------------------------------------
//
// Overloads let the SAME function have different input/output types based
// on the argument shape. TS picks the matching overload in source order at
// the call site. The implementation signature is hidden from callers — it
// only needs to be compatible with every overload.

export interface UserV1 {
  readonly version: 1;
  readonly name: string;
}
export interface UserV2 {
  readonly version: 2;
  readonly email: string;
  readonly name: string;
}
export type User = UserV1 | UserV2;

// Overloads:
//   parseUser(raw, 1) → UserV1
//   parseUser(raw, 2) → UserV2
export function parseUser(raw: unknown, version: 1): UserV1;
export function parseUser(raw: unknown, version: 2): UserV2;
export function parseUser(raw: unknown, version: 1 | 2): User {
  // Implementation: must satisfy BOTH overloads. Use a runtime check.
  if (version === 1) {
    if (typeof raw !== 'object' || raw === null) throw new Error('not an object');
    const r = raw as Record<string, unknown>;
    if (typeof r['name'] !== 'string') throw new Error('name missing');
    return { version: 1, name: r['name'] };
  }
  if (typeof raw !== 'object' || raw === null) throw new Error('not an object');
  const r = raw as Record<string, unknown>;
  if (typeof r['name'] !== 'string') throw new Error('name missing');
  if (typeof r['email'] !== 'string') throw new Error('email missing');
  return { version: 2, name: r['name'], email: r['email'] };
}

// ---------------------------------------------------------------------------
// 2. Constructor overloads
// ---------------------------------------------------------------------------
//
// Classes can declare multiple `new (...)` signatures. Like function
// overloads, callers see only the public signatures, and `this` access is
// available in the implementation.

export interface TimerOptions {
  readonly ms: number;
}
export interface StopwatchOptions {
  readonly startTime: number;
}
export interface ClockOptions {
  readonly initial: Date;
}

export class Timer {
  private mode: 'timer' | 'stopwatch' | 'clock';
  private config: TimerOptions | StopwatchOptions | ClockOptions;
  constructor(options: TimerOptions);
  constructor(options: StopwatchOptions);
  constructor(options: ClockOptions);
  constructor(options: TimerOptions | StopwatchOptions | ClockOptions) {
    if ('ms' in options) {
      this.mode = 'timer';
    } else if ('startTime' in options) {
      this.mode = 'stopwatch';
    } else {
      this.mode = 'clock';
    }
    this.config = options;
  }
  describe(): string {
    return `${this.mode}: ${JSON.stringify(this.config)}`;
  }
}

// ---------------------------------------------------------------------------
// 3. `this` parameter typing (F-bounded polymorphism)
// ---------------------------------------------------------------------------
//
// A `this: T` parameter is erased at runtime. It tells TS what `this` is
// INSIDE the function body, enabling method chaining that preserves the
// subclass type.

export class StringBuilder {
  protected value = '';
  // `this: StringBuilder` lets subclass instances be returned with the
  // subclass type, not just `StringBuilder`.
  append(s: string): this {
    this.value += s;
    return this;
  }
  build(): string {
    return this.value;
  }
}

export class TaggedBuilder extends StringBuilder {
  prefix!: string;
  override append(s: string): this {
    return super.append(this.prefix + s);
  }
}

// ---------------------------------------------------------------------------
// 4. Method bivariance and the `// @strict` escape hatch
// ---------------------------------------------------------------------------
//
// In `strictFunctionTypes: true`, function-type position (parameters of
// arrow functions, type aliases) is contravariant. But METHOD DECLARATIONS
// (object literal method shorthand and class methods) are intentionally
// bivariant for legacy reasons.
//
// If you want a method to be strictly contravariant, declare it as a
// function-type property: `{ onClick: (e: Event) => void }` — NOT
// `{ onClick(e: Event): void }`.

export interface StrictHandler {
  // Function-type property: contravariant. `Event`-typed handlers do NOT
  // accept `MouseEvent`-only handlers.
  onChange: (e: { readonly value: string }) => void;
}

export interface LooseHandler {
  // Method shorthand: bivariant. `MouseEvent` typed is accepted.
  onChange(e: { readonly value: string }): void;
}

// ---------------------------------------------------------------------------
// 5. `ThisType<T>` in object literals
// ---------------------------------------------------------------------------
//
// `ThisType<T>` is a marker that tells TS to type `this` inside an object
// literal as `T`. It's used by Vue, Pinia, and Redux Toolkit to make
// action creators ergonomic inside an object literal.

// 5. `ThisType<T>` in object literals
// ---------------------------------------------------------------------------
//
// `ThisType<T>` is a marker that tells TS to type `this` inside an object
// literal as `T`. It's used by Vue, Pinia, and Redux Toolkit to make
// action creators ergonomic inside an object literal.
//
// Below: a typed event-emitter-style registry. Each event handler receives
// the bound `this` of the registry state — the `ThisType<State>` marker is
// what makes that work without an explicit `this:` parameter at every
// handler declaration.

export interface EventMap {
  readonly ping: () => void;
  readonly setName: (name: string) => void;
  readonly setAge: (age: number) => void;
}
export interface RegistryState {
  count: number;
  user: { name: string; age: number };
}

// `bindHandlers` returns a function whose `this` is the bound state.
export function bindHandlers<S extends object>(
  state: S,
  handlers: ThisType<S> & EventMap,
): EventMap {
  // Bind each method so `this` is the state, not the handlers object.
  return {
    ping: handlers.ping.bind(state),
    setName: handlers.setName.bind(state),
    setAge: handlers.setAge.bind(state),
  };
}

// ---------------------------------------------------------------------------
// 6. Index signatures vs `Record` vs mapped types
//
// Three ways to type a "dictionary":
//   - Index signature:  { [k: string]: T }   — accepts any string key
//   - `Record<K, V>`:   same as `{ [P in K]: V }` for union `K`
//   - Mapped type:      { [P in keyof T]: ... } for object `T`
//
// Under `noUncheckedIndexedAccess`, all three return `T | undefined`.

export type Dict<T> = { readonly [k: string]: T };
export type StringDict = Dict<string>;

export const dict: StringDict = { a: 'x', b: 'y' };
const v: string | undefined = dict['c']; // undefined with noUncheckedIndexedAccess
void v;

// ---------------------------------------------------------------------------
// 7. Generic constraints with multiple type parameters
// ---------------------------------------------------------------------------
//
// `K extends keyof T` is the canonical constraint. It makes lookup safe:
// `obj[K]` is `T[K]`, never `undefined` (when K is a key).

export function pick2<T, K extends keyof T>(obj: T, ...keys: readonly K[]): { [P in K]: T[P] } {
  const out = {} as { [P in K]: T[P] };
  for (const k of keys) out[k] = obj[k];
  return out;
}

// ---------------------------------------------------------------------------
// 8. Conditional types with `infer` — function shape extraction
// ---------------------------------------------------------------------------
//
// `infer` lets a conditional type "destructure" a type during inference.
// This is the building block of `ReturnType`, `Parameters`, `Awaited`, etc.

export type MyParameters<T> = T extends (...args: infer P) => unknown ? P : never;
export type MyReturnType<T> = T extends (...args: never[]) => infer R ? R : never;
export type MyFirstArg<T> = T extends (first: infer F, ...rest: never[]) => unknown ? F : never;

// ---------------------------------------------------------------------------
// 9. Distributive conditional types
// ---------------------------------------------------------------------------
//
// A bare type parameter on the LEFT of `extends` is "naked" — when the
// parameter is instantiated with a UNION, the conditional distributes
// over each member. Wrap in `[T]` to opt out.

export type ToArray<T> = T extends unknown ? T[] : never;
// Distributes: ToArray<string | number> = string[] | number[]

export type ToArrayNonDist<T> = [T] extends [unknown] ? T[] : never;
// Does not distribute: ToArrayNonDist<string | number> = (string | number)[]

// ---------------------------------------------------------------------------
// 10. Variance annotations: `in`, `out`, `in out` (TS 4.7+)
// ---------------------------------------------------------------------------
//
// `in T`    — contravariant (consumer)
// `out T`   — covariant (producer)
// `in out T`— bivariant
// `T`       — invariant by default in some positions, inferred elsewhere
//
// Use them when inference would pick the wrong variance.

export interface Producer<out T> {
  readonly value: T;
}
export interface Consumer<in T> {
  consume(value: T): void;
}

// ---------------------------------------------------------------------------
// Demo runner
// ---------------------------------------------------------------------------

if (import.meta.url === `file:///${process.argv[1]}`) {
  const u1 = parseUser({ name: 'Ada' }, 1);
  const u2 = parseUser({ name: 'Ada', email: 'a@b' }, 2);
  console.info('u1 =', u1, 'u2 =', u2);

  const sb = new TaggedBuilder();
  // The `this` typing in `append` keeps `TaggedBuilder` as the return type.
  void sb.append('x');

  const timer = new Timer({ ms: 1000 });
  console.info('timer =', timer.describe());

  const handlers = bindHandlers(
    { count: 0, user: { name: 'Ada', age: 36 } },
    {
      ping() {
        console.info('ping, count =', this.count);
      },
      setName(name) {
        this.user.name = name;
      },
      setAge(age) {
        this.user.age = age;
      },
    },
  );
  void handlers;
}
