# Deep dives — what each module teaches, concretely

## Module 01 — Type System Fundamentals

- `literalHello` keeps type `"hello"`; `widenedHello` widens to `string`.
- `Result<T, E>` is a tagged union: `{ ok: true; value } | { ok: false; error }`.
- `assertNever(x: never)` makes a switch over a union compile-error if any
  member is unhandled. Add a new variant to `Shape` and `area()` fails to build
  until you handle it.
- `isUser(x: unknown): x is User` — custom type guards.
- `handleEvent` uses `in` narrowing on a tagged union.

## Module 02 — Generics

- `Box<out T>` is covariant, `Consumer<in T>` is contravariant.
- `pick<T, K extends keyof T>` produces `Pick<T, K>`; `noUncheckedIndexedAccess`
  forces `out[k]` to be typed correctly.
- `Brand<T, K> = T & { readonly __brand: K }` — phantom types. `UserId` and
  `OrderId` cannot be interchanged at compile time even though both are
  `string` at runtime.
- Type-level `Last<T>`, `GreaterThan<A, B>`, and `Sort<T>` operate on tuple shapes.

## Module 03 — Advanced Types

- Hand-rolled `MyPartial`, `MyRequired`, `MyReadonly`.
- `Getters<T>` uses key remapping (`as \`get${Capitalize<…>}\``).
- `EventName<'click'>` resolves to `"onClick"`; `CssValue = \`${number}${'px'|'rem'|'em'|'%'}\``.
- `routes as const satisfies Record<string, Route>` — keeps literal types AND
  validates the contract.
- `Json = ...` recursive type. `Opaque<T, K extends symbol>` is the most
  ergonomic nominal-type trick.
- **Template-literal DSL**: `ExtractParams<P>` derives `{ id: string; postId: string }`
  from `'/users/:id/posts/:postId'`; `buildUrl` uses the inferred type to enforce
  the parameter set at the call site. This is the core technique behind
  Hono / tRPC / Zod's path APIs.

## Module 04 — Classes & OOP

- `abstract class Shape2D` with `override readonly kind`.
- `TimestampedBase(Base)` and `Serializable(Base)` are mixins. Note the
  `Constructor<T = object> = new (...args: any[]) => T` signature that TS
  requires for composable mixin classes.
- TC39 stage-3 decorators: `@sealed`, `@logged`, `@format('currency')` are
  real decorators (not the legacy `experimentalDecorators` flavour).
- `Port` uses `#port` with get/set validation in strict mode.
- `this`-typing in `Version.compareTo`.

## Module 05 — Modules & Declaration Files

- A `User` is defined twice in the same file — TS merges them.
- `Currency` is both an interface AND a namespace with statics.
- `globals.d.ts` augments `NodeJS.ProcessEnv` with required env variables and
  declares ambient modules for `*.json` and `*.module.css`.
- `verbatimModuleSyntax` discipline: type-only imports use `import type`.

## Module 06 — Async, Iterators, Generators

- `paginate<T>()` is an async generator that yields pages until exhausted.
- `withTimeout()` uses `Promise.withResolvers()` (ES2024) instead of the
  `new Promise(executor)` form.
- `abortable()` checks `signal.aborted` between yields to short-circuit on cancel.
- `AsyncCounter implements AsyncIterable<number>` via `async *[Symbol.asyncIterator]()`.
- `Logger extends AsyncDisposable` and `doWork()` uses `await using` (TS 5.2+).
- `parallel()` is a worker-pool that respects `concurrency`.

## Module 07 — Type-Level Programming

- `Inc`, `Dec`, `Add`, `Sub` operate on tuple lengths.
- `Get<T, 'a.b.c'>` recursively walks dot-paths.
- `Split<S, D>` and `Join<S, D>` are the type-level string utilities.
- The `Conn<S>` interface encodes a state machine: `connect` is callable
  only on a `Disconnected` connection, `open` only on a `Connecting` one.
- `EventBuilder<Keys>` accumulates literal event names — `fire<K extends Keys>`
  rejects keys you forgot to register.

