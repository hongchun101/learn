# Module 11 · Rust Reference

> Constant-time primitives, type-system-enforced ownership of secrets, and a
> `Result<T, Error>`-style API that doesn't leak secrets on failure paths.

## Why Rust gets its own module

Rust has two structural advantages for crypto:

1. **No implicit copies** — secrets do not leak through `Drop` or `Clone`
   bugs by accident. The `Zeroize` trait + `subtle` crate enforce
   constant-time comparison + memory hygiene.
2. **The `Result<T, E>` panic surface** — error paths can be wide but the
   *error itself* never contains secret material, by API design.

The catch: `Ed25519` and friends need a crate (`ed25519-dalek`, `ring`,
`dalek`); AES needs `aes-gcm`; HKDF needs `hkdf`. To keep this module
**runnable on the local host with `cargo`** we depend on stdlib-only primitives
(`getrandom`) and the `sha2` / `hmac` crates (which are pure-Rust, small, and
crate-host-independent).

## What this module covers

| # | Primitive | Crate |
|---|-----------|-------|
| 1 | AES-256-GCM | stdlib + custom | (compile-time disabled; this host is `crates.io`-throttled) |
| 2 | HMAC-SHA-256 | `hmac`, `sha2` | runnable |
| 3 | SHA-256 | `sha2` | runnable |
| 4 | HKDF-SHA-256 | `hkdf`, `sha2` | runnable |
| 5 | Ed25519 | `ed25519-dalek` | documented; not runnable here (see notes) |
| 6 | CSPRNG | `getrandom` | runnable |

## Run it

```bash
cd modules/11-rust
# 如果 crates.io 可访问：
cargo test

# 如果不可达（主机可能限流）：
RUST=1 RUSTFLAGS='--offline' cargo test --offline || cargo build --offline
```

The test suite reuses the same six properties as the Java and TS modules.

## Why type-system-enforced ownership of secrets

In Rust:

```rust
pub fn decrypt(&self, ciphertext: &[u8]) -> Result<Vec<u8>, Error>;
```

`Vec<u8>` is the *plaintext* — it is a fresh allocation owned by the caller.
There is no way to "drop" the secret key *after* it's been overwritten —
`Drop` runs deterministically when the binding goes out of scope. With
`Zeroize` (in `zeroize` crate), the dropped buffer is scrubbed:

```rust
use zeroize::Zeroize;
let mut key = getrandom::getrandom::<32>().unwrap();
key.zeroize();  // 不会出现在堆转储中。
```

## Why constant-time eq is enforced

```rust
use subtle::ConstantTimeEq;
let a: [u8; 32] = …;
let b: [u8; 32] = …;
a.ct_eq(&b).into()  // 返回 Choice 而非 bool——不会提前退出。
```

The `Choice` is a single bit that *must* be converted at the end; it cannot
be used to branch mid-way. Many CVEs have come from the *lack* of this
primitive in a language.

## Files

```
src/lib.rs              — module exports
src/hmac.rs             — HMAC-SHA-256
src/sha256.rs           — SHA-256
src/hkdf.rs             — HKDF-SHA-256
src/ed25519.rs          — Ed25519 placeholder (see README)
src/csprng.rs           — getrandom wrapper
tests/contract.rs       — the six cross-chapter properties
Cargo.toml
```

## Why AES is not here

`aes-gcm` is fine but on this host we restrict to small downloads and pure-Rust.
AES-128-GCM would inflate the dep tree. The HMAC + SHA-256 set covers *every
property test* except encrypted round-trip; that maps to AES-GCM in the JS
contract and is exercised from the top-level TypeScript harness.

## Exercises (Rust)

1. Add a feature gate so `aes-gcm` compiles when requested and the test
   expands by 3 assertions.
2. Implement a checked-buffer pattern (`SecretBytes<'a>` with `Zeroize` on
   `Drop`) and use it instead of raw `Vec<u8>`.
3. Implement an `assert_constant_time!` macro that runs the closure 1000
   times in a tight loop and reports the variance of the latency.
4. Read the `subtle` crate docs, then re-implement `ct_eq` for `Box<[u8]>`
   (variable-length) using the BoringSSL OpenSSL-CT-implementing logic.
