/**
 * Module 7: Type-Level Programming
 *
 * Covers:
 *  - Tuple manipulation at the type level
 *  - Type-level natural numbers, arithmetic, comparison
 *  - Path navigation types: `Get<T, 'a.b.c'>`
 *  - Type-level string operations (Split, Join)
 *  - Type-state machines (state encoded in the type)
 *  - Builder pattern with literal type accumulation
 *  - HKT simulation via kind-tagged interfaces
 *
 * The point of this module: TS's type system is a tiny lambda calculus.
 * Push it as far as it'll go to make impossible states unrepresentable.
 */

// ---------------------------------------------------------------------------
// 1. Tuple ops
// ---------------------------------------------------------------------------

export type Length<T extends readonly unknown[]> = T['length'];

export type Head<T extends readonly unknown[]> = T extends readonly [infer H, ...unknown[]] ? H : never;

export type Tail<T extends readonly unknown[]> = T extends readonly [unknown, ...infer Rest] ? Rest : [];

export type Last<T extends readonly unknown[]> = T extends readonly [...unknown[], infer L] ? L : never;

export type Concat<A extends readonly unknown[], B extends readonly unknown[]> = [...A, ...B];

export type Reverse<T extends readonly unknown[]> = T extends readonly [infer H, ...infer R]
  ? R extends readonly unknown[]
    ? [...Reverse<R>, H]
    : never
  : [];

export type Zip<A extends readonly unknown[], B extends readonly unknown[]> = A extends readonly [infer AH, ...infer AR]
  ? B extends readonly [infer BH, ...infer BR]
    ? AR extends readonly unknown[]
      ? BR extends readonly unknown[]
        ? [[AH, BH], ...Zip<AR, BR>]
        : never
      : never
    : []
  : [];

// ---------------------------------------------------------------------------
// 2. Type-level natural numbers
// ---------------------------------------------------------------------------

// Build a tuple of length N (capped at ~30 to avoid TS recursion limits).
type BuildTuple<L extends number, Acc extends unknown[] = []> = Acc['length'] extends L
  ? Acc
  : BuildTuple<L, [unknown, ...Acc]>;
export type Inc<N extends number> = [...BuildTuple<N>, unknown]['length'];
export type Dec<N extends number> = BuildTuple<N> extends readonly [unknown, ...infer R] ? R['length'] : 0;
export type Add<A extends number, B extends number> = [...BuildTuple<A>, ...BuildTuple<B>]['length'];
export type Sub<A extends number, B extends number> = BuildTuple<A> extends [...BuildTuple<B>, ...infer R]
  ? R['length']
  : 0;
// ---------------------------------------------------------------------------
// 3. Type-level comparison
// ---------------------------------------------------------------------------
export type IsZero<N extends number> = N extends 0 ? true : false;
export type GreaterThan<A extends number, B extends number> = BuildTuple<A> extends [
  ...BuildTuple<B>,
  ...infer _,
]
  ? _['length'] extends 0
    ? false
    : true
  : false;
export type LessThan<A extends number, B extends number> = GreaterThan<B, A>;
export type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// ---------------------------------------------------------------------------
// 4. Path navigation: `Get<T, 'a.b.c'>`
// ---------------------------------------------------------------------------

export type Get<T, P extends string> = P extends `${infer Head}.${infer Rest}`
  ? Head extends keyof T
    ? Get<T[Head], Rest>
    : never
  : P extends keyof T
    ? T[P]
    : never;

interface Config {
  server: { host: string; port: number; tls: { enabled: boolean; cert?: string } };
  db: { url: string; pool: number };
}

export type _HostType = Get<Config, 'server.host'>; // string
export type _PortType = Get<Config, 'server.port'>; // number
export type _TlsEnabled = Get<Config, 'server.tls.enabled'>; // boolean

// Set path (writes) — keep as an exercise: this is a common interview prompt.
// type Set<T, P extends string, V> = { ... } — partial on the path; rest spread.

// ---------------------------------------------------------------------------
// 5. String ops at the type level
// ---------------------------------------------------------------------------

export type Split<S extends string, D extends string> = S extends `${infer Head}${D}${infer Tail}`
  ? [Head, ...Split<Tail, D>]
  : [S];

