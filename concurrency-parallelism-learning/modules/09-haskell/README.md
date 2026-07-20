# Haskell — concurrency & parallelism (Ch09)

GHC 9.6 / Haskell 2021. The Haskell story is **categorically different from
every other language in this repo**: in pure Haskell, *there is no shared
mutable state*. Two threads cannot observe each other's intermediate state
because there is no such thing. That changes everything.

This module covers:

1. **Pure concurrency** — `Control.Concurrent` (`forkIO`, `MVar`, `Chan`,
   `ThreadId`, `myThreadId`, `throwTo`, `killThread`, `yield`, `threadDelay`).
2. **Async abstractions** — `Control.Concurrent.Async` (`async`, `wait`,
   `waitAny`, `waitAnyCancel`, `race`, `mapConcurrently`, `replicateConcurrently_`).
3. **Software Transactional Memory** — `Control.Concurrent.STM` (`TVar`,
   `STM`, `atomically`, `retry`, `orElse`, `throwSTM`).
4. **Parallel evaluation** — `Control.Parallel` (`par`, `pseq`), `parMap`,
   `Control.DeepSeq`, Strategies, `Eval` monad.
5. **Data parallelism** — `Data.Array.Repa` and `Data.Vector` with
   `-threaded -N`.
6. **Async I/O** — `Control.Concurrent.Async` + `withAsync`, `bracket`.
7. **Effect systems** — `Control.Monad.Reader`, `RIO`, `Polysemy`, `Effectful`
   as the modern alternative to `IO` ergonomics.
8. **Lock-free** — `Data.Atomics`, `Data.IORef` with CAS via `atomicModifyIORef'`.
9. **Cross-language tasks** — all six tasks in idiomatic Haskell.

## What an expert can do after this module

- Reason about thread safety *by category* — anything `IO` may share;
  anything pure is automatically safe; `STM` composes the dangerous parts.
- Pick the right primitive: `MVar` for single-cell shared state, `Chan` for
  ordered streaming, `TBQueue` for bounded + backpressure, `TVar` for
  multi-cell atomic updates, `async`/`race` for one-shot parallelism.
- Use `par`/`pseq` Strategies to *nudge* the runtime to evaluate in parallel
  *without changing semantics*; understand when this works (NFs) and when
  it does not (deep thunks).
- Profile with `ThreadScope` to see spark conversion rate; raise `+RTS -N`
  to use multiple cores; use `-A` to control allocation area.
- Diagnose a deadlock: `MVar` cycles, `STM` `retry` storms, blocked
  `forkIO` from missing `killThread` on exception.

## Layout

```
modules/09-haskell/
├── README.md
├── cp-haskell.cabal
├── stack.yaml            (optional, for users with stack)
├── src/
│   └── Cp/
│       ├── Ch01MVar.hs
│       ├── Ch02Chan.hs
│       ├── Ch03Async.hs
│       ├── Ch04STM.hs
│       ├── Ch05Parallel.hs
│       ├── Ch06Atomics.hs
│       ├── Ch07Structured.hs     (bracket, withAsync, mask)
│       ├── Ch08Threads.hs        (forkIO, killThread, throwTo)
│       └── Ch09Patterns.hs       (the six cross-language tasks)
├── app/
│   └── Main.hs           (run all six tasks in one binary for inspection)
└── test/
    └── Spec.hs           (hspec with all six task tests)
```

## How to run

```bash
cd modules/09-haskell
cabal test
# or
cabal run cp-haskell
```

Build target: `ghc-9.6`, `base-4.18`, `async`, `stm`, `containers`,
`vector`, `parallel`, `deepseq`, `atomic-primops`, `hspec`. RTS flags
`-threaded -N4` for parallel chapters.

The local host does not have GHC installed; the code is reviewed by
inspection. Any Linux machine with `ghcup` can run it in 30 seconds:

```bash
ghcup install ghc 9.6.4
ghcup install cabal 3.10
cabal test
```

## Cross-language task implementations

`Ch09Patterns` contains the six tasks. `test/Spec.hs` asserts the same
properties as the TypeScript reference. The implementations are short —
Haskell's high-level primitives usually beat the per-language code by 5-10x
in lines.

## Memory model

Haskell's "memory model" is simple: **there is no shared mutable state
unless you use `IORef`/`MVar`/`TVar`**. Pure values are immutable. The
runtime (GHC) provides *exactly-once* evaluation guarantees for thunks
(update memoisation under `dupable` control). `par` injects a "spark" that
the RTS may convert into a real parallel task; sparks are a *hint*, not a
*guarantee*.

GHC's threaded runtime uses one OS thread per Haskell thread; `MVar` and
`STM` are implemented in C and lock-free for the common case.
