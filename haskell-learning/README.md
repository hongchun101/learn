# haskell-learning

A **from-zero-to-expert** Haskell curriculum. Every chapter ships
runnable, idiomatic code you can read top-to-bottom, plus tests so the
behaviour is locked down.

> Audience: engineers who already know a mainstream language (Rust, Scala,
> TypeScript, etc.) and want to learn Haskell by *type-driven*
> progression rather than toy puzzles.

---

## Table of contents

| Ch | Topic                                                     |
| -- | ---------------------------------------------------------- |
| 01 | Basics: expressions, functions, pattern matching, recursion |
| 02 | Lists & Strings: laziness, `Text`, fold patterns            |
| 03 | Higher-order: lambdas, partial application, combinators     |
| 04 | Type classes: `Eq`/`Ord`/`Show`, `data`/`newtype`/`type`   |
| 05 | `Semigroup`, `Monoid`, `Foldable`, `Map`, `Set`             |
| 06 | `Functor`, `Applicative`, validation patterns               |
| 07 | `Monad`, `do`, transformers (`MaybeT`, `StateT`)            |
| 08 | `IO`: args, files, exceptions, `withFile`                   |
| 09 | Parser combinators + a minimal JSON-form parser             |
| 10 | Concurrency: `forkIO`, `MVar`, `STM`, `async`/`race`        |
| 11 | Testing: `Tasty` + HUnit, QuickCheck properties             |
| 12 | Advanced: GADTs, type families, existentials, `RankNTypes`  |
| 13 | Expert: `ST`, FFI sketch, `TemplateHaskell` intro           |

## Quick start

You need either `stack` (recommended) or `cabal-install` + GHC.

```bash
# Option A — stack
stack --no-install-ghc --system-ghc build           # build everything
stack test                                          # run all tests
stack run haskell-learning-demo                     # walk the chapter demos

# Option B — cabal
cabal v2-build
cabal v2-test
cabal v2-run haskell-learning-demo
```

When you want to give students an out-of-the-box toolchain:

```bash
stack ghci src/Basics.hs        # :l a single chapter, REPL-play it
stack ghci haskell-learning:lib # whole library loaded
```

## Repository layout

```
src/                Modules + the demo executable
  Main.hs           Walks every chapter and prints its results
  Basics.hs         ... etc ...
tests/Test.hs       Tasty suite for the chapters that have IO-free parts
docs/               Long-form guides (e.g. for users coming from Cangjie)
```

## Learning path

Each chapter is **read in order**. Code is heavily commented; every
non-trivial example includes the *why*, not just the *what*. Later
chapters deliberately reuse earlier abstractions so the curriculum
reinforces itself.

If you already know Scala's cats or Rust's ownership model, skim Ch01–Ch04
for syntax only and lean harder on Ch05–Ch13.

## Contributing

Inside `Main.hs` you can see which demos run by default. To add a new
demo:

1. Add the function to the matching module.
2. Register the call in `Main.hs`'s `chapters` list.
3. Add tests under `tests/`.

Stay terse; prefer pointing at existing `base`/`containers`/`text`
functions over rebuilding them.