## Module 08 — Functional Patterns

- `Option<T> = { kind: 'some'; value } | { kind: 'none' }` is total.
- `Either<E, A>` distinguishes failure causes.
- `pipe(a, f1, f2, f3)` and `flow(...)` chain functions without losing types.
- `lens<S, A>` + `composeLens` give you immutable focal updates.
- `memoize1` uses `JSON.stringify(args)` for the cache key;
  `memoizeWeak` uses a `WeakMap`.

## Module 09 — DTO & Runtime Validation

- Smart constructors: `UserId`, `Email`, `PositiveInt`, `Iso8601`,
  `NonEmptyString` are all `Brand<T, Tag>`-typed and reject bad input.
- A 100-line combinator library: `string`, `number`, `boolean`, `literal`,
  `nullable`, `optional`, `array`, `object`, `union`. Each parser is
  `(u: unknown) => Result<A, string>`.
- `parseCreateUserDto` returns `Result<CreateUserDto, string>` — consume the
  result; after that, downstream code gets fully-typed branded values.

## Module 10 — Build & Project Config

- This project's `tsconfig.json` is the worked example. Every option is on
  for a reason.
- The module comments explain project references (`composite: true`),
  `verbatimModuleSyntax`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  ESM/CJS interop, and conditional exports — without forcing you to read a
  thousand-line doc.

## Module 11 — Patterns

- `Connection<S extends ConnectionState>` — a generic class where the state
  is encoded in the type parameter. Each method's `this:` constraint ensures
  you can only call `open` on a `Connecting` connection.
- `QueryBuilder<Have>` accumulates literal key names; `build()` validates the
  required keys are set.
- `Repository<T extends Identified>` + `InMemoryRepository<T>` — textbook
  hexagonal ports-and-adapters.
- `Emitter<E>` types each event by name: `e.on('login', u => ...)` knows `u`
  is `User`.
- `Expr` + `visit()`: visitor with single object dispatch + exhaustiveness.
- `saga()` is a generator-based async state machine for long-running flows.

## Module 12 — Performance & Compiler Internals

- `function tuple<const T>(...args: T)` (TS 5.0+) preserves literal types;
  without `const`, `T` widens to `string[]`.
- `asserts cond is T` — assertion functions that narrow for the rest of the
  scope.
- `satisfies` keeps narrow inference while checking a contract.
- `Promise.withResolvers()` preferred over `new Promise((resolve, reject) => ...)`.
- `Object.freeze` + `as const` — type-level immutability.
- Recursion depth warnings and mitigations.

## Module 13 — TS 5.x Cutting-Edge Features

- `const` type parameters: `tupleConst('a', 'b')` infers `readonly ['a', 'b']`.
- `NoInfer<T>`: lock inference to a specific position. `createFSMSafe({ initial: 'idle', states: { idle, running, stopped } })` widens `S` from `states`, not `initial`.
- `using` / `await using`: explicit resource management. `TempFile implements Disposable`; `using f` calls `[Symbol.dispose]()` on scope exit.
- ES2025 iterator helpers: `naturals.filter(...).take(n).toArray()` — lazy, short-circuits on infinite sources.
- `DeepAwaited<T>`: nested `Promise<Promise<Promise<number>>>` → `number`.
- `asserts cond` polyfill for older runtimes.

## Module 14 — Overloads & Advanced Call Signatures

- Function overloads: `parseUser(raw, 1)` → `UserV1`; `parseUser(raw, 2)` → `UserV2`.
- Constructor overloads: `new Timer(opts)` selects the right `mode` by `in`-narrowing the options.
- `this:` parameter typing: `TaggedBuilder extends StringBuilder`'s `append` returns `this` (preserves subclass type).
- Method bivariance vs function-property contravariance under `strictFunctionTypes`.
- `ThisType<T>` in `bindHandlers<S>(state, handlers: ThisType<S> & EventMap)`.
- Distributive conditional types: `ToArray<string | number>` distributes to `string[] | number[]`; `ToArrayNonDist` does not.
- Infer utility types: `MyParameters<T>`, `MyReturnType<T>`, `MyFirstArg<T>`.

