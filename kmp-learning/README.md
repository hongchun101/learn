# KMP Learning — From 0 to Expert

> **Kotlin Multiplatform (KMP)** is JetBrains' answer to "write Kotlin once,
> run it on every platform". This curriculum takes you from the language
> fundamentals through coroutines, Flow, structured concurrency, expect/actual
> bridges, kotlinx serialization, kotlinx-datetime, Ktor HTTP, and KMP
> architecture — to the point where you can read and review any production
> KMP module and design one from scratch.

## Who this is for

- A Kotlin developer who has touched Android or backend Spring and wants to
  ship to iOS, web, and native from one codebase.
- A polyglot engineer comparing KMP with Flutter / React Native / .NET MAUI
  who wants the *real* trade-offs, not the marketing slide.
- A tech lead deciding whether KMP fits the next product and what the
  hiring and code-review bar should be.

After working through the 18 chapters in order, you can:

- [ ] Read a KMP module and tell which `expect` belongs to which target.
- [ ] Choose between coroutines, Flow, and Channel for a given problem and
      justify it in a code review.
- [ ] Design a source-set hierarchy (`commonMain` / `jvmMain` /
      `androidMain` / `iosMain` / `jsMain` / `nativeMain`) that keeps
      business logic in `commonMain` and platform glue in the leaf set.
- [ ] Implement structured concurrency: scopes, cancellation, exception
      propagation, and the `SupervisorJob` trade-off.
- [ ] Compose cold/hot Flows and reason about backpressure, conflation,
      and the `SharingStarted` semantics.
- [ ] Wire kotlinx-serialization and Ktor into a multiplatform module and
      handle the per-platform JSON quirks.
- [ ] Translate a JVM-only codebase into a KMP module and migrate one
      Android/iOS class to a shared interface at a time.
- [ ] Audit a PR for "platform leakage" — i.e. JVM-only or iOS-only types
      that escaped into `commonMain`.
- [ ] Decide when **not** to use KMP (single-platform app, hot path on
      every platform, or a team with no Kotlin chops).

## Reading order

```
00  docs/00-taxonomy.md         ← the mental model: source sets, expect/actual, memory
                                   model implications, comparison with Flutter/RN/MAUI
↓   then top-to-bottom:
01  ch01_basics                ← language fundamentals every KMP dev needs
02  ch02_oop                   ← class system, sealed, data, object, inline value
03  ch03_generics              ← variance, reified, star projection, where clauses
04  ch04_collections           ← List/Set/Map, sequences, ranges, arrays
05  ch05_functional            ← lambdas, scopes, extensions, infix, operator, DSL
06  ch06_coroutines            ← structured concurrency foundation
07  ch07_flow                  ← cold/hot flows, operators, sharing
08  ch08_concurrency           ← Mutex, Semaphore, Channel, Actor, select
09  ch09_kmp_fundamentals      ← expect/actual, source sets, hierarchy
10  ch10_serialization         ← kotlinx.serialization across platforms
11  ch11_datetime              ← kotlinx-datetime: Clock, Instant, TimeZone
12  ch12_io_logging            ← file I/O, logging in commonMain, expect/actual
13  ch13_testing               ← kotlin.test, runTest, TestScope, per-target
14  ch14_di                    ← handwritten DI (the framework-free mental model)
15  ch15_http                  ← Ktor client: engines, plugins, content negotiation
16  ch16_sql                   ← SQLDelight primer and the persistence contract
17  ch17_architecture          ← MVI / MVVM with StateFlow and UseCase
18  ch18_capstone              ← a cross-platform TODO app in commonMain + jvmMain
```

If you only have one weekend: read `00`, then jump to `06` and `09`. Those
two are the load-bearing KMP skills. Everything else is depth.

## How the project is laid out

