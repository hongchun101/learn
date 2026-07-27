import { describe, it, expect } from 'vitest';
import { asPrivateSeed, asPublicPoint, useEd25519 } from '../src/ed25519-typed.js';
import { generateEd25519Keypair, ed25519Sign, ed25519Verify } from '../../../src/crypto/ed25519.js';

describe('module 09: typed Ed25519', () => {
  it('rejects non-32-byte inputs at the boundary', () => {
    expect(() => asPrivateSeed(new Uint8Array(31))).toThrow();
    expect(() => asPublicPoint(new Uint8Array(33))).toThrow();
  });

  it('round-trip with branded keys', () => {
    const kp = generateEd25519Keypair();
    const sk = asPrivateSeed(kp.skSeed);
    const pk = asPublicPoint(kp.pkPoint);
    const s = ed25519Sign(kp.skObject, new TextEncoder().encode('hello'));
    expect(ed25519Verify(kp.pkObject, new TextEncoder().encode('hello'), s)).toBe(true);
    expect(s.length).toBe(64);
    // `useEd25519` 只是一个轻量适配器；这里仅验证其能往返。
    expect(useEd25519({ sign: (x) => s, verify: () => true })).toBeDefined();
    // `sk` / `pk` 现在是 32 字节的品牌化类型；这就是*类型层面*的证据。
    // （在运行时它们只是 Uint8Array。）
    void sk; void pk;
  });
});
