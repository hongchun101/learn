import { describe, it, expect } from 'vitest';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

function buf(b: Uint8Array): Buffer { return Buffer.from(b); }
function xorBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(Math.min(a.length, b.length));
  for (let i = 0; i < out.length; i++) out[i] = (a[i] ?? 0) ^ (b[i] ?? 0);
  return out;
}

describe('modes: ECB', () => {
  it('reveals identical-block structure', () => {
    const key = randomBytes(32);
    const pt  = new Uint8Array(32); // 2 zero blocks
    const cipher = createCipheriv('aes-256-ecb', key, null);
    const c = Buffer.concat([cipher.update(buf(pt)), cipher.final()]);
    expect(c.slice(0, 16).equals(c.slice(16, 32))).toBe(true);
  });
});

describe('modes: CTR', () => {
  it('fresh nonce → round-trips', () => {
    const key = randomBytes(32);
    const nonce = randomBytes(16);
    const pt = new TextEncoder().encode('hello world 1234');
    const enc = createCipheriv('aes-256-ctr', key, nonce);
    const c = Buffer.concat([enc.update(buf(pt)), enc.final()]);
    const dec = createDecipheriv('aes-256-ctr', key, nonce);
    const r = Buffer.concat([dec.update(c), dec.final()]);
    expect(new Uint8Array(r)).toEqual(pt);
  });

  it('nonce reuse leaks XOR of plaintexts', () => {
    const key = randomBytes(32);
    const nonce = randomBytes(16);
    const m1 = new TextEncoder().encode('attack at dawn          ');
    const m2 = new TextEncoder().encode('attack at dusk          ');
    const e1 = createCipheriv('aes-256-ctr', key, nonce);
    const C1 = Buffer.concat([e1.update(buf(m1)), e1.final()]);
    const e2 = createCipheriv('aes-256-ctr', key, nonce);
    const C2 = Buffer.concat([e2.update(buf(m2)), e2.final()]);
    expect(xorBytes(C1, C2)).toEqual(xorBytes(m1, m2));
  });
});

describe('modes: GCM', () => {
  it('bit flip is detected', () => {
    const key = randomBytes(32);
    const pt  = new TextEncoder().encode('a very secret string');
    const iv  = randomBytes(12);
    const enc = createCipheriv('aes-256-gcm', key, iv);
    const ct  = Buffer.concat([enc.update(buf(pt)), enc.final()]);
    const tag = enc.getAuthTag();
    const flipped = buf(ct);
    flipped[0] = (flipped[0] ?? 0) ^ 0x01;
    expect(() => {
      const dec = createDecipheriv('aes-256-gcm', key, iv);
      dec.setAuthTag(tag);
      dec.update(flipped);
      dec.final();
    }).toThrow();
  });

  it('AAD mismatch is detected', () => {
    const key = randomBytes(32);
    const pt  = new TextEncoder().encode('payload');
    const iv  = randomBytes(12);
    const enc = createCipheriv('aes-256-gcm', key, iv);
    enc.setAAD(Buffer.from('header=v1'));
    const ct  = Buffer.concat([enc.update(buf(pt)), enc.final()]);
    const tag = enc.getAuthTag();
    expect(() => {
      const dec = createDecipheriv('aes-256-gcm', key, iv);
      dec.setAuthTag(tag);
      dec.setAAD(Buffer.from('header=v2')); // wrong AAD
      dec.update(ct);
      dec.final();
    }).toThrow();
  });
});
