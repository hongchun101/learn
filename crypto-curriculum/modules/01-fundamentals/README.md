# Module 01 · Classical Ciphers & Information Theory

> The minimum a working cryptographer must believe before reading anything else.

## What you will learn

1. Three classical ciphers and why each is broken (Caesar, Vigenère, One-Time Pad).
2. Kerckhoffs's principle and Shannon's maximisation of attacker uncertainty.
3. Why "secret algorithm" is a security antipattern.
4. The mathematical definition of *perfect secrecy* and what it costs.
5. Why every modern cipher is *computationally* secure, not *information-theoretically* secure.

## Three classical ciphers

### 1. Caesar — `c = (m + k) mod 26`

A single letter shift. 26 keys. Anyone can brute-force it; it survives only because
it's a children's toy. But every block cipher is a generalisation: instead of
shifting one *bit*, modern ciphers apply a key-controlled permutation to one
*block* (16 bytes for AES).

### 2. Vigenère — `c = (m + k) mod 26` with a *repeating key*

A polyalphabetic cipher. Resistant to single-letter frequency analysis, but broken
by **Kasiski examination** (find the key length by spotting repeated bigrams in
the ciphertext) or the **Friedman test** (variance of IC vs uniform).

### 3. One-Time Pad — `c = m ⊕ k`, single-use key

**Information-theoretically secure** (Shannon 1949). The only cipher with a
proof of security against an attacker with unlimited compute — *provided*:

1. `k` is uniformly random.
2. `k` is at least as long as `m`.
3. `k` is never reused.

The cost: you need a pre-shared secret as long as the message. You cannot exchange
it on the same channel that carries `c`, because then an attacker can trivially
recover `m`. This is the *key-distribution problem* — and it is the reason
asymmetric / public-key cryptography exists.

## Kerckhoffs's principle (1883)

> *"The security of a cryptosystem must lie in the choice of its key, not in the
> obscurity of its algorithm."*

Restated by Shannon (1949) as **"the enemy knows the system"**. AES is public;
RSA is public; every cipher you have ever shipped is public. If your scheme
breaks under that assumption, it is broken.

Concretely:

| Property | Algorithmic | Computational |
|----------|-------------|---------------|
| Attacker knows algorithm? | Yes (Kerckhoffs) | Yes (Shannon) |
| Attacker has unlimited compute? | Allowed | Not assumed |
| Proof of security? | Empirical / ad hoc | Reduction (e.g. EUF-CMA ⇒ discrete log) |
| Examples | Hashing passwords | AES, RSA, Ed25519 |

## Shannon's definition of perfect secrecy

A cipher `(E, D)` provides **perfect secrecy** over message space `M` if for all
`m₀, m₁ ∈ M` and every ciphertext `c`:

```
Pr[ m = m₀ | c ]  =  Pr[ m = m₁ | c ]
```

i.e. the ciphertext gives the attacker *zero information* about the plaintext.
The one-time pad achieves this; nothing shorter does (Shannon's theorem:
perfect ⇒ `|K| ≥ |M|`).

So how is AES secure? It's not — *information-theoretically* it gives an
attacker *some* information (namely, the AES algorithm leaks structure, and the
key is short). But the information leaked is *computationally infeasible* to
extract. We accept that because we don't have a way to get a 1 GB OTP.

## Why this matters in 2026

The default threat model in *this curriculum* is:

- The algorithm is public.
- The attacker knows everything except the keys.
- The attacker has access to today's compute (and is preparing for tomorrow's).
- The attacker **may see chosen plaintexts** (because the protocol must work
  for parties who encrypt on demand).
- The attacker **may see chosen ciphertexts** for everything except the
  *target* ciphertext.

If your scheme isn't secure in that model, don't ship it.

## Try it

```bash
cd modules/01-fundamentals && npx tsx src/classical-cipher-attack.ts
```

You'll see:

- Caesar broken in 26 tries (`o(n)` time).
- Vigenère broken via Kasiski / IC, with the key length recovered.
- OTP **not** broken by these tools — only reuse breaks it, and that's an
  operational issue, not an attack against the math.
