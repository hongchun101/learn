import { describe, it, expect } from 'vitest';
import {
  rsaGenerateKeypair,
  rsaEncrypt,
  rsaDecrypt,
  rsaSign,
  rsaVerify,
} from '../src/rsa-textbook.js';
import { gcd, modInv, modPow } from '../src/mod-math.js';

// 256-bit keys with a small public exponent so the property tests complete
// quickly. The RSA algorithms are identical regardless of e.
const KEY_BITS = 256;
const E = 17n;

describe('module 17: modular arithmetic', () => {
  it('gcd is correct on small inputs', () => {
    expect(gcd(54n, 24n)).toBe(6n);
    expect(gcd(17n, 31n)).toBe(1n);
    expect(gcd(1024n, 96n)).toBe(32n);
  });

  it('modInv recovers the inverse', () => {
    expect(modInv(3n, 32n)).toBe(11n);
    expect(modInv(7n, 26n)).toBe(15n);
  });

  it('modPow handles large exponents', () => {
    expect(modPow(2n, 10n, 1000n)).toBe(24n);
    expect(modPow(7n, 0n, 100n)).toBe(1n);
  });
});

describe('module 17: textbook RSA', () => {
  it('round-trips a small message', () => {
    const { sk, pk } = rsaGenerateKeypair(KEY_BITS, E);
    const m = 12345n;
    const c = rsaEncrypt(pk, m);
    expect(c).not.toBe(m);
    expect(rsaDecrypt(sk, c)).toBe(m);
  });

  it('sign and verify a small message', () => {
    const { sk, pk } = rsaGenerateKeypair(KEY_BITS, E);
    const m = 42n;
    const s = rsaSign(sk, m);
    expect(rsaVerify(pk, m, s)).toBe(true);
    expect(rsaVerify(pk, 43n, s)).toBe(false);
  });

  it('textbook RSA is multiplicatively homomorphic (Bleichenbauch property)', () => {
    const { pk } = rsaGenerateKeypair(KEY_BITS, E);
    const m1 = 3n, m2 = 5n;
    const c1 = rsaEncrypt(pk, m1);
    const c2 = rsaEncrypt(pk, m2);
    const homomorphic = (c1 * c2) % pk.n;
    expect(rsaEncrypt(pk, m1 * m2)).toBe(homomorphic);
  });

  it('CCA attack: with a decryption oracle, any ciphertext is decryptable', () => {
    const { sk, pk } = rsaGenerateKeypair(KEY_BITS, E);
    const m = 7n, r = 3n;
    const c = rsaEncrypt(pk, m);
    const cBlinded = (c * rsaEncrypt(pk, r)) % pk.n;
    const mBlinded = rsaDecrypt(sk, cBlinded);
    const rInv = modInv(r, pk.n)!;
    const recovered = (mBlinded * rInv) % pk.n;
    expect(recovered).toBe(m);
  });
});
