# Module 04 · Hash Functions & MACs

> Reducing arbitrarily large messages to fingerprint-sized commitments, and the
> "did the right key sign this?" guarantee that follows.

## What you will learn

1. **Security properties** of a hash `H`:
   - collision-resistance:    `H(m) = H(m') ⇒ m = m'`
   - second-preimage:         given `m`, `m' ≠ m`, hard to find `H(m) = H(m')`
   - preimage:                given `h`, hard to find `m : H(m) = h`
   - random oracle model:    `H` *behaves* like a random function; security proofs
     of AES-GCM, signatures, etc. all rely on it
2. **Merkle–Damgård construction** (SHA-2): padding, length-extension attack;
   the Fix: HMAC or use a sponge (SHA-3).
3. **HMAC** (RFC 2104) and **KMAC** — keyed hashes that *aren't* MAC-of-prefix.
4. **HKDF** (RFC 5869) — separate `salt + master` into `info`-tagged subkeys.
5. **BLAKE3** — modern, fast, tree-structured; what TLS 1.3 *might* have used
   but didn't (it stuck with SHA-256/384).

## Why you can't just use SHA-256(M)

```
server stores H(password) for login verification
```

Wrong, because: hashes are *fast*. A 2024 GPU tries ~50 GH/s on SHA-256; common
passwords fall in seconds. Use Argon2id / scrypt / bcrypt with a memory cost.

```
server stores HMAC(key_server, password) for login verification
```

Wrong: HMAC needs a stable key per user; in practice, store Argon2id(password,
salt) — see module 06.

## The length-extension attack

Given `H(M)` for a Merkle–Damgård hash and `|M|`, an attacker can compute
`H(M ‖ padding ‖ X)` for any X without knowing M. That is, the only thing an
attacker cannot do is read M.

```python
# never make the mistake
mac = SHA256(key || message)        # broken — extensible from mac
mac = HMAC-SHA256(key, message)     # OK
mac = SHA256(message || key)        # usually OK, but avoid
```

## Sponge vs Merkle–Damgård

| Construction | Hash | Internals |
|--------------|------|-----------|
| Merkle–Damgård | SHA-256 | fixed IV, blocks, length-extension vulnerable |
| Sponge (Keccak) | SHA-3 / SHAKE | absorb+squeeze, NOT length-extensible |
| Tree | BLAKE3 | parallel-friendly |

## KMAC — modern replacement

`KMAC256(X)` = Keccak with the same byte API as SHA-256 but tagged to avoid the
amateur mistake of `H(key ‖ message)`. NIST SP 800-185.

## Run it

```bash
cd modules/04-hashes && npx tsx src/hashes.ts
```

You'll see:
- SHA-256's length-extension property (compute `H(M ‖ padding ‖ X)` from `H(M) ‖ len(M)`).
- HMAC over `key ‖ message` vs `key ‖ message ‖ key` — both work and are equal.
- HKDF-SHA-256 RFC 5869 Test Case 1 trace.
- BLAKE3 — pip-installed `blake3` or `crypto.createHash('blake3')` if Node is built with BLAKE3.

## Exercises

1. Implement Merkle–Damgård SHA-256 from scratch (use a stripped version —
   this is module 16).
2. Implement HMAC and prove it's not just `H(k ‖ m)` — it does `H((k ⊕ opad) ‖ H((k ⊕ ipad) ‖ m))`
   for inner/outer `ipad=0x36, opad=0x5c` blocks.
3. Show the **length-extension**: for any extension `X`, given `H(M) ‖ len(M)`
   an attacker can compute `H(M ‖ pad ‖ X)`. Make a script that picks a random
   M and X and verifies.
