# typescript-learning

A curated, code-first tour of advanced TypeScript. Twelve focused modules, each
with runnable examples and a Vitest spec — every concept is exercised, not just
explained.

## What's in here

- **Twelve modules** covering the full TypeScript spectrum: literals and
  discriminated unions, generics and variance, mapped/conditional/template
  types, classes and decorators, module typing and declaration merging,
  async/iterators/generators, type-level programming, functional patterns,
  runtime validation, build configuration, design patterns, and compiler
  internals.
- **Strict-mode tsconfig** with every relevant option turned on:
  `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `noImplicitOverride`, `noPropertyAccessFromIndexSignature`, `isolatedModules`,
  `experimentalDecorators`, ES2024 lib for `Promise.withResolvers`.
- **70 unit and type tests** with Vitest, including `expectTypeOf` checks
  for compile-time guarantees.
- **Code that runs**: every module has a runnable demo, and `npm test`
  exercises all public APIs.

## Layout

```
src/
  01-basics/         Discriminated unions, exhaustiveness, type guards
  02-generics/       Variance, constraints, phantom types, `const` params
  03-advanced-types/ Mapped, conditional, template literal, `satisfies`
  04-classes/        Abstract, mixins, decorators, accessors
  05-modules/        Declaration merging, ambient, import type, exports
  06-async/          Generators, async iterators, AbortSignal, AsyncDisposable
  07-type-level/     Path types, type-level arithmetic, type-state machines
  08-functional/     Option, Either, pipe, lens, memoize, lens, lazy
  09-validation/     DTOs, branded smart constructors, a tiny schema library
  10-build-config/   tsconfig matrix, project references, ESM/CJS interop
  11-patterns/       Type-state, builder, repository, observer, visitor, saga
  12-performance/    `const` params, `satisfies`, structural typing, recursion
  globals.d.ts       Global NodeJS.ProcessEnv + asset ambient types
tests/               One spec per module
```

## Quick start

```bash
npm install
npm run typecheck      # strict tsc --noEmit
npm test               # vitest run, 70 specs
npm run test:watch     # interactive
npm run lint           # eslint
```

## Learning path

The modules are designed to be read in order. Each builds on the previous.

| #   | Module                              | Key topics                                                                  |
| --- | ----------------------------------- | --------------------------------------------------------------------------- |
| 01  | Type System Fundamentals            | Literal types, `as const`, tagged unions, exhaustiveness (`assertNever`)   |
| 02  | Generics                            | Constraints, variance (in/out), phantom types, conditional inference         |
| 03  | Advanced Types                      | Mapped types, key remapping, template literals, `satisfies`, opaque types   |
| 04  | Classes & OOP                       | `abstract`, mixins, decorators (TC39 stage 3), `this`-typing, accessors     |
| 05  | Modules & Declaration Files          | Declaration merging, ambient `.d.ts`, `import type`, conditional exports    |
| 06  | Async, Iterators, Generators        | Async iterators, generators, `AbortController`, `AsyncDisposable`           |
| 07  | Type-Level Programming              | Path navigation, type-level arithmetic, type-state machines, recursive sort |
| 08  | Functional Patterns                 | `Option<T>`, `Either<E,A>`, `pipe`, lens, memoize (Memo + Weak)             |
| 09  | DTO & Runtime Validation            | Branded IDs, smart constructors, a 100-line combinator schema library       |
| 10  | Build & Project Config              | tsconfig matrix, project references, ESM/CJS interop, path aliases           |
| 11  | Patterns                            | Type-state machine, builder, repository, observer, visitor, saga            |
| 12  | Performance & Compiler Internals    | `const` type params, `satisfies`, soundness, assertion functions            |

Each module is small (typically a few hundred lines) and ends with a
`if (import.meta.url === ...)` demo block you can run with `tsx`.
