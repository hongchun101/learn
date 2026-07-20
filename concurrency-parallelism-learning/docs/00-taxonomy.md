# 00 · Concurrency & Parallelism Taxonomy

The shared mental model used by every language module in this repo. **Read this
once before any chapter; revisit when a new language module introduces a name
you don't recognise.**

## 1. Two orthogonal axes

```
                          CONCURRENCY
              "dealing with many things at once"
              (composition of independent tasks)
                                │
                                │  One CPU core
                                │  ───────────
                                │  Concurrency
                                │  is a PROGRAM
                                │  STRUCTURE
                                │  problem.
                                │
                                │  Many CPU cores
                                │  ────────────
                                │  Parallelism
                                │  is a HARDWARE
                                │  RESOURCE
                                │  problem.
                                │
                                ▼
                          PARALLELISM
              "doing many things at the same time"
              (simultaneous physical execution)
```

A **concurrent** program is structured around independently-evolving tasks; it
**may** run on one core (interleaved) or many (truly parallel). A
**parallel** program is one that **does** exploit hardware simultaneity. A
program can be concurrent without being parallel (single-threaded JS, classic
Erlang BEAM scheduler on a single core) and parallel without being concurrent
(plain SIMD or `vec_add(a,b,c)` style numeric kernels).

## 2. Five execution models

Every language module maps onto one or more of these. The names are the
*abstract* model; the concrete primitive is what the chapter titles refer to.

| # | Model | Mental picture | Canonical primitives |
|---|-------|----------------|----------------------|
| 1 | **OS threads + shared mutable state** | N kernel threads, all touching the same memory; protect with locks. | `pthread`, `std::thread`, `java.lang.Thread`, `ThreadPool`, `Channel<T>` (Go) |
| 2 | **Message passing / CSP / actors** | N independent processes, no shared state, communicate by sending values through channels or mailboxes. | `chan` (Go), `Erlang`/`Elixir` processes, `Akka` actors, `Rust` `mpsc::channel`, `kotlinx.coroutines` `Channel` |
| 3 | **async/await (cooperative stackless coroutines)** | One or a few OS threads run a scheduler; tasks yield at `await` points. | `tokio`, `asyncio`, `Kotlin coroutines`, `C# async/await`, `Java virtual threads`, `Rust async` |
| 4 | **Data parallelism / GPU / SIMD** | One operation applied to a whole collection; compiler / runtime farms it to SIMD lanes, cores, or a device. | OpenMP, `rayon`, CUDA, WebGPU compute, `.parallelStream()` |
| 5 | **Lock-free / wait-free / STM** | Progress without OS blocking; correctness via atomic CAS, hazard pointers, or transactional memory. | `java.util.concurrent.atomic`, `crossbeam`, `software-transactional-memory` (Haskell), `tokio` internals |

Most production systems **mix models**: Go uses (1)+(2); Rust uses (1)+(2)+(3)+(5); Scala uses (1)+(2)+(3)+(4); Java 21+ uses (1)+(3).

## 3. Memory model — the part people skip

The "memory model" answers: *what value can thread A see when it reads a
location that thread B wrote?* Without a defined model, "I wrote it before I
launched the thread" is folklore, not law.

| Language / runtime | Memory model spec |
|---|---|
| C / C++ | C11/C++11 §6.8 — *sequenced-before*, *synchronizes-with*, `memory_order_relaxed/acquire/release/seq_cst` |
| Java | JSR-133, JEPs 188/283; happens-before via `volatile`, `synchronized`, `final` |
| C# | ECMA-335 §I.12.6; `volatile`, `Interlocked`, `lock` |
| Rust | LLVM-derived, *but* `Send`/`Sync` enforce *single-threaded* ownership; the crossbeam crate is the standard lock-free story |
| Go | "Go memory model" doc; channels establish happens-before, races are bugs the runtime can detect (`go test -race`) |
| JavaScript | Single-threaded event loop; `Atomics` + `SharedArrayBuffer` since ES2017 |
| Python | GIL (CPython) makes (1) useless for CPU-bound; `multiprocessing` is real parallelism; `asyncio` is cooperative |
| Haskell | Pure ⇒ no shared mutable state ⇒ "concurrency" is "evaluate independently and combine results"; STM gives composable atomic updates |
| Erlang/Elixir | Per-process heap, share-nothing; message passing is the *only* way to communicate |

The chapters don't just say "use a mutex" — they quote the memory model and
show, on the chosen platform, **which synchronisation primitive establishes
the happens-before edge you need.**

## 4. The seven problems every model has to solve

The chapters in this repo are organised around these. Every language module
touches all seven, in the same order, so you can compare solutions.

