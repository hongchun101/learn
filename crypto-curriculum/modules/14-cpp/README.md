# Module 14 · C++ Reference

> The same primitives, in the language with the most footguns and the fastest
> constant-time code.

## Why C++

C++ is where the *real* crypto gets shipped when performance is non-negotiable
(BoringSSL, libsodium, OpenSSL, mbedTLS). The trade-off:

- Manual memory management. Secrets leak unless you `mlock` + `explicit_bzero`.
- `std::string` is not a byte container. `std::span<byte>` is.
- `new[]` does not zero memory. `calloc` doesn't zero *on free*, either.
- Comparisons: `std::memcmp` is **not** constant-time.
- Optimizers strip "redundant" zero-writes. Use `explicit_bzero`, `memset_s`, or
  `volatile` *and* a memory barrier.

## Files (CMake + catch2)

```
src/
  primitives.cpp  — wrappers around OpenSSL 3 (CryptoKit-style API)
  ctr_drbg.cpp    — a NIST Hash-DRBG
  sha256.cpp      — manual SHA-256 (educational)
include/learncrypto.h
tests/
  contract.cpp    — the six properties via Catch2
CMakeLists.txt
```

## Run it

```bash
cd modules/14-cpp
cmake -B build && cmake --build build && ctest --test-dir build --output-on-failure
```

Tested compilers: g++ 11+ / clang 14+, OpenSSL ≥ 3.

## C++ specific gotchas

| Bug | Fix |
|-----|-----|
| `memcmp(a, b, n)` | `crypto_memcmp(a, b, n)` (constant-time) |
| `memset(k, 0, n)` to clear | `explicit_bzero(k, n)` |
| `std::vector<uint8_t>` resized realloc | `std::pmr::monotonic_buffer` or pinned allocator |
| `std::cout << secret` | `noexcept` formatting + masked formatter |
| `new T[n]` for `k` | `std::make_unique<T[]>` for ownership |
| `std::byte` is the right type | yes; `uint8_t` also accepted |
| `[[nodiscard]]` on tag returns | yes; silence the pragma, not the lint |

## Exercises

1. Replace `memcmp` in OpenSSL's `CRYPTO_memcmp` with `__builtin_constant_p` to
   evaluate-at-compile-time safety, then stress-test with 1M random keys.
2. Implement `mlock + explicit_bzero + MemoryBarrier` for a `Secret<T>` class.
3. Write a `SwitchStatementKey` where every branch takes the same time.
4. Implement the *raw* AES-256 (no platform intrinsics) and verify against
   NIST CAVP.
