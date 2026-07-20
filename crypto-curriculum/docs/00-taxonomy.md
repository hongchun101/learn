# 00 · Cryptography Taxonomy

The shared mental model used by every chapter in this curriculum.
**Read this once before any chapter; revisit when a new chapter introduces a
name you do not recognise.**

## 1. The two questions every chapter answers

> "Given an attacker who can do **X**, what computations are still hard for
> them to do?"

```
                      WHAT THE ATTACKER CAN SEE
                 ────────────────────────────────
                 ciphertext only   │   chosen-plaintext
                 (passive)         │   (active / adaptive)
                 ────────────────────────────────────────
WHAT THE
ATTACKER WANTS
────────────────┬──────────────────┬─────────────────────
recover the key  │  Kerckhoffs's    │  CPA-security
                 │  requirement:    │  (IND-CPA)
                 │  assume the      │
                 │  attacker knows  │
                 │  the algorithm  │
─────────────────┼──────────────────┼─────────────────────
recover the      │  one-way        │  semantic security
plaintext        │  function       │  (IND-CPA)
─────────────────┼──────────────────┼─────────────────────
forge a          │  existential    │  unforgeability
signature        │  unforgeability │  (EUF-CMA)
                 │  (EUF) under    │
                 │  no-message     │
                 │  queries        │
─────────────────┼──────────────────┼─────────────────────
break a MAC      │  no forgery     │  MAC unforgeability
                 │  without a key  │  (strongly-UF)
─────────────────┴──────────────────┴─────────────────────
```

The **default threat model** for every primitive in this curriculum is:
*the algorithm is public, the attacker sees ciphertexts, may submit chosen
plaintexts and chosen queries, and may adaptively corrupt keys*. If a
construction fails outside that box, it is broken.

## 2. Three orthogonal axes of difficulty

```
       CLASSICAL                          POST-QUANTUM
   (factoring / discrete-log            (lattices / codes / multivariate /
    / elliptic curves)                    hash-based / isogenies)
        │                                       │
        │                          Key sizes grew.
        │                          Speeds dropped.
        │                                       │
        ▼                                       ▼
   ┌──────────────┐                       ┌──────────────┐
   │   TODAY:     │   NIST PQC migration │   TOMORROW:   │
   │  RSA / DH /  │   (2024–2030+)       │  ML-KEM /     │
   │  ECDSA /     │ ◄──────────────────► │  ML-DSA /     │
   │  X25519      │                      │  SLH-DSA      │
   └──────────────┘                      └──────────────┘
                 \                    /
                  \                  /
                   ▼                ▼
                SYMMETRIC PRIMITIVES (AES, SHA-2/3)
                survived both axes unchanged — Grover
                only halves effective key length.
```

A **complete** system mixes both:
symmetric primitives stay the same;
asymmetric primitives migrate to lattice / hash-based.

## 3. The eight primitives — the curriculum at a glance

| # | Primitive | Mental picture | Canonical constructions (today) |
|---|-----------|----------------|--------------------------------|
| 1 | **Confidentiality** (encryption) | Sender & receiver share a secret; others see only noise. | AES-GCM, ChaCha20-Poly1305 |
| 2 | **Integrity / authentication** (MAC) | Tag proves the *sender* knew a key and the *message* was not altered. | HMAC-SHA-256, GMAC, Poly1305, KMAC |
| 3 | **Public-key encryption** | Anyone can encrypt to a published key; only the holder decrypts. | RSA-OAEP, ECIES, ML-KEM (post-quantum) |
| 4 | **Digital signature** | Anyone can verify; only the signer produces a valid signature. | Ed25519, ECDSA-P256, RSA-PSS, ML-DSA (post-quantum) |
| 5 | **Key exchange** | Two parties derive a shared secret over an open channel. | ECDH (X25519), TLS 1.3 HKDF handshake, ML-KEM |
| 6 | **Hash function** | Arbitrary-length input, fixed-length output, collision-resistant. | SHA-256, SHA-3/Keccak, BLAKE3 |
| 7 | **Key derivation / stretching** | Turn one weak secret into many strong keys. | HKDF, Argon2id, scrypt, PBKDF2 |
| 8 | **Randomness source** | Bits no attacker can predict even with side-channel access. | OS CSPRNG (`getrandom`, `/dev/urandom`), DRBG (CTR-DRBG, Hash-DRBG), hardware RNG |