## Module 15 — Type Predicates, Assertion Functions & Branded Narrowing

- Type predicate: `isFish(p: Pet): p is Fish`. Filter-style: `compact<T>(items): T[]` widens via `isNotNullish`.
- Assertion function: `assertIsString(x: unknown): asserts x is string`. Narrows for the rest of the scope without `if` at the call site.
- Branded types: `UserId = Brand<string, 'UserId'>`; smart constructor `makeUserId` and assertion `assertUserId` are the only ways to produce one.
- Exhaustiveness: `assertNever(e)` makes a switch over `AppEvent` compile-error on missing variants.
- `in`-narrowing: `describeVehicle(v)` discriminates `Car | Boat` by checking `'engine' in v` and `'sails' in v`.
- `instanceof` narrowing on custom `Error` subclasses (`NotFoundError`, `PermissionError`).
- `this:` parameter and `this: Counter` to pin the receiver type when methods are unbound.
- Common pitfalls: `as` after a guard, predicates in callbacks, optional chaining on the discriminant.

## Module 16 — Real-World Type-System Patterns

- End-to-end type-safe RPC: `ApiContract` is `(input) => Promise<output>`; `Transport.call<K>` infers input/output at the call site.
- DI container: `Container.register(tag, value)` and `resolve(tag)`. `buildUserService(c)` wires `UserRepo` and `Logger` into `UserService`.
- Plugin registry: `PluginRegistry<A>` rejects duplicate names; `featureFlag(name, enabled)` returns a `Plugin<FeatureFlag>`.
- Form schemas: `Form<F>` aggregates `Field<T>` members; `FieldValues<F>` extracts the per-key value type via `F[K] extends Field<infer V> ? V : never`.
- Typed event bus: `TypedBus.on<E extends EventName>(name, fn)` and `emit<E>(name, payload)` with `EventMap[E]` payload types.
- Type-safe env: `parseEnv<S extends EnvSchema>(schema, raw)` returns `Result<ParsedEnv<S>, errors>`.

## Module 17 — Declarations & JSDoc

- Hand-writing `.d.ts` for an untyped npm package (`left-pad` style).
- `declare global` for ambient types (`Window.__APP_VERSION__`, `__BUILD_ID__`).
- Module augmentation patterns (`declare module 'express' { interface Request { user?: ... } }`).
- `tsconfig` settings that affect declaration files: `declaration`, `declarationMap`, `emitDeclarationOnly`, `stripInternal`.
- JSDoc-typed JavaScript: `// @ts-check`, `@param`, `@returns`, `@template T`.
- Source vs `.d.ts` shipping: when to use each, what `tsc --declaration` does.
- DefinitelyTyped: `@types/*` packages and the resolver.
- Type-only imports: `import type { Foo } from './bar'`.
- `tsconfig` reference snippet for publishing a typed library.

## Module 18 — Error Handling Patterns

- Two strategies: `throw` for unrecoverable / programmer errors; `Result<T, E>` for domain failures.
- Error union design: `AppError = { kind: 'NotFound' | 'Permission' | 'Validation' | 'Network' | 'Conflict', ... }` with a `kind` discriminant.
- `Result<T, E>` monad: `ok`, `err`, `map`, `flatMap`, `mapError`, `unwrap`, `unwrapOr`.
- Composition: `all` (short-circuit), `allSettled` (collect both), `first` (first success or all errors).
- Async: `tryAsync(p: Promise<T>): Promise<Result<T, unknown>>` and `trySync`.
- `toAppError(cause: unknown)` narrows an unknown cause to the AppError union.
- Stack-trace preservation: pass the original as `cause` on the new error.
- Error boundaries in async iterators: `safeAsyncMap` yields `Result<U, E>` per item.
- Saga with typed error propagation: `runSagaWithErrors` short-circuits on the first `Result.err`.
- "Errors as values" discipline: when to throw, when to return Result, how to translate at the boundary.
