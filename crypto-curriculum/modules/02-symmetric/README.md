# Module 02 · Symmetric Primitives

> Block ciphers, modes of operation, AEADs, and what happens when you pick the wrong one.

## What you will learn

1. **Block ciphers** — AES (rijndael) internals: SubBytes, ShiftRows, MixColumns, AddRoundKey. Why 10/12/14 rounds. Confusion & diffusion (Shannon, again).
2. **Modes of operation** — ECB (don't), CBC (legacy), CTR (good), GCM (the default).
3. **Padding-oracle attacks** — Vaudenay 2002; how a "did decryption succeed?" bitstream breaks CBC.
4. **AEAD** — authentication + encryption in one API. GCM and ChaCha20-Poly1305.
5. **Why AES-256-GCM nonces must not repeat** — every key-nonce pair is one-time; 32 GiB of CTR keystream before you wrap.

## Mental model

```
       message
          │
          ▼
   ┌───────────────┐                         ┌───────────────┐
   │  AES key      │──── encrypt ──────►──── │  ciphertext    │
   │  (128/256 b)  │                         │  + tag + nonce │
   └───────────────┘                         └───────────────┘
   block / counter / nonce
```

Three steps every modern symmetric scheme gets right:
- **Different nonce per encryption** (AES-GCM: 96-bit random; XChaCha20: 192-bit random)
- **Authenticated** (so a flipped bit fails the verify, instead of decrypting to garbage)
- **Forward-secret keys** if a long-term secret is involved (e.g. Noise XX pattern)

## The four modes — at a glance

| Mode | Plaintext ⇨ | Issues |
|------|-------------|--------|
| **ECB** | independent blocks | leaks structure (the famous Tux penguin) |
| **CBC** | XOR with previous block; IV for first | malleable; padding-oracle |
| **CTR** | block-aligned counter XOR | malleable without MAC; fine WITH MAC |
| **GCM** | CTR + GHASH tag | nonce-reuse catastrophic |

## Padding oracle

CBC decryption pads to block size. If the server tells the attacker "padding bad"
vs "padding good" (status code, timing, anything), the attacker can decrypt any
ciphertext block by block: ~16 attempts per byte × block-count = 256 attempts per
byte, ~80 ms per byte on a LAN. The fix is *constant-time decoding of padding*
combined with *MAC-then-encrypt* (or, better, AEAD).

## AES-GCM nonce reuse — the absolute worst

```
ciphertext = nonce ‖ AES_k(ctr_nonce, plaintext)
tag        = GHASH(AES_k, ciphertext)
```

If you encrypt *two* different plaintexts under the *same* key+nonce:

```
c1 ⊕ c2 = (p1 ⊕ ctr) ⊕ (p2 ⊕ ctr) = p1 ⊕ p2
tag₁ ⊕ tag₂ = GHASH(c1) ⊕ GHASH(c2)
```

You can recover the secret H of GHASH, then **forge** messages at will. This is
not a bug; it's a published result (Joux 2002; see also "Forbidden Attack").

`libsodium`'s `secretbox`, ChaCha20-Poly1305 with XChaCha (192-bit nonce), and
AES-GCM-SIV all but eliminate the worry: randomly picking a nonce almost never
collides.

## Run it

```bash
cd modules/02-symmetric && npx tsx src/modes-demo.ts
```

You'll see:
- ECB vs CBC: encryption of identical 16-byte blocks under ECB → identical
  ciphertext blocks (and the Tux-style image leak).
- CTR with a *reused* nonce → recovers XOR of two plaintexts.
- AES-GCM: bit-flipped ciphertext throws.

## Exercises

1. Implement CBC-MAC over AES-CBC using the last block as a tag. Show why
   CBC-MAC is *not* secure for variable-length messages.
2. Implement HMAC-DRBG: a CSPRNG built from a hash + key + seed.
3. Find at least three historical real-world padding-oracle vulnerabilities
   (POODLE, Lucky 13, etc.) and write up what went wrong.
4. Re-implement AES-256-GCM without libraries using `crypto.createCipheriv`'s
   underlying primitive and confirm 100× speedup potential vs pure-JS.
