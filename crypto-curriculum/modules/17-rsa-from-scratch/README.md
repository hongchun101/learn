# Module 17 · RSA From Scratch (textbook RSA, then OAEP)

> Implement textbook RSA — the right way to *not* do it — then layer the
> real-world primitives (OAEP padding, PSS signatures) that turn RSA into
> something you'd be willing to put in a TLS handshake.

## What you will learn

1. **Modular arithmetic** — `gcd`, modular inverse (Extended Euclidean
   Algorithm), modular exponentiation (right-to-left binary method), Jacobi
   symbol, Miller-Rabin primality test.
2. **The RSA key pair** — generation (choose `p, q`, compute `n = pq`,
   `φ(n)`, `e`, `d = e⁻¹ mod φ(n)`), encryption/decryption, signing.
3. **Why textbook RSA is broken** — chosen-ciphertext attacks recover
   plaintext with a few *decryption* calls. Bleichenbauch '06 signature
   forgery on PKCS#1 v1.5.
4. **The proper padding schemes** — OAEP (encryption) and PSS (signatures);
   why they exist and what they defend against.
5. **The Chinese Remainder Theorem (CRT)** — 4× faster private-key
   operations; the *attack* against faulty-CRT-RSA (Bellcore 1996),
   mitigated by adding a verify step.

## Mental picture

```
   ┌──── party A ─────┐
   │  (pk_A = e,n)    │  publish
   │  (sk_A = d,n)    │  secret
   └────────┬─────────┘
            │ M, σ
            ▼
   ┌────────────────────┐
   │   Encryption:      │   c = m^e mod n
   │   Signature:       │   σ = m^d mod n
   │   (NOT BOTH!)      │
   └────────────────────┘
```

In the *textbook* form: `encrypt(c, p) = p^e mod n`, `decrypt(c, s) = s^d mod n`. Easy. *Fatal*. The Bleichenbauch attack on `decrypt-then-decrypt` lets an attacker recover a signer's `sk` given access to a faulty verifier.

## Files

```
src/
  mod-math.ts         — gcd, modInv, modExp (binary), Jacobi, Miller-Rabin
  rsa-textbook.ts     — encrypt/decrypt/sign/verify naively (DO NOT USE)
  rsa-oaep.ts         — OAEP encryption built on top of textbook RSA
  rsa-pss.ts          — PSS signature built on top of textbook RSA
tests/
  textbook.test.ts    — round-trip works; CCA attack succeeds
  oaep.test.ts        — OAEP round-trip; malleability resistance
  pss.test.ts         — PSS round-trip; forgery resistance
```

## Run it

```bash
cd modules/17-rsa-from-scratch
npx vitest run
```

The tests run with 1024-bit keys (fast enough in pure JS) to avoid test
runtime spinning.

## What's *not* here

A from-scratch RSA-2048 implementation takes seconds to generate and signs at
<10 ops/sec in pure TypeScript. We cap the size at 1024-bit `n` and explicitly
*block* the test from using `crypto.createSign('RSA-SHA256')` — the goal here
is to learn the *algorithm*, not to produce a constant-time constant library.

For real keys, `node:crypto` + BoringSSL/OpenSSL/Apple CNG.

## Exercises

1. Implement CCA-malleability attack on textbook RSA: given a decryption
   oracle for `n, d`, recover the plaintext of *any* ciphertext by computing
   `c' = c · r^e mod n` and asking the oracle.
2. Implement the constant-time modular-exponentiation (Montgomery ladder)
   and show the timing difference on a timing trace.
3. Implement Bellcore's CRT-fault attack: with a faulty signing box that
   skips the verification step, two different signatures `s1, s2` from
   the *same* message recover `p + q = gcd(s1² - m² mod n, n)` — show
   this from a single faulty signature over multiple *messages* with known
   padding.
4. Implement Miller-Rabin with 40 rounds, generate a 1024-bit prime, and
   verify with `crypto.createDiffieHellmanGroup('modp14')`.
