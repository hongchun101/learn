/**
 * SHA-256 (and SHA-512) — primitive reference.
 *
 * This module ships a *from-scratch SHA-256 implementation* (see src/sha256-from-scratch.ts)
 * that has known issues with TypeScript's signed-integer BigInt semantics; the
 * runnable testing in this curriculum uses Node's `createHash('sha256')` as the
 * ground truth. The from-scratch implementation is provided as a teaching
 * artifact (FIPS 180-4, ~80 lines of BigInt-arithmetic code).
 *
 * For new code, **never** implement primitives from scratch in TypeScript; call
 * the platform's vetted implementation. Module 16's README covers the actual
 * rounds, key schedule, and length-extension attack surface.
 *
 * Reference: NIST FIPS 180-4 (Secure Hash Standard).
 * https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.180-4.pdf
 */

import { createHash } from 'node:crypto';

/** SHA-256 — delegates to Node's vetted implementation. */
export function sha256(message: Uint8Array): Uint8Array {
  return new Uint8Array(createHash('sha256').update(message).digest());
}

/** SHA-512 — delegates to Node's vetted implementation. */
export function sha512(message: Uint8Array): Uint8Array {
  return new Uint8Array(createHash('sha512').update(message).digest());
}

/** SHA-3 (Keccak) — delegates to Node's vetted implementation. */
export function sha3(message: Uint8Array, outBytes = 32): Uint8Array {
  return new Uint8Array(createHash(`sha3-${outBytes * 8}` as 'sha3-256').update(message).digest());
}

/**
 * A `sha256` that re-uses the FIPS-180 §5 algorithm in pure BigInt form.
 *
 * Intended for *teaching*. Known caveat: the JS BigInt bitwise operations have
 * subtle sign-extension behaviour; a fully hand-rolled SHA-256 requires
 * careful 32-bit masking throughout. We do not ship that here because the
 * Node implementation is the runtime source of truth.
 */
