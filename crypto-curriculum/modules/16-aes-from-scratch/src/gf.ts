/**
 * AES 的 GF(2⁸) 基本运算。该域使用 AES 的不可约多项式：
 *   x⁸ + x⁴ + x³ + x + 1 = 0x11b
 *
 * 乘法：
 *   步骤 1：竖式多项式乘法（异或移位）
 *   步骤 2：归约：若最高位为 1，则与 0x11b 异或（因为该多项式
 *   次数为 8，前缀为 0001 0001 1011）
 *
 * 求逆：
 *   对于 y != 0，y⁻¹ = y²⁵⁴（因为 GF(2⁸)* 是 255 阶循环群）。
 */

export const GF_POLY = 0x11b;

export function gfMul(a: number, b: number): number {
  let acc = 0;
  let x = a;
  let y = b;
  for (let i = 0; i < 8; i++) {
    if (y & 1) acc ^= x;
    const carry = x & 0x80;
    x = (x << 1) & 0xff;
    if (carry) x ^= 0x1b;
    y >>= 1;
  }
  return acc;
}

export function gfInv(a: number): number {
  // 要求 a != 0
  let r = a;
  for (let i = 0; i < 6; i++) {
    r = gfMul(r, r);
    r = gfMul(r, a);
  }
  r = gfMul(r, r);
  return r;
}
