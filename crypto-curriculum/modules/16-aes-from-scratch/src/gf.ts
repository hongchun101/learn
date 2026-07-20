/**
 * GF(2⁸) primitives for AES. The field uses AES's irreducible polynomial:
 *   x⁸ + x⁴ + x³ + x + 1 = 0x11b
 *
 * Multiplication:
 *   step 1: schoolbook polynomial multiplication (XOR shifts)
 *   step 2: reduction: if the leading bit is set, XOR with 0x11b (since the
 *   polynomial has degree 8 with this prefix = 0001 0001 1011)
 *
 * Inversion:
 *   For y != 0, y⁻¹ = y²⁵⁴ (since GF(2⁸)* is cyclic of order 255).
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
  // a != 0
  if (a === 0) throw new Error('no inverse of 0');
  let r = a;
  for (let i = 0; i < 6; i++) {
    r = gfMul(r, r);
    r = gfMul(r, a);
  }
  r = gfMul(r, r);
  return r;
}