export type Join<S extends readonly string[], D extends string> = S extends readonly [
  infer Head extends string,
  ...infer Rest extends string[],
]
  ? Rest extends []
    ? Head
    : `${Head}${D}${Join<Rest, D>}`
  : '';

export const splitExample: Split<'a.b.c', '.'> = ['a', 'b', 'c'];
export const joinExample: Join<['x', 'y', 'z'], '-'> = 'x-y-z';

// ---------------------------------------------------------------------------
// 6. Type-state machine
// ---------------------------------------------------------------------------

// The connection's state is encoded in its type. You can only call methods
// valid for the current state.
export interface Disconnected {
  readonly status: 'disconnected';
}
export interface Connecting {
  readonly status: 'connecting';
}
export interface Connected {
  readonly status: 'connected';
  readonly sessionId: string;
}
export interface Failed {
  readonly status: 'failed';
  readonly reason: string;
}

export type ConnState = Disconnected | Connecting | Connected | Failed;

export interface Conn<S extends ConnState> {
  state: S;
}

export function connect(_c: Conn<Disconnected>): Conn<Connecting> {
  return { state: { status: 'connecting' } };
}

export function ready(c: Conn<Connecting>, sessionId: string): Conn<Connected> {
  if (c.state.status !== 'connecting') throw new Error('unreachable');
  return { state: { status: 'connected', sessionId } };
}

export function fail(c: Conn<Connecting>, reason: string): Conn<Failed> {
  if (c.state.status !== 'connecting') throw new Error('unreachable');
  return { state: { status: 'failed', reason } };
}

// You can't call `ready` on a `Conn<Disconnected>` — compile error.

// ---------------------------------------------------------------------------
// 7. Builder with literal accumulation
// ---------------------------------------------------------------------------

// Each method appends a key to a string-literal union, so by the end
// `result` knows all keys that were set.
export class EventBuilder<Keys extends string = never> {
  private handlers: Partial<Record<string, () => void>> = {};
  private _keys: Keys[] = [];

  on<K extends string>(event: K, handler: () => void): EventBuilder<Keys | K> {
    this.handlers[event] = handler;
    (this._keys as string[]).push(event);
    return this as unknown as EventBuilder<Keys | K>;
  }
  has<K extends string>(event: K): this is EventBuilder<Keys | (Keys & K)> {
    return event in this.handlers;
  }
  fire<K extends Keys>(event: K): void {
    this.handlers[event]?.();
  }
  listEvents(): readonly Keys[] {
    return this._keys;
  }
}

// ---------------------------------------------------------------------------
// 8. HKT simulation
// ---------------------------------------------------------------------------

// TS lacks true HKTs. We simulate them with a `Kind` interface and apply.
export interface Kind<F, A> {
  readonly _f: F;
  readonly _a: A;
}

export interface ArrayF extends Kind<ArrayF, never> {
  // marker
}
export interface OptionF extends Kind<OptionF, never> {}

export interface MapF<F, A, B> {
  <X>(fa: Kind<F, A> & { value: X }): Kind<F, B> & { value: X };
}

// A tiny "type-class" for Functor: real HKTs would let us write it generically.
// The `F` parameter is phantom — the type-class is keyed by F but the methods
// here operate on the underlying { value } container, so we accept it and ignore.
export interface FunctorOps<F> {
  map<A, B>(fa: { value: A }, f: (a: A) => B): { value: B };
  readonly _phantom?: F;
}

export const arrayFunctor: FunctorOps<ArrayF> = {
  map: (fa, f) => ({ value: f((fa as unknown as { value: unknown }).value as never) }),
};

// ---------------------------------------------------------------------------
// 9. Type-level sort (illustrative, capped)
// ---------------------------------------------------------------------------

export type Sort<T extends readonly number[]> = T extends readonly [
  infer H extends number,
  ...infer Rest extends number[],
]
  ? Insert<H, Sort<Rest>>
  : [];

type Insert<N extends number, T extends readonly number[]> = T extends readonly [
  infer H extends number,
  ...infer Rest extends number[],
]
  ? LessThan<N, H> extends true
    ? [N, H, ...Rest]
    : [H, ...Insert<N, Rest>]
  : [N];

export const sortedExample: Sort<[3, 1, 4, 1, 5, 9, 2, 6]> = [1, 1, 2, 3, 4, 5, 6, 9];
