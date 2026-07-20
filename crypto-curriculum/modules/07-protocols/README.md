# Module 07 · Protocols & Applications

> What happens when the eight primitives in chapters 01–06 try to talk to each other.

## What you will learn

1. **TLS 1.3** — the canonical "make two parties secure on an open channel".
2. **JWT / JOSE** — bearer tokens; why "alg: none" was a disaster.
3. **X.509 / PKI** — chains of trust, chain validation, revocation.
4. **E2E messaging** — Double Ratchet (Signal), X3DH, forward & post-compromise security.
5. **Secret-sharing** — Shamir's (k, n) threshold scheme.
6. **MPC** — the same idea, but applied to *computation* over secrets.

## TLS 1.3 handshake (conceptual)

```
                 Client                                            Server
                   │                                                  │
                   │        ClientHello{cipher_suites, key_share, pqc} │
                   │ ────────────────────────────────────────────────► │
                   │                                                  │
                   │ {ServerHello{suite, key_share}, cert_chain,        │
                   │  cert_verify (signed transcript), finished}        │
                   │ ◄────────────────────────────────────────────────│
                   │                                                  │
                   │  finished (client)                                │
                   │ ────────────────────────────────────────────────► │
                   │                                                  │
                   ▼                                                  ▼
            [mTLS keys derived from "early secret" → handshake → traffic secrets]
```

Salient features (RFC 8446):

- Mandatory **forward secrecy** — every session makes a fresh ECDH key.
- **0-RTT** data — but only for *idempotent* requests; replay protection required.
- Encrypted handshake — even the certificate is encrypted (unlike TLS 1.2).
- Post-quantum key exchange (ML-KEM) optional as of draft-2025.

## JWT / JOSE failure modes

```
base64url(header).base64url(payload).signature
                         ▲
                         │ "alg: none" + empty signature: NO signature check.
                         ▼
                          alg=HS256 verified with key = public-key of RS256.
                          → secret recovered.
```

The fix: enforce a verifier allow-list for `alg`. **Do not parse `alg` from the
header**. RFC 8725 ("JWT BCP") codifies this; ASVS V3 covers the audits.

## X.509 / PKI

A real-world certificate *chain* is more like a graph:

```
               Root CA (Boulder)
                  │ self-signed, baked into OS / browser
                  ▼
            Intermediate CA ── OCSP responder, signed by Root
                  │ restricted: *.example.com
                  ▼
              example.com (leaf)
                  │ SAN: dns=example.com, dns=*.example.com
                  ▼
                user (TOFU the leaf)
```

Things that go wrong:

- Constrained intermediate escapes its restriction → CABF baseline requirements
- Revocation: OCSP must-staple, OCSP stapling, CRLs, OCSP-multi-stapling
- Algorithm downgrade: enforced at the verifier (e.g. no RSA < 2048, no SHA-1)

## Double Ratchet (Signal)

Each message derives a fresh symmetric key from *both*:

- A **Diffie–Hellman ratchet** (a new ECDH key per "ratchet step")
- A **symmetric-key chain ratchet** (HMAC chain, advancing by 1 per message)

Compromise of *one* symmetric key reveals nothing about earlier messages
(forward secrecy) and after one more ratchet, no later messages either (post-
compromise security).

## Secret-sharing

Shamir (1979): pick a polynomial `f(x)` of degree `t-1`, `f(0) = secret`,
`f(i)` for `i ∈ {1..n}` are shares. Any `t` shares reconstruct via Lagrange
interpolation. `t-1` shares reveal nothing.

```
                 share 1          share 2          share t
                  ▼                ▼                ▼
        ┌──────────────────────────────────────────────────┐
        │            Lagrange interpolation over GF(p)       │
        └──────────────────────────────────────────────────┘
                              ▼
                       f(0) = secret
```

A modern improvement: Pedersen commitments hide the shares; FROST (RFC 9591)
makes the protocol non-interactive.

## Run it

```bash
cd modules/07-protocols && npx tsx src/tls-jwt.ts
```

You'll see:
- A real TLS 1.3 connection to https://example.com:443 (or a Node-side TLS server).
- A JWT signed with HS256 and how a pin to `RS256` enforces the algorithm.
- Shamir-Secret-Sharing reconstruct with `t ≤ k ≤ n` shares.

## Exercises

1. Implement a minimal TLS 1.3 handshake in pure code (no library) using X25519 +
   HKDF + AES-GCM, including certificate verification of an ephemeral root.
2. Implement Shamir secret-sharing over GF(256) — see `secret-sharing.test.ts`.
3. Implement JSON Web Token (JWS) with an algorithm-allow-list verifier; reject
   `alg: none` and `alg: HS256` if the public key is RSA.
4. Implement the Double-Ratchet chain mode (HMAC-based) and show that
   compromising key `n` does not reveal keys 0..n-1.