Every chapter in `modules/01..08` focuses on one of these.
Every chapter in `modules/09..15` implements them in a different language/runtime.
Every chapter in `modules/16..17` implements one from scratch in pure code.
Module `18` ties all eight together.

## 4. Eight building blocks — the chapter spine

The chapters in this curriculum are organised around these, in this order:

1. **Ciphers & information theory** — Caesar → Vigenère → OTP → Shannon.
   The "you must not invent the algorithm" theorem.
2. **Symmetric primitives** — block ciphers, modes (ECB / CBC / CTR / GCM),
   padding-oracle attacks, AEAD.
3. **Asymmetric / public-key** — RSA, DH, ECC, hybrid encryption.
4. **Hashes & MACs** — SHA-2 / SHA-3, HMAC, Merkle–Damgård, length-extension,
   KMAC, BLAKE3.
5. **Signatures & authentication** — RSA-PSS, Ed25519, ECDSA, certificates,
   PAKE.
6. **Randomness & key management** — CSPRNGs, KDFs, key derivation, envelope
   encryption, KMS, threshold.
7. **Protocols & applications** — TLS 1.3, JWT/JOSE, X.509/PKI, E2E messaging,
   secret-sharing, MPC.
8. **Advanced / frontier** — ZKPs (Groth16, STARKs, Bulletproofs),
   homomorphic encryption, post-quantum (Kyber/Dilithium/SLH-DSA),
   threshold signatures.

After chapters 1–4 you can read any textbook on symmetric / asymmetric crypto
and understand it. After chapters 5–7 you can review and design a real-world
system. After chapter 8 you can read current research papers.

## 5. Five universal properties — the contract that ties modules together

Every chapter touches all five. Each language module proves its implementation
satisfies them.

1. **Correctness round-trip** — `dec(k_e, enc(k_e, m)) ≡ m` for every `m`.
2. **Determinism of MACs / hashes** — same input, same output, byte-for-byte.
3. **Authentication / unforgeability** — no attacker produces a valid MAC /
   signature without the key.
4. **Constant-time comparators** — comparison of secrets does not branch on
   their value (otherwise timing leaks the secret).
5. **Side-channel resistance** — sensitive intermediates do not appear in error
   messages, logs, or timing profiles.

The top-level TypeScript harness in `src/crypto/` implements these five as
*property checks*. Each language module exports the same five and the
corresponding test asserts the same property in that language.

## 6. Six cross-chapter challenges — the comparison surface

These are the *named* properties the modules implement in every language:

| # | Challenge | Property |
|---|-----------|----------|
| 1 | **`encrypt-decrypt` round-trip** | For random key + random plaintext, `decrypt(k, encrypt(k, m)) === m` |
| 2 | **`mac-verify` round-trip** | For random key + random message, `verify(k, m, mac(k, m))` is `true`; flipping a bit falsifies it |
| 3 | **`hash` collision-resistance (practically)** | For 100k random 32-byte inputs, all SHA-256 outputs distinct |
| 4 | **`kdf` determinism & domain separation** | Same `(master, info)` → same subkey; different `info` → different subkey |
| 5 | **`signature` round-trip** | For random keypair + random message, `verify(pk, m, sign(sk, m))` is `true` |
| 6 | **`rsa-padding-oracle` resistance** | Decrypting two related ciphertexts that differ only in padding produces differing timing |

If your construction fails any of these, you have a publishable break.

## 7. Attacks catalogue

