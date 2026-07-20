/**
 * Cross-chapter contract surface (TypeScript reference implementation).
 *
 * Every language module in this curriculum implements the same six challenges
 * against this surface. The tests in `crypto-curriculum/tests/crypto.test.ts`
 * verify the TypeScript reference; each module's own test file verifies the
 * same properties in that language.
 *
 * Why six? They map directly onto the six cross-chapter challenges in
 * `docs/00-taxonomy.md` §6 — the property set that distinguishes
 * "I implemented AES" from "I implemented AES correctly".
 *
 * Synchronous design: every reference implementation is synchronous. A
 * language module that natively uses async/await (Rust Tokio, JS Workers,
 * Go goroutines) wraps it the same way — sync APIs feed async callers.
 *
 * All inputs/outputs are `Uint8Array`; never strings, never `Buffer`-only.
 * Module authors in Python/Go/Rust must convert at the boundary.
 */

/** Challenge 1 — encrypt/decrypt round-trip with an authenticated cipher. */
export interface AuthenticatedCipher {
  /** 32-byte key (AES-256). */
  encrypt(key: Uint8Array, plaintext: Uint8Array, aad?: Uint8Array): {
    ciphertext: Uint8Array;
    nonce: Uint8Array;
    tag: Uint8Array;
  };
  /** Inverse of `encrypt`. Throws on tag-mismatch. */
  decrypt(
    key: Uint8Array,
    ciphertext: Uint8Array,
    nonce: Uint8Array,
    tag: Uint8Array,
    aad?: Uint8Array,
  ): Uint8Array;
}

/** Challenge 2 — MAC round-trip. */
export interface Mac {
  /** Returns `tagLength`-byte tag. */
  sign(key: Uint8Array, message: Uint8Array): Uint8Array;
  /** Constant-time comparison. */
  verify(key: Uint8Array, message: Uint8Array, tag: Uint8Array): boolean;
  tagLength: number;
}

/** Challenge 3 — Hash function with practical-collision test. */
export interface Hash {
  /** Output length in bytes. */
  outputLength: number;
  hash(message: Uint8Array): Uint8Array;
}

/** Challenge 4 — Key derivation function with domain separation. */
export interface Kdf {
  /** Derive `outLen`-byte subkey from `master` and optional `salt` / `info`. */
  derive(
    master: Uint8Array,
    outLen: number,
    opts?: { salt?: Uint8Array; info?: Uint8Array },
  ): Uint8Array;
}

/** Challenge 5 — Asymmetric signature pair. */
export interface SignaturePair {
  /** Generate fresh keypair; this is for property tests, not production. */
  generateKeypair(): { sk: Uint8Array; pk: Uint8Array };
  sign(sk: Uint8Array, message: Uint8Array): Uint8Array;
  verify(pk: Uint8Array, message: Uint8Array, signature: Uint8Array): boolean;
}

/** Challenge 6 — CSPRNG. */
export interface Csprng {
  /** Generate `outLen` cryptographically-secure random bytes. */
  randomBytes(outLen: number): Uint8Array;
}

/** Utility: byte equality (constant-time, so implementations do not leak). */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

/** Utility: hex-encode (used in test output and `print-curriculum.ts`). */
export function toHex(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i] ?? 0;
    s += b.toString(16).padStart(2, '0');
  }
  return s;
}
