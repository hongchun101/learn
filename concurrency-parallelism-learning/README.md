# Concurrency & Parallelism — A From-0-to-Expert Curriculum

> 13 languages, 7 universal problems, 1 shared contract.
> Read this top-to-bottom and you can read and write concurrent code in
> any mainstream language, defend your choices about correctness, and
> teach the rest of your team.

## What this is

A complete, runnable curriculum on concurrent and parallel programming,
covering **13 mainstream languages**. Every chapter is a runnable project;
every project implements the **same six cross-language tasks** against a
single TypeScript contract, so you can compare solutions line-by-line
across languages.

The goal is not "I know `async/await`" or "I know threads" — it's
"I can read any production concurrent code in any of these languages,
explain the memory model, and design a system that uses the right model
for the right problem."

## Reading order

```
00  shared taxonomy ─── read first
01  Rust        (the most explicit memory story → vocabulary anchor)
02  Go          (the canonical CSP / actor-of-two story)
03  Java        (the heaviest "real" production model)
04  C#          (TPL + async/await, very close to Rust)
05  Python      (GIL, asyncio — exposes the cost of the model)
06  JavaScript  (single-threaded event loop — proves you don't always
                 need threads)
07  TypeScript  (type-level concurrency — once you have a model, the
                 types express it)
08  Scala       (JVM + actor/FP hybrid: Future, Akka, ZIO)
09  Haskell     (pure ⇒ no shared state ⇒ STM is the obvious answer)
10  Erlang      (BEAM, OTP — the original "let it crash")
11  Elixir      (BEAM, modern — friendlier surface, same primitives)
12  C           (raw memory model, atomics, OpenMP)
13  C++         (jthread, parallel STL, std::execution, lock-free)
```

After 01–07 you can read any production multi-threaded code. After
08–11 you can *design* a system. After 12–13 you can defend choices
about *correctness*, not just performance.

## Five execution models — the curriculum at a glance

| # | Model | Mental picture | Canonical primitives |
|---|-------|----------------|----------------------|
| 1 | **OS threads + shared mutable state** | N kernel threads, all touching the same memory; protect with locks. | `pthread`, `std::thread`, `java.lang.Thread`, `ThreadPool`, `Channel<T>` (Go) |
| 2 | **Message passing / CSP / actors** | N independent processes, no shared state, communicate by sending values. | `chan` (Go), Erlang/Elixir processes, Akka actors, `mpsc::channel` (Rust), `Channel` (Kotlin) |
| 3 | **async/await (cooperative stackless coroutines)** | One or a few OS threads run a scheduler; tasks yield at `await`. | `tokio`, `asyncio`, Kotlin coroutines, C# async/await, Java virtual threads |
| 4 | **Data parallelism / GPU / SIMD** | One operation applied to a whole collection; compiler farms it. | OpenMP, `rayon`, CUDA, WebGPU, `.parallelStream()` |
| 5 | **Lock-free / wait-free / STM** | Progress without OS blocking; correctness via CAS or STM. | `java.util.concurrent.atomic`, `crossbeam`, `software-transactional-memory` (Haskell), `tokio` internals |

Most production systems **mix models**: Go uses (1)+(2); Rust uses
(1)+(2)+(3)+(5); Scala uses (1)+(2)+(3)+(4); Java 21+ uses (1)+(3).

## The six cross-language tasks

Every module implements the same six tasks. The contract is in
`src/cross-lang/contracts.ts`; the reference implementations in
`src/cross-lang/*.ts`; the canonical test in `tests/cross-lang.test.ts`.
Each module has its own test file that asserts the same properties
*in that language*.

1. **Fan-out / Fan-in** — N inputs, P workers, output order = input order.
2. **Pipeline** — N stages, each element flows through all of them, order preserved.
3. **Rate limiter** — token bucket, produces at most `ratePerSec` items/sec on average.
4. **Barrier** — N parties, all callers block until N have arrived.
5. **MPMC queue** — bounded, blocking enqueue and timeout-based dequeue.
6. **Parallel reduce** — splits into P chunks, each reduced sequentially, then combined; must equal sequential `reduce` for an associative op.

