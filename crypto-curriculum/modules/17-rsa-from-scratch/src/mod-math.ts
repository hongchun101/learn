/**
 * Module 17 — RSA from scratch: modular arithmetic primitives.
 *
 * All math in BigInt. The implementations follow Knuth, Art of Computer
 * Programming vol 2 §4.5 (Modular Arithmetic). They are NOT constant-time.
 *
 * Reference: NIST FIPS 186-4 for the spec; PKCS#1 v2.2 for RSA-OAEP and
 * RSA-PSS padding.
 */

import { generatePrimeSync } from 'node:crypto';

/** Modular exponentiation: g^e mod m, right-to-left binary method. */
export function modPow(g: bigint, e: bigint, m: bigint): bigint {
  if (m === 1n) return 0n;
  let base = ((g % m) + m) % m;
  let result = 1n;
  let exp = e;
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % m;
    base = (base * base) % m;
    exp >>= 1n;
  }
  return result;
}

/** GCD by Euclidean algorithm. */
export function gcd(a: bigint, b: bigint): bigint {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b !== 0n) {
    [a, b] = [b, a % b];
  }
  return a;
}

/** Extended Euclidean algorithm. Returns [g, x, y] with g = x·a + y·b. */
export function extGcd(a: bigint, b: bigint): [bigint, bigint, bigint] {
  if (b === 0n) return [a < 0n ? -a : a, a < 0n ? -1n : 1n, 0n];
  const [g, x, y] = extGcd(b, a % b);
  return [g, y, x - (a / b) * y];
}

/** Modular inverse: x⁻¹ such that x · x⁻¹ ≡ 1 (mod m). */
export function modInv(x: bigint, m: bigint): bigint | null {
  const [g, a] = extGcd(x, m);
  if (g !== 1n && g !== -1n) return null;
  return ((a % m) + m) % m;
}

/** Generate an `bits`-bit prime via Node's CSPRNG. Uses non-safeprime for
 *  speed; for RSA this is fine — safeprime is only needed if you derive
 *  discrete-log properties from the factor. */
export function generatePrime(bits: number): bigint {
  const r = generatePrimeSync(bits, { bigint: true });
  return r as bigint;
}
