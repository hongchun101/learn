# Module 06 · Randomness & Key Management

> The hardest part of cryptography: "where do the bytes come from?"

## What you will learn

1. **CSPRNGs** — what makes a CSPRNG different from a regular RNG.
2. **DRBGs** — NIST SP 800-90A: Hash-DRBG, HMAC-DRBG, CTR-DRBG.
3. **Fortuna** — Yarrow-style accumulator with reseeding.
4. **KDFs** — Argon2id (PHC winner), scrypt, PBKDF2, HKDF.
5. **Key management** — DEK/KEK (envelope encryption), KMS, MPC, threshold.

## Why CSPRNG ≠ RNG

```
lin-congruential: state = (state * a + c) mod m
output = state
                  → second-out bit is a deterministic function of state.
                    Period ~ m. Predictable.
```

A CSPRNG must:

- be **backtracking-resistant**: given current state, recovering past output is
  intractable.
- be **forward-secrecy-after-reseed**: compromising current state doesn't
  recover future output *if* entropy seed arrives at the right rate.
- pass **NIST SP 800-22** statistical battery.

Almost no one implements their own CSPRNG. Use your OS one:

- Linux:   `getrandom(2)`, then userland CSPRNG (haveged → /dev/urandom)
- Windows: `BCryptGenRandom`
- macOS:   `CCRandomGenerateBytes` / `SecRandomCopyBytes`

The 2008 Debian OpenSSL bug (CVE-2008-0166) caused keys generated on Debian
Ubuntu to live in a 32768-key space. That should be the watermark for every
auditor: **a one-line change to "just rand()" can compromise every key**.

## DRBGs

A CSPRNG is typically *seeded* with platform entropy, then runs a *DRBG* (a
stateful, periodically-reseeded bit generator):

```
      entropy        ┌─────────┐     reseed
OS ────────────────►─┤   DRBG  ├────► reseed
                    └────┬────┘
                         │ output
                         ▼
                  ╔════════════╗
                  ║  userland   ║ ── aes key, rsa nonce, ECDH ephemeral
                  ╚════════════╝
```

NIST SP 800-90A standardises Hash-DRBG and CTR-DRBG; the spec includes
*prediction resistance* (continual re-seeding).

## KDFs

```
                             Argon2id   scrypt   PBKDF2
            memory-hard          ✓         ✓       ✗
            per-password cost    ✓         ✓       ✓ (iterations)
            ASIC-resistant       ✓         ✓       ✗
            side-channel         ✓         ✓       ✓
            standard            PHC       RFC     RFC 8018
```

Argon2id is the modern winner for password-based KDFs:

- Time cost: `t`
- Memory cost: `m` (e.g. 64 MiB)
- Parallelism: `p` lanes
- Output: 32-byte key

Set `m` as high as tolerable (1 GiB → ASIC-unprofitable).

## Envelope encryption

```
            ┌──── KEK ────► DEK
            │  unwrap k
            ▼
┌───── KMS ─────┐
│  wraps DEK    │  ciphertext = AES-GCM(DEK, plaintext)
└───────────────┘  wrapped = KMS.wrap(KEK, DEK)
                    [wrapped + ciphertext] → unwrap → decrypt
```

The KMS never sees plaintext. CloudHSM, AWS KMS, GCP KMS all do this.

## Threshold cryptography

Distribute a secret `sk` across `n` parties such that any `t ≤ n` can sign but
any `t-1` cannot. **FROST** (RFC 9591) is the modern threshold-Ed25519 protocol.
Use cases:

- Hot wallets, no single point of compromise.
- Cross-org key custody for protocols (1inch fusion+, Fireblocks).

## Run it

```bash
cd modules/06-randomness && npx tsx src/randomness.ts
```

You'll see:
- Argon2id using Node's `crypto.scrypt` (closest portable KDF in stdlib).
- HKDF chained derivation (master → 3 subkeys with different `info`).
- Threshold-Ed25519 issuance using `ed25519-keygen` if installed, else
  simulated.

## Exercises

1. Implement a toy Linear Congruential generator and break it on three outputs.
2. Run Argon2id at various memory parameters on this machine and graph the time.
3. Implement envelope-encryption by hand: generate DEK + AES-GCM encrypt
   plaintext, then "wrap" DEK with a separate `keyWrap` (KEK, key) → `wrapped`.
   Show that `wrapped + ct` round-trips only with `KEK`.
4. Implement Shamir Secret Sharing over GF(256).