| Attack | Defeated by |
|--------|-------------|
| Brute force (key search) | Key length ≥ 128-bit symmetric ≥ 256-bit ECC |
| Frequency analysis (Caesar) | Polyalphabetic, modern ciphers |
| Known-plaintext (Vigenère) | Modern block ciphers |
| Differential / linear cryptanalysis | AES, modern designs — **the reason AES exists** |
| Birthday / meet-in-the-middle | 256-bit hashes, 3DES retirement |
| Padding oracle (Bleichenbauch, Vaudenay) | AEAD (GCM, ChaCha20-Poly1305), constant-time decoding |
| Length extension (SHA-2) | SHA-3 / BLAKE3 / HMAC |
| RSA small message / `m^e < N` | OAEP padding, min bit-length |
| RSA-CRT fault attack | Verify `s^e = m mod N` after signing |
| Bleichenbauch '06 (PKCS#1 v1.5 sig) | Strict RSA-PSS / strict verification |
| Heartbleed-style memory disclosure | Zero-after-free, secret-zeroing, mlock; better: don't hold it |
| Side-channel (timing, cache, EM) | Constant-time code, blinding, masking |
| Replay (TLS, Kerberos) | Nonces, sequence numbers, counters |
| Quantum (Shor) | ML-KEM, ML-DSA, SLH-DSA |
| Bad-randomness (Debian OpenSSL 2008) | CSPRNG seed health tests, hardware RNG |
| Compiled-out checks (static analysis failures of CRT_RAND) | Constant-time verified primitives, type system via `subtle` crate |

## 8. Reading order

```
00  shared taxonomy (this file — read first)
↓
01  fundamentals   (start here; nothing else makes sense otherwise)
02  symmetric      (AES, modes, MACs — the workhorse)
03  asymmetric     (RSA, DH, ECC — slow but powerful)
04  hashes / MACs  (SHA family, HMAC, KMAC)
05  signatures     (the certificate chain of trust depends on this)
06  randomness     (CSPRNG, KDF — without it, everything else breaks)
07  protocols      (TLS, JWT, X.509 — the chapters 1–6 in the wild)
08  frontier       (ZKPs, FHE, post-quantum, threshold sigs)
↓
09  TS reference  (the contract; same code as the top-level harness)
10  Java 8        (production-type, JDK only)
11  Rust          (constant-time verified primitives)
12  Go example    (stdlib-heavy, post-quantum ready)
13  Python example (most readable; pedagogical)
14  C++ example   (low-level control, OpenSSL integration)
15  JS / WebCrypto example (browser-side; SubtleCrypto only)
16  handwritten AES (no library, every MixColumns trace explained)
17  handwritten RSA (textbook RSA → OAEP)
18  capstone      (implement TLS 1.3 AEAD + X25519 + Ed25519 yourself;
                   break something on purpose, then fix it)
```

After 01–07 you can read any textbook chapter on the matching topic and
understand it; after 08–15 you can read production code in that language and
explain it; after 16–18 you can *design* a system and *attack* one you built
yourself.

## 9. Why a single-language curriculum fails

A "learn cryptography" tutorial that uses only one language hides the fact
that the **API surface** matters more than the algorithm:

| API surface issue | Bites in which language |
|-------------------|--------------------------|
| Strings vs bytes | Every non-Rust language |
| Padding / `null` vs `undefined` | TypeScript / JS |
| Cached RNG seeding | C / C++ (`RAND_poll`) |
| Deterministic DSA `k` | All — but ECDSA k-reuse is what *broke* Sony PS3 |
| Random nonce per encryption | GCM nonce reuse destroys everything; XSalsa20 needs only the secret |
| Constant-time comparison | All — but easy to forget in C / C++ / Go |
| Mutable `crypto` state | None in Rust / Go / TS, painful in Java, easy in Python |
| Hardware RNG presence | Server-class yes, embedded often no |

That is why this curriculum repeats everything in 7 languages. The language
hides half the bugs.

## 10. How to verify what you've learned

A learner can self-verify at every level:

| After chapter | Verification |
|---------------|--------------|
| 01 | Implement OTP, prove `H(K|C) ≥ H(M)` when `|K|=|M|` |
| 02 | Implement AES-CTR + HMAC; show a forged MAC fails |
| 03 | Implement RSA-OAEP; show textbook RSA is malleable |
| 04 | Implement HMAC; show length-extension does not apply |
| 05 | Implement Ed25519; show leaked `k` from ECDSA recovers `sk` |
| 06 | Implement Argon2id; show GPU cost vs scrypt vs PBKDF2 |
| 07 | Run your own MITM on TLS 1.2 (testserver) — see why 1.3 fixed it |
| 08 | Implement a Schnorr identification protocol; verifier learns nothing |

If you can clear those, you can call yourself a cryptography practitioner.
