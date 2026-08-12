# Design choices and notes

## Why TypeScript 5+?

- `const` type parameters (5.0)
- `using` and `await using` (5.2)
- `NoInfer<T>` (5.4)
- `Promise.withResolvers` (ES2024, available in TS lib 5.4+)
- Iterator helpers via `IteratorObject` (ES2025 / TS 5.6+)
- Stage-3 decorators with proper typing

If you're stuck on TS 4.x, decorators, `using`, and `NoInfer` won't
type-check — disable them in `tsconfig.json` or upgrade.

## Strictness settings explained

| Flag                                | What it enforces                                       | Cost                       |
| ----------------------------------- | ------------------------------------------------------ | -------------------------- |
| `strict: true`                      | All of: no implicit `any`, strict null checks, etc.    | Forces nullable handling   |
| `noUncheckedIndexedAccess`          | `arr[i]` is `T \| undefined`                           | Adds nullish checks        |
| `exactOptionalPropertyTypes`        | `x?: T` ≠ `x: T \| undefined`                          | Mismatched object literals |
| `noImplicitOverride`                | Subclass methods overriding a base must use `override` | Three characters per method |
| `noPropertyAccessFromIndexSignature` | Use `o['key']` for records                             | Bracket notation           |
| `isolatedModules`                   | Each file parses in isolation (esbuild, swc)           | `import type` discipline   |

Keep them all on.

## Validation: when to reach for what

- Boundary data (network, env, config, JSON): use a schema. In this project we
  shipped a tiny library at `src/09-validation` — in real code use Zod,
  Valibot, or Typia.
- One-off shape checks: a `type guard` with `in` / `typeof`.
- TS knows more than you can express: an unchecked cast with a one-line reason.
- Async I/O: `tryAsync(p): Promise<Result<T, unknown>>` (module 18).

This project uses the first two categories. Unchecked casts carry a comment
naming the boundary.

## Why a `Result` instead of throwing?

Throwing moves control flow out of the type system. Callers that swallow
errors become invisible bugs. `Result<T, E>` puts the error on the type:

```ts
function loadUser(id: string): Result<User, NotFoundError | NetworkError>;
```

Now `map`, `flatMap`, `unwrap`, and `match` are total functions; the compiler
forces you to handle failure.

Module 18 is the deep dive on this discipline — when to throw, when to
return Result, how to compose multiple Results, and how to convert at
async boundaries.

## Why include a mixin example?

Mixins are a recurring interview topic, and the `Constructor<T>` shape is
tricky to write from scratch. The `(...args: any[])` parameter is a TS
requirement for it to recognize the returned class as composable.

## Why `NoInfer` matters

Without `NoInfer`, `createFSM({ initial: 'idle', states: { idle, running, stopped } })`
forces `S` to be inferred from `initial` first, and the type-checker
rejects `running` and `stopped` as extras. `NoInfer<S>` makes the
`initial` position ineligible for inference, so `S` widens from the
`states` keys. This is the canonical fix for the "inference fights the
constraint" problem.

## Why explicit overloads instead of generics

Function overloads give you a stable, narrow signature at the call site.
A single generic signature with conditional types may also work but is
harder to read, harder to debug, and the inference can surprise. Reach
for overloads when the inputs are *finite variations* of one another
("two call shapes"), not arbitrary.

## Why `satisfies` over `as`

`satisfies T` keeps the narrow literal type *and* validates against `T`.
`x as T` erases the literal type and replaces it with `T`. For a `routes`
object with `method: 'GET' | 'POST' | ...`, you want the literal `'GET'`
to survive so the route handler can dispatch on it.

## Why include a tiny schema library

Zod, Valibot, Typia are excellent but adding a dep for a teaching project
adds noise. Module 09's combinator library is ~100 lines and exercises
the same concepts: smart constructors, parsers as `(u: unknown) => Result<A, string>`,
`object`/`array`/`union`/`literal`/`optional`/`nullable`. The translation
to Zod is mechanical.

## Why `using` and `await using`

`using f = new TempFile('/tmp/x')` calls `[Symbol.dispose]()` at the
end of the scope, even on throw. This eliminates a class of "I forgot
to close the file in the catch branch" bugs. TS 5.2+.

## What's intentionally NOT here

- React / Vue / Solid: out of scope for a TS project. The principles
  transfer directly: `FC<Props>` is just a function type, `useState`'s
  generic constrains the state shape, and `useRef<T>(null)` is a
  `MutableRefObject<T | null>`.
- tRPC / GraphQL: integration-layer concerns. Module 16's `ApiContract`
  is the tRPC pattern stripped of the RPC transport.
- Zod / Valibot: built a minimal stand-in to keep deps zero.
- `d.ts` generation from source: that's `tsc --declaration` and project
  references — covered in modules 10 and 17.

## Reading order

If you are new to TypeScript:

1. Modules 1-7 are sequential and each builds on the previous.
2. Module 8 (functional) can be read in parallel with 9-11.
3. Modules 12-13 are the "modern TS" core.
4. Modules 14-18 are the senior-engineer tier.

If you are intermediate (you've used TS for a year):

1. Skim 1-7 to find gaps.
2. Read 8-12 sequentially.
3. Spend a week on 13-18. The exercises are senior-interview relevant.

## Goal alignment

This curriculum is designed so a developer who finishes it can:

- Pass a 50K-tier TS interview (variance, narrowing, type-level programming, declaration files).
- Design a type system for a non-trivial application (RPC, plugin systems, forms, env, errors).
- Read and understand any TS error message (the `// @ts-expect-error` discipline).
- Ship a typed library (modules 10 + 17).
