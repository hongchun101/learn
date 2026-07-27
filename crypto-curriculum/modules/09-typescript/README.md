# Module 09 · TypeScript Reference Implementation

> The contract every other module implements, plus idiomatic-TS wrappers
> (`Result<T,E>`-style returns, `Uint8Array`-only, `SubtleCrypto`-aware).

## Why TypeScript first?

TypeScript is the language with the highest cross-domain reach for *crypto-aware*
applications (Node, Deno, Bun, browser, Workers). It also has the cleanest
type model for expressing things like:

```typescript
// 在类型层面保证公钥是你所期望的类型
type PublicKeyOf<Sig extends SignaturePair> = ReturnType<Sig['generateKeypair']>['pk'];

// 在类型层面保证签名函数对消息类型与密钥类型匹配
function sign<S extends SignaturePair>(sig: S, sk: S extends SignaturePair ? Uint8Array : never,
                                       m: Uint8Array): Uint8Array { /*…*/ }
```

That's the *kind* of safety you don't get from `valueOf(sk)`.

## What this module contributes beyond the top-level contract

1. **Async variant** of the contract: same interface, async-only. Some
   libraries (WebCrypto, Node worker threads, Async/Await on engines like
   Erlang/BEAM) prefer async primitives.
2. **WebCrypto adapter**: an `AuthenticatedCipher` against
   `globalThis.crypto.subtle.encrypt('AES-GCM', …)` for the browser /
   Workers.
3. **Type safety for Ed25519** — see `ed25519-typed.ts`; the raw-bytes
   contract collides with Node's `KeyObject` interface; we re-export a
   dedicated `type Ed25519PrivateSeed = Uint8Array & { readonly __brand: unique symbol }`
   to distinguish raw seeds from raw public points at compile time.
4. **Live TLS 1.3 inspection of public sites** for protocol observability.

## Files

```
src/
  contracts.ts       — the cross-module contract, re-exported
  aesgcm-async.ts    — async AEAD via SubtleCrypto
  ed25519-typed.ts   — branded keys + type-level tests
  tls-trace.ts       — open a TLS 1.3 connection, log the cipher suite
tests/
  webcrypto.test.ts  — assert SubtleCrypto output matches the contract
```

## How to verify

```bash
cd modules/09-typescript && npx vitest run
```

The TypeScript harness at `crypto-curriculum/tests/crypto.test.ts` already
exercises the synchronous reference. This module additionally checks the
async/SubtleCrypto path returns the same properties.

## Why this matters as a language *module*

TypeScript is the only language in this curriculum where:

- `Uint8Array` is *literally* an array — no Rust `&[u8]` view, no Python
  `bytes` (also a sequence), no Java `byte[]` (signed!), no Go `[]byte` (mutable).
- The type system is rich enough to capture brand-types for things like
  `EncryptedBytes`, `SignatureBytes`, `PublicKey`, `PrivateKey` — making
  misuse a compile-time error.
- The `crypto` namespace is the same in Node 24 and browsers — modules that
  use `crypto.subtle` work in both.

## Reading

- *TypeScript and the Smart Contract*, B. Dickman, USENIX 2018 (covers
  `Crypto.ts` patterns).
- *Domain Modelling with TypeScript*. Robert C. Martin series.
