# Module 08 · Frontier Cryptography

> What happens when "computationally secure" isn't enough, "quantum-secure"
> isn't practical, or "trust no one" really means *no one*.

## What you will learn

1. **Post-quantum cryptography** — lattice-based (Kyber / ML-KEM), hash-based
   (XMSS, SPHINCS+ / SLH-DSA), code-based (Classic McEliece), multivariate.
2. **Zero-knowledge proofs** — Schnorr identification, NIZK (Groth16), STARKs,
   Bulletproofs.
3. **Homomorphic encryption** — Paillier (additive), BFV / CKKS (approximate).
4. **Threshold / multi-party computation** — FROST (Ed25519 sharing), Shamir +
   MPC, private set intersection.
5. **Verifiable random functions** (VRFs) — randomness with a public proof.

## The quantum threat

Shor's algorithm solves discrete-log and factoring in polynomial time on a
quantum computer. Shor's algorithm needs:

- "Big" quantum computer: a few million noisy qubits (the kind of machine that
  doesn't exist yet in 2026, but might in 2035–2050).
- Specific structure: the math problem must be in a *group where Shor is known*.

So, switch the asymmetric primitives:
- **RSA / DH / ECDSA / X25519** → **ML-KEM / ML-DSA / SLH-DSA** (NIST PQC).
- Symmetric primitives: **double the key** (Grover halves it; AES-128 → AES-256).

| Class | Migration target |
|-------|------------------|
| TLS key exchange | ML-KEM-768 (Hybrid X25519+ML-KEM-768, RFC 9378) |
| TLS authentication | ML-DSA-65 or SLH-DSA-SHAKE-128s |
| Code-signing | SLH-DSA or ML-DSA |
| Long-term secrets | Envelope with ML-KEM (still wrap with symmetric primitives) |

NIST's release: FIPS 203 (ML-KEM), FIPS 204 (ML-DSA), FIPS 205 (SLH-DSA).

## Zero-knowledge proofs

A *zero-knowledge* proof system has three properties:

- **Completeness**: an honest verifier is convinced by an honest prover.
- **Soundness**: a cheating prover can convince a verifier with only
  negligible probability.
- **Zero-knowledge**: the verifier learns nothing *beyond* the statement.

Concrete systems you'll meet:

| System | Setting | Proof size | Trusted setup |
|--------|---------|-----------|---------------|
| Schnorr | discrete-log | O(λ) bits | none |
| Groth16 | arithmetic circuit | ~200 B | required (Powers of Tau) |
| PLONK / Halo2 | arithmetic circuit | ~1-2 KB | Halo2: none |
| Bulletproofs | inner-product | O(log n) | none |
| STARK | AIR | O(poly-log) | none |

Schnorr is the simplest:

```
P: x ← random; X = g^x
P → V:  T = g^r,  r ← random
V → P: c ← random challenge
P → V:  s = r + c x
V: check g^s == T · X^c
```

The transcript reveals nothing about `x` to a verifier (or anyone taping the
wire); the verifier is convinced `P` knows `x` only because they couldn't have
produced `s` otherwise.

## FHE

Fully-homomorphic encryption lets you compute on ciphertexts:

```
Enc(x) ⊕ Enc(y)  =  Enc(x + y)
Enc(x) ⊗ Enc(y)  =  Enc(x · y)       (in BFV/CKKS)
```

A program can be evaluated "blindfolded" — useful for ML inference on
encrypted inputs, encrypted-SQL, etc. Costs: 10⁻⁴× to 10⁻⁸× slower than
plaintext today; outputs are *noisy* and need bootstrapping after a depth of
multiplications.

## Threshold / MPC

If `sk` is split across `n` parties, a signature requires `t ≤ n` parties to
cooperate. FROST (RFC 9591) is the standard threshold-Ed25519 scheme:

- `sk = sk₁ + sk₂ + … + sk_n` (Shamir).
- Each party signs a message *share*; shares combine into a valid signature.
- Compromise of `t-1` shares reveals no information about `sk`.

Private Set Intersection (PSI): two parties learn `|A ∩ B|` without
disclosing individual elements. Used heavily in advertising measurement.

## VRFs

A *Verifiable Random Function*:

```
y = VRF(sk, alpha)         # 确定性
pi = VRF_prove(sk, alpha)
(VK_RSA(sk) → pk)
verifier: VRF_verify(pk, alpha, pi, y)  → bool
```

Used for leader election in consensus protocols (Algorand, Cardano) and for
deterministic bind-to-input tokens (DNSSEC's NSEC5).

## Run it

```bash
cd modules/08-frontier && npx tsx src/frontier.ts
```

We use Node's TLS harness as a stand-in for "the cloud" — the actual PQC swap
requires `liboqs` or BoringSSL ≥ 2024.x with the Kyber / Dilithium algorithms
enabled; for an air-gapped demonstration we re-export a TLS 1.3 + ML-KEM-768
handshake *parameters* (no real cryptography, just the negotiation shape).

## Exercises

1. Implement Schnorr identification from scratch.
2. Implement a Schnorr-based ring signature (Monero-style MoneroCT).
3. Implement Private Set Intersection using Diffie–Hellman and Bloom filters.
4. Implement a simple VRF using `HMAC-DRBG(sk, alpha)` and a Schnorr proof.

## Reading list

- Bernstein, Lange — *Post-Quantum Cryptography* (de Gruyter, 2009–present).
- Boneh, Shoup — *A Graduate Course in Applied Cryptography* (online).
- NIST FIPS 203 (ML-KEM), 204 (ML-DSA), 205 (SLH-DSA).
- FROST — RFC 9591.
- STARKs — *STARK 101* by Starkware (free).
