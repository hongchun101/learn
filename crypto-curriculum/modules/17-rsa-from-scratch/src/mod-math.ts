/**
 * 模块 17 — 从零实现 RSA：模算术基本原语。
 *
 * 所有运算基于 BigInt。实现遵循 Knuth《计算机程序设计艺术》
 * 第 2 卷 §4.5（模算术）。它们 **不是** 常数时间的。
 *
 * 参考标准：NIST FIPS 186-4 是规范；PKCS#1 v2.2 描述了 RSA-OAEP 和
 * RSA-PSS 填充方案。
 */

import { generatePrimeSync } from 'node:crypto';

/** 模幂运算：g^e mod m，采用从右到左的二进制方法。 */
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

/** GCD，使用辗转相除法（欧几里得算法）。 */
export function gcd(a: bigint, b: bigint): bigint {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b !== 0n) {
    [a, b] = [b, a % b];
  }
  return a;
}

/** 扩展欧几里得算法。返回 [g, x, y]，满足 g = x·a + y·b。 */
export function extGcd(a: bigint, b: bigint): [bigint, bigint, bigint] {
  if (b === 0n) return [a < 0n ? -a : a, a < 0n ? -1n : 1n, 0n];
  const [g, x, y] = extGcd(b, a % b);
  return [g, y, x - (a / b) * y];
}

/** 模逆元：x⁻¹ 满足 x · x⁻¹ ≡ 1 (mod m)。 */
export function modInv(x: bigint, m: bigint): bigint | null {
  const [g, a] = extGcd(x, m);
  if (g !== 1n && g !== -1n) return null;
  return ((a % m) + m) % m;
}

/** 使用 Node 的 CSPRNG 生成一个 `bits` 位的素数。为了速度，使用
 *  非安全素数；RSA 中这没有问题 —— 只有在需要从因子推导离散
 *  对数性质时才必须使用安全素数。 */
export function generatePrime(bits: number): bigint {
  const r = generatePrimeSync(bits, { bigint: true });
  return r as bigint;
}
