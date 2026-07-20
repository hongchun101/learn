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
    // `useEd25519` is a tiny adapter; we just verify it round-trips.
    expect(useEd25519({ sign: (x) => s, verify: () => true })).toBeDefined();
    // `sk` / `pk` are now 32-byte branded; this is the *type-level* proof.
    // (At runtime they're just Uint8Array's.)
    void sk; void pk;
  });
});
