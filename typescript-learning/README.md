# typescript-learning

> A code-first curriculum for production-grade TypeScript. Eighteen focused modules, 129 tests, zero runtime dependencies. After completion, you can design a type system for a non-trivial application and pass senior-level TS interviews.

## Goal

Learn TypeScript deeply enough to:

1. Design type-safe APIs (RPC contracts, plugin systems, form schemas) end-to-end.
2. Diagnose obscure TS errors (`TS2322`, `TS2344`, `TS2536`, …) by reading the message.
3. Pass senior/staff-level TS interviews at companies targeting 50K+ monthly.
4. Ship a library with hand-written `.d.ts` files.
5. Apply every strict-mode flag (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noPropertyAccessFromIndexSignature`) without flinching.

## What's in here

- **Eighteen modules**, each a single `index.ts` with runnable demos and a paired `*.test.ts` spec.
- **129 Vitest tests** including `expectTypeOf` checks for compile-time guarantees.
- **Strict-mode tsconfig** with every relevant option on (see "Strictness" below).
- **Zero runtime dependencies** — every example is implemented from scratch; we don't pull Zod, tRPC, or React into the modules.
- **Run or read**: every module ends with an `if (import.meta.url === ...)` demo block that you can run with `tsx`.

## Layout

```
src/
  01-basics/         Discriminated unions, exhaustiveness, type guards
  02-generics/       Variance, constraints, phantom types, type-level comparisons
  03-advanced-types/ Mapped, conditional, template literal, `satisfies`, opaque, DSL parser
  04-classes/        Abstract, mixins, TC39 decorators, `this` typing
  05-modules/        Declaration merging, ambient, `import type`, conditional exports
  06-async/          Generators, async iterators, AbortSignal, AsyncDisposable
  07-type-level/     Path types, type-level arithmetic, type-state machines
  08-functional/     Option, Either, pipe, lens, memoize
  09-validation/     Branded smart constructors, a 100-line combinator schema library
  10-build-config/   tsconfig matrix, project references, ESM/CJS interop
  11-patterns/       Type-state, builder, repository, observer, visitor, saga
  12-performance/    `const` params, `satisfies`, soundness, assertion functions
  13-ts5x/           `NoInfer`, `const T`, `using`, iterator helpers, deep Awaited
  14-overloads/      Function/constructor overloads, `this:` typing, `ThisType<T>`
  15-narrowing/      Type predicates, assertion functions, branded narrowing
  16-real-world/     RPC contracts, DI container, plugin system, forms, env, bus
  17-declarations/   `.d.ts` authoring, `declare`, JSDoc, conditional exports
  18-errors/         Result monad, error unions, async error flows, saga errors
  globals.d.ts       Global NodeJS.ProcessEnv + asset ambient types
tests/               One spec per module
```

## Quick start

```bash
npm install
npm run typecheck      # strict tsc --noEmit
npm test               # vitest run, 129 specs
npm run test:watch     # interactive
npm run lint           # eslint
npm run start:examples # tsx src/01-basics/index.ts
```

## Learning path

Read the modules in order. Each builds on the previous.

| #   | Module                              | Key topics                                                                  |
| --- | ----------------------------------- | --------------------------------------------------------------------------- |
| 01  | Type System Fundamentals            | Literal types, `as const`, tagged unions, exhaustiveness (`assertNever`)   |
| 02  | Generics                            | Constraints, variance (`in`/`out`), phantom types, conditional inference   |
| 03  | Advanced Types                      | Mapped types, key remapping, template literals, `satisfies`, opaque, **DSL** |
| 04  | Classes & OOP                       | `abstract`, mixins, TC39 decorators, `this` typing                          |
| 05  | Modules & Declaration Files         | Declaration merging, ambient `.d.ts`, `import type`, conditional exports    |
| 06  | Async, Iterators, Generators        | Async iterators, generators, `AbortController`, `AsyncDisposable`           |
| 07  | Type-Level Programming              | Path navigation, type-level arithmetic, type-state machines, recursive sort |
| 08  | Functional Patterns                 | `Option<T>`, `Either<E,A>`, `pipe`, lens, memoize                           |
| 09  | DTO & Runtime Validation            | Branded smart constructors, schema combinators                              |
| 10  | Build & Project Config              | tsconfig matrix, project references, ESM/CJS interop, path aliases           |
| 11  | Patterns                            | Type-state, builder, repository, observer, visitor, saga                    |
| 12  | Performance & Compiler Internals    | `const` params, `satisfies`, soundness, assertion functions                |
| 13  | TS 5.x Cutting Edge                 | `NoInfer`, `const T`, `using`, iterator helpers, `asserts`                 |
| 14  | Overloads & Call Signatures         | Function overloads, constructor overloads, `this:` typing, `ThisType<T>`    |
| 15  | Type Predicates & Narrowing         | `x is T`, `asserts x is T`, branded narrowing, exhaustiveness             |
| 16  | Real-World Patterns                 | RPC contracts, DI, plugin systems, form schemas, env, typed event bus     |
| 17  | Declarations & JSDoc                | Hand-writing `.d.ts`, `declare`, JSDoc in JS, conditional exports         |
| 18  | Error Handling Patterns             | `Result` monad, error unions, async error flows, saga error propagation     |

## How to use this

### If you are a beginner

Read modules 1-12 first. Don't skip — they form a tight dependency chain. The expected pace is **one module per day** with the exercises below done at the end of each.

### If you are an intermediate TS user

Skim 1-7, then dig into 8-18. Most of the interview-relevant material is in 13-18. The "what you don't know you don't know" patterns live there.

### If you are preparing for a senior / staff interview

Focus on 13-18 and the interview questions below. Bring a notebook: type each module's examples by hand, then try to break the type system before looking at the tests.

## Exercises

After each module, do the following **without running** the code first. Predict the type. Then verify.

### Module 01 — Basics

1. Add a fourth variant to `Shape`: `{ kind: 'square'; side: number }`. The compiler should tell you where to update.
2. Change `isUser` to require an `email` matching `/^[^@]+@[^@]+$/`. The test should still pass for valid users.
3. Implement `Result.flatMap` from scratch.

### Module 02 — Generics

1. Add an `isString` predicate and `isNumber` predicate, then build a discriminated union `Scalar = string | number | null | boolean` and a `coerce` that returns one of these from `unknown`.
2. Write a `pickOptional<T, K extends keyof T>` that picks the keys whose values are optional.
3. Add a `Last2<T>` type using only conditional types and `infer` (no helper types).

### Module 03 — Advanced Types

1. Add a `RequiredKeys<T>` and `OptionalKeys<T>` type using mapped types.
2. Extend `ExtractParams` to handle query strings (`:foo` in the path AND `?bar`).
3. Implement a `ParseQueryString<S extends string>` that returns the typed query object.

### Module 04 — Classes

1. Add a `Serializable` mixin that adds `toJSON()` returning a `JSON.stringify`-able object.
2. Replace the experimental `experimentalDecorators` block with TC39 stage-3 decorators and verify the type-checker agrees.
3. Implement a method on `Port` that calls `super.validate` only on the subclass.

### Module 05 — Modules

1. Add a `declare module '*.svg'` that types the import as `{ readonly src: string }`.
2. Write a `barrel.ts` for module 04 and demonstrate that the order of re-exports is irrelevant for types.

### Module 06 — Async

1. Implement `retry<T>(fn: () => Promise<T>, n: number, backoff: number): Promise<T>` that respects `AbortSignal`.
2. Build an async generator that yields every other value of its source.
3. Implement `merge<T>(...iters: AsyncIterable<T>[]): AsyncGenerator<T>`.

### Module 07 — Type-level

1. Add a `MapTypes<T, From, To>` that walks a type and replaces `From` with `To`.
2. Implement `Path<T>` that returns the union of all valid dot-paths into `T`.
3. Build a `StateMachine<S, T>` that takes a record of `state -> events -> state` and exposes only the valid transitions.

### Module 08 — Functional

1. Implement `traverse` and `sequence` for `Option<T>`.
2. Add a `chain` that takes a list of functions and a starting value (like `pipe` but applied to a list).

### Module 09 — Validation

1. Add a `tuple` parser to the schema library.
2. Add a `refine` parser that takes a base parser and a predicate.
3. Build a `discriminatedUnion` parser.

### Module 10 — Build config

1. Set up a project reference between two folders in a fresh folder.
2. Enable `noEmitOnError` and `noFallthroughCasesInSwitch` in `tsconfig.build.json`. What breaks?

### Module 11 — Patterns

1. Add a 4th state to `ConnectionState`. `close()` should now require the same `reason` argument as today.
2. Implement a `QueryBuilder.coalesce()` that returns the first non-null result.

### Module 12 — Performance

1. Add a `DeepReadonly<T>` mapped type and verify it works on nested objects.
2. Add `NoInfer` to a function where inference fights the constraint.

### Module 13 — TS 5.x

1. Build a typed `EventTarget` subclass using the new `using` syntax.
2. Build a deeply-nested Promise unwrapper with `DeepAwaited`.
3. Use `IteratorObject.map().filter().take().toArray()` on a generated source.

### Module 14 — Overloads

1. Write a `parse(input: string, fmt: 'json'): unknown; parse(input: string, fmt: 'yaml'): unknown` overload pair.
2. Make a class whose `this:` parameter is more specific in a subclass.

### Module 15 — Narrowing

1. Implement a `parseEnv`-style function that returns `Result<Env, ValidationError>` instead of throwing.
2. Add an assertion function that asserts an `unknown` is a `Record<string, unknown>`.
3. Build a negative type predicate (use `Exclude`).

### Module 16 — Real-world

1. Add `update` and `delete` methods to the `ApiContract`.
2. Add a `lifecycle` plugin to the registry (e.g., `onStart`, `onStop`).
3. Add a `transform` step to the form: field `f` whose value depends on field `g`.

### Module 17 — Declarations

1. Write a `.d.ts` for an untyped package you actually use.
2. Convert module 09 to ship only `.d.ts` (no `.ts` source) and verify a consumer still gets full types.

### Module 18 — Errors

1. Add a `ResultAsync<T, E>` class with `map`, `flatMap`, `andThen`.
2. Add a `tapError` that runs a side effect on failure.
3. Build an HTTP handler that translates `AppError` to status codes.

## Interview questions

These come up at senior / staff level. After each, **write the answer in code**, not prose.

### Q1 — Variance

> Explain the difference between `in T`, `out T`, and `in out T` in a generic type parameter. When would you use each?

Implement an `EventEmitter<E>` where the payload is `E` and demonstrate the variance difference between `Consumer<in T>` and `Producer<out T>`.

### Q2 — Type predicates vs assertion functions

> When do you reach for `x is T` vs `asserts x is T`?

Write a parser that uses both: a predicate for filter, an assertion for the top-level entry point.

### Q3 — `NoInfer`

> What problem does `NoInfer<T>` solve? Give a use case.

Build a `createReducer<S, A>(initial: S, actions: Record<A, (s: S) => S>)` where `A` is inferred from the actions, not the initial state.

### Q4 — `Result` vs `throw`

> When should you use `Result<T, E>` instead of `throw`?

For your codebase, identify the last 3 functions that threw a domain error. Convert one to `Result`. The change should be observable at the call site without losing type information.

### Q5 — Branded types

> How do you prevent passing a `UserId` where an `OrderId` is expected, even though both are strings at runtime?

Build a `UserId`, `OrderId`, `Email` with smart constructors. Write a function that takes one of each. Verify the compiler rejects transposed arguments.

### Q6 — Type-level state machines

> Show me a connection that can't call `close` until it's `open`.

Build a `Connection<S>` where `S` is one of `'idle' | 'connecting' | 'open' | 'closed'`. Method availability must be encoded in `S`.

### Q7 — `this` parameter typing

> How do you preserve the subclass type in a method chain?

Implement a `Fluent` builder where the return type of `withFoo()` is the most-derived subclass.

### Q8 — Overloads

> When do you write overloads instead of generics?

Take a `parse(input, format)` function. Write the overloads. Write the generic alternative. Compare readability and inference.

### Q9 — `satisfies` vs `as`

> What's the difference between `x satisfies T` and `x as T`?

Take a `routes` object with method/path literal types. Show the loss of literal types when you use `as` and the preservation with `satisfies`.

### Q10 — Template literal DSLs

> How does Hono / tRPC / Zod derive the parameter object from a path literal?

Build a `buildUrl<P extends string>(path: P, params: ExtractParams<P>)` from scratch.

### Q11 — `using` and `Disposable`

> What does `using` give you that try/finally doesn't? When does it matter?

Implement a `ConnectionPool` where each connection is `Disposable`. Show the cleanup on throw.

### Q12 — `asserts` keyword

> How does `asserts` differ from a type predicate function? When would you write each?

Write an `assertBigInt` and an `isBigInt`. Show the call-site difference.

### Q13 — Declaration files

> A third-party package lacks types. You can't add a DefinitelyTyped package. What do you do?

Write a `.d.ts` for an imaginary `left-pad`-style package. Add a `declare module 'left-pad' { ... }` block.

### Q14 — Conditional exports

> Your library needs to ship both ESM and CJS. Show the `package.json`.

Write a complete `package.json` with `exports` for `.` and `./internal`.

### Q15 — Type narrowing pitfalls

> What's wrong with this code? `if (typeof x === 'string') { const n: number = x as any; }`

Identify three narrowing pitfalls. Write code that does the right thing for each.

## Strictness

All relevant flags are on. See `README-advanced.md` and `README-notes.md` for what each does and why it matters. The configuration is opinionated; flipping a flag off is allowed but must be a conscious decision with a comment.

## Contributing

This is a personal curriculum; contributions are not expected. If you find a bug, open an issue with the test name and the module number.
