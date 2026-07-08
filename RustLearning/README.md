# RustLearning

A high-quality Rust learning project covering the full spectrum of the language:
ownership, lifetimes, type-system features, traits, async, FFI, macros, and
runtime primitives. The project is organized as a Cargo workspace of focused
crates so each topic lives next to tests, doc examples, and bench stubs.

## Crates

| Crate | Topic |
| --- | --- |
| `advanced-syntax` | Every advanced language feature in one place: lifetimes, traits, macros, `unsafe`, GATs, async, error model. |
| `idiomatic-patterns` | Patterns: type-state builders, RAII guards, lock-free structures, zero-copy parsing, newtypes, intrusive containers. |
| `ffi-bridge` | `extern "C"` ABI, `#[no_mangle]`, `repr(C)`, callback handlers, a C header checked into the repo. |
| `parser-demo` | Stream-style parser built on `winnow` to illustrate combinators and zero-copy slicing. |
| `runtime` | A minimal hand-rolled executor + `Waker` playground to demystify `Pin`, `Future`, and polling. |

## Build and Verify

```bash
cargo fmt --all
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
cargo doc --workspace --no-deps
```

## Layout

```
crates/
  advanced-syntax/   # one module per topic, public + tested
  idiomatic-patterns/# pattern catalog with tests
  ffi-bridge/        # C ABI boundary
  parser-demo/       # winnow-based parser
  runtime/           # executor + Waker playground
```

Each module is documented at the crate level and per-module; test modules are
co-located so each technique has a runnable demonstration.
