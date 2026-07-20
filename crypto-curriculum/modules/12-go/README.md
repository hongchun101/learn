# Module 12 · Go Reference

> The same six primitives, in the language built for systems programming.

## Why Go gets its own module

Go's crypto is in the standard library, audited by the Go security team, and
deliberately boring. The trade-off: lots of `[]byte` everywhere, no inherent
ownership semantics.

`crypto/aes`, `crypto/cipher`, `crypto/sha256`, `crypto/hmac`, `crypto/ed25519`,
`crypto/ecdh`, `crypto/hkdf` (1.24+), `crypto/rand` — all present; no third
party needed for the eight primitives.

## The single thing every Go crypto program must do

```go
import "crypto/rand"

func randomBytes(n int) []byte {
    out := make([]byte, n)
    if _, err := rand.Read(out); err != nil {
        panic(err)
    }
    return out
}
```

`crypto/rand.Read` blocks until the kernel CSPRNG is ready. *Never* use
`math/rand`.

## Files

```
src/
  primitives.go     — module entry point
  aesgcm.go         — AES-256-GCM
  hmac.go           — HMAC-SHA-256
  hkdf.go           — HKDF-SHA-256 (1.21+; 1.18-1.20 use x/crypto/hkdf)
  ed25519.go        — Ed25519 sign/verify
  csprng.go         — crypto/rand wrapper
tests/
  contract_test.go  — the six properties
go.mod
```

## Run it

```bash
cd modules/12-go
go test -race ./...
```

`-race` runs the race detector — the language-level equivalent of `-fsanitize=thread`
in Clang. Most Go crypto is single-threaded, but the `-race` test is the same
*type* of property as in C/Rust.

## Go-specific gotchas

1. **Subtle comparison** — `hmac.Equal(b1, b2)` is the constant-time one.
   `bytes.Equal` is NOT. Compare MACs with `subtle.ConstantTimeCompare`.
2. **GC will pause** — your secret-bearing buffers are movable *unless* you
   `runtime.KeepAlive(sk)` immediately. Otherwise the secret may already be
   unmarked when the next call returns.
3. **`slices.Clone` copies by reference for large types** — always `make` fresh
   for keys.
4. **`crypto/hkdf` only exists since Go 1.24** — earlier you used
   `golang.org/x/crypto/hkdf`.
5. **AES block size is fixed at 16 bytes** — split your own implementation
   manually for non-AEAD buffers.

## Why this module shows `-race`

A `-race` build of every contract test means a race condition (data race)
would be detected. AES-GCM's nonce reuse is not technically a race, but
nonces leaking through shared buffers are, and `-race` catches them.

## Exercises

1. Implement envelope encryption in 30 lines.
2. Implement TLS 1.3 server with `crypto/tls.Config.NextProtos = ["h2"]`.
3. Implement hash-based signatures (XMSS) from RFC 8391 using `crypto/sha256`.
4. Use `runtime.SetFinalizer` to zero buffers after function returns.
