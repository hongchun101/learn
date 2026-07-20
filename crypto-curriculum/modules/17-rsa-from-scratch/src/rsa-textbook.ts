/**
 * Textbook RSA: NEVER use this for real protection.
 *
 * This module demonstrates the algorithm. The tests in `rsa-textbook.test.ts`
 * show exactly *why* it is broken — every property test you can think of
 * (CCA, malleability, low-exponent attack) succeeds.
 *
 * For real protection use RSA-OAEP (`rsa-oaep.ts`) or, better, Ed25519.
 */

import { gcd, generatePrime, modInv, modPow } from './mod-math.js';

export interface RsaKey {
  n: bigint;
  e: bigint;
  d?: bigint;  // private exponent; absent for the public half.
}

export function rsaGenerateKeypair(bits = 1024, e = 65537n): { sk: RsaKey; pk: RsaKey } {
  const halfBits = Math.max(64, Math.floor(bits / 2));
  // For an RSA prime-pair, we need p ≠ q AND gcd(e, p-1) = gcd(e, q-1) = 1.
  // For e = 17 (prime), this means (p-1) % 17 ≠ 0 AND (q-1) % 17 ≠ 0. About
  // 1 in 17 random 128-bit primes satisfies this; on average 1-2 attempts.
  // For e = 65537, the same arithmetic: 1 in 65537 attempts.
  let p: bigint, q: bigint;
  do { p = generatePrime(halfBits); } while ((p - 1n) % e === 0n);
  do { q = generatePrime(halfBits); } while ((q - 1n) % e === 0n || q === p);
  const n = p * q;
  const phi = (p - 1n) * (q - 1n);
  const d = modInv(e, phi);
  if (d === null) throw new Error('failed to compute d; e and phi not coprime');
  return { sk: { n, e, d }, pk: { n, e } };
}

/** Textbook encrypt: c = m^e mod n. */
export function rsaEncrypt(pk: RsaKey, m: bigint): bigint {
  return modPow(m, pk.e, pk.n);
}

/** Textbook decrypt: m = c^d mod n. */
export function rsaDecrypt(sk: RsaKey, c: bigint): bigint {
  if (sk.d === undefined) throw new Error('no private exponent');
  return modPow(c, sk.d, sk.n);
}

/** Textbook sign: σ = m^d mod n. */
export function rsaSign(sk: RsaKey, m: bigint): bigint {
  return rsaDecrypt(sk, m);
}

/** Textbook verify: m ?= σ^e mod n. */
export function rsaVerify(pk: RsaKey, m: bigint, sig: bigint): boolean {
  return rsaEncrypt(pk, sig) === m;
}
