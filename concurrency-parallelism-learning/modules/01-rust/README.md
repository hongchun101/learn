# Rust — concurrency & parallelism (Ch01)

Cargo workspace of focused crates. Every primitive the language exposes,
plus a contract-tested module that re-implements the six cross-language
tasks in idiomatic Rust. Compiles and tests on stable `rustc 1.96+`.

## Crates

| Crate | Topic |
| --- | --- |
| `ch01-threads` | `std::thread`, `std::sync::{Mutex, RwLock, Condvar}`, `mpsc`, `OnceLock`, `Barrier` |
| `ch02-async-tokio` | `tokio` tasks, `select!`, mpsc, watch, oneshot, `Notify`, `JoinSet` |
| `ch03-rayon` | `par_iter`, `par_chunks`, `par_bridge`, `scope`, `ThreadPoolBuilder` |
| `ch04-crossbeam` | `crossbeam-channel`, `crossbeam-queue` (`ArrayQueue`), `crossbeam-utils` (`Backoff`, `CachePadded`) |
| `ch05-lockfree` | `SeqLock`, `Treiber` stack, `Michael-Scott` SPSC; all `unsafe` blocks SAFETY-annotated |
| `ch06-patterns` | The six cross-language tasks reimplemented idiomatically; cross-lang contract tests in `tests/cross_lang.rs` |
| `ch07-ffi` | Exposing a Rust thread pool over the C ABI; `extern "C"` + `repr(C)` struct; checked-in C header |

## Build and verify

```bash
cd modules/01-rust
cargo build --workspace --all-targets
cargo test  --workspace
cargo clippy --workspace --all-targets -- -D warnings
cargo fmt  --all -- --check
```

## Layout

```
crates/
  ch01-threads/   # std::thread + sync primitives
  ch02-async-tokio/
  ch03-rayon/
  ch04-crossbeam/
  ch05-lockfree/  # all unsafe with SAFETY comments
  ch06-patterns/  # contract implementation; tests/cross_lang.rs
  ch07-ffi/       # extern "C" pool, with include/cp_pool.h
```

## What an expert can do after this module

- Read and write `unsafe` lock-free code with a clear SAFETY justification for every operation.
- Pick the right primitive for a job: `Mutex` for short critical sections, `RwLock` for read-heavy, `mpsc` for a single-consumer fan-in, `crossbeam-channel` for MPMC, `ArrayQueue` for a hot single-purpose ring, `parking_lot::Mutex` when contention matters.
- Design a `tokio` service: separate `tokio::spawn` for short tasks, `tokio::task::spawn_blocking` for blocking work, `JoinSet` for tracking, `select!` for racing, `Notify`/`watch`/`oneshot` for coordination.
- Use `rayon` for data-parallel bulk operations; build a custom thread pool for non-rayon work; choose between `par_iter` and `par_chunks` based on cache behaviour.
- Cross the FFI boundary safely: never panic across `extern "C"`, never hold a `Mutex` across a foreign call, document the threading contract.
- Verify correctness with `loom` (the chapter shows the pattern; the test suite in `ch05-lockfree` includes a `loom`-conditional test).

## Cross-language tasks

`crates/ch06-patterns/src/lib.rs` contains the six tasks. `crates/ch06-patterns/tests/cross_lang.rs` asserts the same properties as the TypeScript reference in `src/cross-lang/contracts.ts`.

## Memory model

Rust does not have a separate memory model; the model is the LLVM model
plus the `Send`/`Sync` traits. A type is `Send` iff it can be moved to
another thread; `Sync` iff `&T` can be shared. The crossbeam crate
implements the high-performance lock-free primitives; the standard
library implements the safe primitives. Lock-free code in Rust is
written using the `compare_exchange` family on `AtomicPtr` and
`AtomicUsize`; the rules are the same as C11 §6.8.
