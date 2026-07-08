# Design choices and notes

## Why TypeScript 5+?

- `const` type parameters (5.0)
- `using` and `await using` (5.2)
- `Promise.withResolvers` (ES2024, available in TS lib 5.4+)
- Stage-3 decorators with proper typing

If you're stuck on TS 4.x, decorators and `Promise.withResolvers` won't
type-check — disable them in `tsconfig.json` or upgrade.

## Strictness settings explained

| Flag                              | What it enforces                                       | Cost                       |
| --------------------------------- | ------------------------------------------------------ | -------------------------- |
| `strict: true`                    | All of: no implicit `any`, strict null checks, etc.    | Forces nullable handling   |
| `noUncheckedIndexedAccess`        | `arr[i]` is `T \| undefined`                           | Adds nullish checks        |
| `exactOptionalPropertyTypes`      | `x?: T` ≠ `x: T \| undefined`                          | Mismatched object literals |
| `noImplicitOverride`              | Subclass methods overriding a base must use `override` | Three characters per method |
| `noPropertyAccessFromIndexSignature` | Use `o['key']` for records                             | Bracket notation           |
| `isolatedModules`                 | Each file parses in isolation (esbuild, swc)           | `import type` discipline   |

Keep them all on.

## Validation: when to reach for what

- Boundary data (network, env, config, JSON): use a schema. In this project we
  shipped a tiny library at `src/09-validation` — in real code use Zod,
  Valibot, or Typia.
- One-off shape checks: a `type guard` with `in` / `typeof`.
- TS knows more than you can express: an unchecked cast with a one-line reason.

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

## Why include a mixin example?

Mixins are a recurring interview topic, and the `Constructor<T>` shape is
tricky to write from scratch. The `(...args: any[])` parameter is a TS
requirement for it to recognize the returned class as composable.

## What's intentionally NOT here

- React / Vue / Solid: out of scope for a TS project.
- tRPC / GraphQL: integration-layer concerns.
- Zod / Valibot: built a minimal stand-in to keep deps zero.
- `d.ts` generation from source: that's `tsc --declaration` and project
  references — covered in module 10.