1. **Spawn** — how do I create a new unit of work?
2. **Synchronise** — how do two units agree an event has happened?
3. **Share state** — what is the *safest* way for two units to read/write the same location?
4. **Coordinate** — barrier, latch, future/promise, count-down, semaphore, condition variable.
5. **Cancel** — how does a unit stop another cooperatively? (Cancellation is the *hard* part of async.)
6. **Backpressure** — if producer is faster than consumer, what fails and how do we degrade?
7. **Observe** — how do I see what is happening? (Tracing, race detectors, deterministic replay, metrics.)

## 5. Patterns catalogue (cross-language)

These are the *named* patterns the chapters implement in every language.

| Pattern | One-line description |
|---|---|
| Producer–Consumer | One goroutine / actor / task writes, another reads; queue in between. |
| Fan-out / Fan-in | Distribute work to N workers, merge results. |
| Pipeline | Stages connected by queues; each stage is a function over a stream. |
| Work-stealing scheduler | Each thread has a deque; idle thread steals from busy peer. (`tokio`, `rayon`, `ForkJoinPool`, `TPL`) |
| Barrier / Latch | All N workers must reach point X before any proceeds past it. |
| Map-reduce / parallel fold | `fold` over a collection in parallel, combine partials. |
| Pub-sub / actor mailbox | Many senders, one receiver; receiver pattern-matches on message. |
| Saga / supervisor | Long-running transaction across services; if one step fails, compensating actions run. |
| Rate limiter / token bucket | Admit at most K ops / window. (Implementations differ wildly by language.) |
| Circuit breaker | After N consecutive failures, short-circuit for a cool-down. |
| Bulkhead | Isolate pools so a slow downstream can't exhaust the whole thread pool. |
| Lock-free queue (Michael–Scott, SPSC, MPMC) | Progress without OS blocking. |
| STM (software transactional memory) | `atomic { txn }` composes reads/writes; runtime retries on conflict. |
| Actor supervision tree | Parent actor restarts child on crash. (Erlang/OTP, Akka) |
| Structured concurrency | Lifetime of children ⊆ lifetime of parent; cancellation is automatic on scope exit. (Kotlin, Java 25, Swift 6, C# `TaskGroup`, `triple_loom`.) |

## 6. How the modules are organised

```
modules/
  00-shared/         shared taxonomy (this file lives in /docs)
  01-rust/           OS threads, async/await (tokio), rayon, crossbeam, mpsc
  02-go/             goroutines, channels, select, context, sync
  03-java/           Thread, Executor, CompletableFuture, virtual threads, VarHandle
  04-csharp/         TPL, async/await, Channels, Channels library, Dataflow
  05-python/         threading, multiprocessing, asyncio, GIL
  06-javascript/     event loop, microtasks, Workers, SharedArrayBuffer + Atomics
  07-typescript/     (advanced) AsyncIterable, Web Locks, type-level worker pools
  08-scala/          Futures, Akka actors, ZIO, parallel collections
  09-haskell/        pure concurrency, STM, async (capability), par-monad
  10-erlang/         BEAM scheduler, gen_server, supervisor, OTP
  11-elixir/         same BEAM, higher abstraction: GenServer, Supervisor, Task
  12-c/              pthreads, atomics, OpenMP, C11 memory model
  13-cpp/            std::thread, std::async, std::execution (P2300), TBB
```

Every module has the same shape:

```
module/
  README.md           the chapter as a paper: model, primitives, patterns, exercises
  src/                runnable code
  tests/              unit tests asserting the documented behaviour
  Cargo.toml / go.mod / package.json / build.gradle / ...   whatever the language uses
```

The cross-language tests in `src/cross-lang/*.test.ts` re-implement the same
three benchmarks in TypeScript and assert the *contracts* (e.g. "fan-out then
fan-in preserves order if the work is index-monotone"). Each language module
ships a **counterpart test in its own language** proving the same property.
This means a learner can compare any two languages line by line on the same
problem.

## 7. Reading order

```
00  shared taxonomy (this file)
↓   then in any order:
01  Rust  (the most explicit memory story → sets the vocabulary for everything else)
02  Go    (the canonical CSP/actor-of-two story)
03  Java  (the heaviest "real" production model)
04  C#    (TPL + async/await, very close to Rust)
05  Python (GIL, asyncio — exposes the cost of the model)
06  JS + TS (single-threaded concurrency → proves you don't always need threads)
07  Scala (JVM + actor/FP hybrid)
08  C / C++ (raw memory model, SIMD, OpenMP)
09  Haskell (pure ⇒ no shared state ⇒ everything composes)
10  Erlang / Elixir (BEAM, OTP, "let it crash")
```

The "0 → expert" promise: after 01–06 you can read any production
multi-threaded code; after 07–10 you can *design* a system; after
C/C++/Rust/lock-free chapters you can defend choices about *correctness*, not
just performance.
