# Module 15 · WebCrypto / SubtleCrypto Reference

> The same primitives, in the world's most sandboxed environment: a browser tab.

## Why WebCrypto

Every working browser since 2014 has a `crypto.subtle` namespace. It is the
*only* way to do constant-time crypto in a browser without bundling OpenSSL
into JS (≥ 1 MiB). It exposes:

| WebCrypto algorithm name | Module ref |
|---------------------------|------------|
| AES-GCM                  | Ch 1 (authenticated cipher) |
| HMAC                     | Ch 2 |
| SHA-256 / SHA-384        | Ch 3 |
| HKDF                     | Ch 4 (via PBKDF2 in older browsers) |
| Ed25519                  | Ch 5 (post-2022 browsers; older limited to ECDSA) |
| getRandomValues           | Ch 6 (CSPRNG) |

## Files

```
src/
  primitives.ts       — async wrappers over `crypto.subtle`
  in-browser-demo.html   — paste into a file:// URL to see it work
tests/
  contract.test.ts    — run with Node's `--experimental-global-webcrypto`
```

## The async-by-construction API

WebCrypto is `async` only — there is no sync `crypto.subtle.encrypt`. The
pattern is:

```javascript
const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
const iv  = crypto.getRandomValues(new Uint8Array(12));
const ct  = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, msg);
```

Returns `ArrayBuffer`s; convert to `Uint8Array` for the cross-module contract.

## Why this matters as a separate module

`crypto.subtle` is the **safe** default for the browser, but:

- `crypto` (no `subtle`) is *also* the safe default for *non-cryptographic* work
  (UUIDs, nonces, etc.). Confusing them with `Math.random()` causes subtle bugs.
- `crypto.subtle.importKey('raw', …, 'AES-GCM', …)` is the only safe way to
  hand over a raw AES key to the engine.
- `crypto.subtle.exportKey` is the only safe way to *extract* one — and almost
  never the right thing to do at runtime.
- `Worker` threads don't share `crypto.subtle` keys; pass them via
  `postMessage` with a structured-cloneable `CryptoKey`.

## Why the sync API is the contract surface in the top-level harness

Browsers + Node 24 + Deno + Workers all have a *single* sync `crypto` module.
The async API in this module is a thin shim — the underlying primitive is the
same; the concurrency story differs.

## Run it

```bash
cd modules/15-webcrypto
npx vitest run
```

The test uses Node's `--experimental-global-webcrypto` (default-on in Node 24).

## Exercises

1. Add a `crypto.subtle.deriveKey` from password to AES key via PBKDF2 (using
   SHA-256, ≥ 600k iterations, unique 16-byte salt).
2. Implement a worker-thread round-trip where a key is generated on the main
   thread and used in a worker.
3. Use `crypto.subtle.digest` over a stream of `Uint8Array` chunks (the
   streaming pattern).
4. Implement a SubtleCrypto-based `JWT.verify` with algorithm allow-list.
