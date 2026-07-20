# Module 03 · Public-Key / Asymmetric Cryptography

> The trick that lets strangers establish secrets on a public channel.

## What you will learn

1. **Diffie–Hellman key exchange** (1976) — discrete-log problem.
2. **RSA** — factoring problem; pad with OAEP, sign with PSS.
3. **ECC** — same security at smaller keys (256-bit ECC ≈ 3072-bit RSA).
4. **Hybrid encryption** — RSA/ECIES encrypts a fresh AES key; AES encrypts the message.
5. **Why "textbook RSA" is broken** — chosen-ciphertext attacks on plain `m^e mod n`.

## Mental model

```
          ┌────── party A ──────┐
          │   sk_A, pk_A        │
          │   (random keypair)  │  pk_A published (TLS server cert)
          └─────────────────────┘
                       ▲
                       │ encrypt(pk_A, plaintext) ──► ciphertext
                       │ decrypt(sk_A, ciphertext) ──► plaintext
                       ▼
          ┌────── party B ──────┐
          │   sk_B, pk_B        │
          │   (random keypair)  │  pk_B in cert
          └─────────────────────┘
```

Asymmetric is *expensive*; symmetric is *fast*. Real systems use **hybrid**:
- Pick random AES key K, encrypt data with K (fast).
- Encrypt K with recipient's `pk` (asymmetric; small input).
- Send `{AES_k(m), encrypt(pk, K)}`.

## RSA — the textbook chapter

Pick primes `p, q`, set `n = pq`. Pick `e` (usually 65537). `d` is the modular
inverse of `e mod φ(n)`. Public key `(e, n)`, private key `(d, n)`.

```
encrypt:  c = m^e mod n
decrypt:  m = c^d mod n
sign:     s = m^d mod n
verify:   m ≟ s^e mod n
```

But naively (textbook RSA) every primitive operation is broken:

| Attack | Reason |
|--------|--------|
| "encrypt(m)" with m < n known | attacker just encrypts them and checks |
| Bleichenbauch '06 RSA signature forgery | PKCS#1 v1.5 wastes bytes after the hash; attacker forges |
| "decrypt small m" | m^3 < n never wraps, cube-root attack |
| "common modulus" | same n shared, two keys; extended GCD recovers plaintext |

**Use OAEP for encryption, PSS for signatures, OAEP/PSS only with random nonces,
and ≥ 2048-bit keys.** Or **don't use RSA at all** — Ed25519 signatures + X25519
DH + AES-GCM is a more modern stack.

## Diffie–Hellman

```
A: x ← random; X = g^x mod p
B: y ← random; Y = g^y mod p
send: A → B: X   ─►  B:  s = Y^x = g^(xy) mod p
send: B → A: Y   ─►  A:  s = X^y = g^(xy) mod p
```

The attacker knows `g, p, X = g^x, Y = g^y` and wants `g^(xy)`. That's the
**discrete-log problem** in a cyclic group of prime order `p`.

**Active attack** (no authentication): a man-in-the-middle `M` substitutes
`X_M, Y_M` for both parties, ending with two shared secrets. **Mitigation**:
signed DH (or just use TLS 1.3 handshakes, which always sign the exchange).

## ECC — same problem, smaller numbers

Replacing "cyclic group of Z_p*" with a point group on an elliptic curve
gives roughly the same hardness at *much* smaller key sizes. ECDH with P-256,
Ed25519 signatures, X25519 DH — these are the modern defaults.

| RSA | ECC | Symmetric equivalent |
|------|------|----------------------|
| 1024 bits | ~80 bits | — (broken) |
| 2048 bits | ~112 bits | 112 |
| 3072 bits | ~128 bits | 128 |
| 15360 bits | ~256 bits | 256 |

## Run it

```bash
cd modules/03-asymmetric && npx tsx src/asymmetric.ts
```

You'll see:
- Naive RSA on byte<1 looks identical to byte<2 (no padding — broken).
- Textbook signature forgery on PKCS#1 v1.5 with low e (Bleichenbauch '06).
- A working X25519 ECDH (raw 32-byte keys + 32-byte shared secret).

## Exercises

1. Implement OAEP from scratch and verify it round-trips.
2. Implement RSA-PSS from a hash function — show the random salt is essential.
3. Prove the Diffie–Hellman problem in (Z, ·) is not a hard group for tiny `p`.
4. Run a textbook-RSA chosen-ciphertext attack on a "send yourself a 256-bit
   value" oracle — recover the key by asking for `m*2 mod n`, `m*4 mod n`, etc.
