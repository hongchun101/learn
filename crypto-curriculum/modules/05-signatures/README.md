# Module 05 · Signatures & Authentication

> The "this came from A, not from someone who looks like A" property.

## What you will learn

1. **Signature schemes** vs **MACs** — public verifiability, non-repudiation.
2. **Ed25519** — small keys, fast, deterministic (RFC 8032).
3. **ECDSA-P256** — what TLS 1.3 uses for *server identity*; the `k` reuse disaster.
4. **RSA-PSS** — the only safe RSA signature padding.
5. **Certificates** — X.509 chains of trust (RSA signature on a CA-issued
   "this public key is `example.com`").
6. **PAKE** — Password-Authenticated Key Exchange; never send a hash of the
   password over the wire.

## Mental model

```
                                 pk_A       pk_A
A: sk_A, pk_A                ── signed ──►  anyone can verify:
m, σ = sign(sk_A, m)            attach    yes, A signed this.
                                                      ─► non-repudiation
MAC: σ = MAC(k, m)
                ── with same k ─► only someone with k can verify.
                                                         ─► confidentiality of k.
```

A MAC says "someone with `k` signed it". A signature says "the *holder of
`sk_A`* signed it" — and anyone with `pk_A` can check. So signatures are
publishable in public forums (you don't need to leak `k`).

## Why ECDSA needs a deterministic per-message `k`

ECDSA signs by sampling a random nonce `k` per signature. If `k` is reused or
biased even slightly, the secret key is recovered. **Sony PS3** signed code
with the same `k` across multiple signatures — public keys + recovered `s` → `k`,
then `dA = (s1 - s2) / (r1 - r2)`.

**RFC 6979** sets `k = HMAC-DRBG(sk, m)` so signatures are *deterministic* and
the failure mode is impossible. Ed25519 is deterministic by design.

## RSA-PSS vs PKCS#1 v1.5

PKCS#1 v1.5 (1993) "wastes" bytes after the encoded message hash, leaving room
for a forgery attack (Bleichenbauch 2006) when the verifier parses loosely.
PSS (1998) uses random salt and masks the whole encoded structure; the public
verifier exposes *nothing* about parsing decisions.

**Always PSS** unless you're stuck with a legacy wire format. Same applies to
RSA encryption — always OAEP.

## PAKE — password-safe key exchange

The naïve way to authenticate a user: send `H(password)`. The attacker
eavesdrops the hash and tries every password offline at GPU speed.

A PAKE protocol like **OPAQUE** or **SRP** (Stanford) does:

```
client knows: pw
server knows:  H(pw) xor something
both end up with: shared key K, attesting to the same password
never transmits: anything brute-forceable against pw
```

This is what Apple's iCloud Keychain end-to-end encryption uses (OPAQUE).

## Run it

```bash
cd modules/05-signatures && npx tsx src/signatures.ts
```

You'll see:
- Ed25519 round-trip and bit-flip failure.
- The same algorithm but on `verify` — forgery rejection.
- ECDSA-P256 raw `sign/verify` (showing length and behaviour).
- Why `k` reuse in ECDSA is bad — we demonstrate the recovery formula.

## Exercises

1. Implement RFC 6979 deterministic DSA-K generation (HMAC-DRBG over `sk || m`).
2. Implement RSA-PSS from `genRSAKey` and `hash` (use a 1024-bit key for speed in tests).
3. Implement Schnorr identification: a non-interactive zero-knowledge-style
   protocol that proves "I know `x` such that `X = g^x`" without revealing `x`.
4. Reconstruct Sony's `k`-reuse attack from a leaked (r, s₁) and (r, s₂) pair
   (educational; you'll need the test vectors).