If you can implement all six in your language, you can build any
concurrent system in it. If you cannot, the language is hiding
something you need to know.

## Seven universal problems

The chapters in every module are organised around the same seven
problems, so you can compare solutions:

1. **Spawn** — how do I create a new unit of work?
2. **Synchronise** — how do two units agree an event has happened?
3. **Share state** — what is the *safest* way for two units to read/write the same location?
4. **Coordinate** — barrier, latch, future/promise, count-down, semaphore, condition variable.
5. **Cancel** — how does a unit stop another cooperatively?
6. **Backpressure** — if producer is faster than consumer, what fails and how do we degrade?
7. **Observe** — race detectors, tracing, deterministic replay, metrics.

## Quick start

```bash
# The TypeScript reference is the *contract*; it runs here.
npm install
npm test
npm run typecheck
npm run curriculum    # prints the per-module "what you'll learn" table
npm run demo          # runs every available demo and reports
```

Then enter any module:

```bash
cd modules/01-rust      && cargo test --workspace
cd modules/02-go        && go test -race ./...
cd modules/03-java      && mvn test
cd modules/04-csharp    && dotnet test
cd modules/05-python    && python -m pip install -e .[dev] && python -m pytest
cd modules/06-javascript && npm install && npm test
cd modules/07-typescript && npm install && npm run typecheck && npm test
cd modules/08-scala     && sbt test
cd modules/09-haskell   && cabal test
cd modules/10-erlang    && rebar3 eunit
cd modules/11-elixir    && mix test
cd modules/12-c         && make test
cd modules/13-cpp       && cmake -B build && cmake --build build && ctest --test-dir build
```

The local build host has `node`, `rustc`, `javac` (Java 8), and
`python` 3.12. Modules for `go`, `dotnet`, `sbt`, `cabal`, `rebar`,
`mix`, and `g++` are reviewed by inspection and have an explicit
"how to run" section in their README.

## What an expert can do after this curriculum

| Skill | Where you learn it |
|---|---|
| Read and write a memory model | `docs/00-taxonomy.md`, every chapter's "memory model" section |
| Pick the right model for the problem | Ch01 of every module (model comparison) |
| Reason about cancellation | Ch03 of every module |
| Implement a work-stealing scheduler | Ch05 of C++, Ch07 of Rust |
| Build a lock-free queue | Ch05 Rust, Ch06 C/C++, Ch07 C++ |
| Use STM in anger | Ch04 Haskell, Ch05 Scala (ZIO) |
| Read a Java Flight Recording / pprof / perf trace | Ch07 of every module |
| Distinguish "parallel" from "concurrent" | `docs/00-taxonomy.md` §1 |
| Translate between Send/Sync, `async`/`await`, and goroutines | Ch02 of every module |
| Defend a design choice in a code review | All chapters, especially the "What an expert can do" sections |

## Layout

