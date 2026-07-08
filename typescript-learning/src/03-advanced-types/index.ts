/**
 * Module 3: Advanced Types
 *
 * Covers:
 *  - Mapped types
 *  - Conditional types + `infer`
 *  - Template literal types
 *  - Recursive / deferred types
 *  - `key remapping` (`as` clause in mapped types)
 *  - Built-in utility types and how to author your own
 */

// ---------------------------------------------------------------------------
// 1. Mapped types — the foundation of utility types
// ---------------------------------------------------------------------------

// Make every property optional.
export type MyPartial<T> = { [K in keyof T]?: T[K] };

// Make every property required.
export type MyRequired<T> = { [K in keyof T]-?: T[K] };

// Make everything readonly.
export type MyReadonly<T> = { readonly [K in keyof T]: T[K] };

// Add a flag `readonly` filter — drop properties of a certain shape.
export type FunctionPropertyNames<T> = {
  [K in keyof T]: T[K] extends (...args: never[]) => unknown ? K : never;
}[keyof T];

// ---------------------------------------------------------------------------
// 2. Key remapping — `as` clause in mapped types (TS 4.1+)
// ---------------------------------------------------------------------------

// Getters: turn each property into a function that returns it.
export type Getters<T> = {
  [K in keyof T as `get${Capitalize<string & K>}`]: () => T[K];
};

export interface PersonShape {
  name: string;
  age: number;
}

export const personGetters: Getters<PersonShape> = {
  getName: () => 'Ada',
  getAge: () => 42,
};

// ---------------------------------------------------------------------------
// 3. Template literal types — type-level string manipulation
// ---------------------------------------------------------------------------

export type EventName<TKind extends string> = `on${Capitalize<TKind>}`;
export type CssValue = `${number}${'px' | 'rem' | 'em' | '%'}`;
export type ApiPath = `/api/${string}`;

// Type-level assertions, exported so tests can verify them.
export type _EventNameCheck = EventName<'click'>; // "onClick"
export type _CssValueCheck = CssValue;            // `${number}${'px' | 'rem' | 'em' | '%'}`
export type _ApiPathCheck = ApiPath;              // `/api/${string}`

// ---------------------------------------------------------------------------
// 4. Conditional types + `infer`
// ---------------------------------------------------------------------------

// Extract the awaited type (re-export semantics of Awaited<>).
export type MyAwaited<T> = T extends Promise<infer Inner>
  ? Inner extends Promise<unknown>
    ? MyAwaited<Inner>
    : Inner
  : T;

// Extract return type.
export type MyReturnType<T> = T extends (...args: never[]) => infer R ? R : never;

// Extract first argument.
export type MyFirstArg<T> = T extends (first: infer F, ...rest: never[]) => unknown ? F : never;

// ---------------------------------------------------------------------------
// 5. Distributive conditional types
// ---------------------------------------------------------------------------

// `T extends U` distributes over unions when T is a naked type parameter.
export type ToPromise<T> = T extends unknown ? Promise<T> : never;

// Strip null and undefined.
export type NonNullableDeep<T> = T extends NonNullable<T> ? T : never;

// ---------------------------------------------------------------------------
// 6. Recursive types — type-level JSON
// ---------------------------------------------------------------------------

export type Json =
  | string
  | number
  | boolean
  | null
  | readonly Json[]
  | { readonly [key: string]: Json };

// ---------------------------------------------------------------------------
// 7. Deferred conditional types — pattern-match on tuple shapes
// ---------------------------------------------------------------------------

export type Reverse<T extends readonly unknown[]> = T extends readonly [infer Head, ...infer Tail]
  ? Tail extends readonly unknown[]
    ? [...Reverse<Tail>, Head]
    : never
  : [];

export type _ReverseCheck = Reverse<[1, 2, 3]>; // [3, 2, 1]

// ---------------------------------------------------------------------------
// 8. `as const` + satisfies — the precision pattern
// ---------------------------------------------------------------------------

export interface Route {
  readonly path: `/${string}`;
  readonly method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  readonly auth: boolean;
}

// `satisfies` keeps literal types AND ensures the contract.
export const routes = {
  listUsers: { path: '/users', method: 'GET', auth: true },
  createUser: { path: '/users', method: 'POST', auth: true },
  deleteUser: { path: '/users/:id', method: 'DELETE', auth: true },
  health: { path: '/health', method: 'GET', auth: false },
} as const satisfies Record<string, Route>;

// `routes.listUsers.method` is the literal 'GET', not the union, because of `as const`.
// `routes` is also exhaustively checked against `Record<string, Route>`.
export type _RoutesMethod = (typeof routes)['listUsers']['method']; // "GET"

// ---------------------------------------------------------------------------
// 9. Indexed access types — `T[K]` and `T[K1 | K2]`
// ---------------------------------------------------------------------------

export type ValueOf<T> = T[keyof T];

export const routesHealth: ValueOf<typeof routes> = routes.health;

// ---------------------------------------------------------------------------
// 10. `Opaque` & friends — preventing accidental interchange
// ---------------------------------------------------------------------------

export type Opaque<T, K extends symbol> = T & { readonly [k in K]: never };
export const MetersBrand: unique symbol = Symbol('Meters');
export const SecondsBrand: unique symbol = Symbol('Seconds');
export type Meters = Opaque<number, typeof MetersBrand>;
export type Seconds = Opaque<number, typeof SecondsBrand>;

export const meters = (n: number): Meters => n as Meters;
export const seconds = (n: number): Seconds => n as Seconds;

// Compile error: cannot add a Meters to a Seconds.
// const _bad: number = meters(1) + seconds(1);

if (import.meta.url === `file:///${process.argv[1]}`) {
  console.info('routes keys =', Object.keys(routes));
}
