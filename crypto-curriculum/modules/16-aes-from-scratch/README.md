# Module 16 · AES-128 From Scratch

> An expert-level audit-quality implementation of the AES block cipher in
> pure TypeScript.

## What you will learn

1. **The full AES-128 round** — SubBytes, ShiftRows, MixColumns, AddRoundKey;
   10 rounds for AES-128 (12 for 192, 14 for 256).
2. **The key schedule** — every round key derives from the previous via
   RotWord, SubWord, and `Rcon`.
3. **S-box implementation** — finite-field inversion x → x⁻¹ in GF(2⁸) +
   affine transformation. Pre-compute or compute-on-use.
4. **Why KeyExpansion is the same algorithm** in the encryption + the inverse
   round keys (with rotational symmetry — for `InvMixColumns` you XOR with the
   inverse MixColumns matrix instead of the forward one).
5. **Why this is *not* constant-time** without further work (look-up tables),
   and how to fix it (see "constant-time variants" in exercises).

## Mental picture

```
                       key
                        │
            ┌───────────▼────────────┐
            │    Key Expansion       │
            │   (10 round keys)      │
            └────┬──────────────────┘
                 │ 0    1    2  …  10
                 ▼     ▼    ▼      ▼
   plaintext  ┌───┐
   ──────────►│ + │─► Round 0 ─► Round 1 ─► … ─► Round 10 ─► ciphertext
              └───┘    ─┬─       ─┬─
                       │          │
                  SubBytes    SubBytes
                  ShiftRows   ShiftRows
                  MixColumns  MixColumns
                  AddRoundKey AddRoundKey

```

## Files

```
src/
  aes-from-scratch.ts  — AES-128 encrypt + decrypt in pure TypeScript
  sbox.ts              — S-box + inverse S-box, generated from GF(2⁸) inversion
  gf.ts                — GF(2⁸) helpers (mul, inv)
tests/
  aes.test.ts          — NIST CAVP test vectors for AES-128-ECB
  gf.test.ts           — GF(2⁸) round-trip properties
```

## Run it

```bash
cd modules/16-aes-from-scratch
npx vitest run
```

It runs **NIST CAVP test vectors**, the standard for "is your implementation
correct?"

## Why this is the *expert* chapter

You can implement AES from scratch in 200 lines. But:

- **Look-up tables leak timing.** A constant-time AES requires combining the
  S-box look-up with a small bit-level computation (`(x·0x80) | (x·0x1F)` etc.).
- **Bit-slicing** is the standard trick to make all 16 bytes in a column
  processable in parallel with no memory lookups.
- **The key schedule** can be combined with the round transformation to make
  a *software-only* constant-time AES — what BearSSL and HACL* do.

If you can implement AES in 200 lines AND pass NIST CAVP, you understand
block ciphers. If you can implement it in 200 lines AND constant-time,
you can write a TLS stack.

## Exercises

1. Implement AES-256 (same algorithm; longer key schedule; 14 rounds).
2. Implement CTR mode on top of the block interface (this is what AES-CTR
   is *internally*).
3. Implement constant-time SubBytes using bit-slicing (see the
   "circuit" interpretation: the S-box is a 32×32 bool matrix? no, a 8x8 one —
   encode every byte as 8 wires, every operation as a fixed sequence of XOR
   gates).
4. Cross-check your implementation against OpenSSL's by parsing
   `OPENSSL_RAND` byte streams.
