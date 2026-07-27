/**
 * 教科书式 RSA：切勿将其用于真实的保护场景。
 *
 * 本模块演示该算法。`rsa-textbook.test.ts` 中的测试清晰地
 * 展示了它 *为什么* 是不安全的 —— 你能想到的所有属性测试
 * （CCA、可延展性、低指数攻击）全部成立。
 *
 * 在真实场景下使用 RSA-OAEP（`rsa-oaep.ts`），或更推荐使用 Ed25519。
 */

import { gcd, generatePrime, modInv, modPow } from './mod-math.js';

export interface RsaKey {
  n: bigint;
  e: bigint;
  d?: bigint;  // 私钥指数；公钥部分不含此项。
}

export function rsaGenerateKeypair(bits = 1024, e = 65537n): { sk: RsaKey; pk: RsaKey } {
  const halfBits = Math.max(64, Math.floor(bits / 2));
  // 对于 RSA 素数对，要求 p ≠ q 且 gcd(e, p-1) = gcd(e, q-1) = 1。
  // 对于 e = 17（素数），这意味着 (p-1) % 17 ≠ 0 且 (q-1) % 17 ≠ 0。
  // 大约每 17 个随机 128 位素数中就有 1 个满足条件；平均 1-2 次尝试即可。
  // 对于 e = 65537，类似的算术过程：每 65537 次尝试中平均成功 1 次。
  let p: bigint, q: bigint;
  do { p = generatePrime(halfBits); } while ((p - 1n) % e === 0n);
  do { q = generatePrime(halfBits); } while ((q - 1n) % e === 0n || q === p);
  const n = p * q;
  const phi = (p - 1n) * (q - 1n);
  const d = modInv(e, phi);
  if (d === null) throw new Error('failed to compute d; e and phi not coprime');
  return { sk: { n, e, d }, pk: { n, e } };
}

/** 教科书式加密：c = m^e mod n。 */
export function rsaEncrypt(pk: RsaKey, m: bigint): bigint {
  return modPow(m, pk.e, pk.n);
}

/** 教科书式解密：m = c^d mod n。 */
export function rsaDecrypt(sk: RsaKey, c: bigint): bigint {
  if (sk.d === undefined) throw new Error('no private exponent');
  return modPow(c, sk.d, sk.n);
}

/** 教科书式签名：σ = m^d mod n。 */
export function rsaSign(sk: RsaKey, m: bigint): bigint {
  return rsaDecrypt(sk, m);
}

/** 教科书式验签：检查 m ?= σ^e mod n。 */
export function rsaVerify(pk: RsaKey, m: bigint, sig: bigint): boolean {
  return rsaEncrypt(pk, sig) === m;
}