```
kmp-learning/
├── README.md                          ← this file
├── docs/
│   ├── 00-taxonomy.md                 ← the mental model
│   ├── 01-how-to-run.md               ← toolchain, gradle, IDE, per-target notes
│   └── 02-idioms.md                   ← idioms, anti-patterns, naming
├── gradle/
│   └── libs.versions.toml             ← pinned library versions
├── settings.gradle.kts                ← project name
├── build.gradle.kts                   ← KMP plugin, JVM target, common deps
├── gradle.properties                  ← JVM args, code style
├── src/
│   ├── commonMain/kotlin/             ← everything reusable across platforms
│   │   ├── ch01_basics/ ... ch18_capstone/   ← one package per chapter
│   │   └── platform/                  ← shared expect/actual interfaces
│   ├── commonTest/kotlin/             ← cross-platform test code (kotlin.test)
│   ├── jvmMain/kotlin/                ← JVM-specific actuals, demo entry, capstone
│   │   ├── ch09_kmp_fundamentals/     ← actuals: System.getProperty, File, etc.
│   │   ├── ch12_io_logging/           ← JVM file I/O actuals
│   │   ├── ch15_http/                 ← JVM Ktor CIO engine
│   │   ├── ch18_capstone/             ← JVM application entry point
│   │   └── platform/                  ← JVM-side actuals
│   └── jvmTest/kotlin/                ← JUnit-bridged tests for JVM-specific code
├── examples/                          ← runnable, self-contained mini projects
│   ├── hello-kmp/                     ← the 10-line multiplatform starter
│   └── todo-app/                      ← 250-line mini version of ch18
└── tools/
    ├── verify.mjs                     ← static verification (Node 18+)
    │                                    pairing, test coverage matrix, contract checks
    └── README.md                      ← how to run the verifier
```

## Verification

This repo has two layers of verification:

1. **`./gradlew jvmTest`** (recommended on a machine with the Kotlin
   toolchain). Runs the full test suite on the JVM target. See
   `docs/01-how-to-run.md` for the per-target commands.
2. **`node tools/verify.mjs`** — a toolchain-free static verifier that
   checks:
   - every Kotlin file declares a package matching its directory
   - every `expect` declaration has a matching `actual` for every target
     that uses the interface
   - every test file has at least one `@Test` method
   - the `chapter-coverage-matrix.md` report is regenerated, listing
     public API per chapter and the tests that exercise it
   - the README's "What an expert can do" checklist is mapped to actual
     code locations

The static verifier is the **ground truth** for "is the curriculum
complete" — it doesn't need a Kotlin compiler.

## Code quality principles

- **Immutability first.** `val` over `var`. `List` over `MutableList`.
  `data class` over a hand-rolled equality.
- **Explicit types on public API.** Type inference is fine inside a
  function body; the public surface is annotated.
- **One concept per file.** A class is one idea. A package is one
  chapter.
- **`commonMain` is sacred.** Anything that leaks a JVM-only or iOS-only
  type into `commonMain` is a curriculum regression.
- **Tests are executable documentation.** Every chapter ships with at
  least one test file that exercises the contracts the chapter promises.

## What an expert can do after this curriculum

| Skill | Where you learn it |
|---|---|
| Read & write `expect` / `actual` correctly | ch09, every `platform/*` file |
| Design a source-set hierarchy | ch09, ch12, ch15, ch18 |
| Use `coroutineScope` / `supervisorScope` correctly | ch06, ch08 |
| Compose cold + hot flows with backpressure | ch07 |
| Pick the right `SharingStarted` for a screen state | ch17 |
| Choose between Channel, Flow, SharedFlow, StateFlow | ch07, ch08 |
| Migrate a JVM API to a KMP module one file at a time | ch09, ch15, ch18 |
| Wire kotlinx-serialization across JVM/iOS/JS | ch10 |
| Handle timezones without a Date footgun | ch11 |
| Test multiplatform code with `runTest` and `TestScope` | ch13 |
| Audit a PR for "platform leakage" | ch09, ch12, ch15, ch18 |
| Decide when **not** to use KMP | docs/00-taxonomy.md §7 |

## License

BSD-3-Clause.