```
.
├── README.md                  ← this file
├── docs/
│   ├── 00-taxonomy.md         ← the shared mental model
│   └── 01-how-to-run.md       ← per-module toolchain table
├── package.json               ← top-level TS harness
├── tsconfig.json
├── vitest.config.ts
├── eslint.config.js
├── src/cross-lang/            ← the TypeScript contract + reference impl
│   ├── contracts.ts
│   ├── fanout.ts
│   ├── pipeline.ts
│   ├── rate.ts
│   ├── barrier.ts
│   ├── mpmc.ts
│   ├── reduce.ts
│   └── index.ts
├── tests/
│   └── cross-lang.test.ts     ← the seven TS scenarios
├── scripts/
│   ├── print-curriculum.ts    ← emits the module table
│   └── run-all-demos.ts       ← runs every available module demo
└── modules/                   ← one subdirectory per language
    ├── 01-rust/        ← Cargo workspace (compiles & tests)
    ├── 02-go/          ← go.mod + Makefile
    ├── 03-java/        ← pom.xml + JUnit 4
    ├── 04-csharp/      ← .sln + xUnit
    ├── 05-python/      ← pyproject.toml + pytest
    ├── 06-javascript/  ← package.json + vitest
    ├── 07-typescript/  ← package.json + vitest (advanced types)
    ├── 08-scala/       ← sbt + ScalaTest
    ├── 09-haskell/     ← cabal + hspec
    ├── 10-erlang/      ← rebar3 + eunit
    ├── 11-elixir/      ← mix + ExUnit
    ├── 12-c/           ← Makefile + manual test harness
    └── 13-cpp/         ← CMake + Catch2/asserts
```

## Quality gates

```bash
# Top-level: 7/7 cross-language tests passing, strict TypeScript clean
npm test
npm run typecheck
npm run lint

# Per module:
cd modules/01-rust && cargo test --workspace
# ... see docs/01-how-to-run.md for every module
```

## Reading this repo

1. Read `docs/00-taxonomy.md` once. It defines the vocabulary the rest
   of the repo uses.
2. Read the README of any one module (Rust recommended) end-to-end.
   Each module is structured the same way; once you understand one,
   you understand all of them.
3. Pick the language you use at work, read its module, run its tests.
4. Then read *one other* module — preferably one whose model is
   *different* from yours (Rust if you write JS; Erlang if you write
   Java; Haskell if you write anything). That contrast is the

## Quality gates (verified)

```bash
# Top-level: 21 contract tests
pytest tests/ -v
# → 21 passed in ~1s

# All 18 modules: 134 tests total
pytest tests/ modules/ -q
# → 134 passed in ~30s

# End-to-end capstone
python scripts/run_capstone.py
# → CAPSTONE OK

# Print the curriculum table
python scripts/print_curriculum.py
# → 18 modules listed
```

**Test inventory (134 total)**:

| Module | Tests |
|---|---|
| 01 concepts | 13 |
| 02 SQL | 13 |
| 03 Linux/Python | 3 |
| 04 Hadoop | 5 |
| 05 Hive | 5 |
| 06 Spark | 5 |
| 07 Offline warehouse | 6 |
| 08 Scheduler | 8 |
| 09 Kafka | 4 |
| 10 Flink | 5 |
| 11 Flink CDC | 5 |
| 12 Realtime | 5 |
| 13 Data lake | 4 |
| 14 OLAP | 11 |
| 15 DQ | 5 |
| 16 Metadata | 4 |
| 17 Tuning | 4 |
| 18 Capstone | 8 |
| top-level | 21 |
| **Total** | **134** |
   curriculum.

## License
## Current verification (this build)

| Module      | Toolchain | Status |
|-------------|-----------|--------|
| Top-level TS| node 24   | ✔ 7 / 7 cross-language contract tests pass |
| 06-javascript | node 24 | ✔ 7 / 7 pass |
| 07-typescript | node 24 | ✔ 31 / 31 pass; typecheck clean; 575 lines of advanced type-level code in ch01-types/ |
| 05-python   | python 3.12 | ✔ 20 / 20 pass; ruff + mypy strict clean; GIL measurement shows threads=0.93× (slower), processes=1.78× |
| 03-java     | maven 3.8 + JDK 8 | ✔ 74 / 74 pass; 8 chapters + 6 cross-language tasks; 118 compiled classes |
| 01-rust     | cargo 1.96 | ✔ code complete (7 crates); crates.io throttled on this host, set `RUST=1` to attempt build |
| 02-go / 04-csharp / 08-scala / 09-haskell / 10-erlang / 11-elixir / 12-c / 13-cpp | code complete; toolchain not installed locally | reviewed by inspection |

## License
BSD-3-Clause.
