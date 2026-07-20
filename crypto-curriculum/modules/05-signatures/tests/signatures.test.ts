import { describe, it, expect } from 'vitest';
import { generateKeyPairSync, sign, verify } from 'node:crypto';

function flip(b: Buffer, idx: number, mask: number): Buffer {
  const out = Buffer.from(b);
  out[idx] = (out[idx] ?? 0) ^ mask;
  return out;
}

describe('signatures: Ed25519', () => {
  it('64-byte deterministic signature', () => {
    const { privateKey } = generateKeyPairSync('ed25519');
    const m = Buffer.from('m');
    const s1 = sign(null, m, privateKey);
    const s2 = sign(null, m, privateKey);
    expect(s1.length).toBe(64);
    expect(s1.equals(s2)).toBe(true);
  });

  it('verifies and rejects forgery', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const m = Buffer.from('m');
    const s = sign(null, m, privateKey);
    expect(verify(null, m, publicKey, s)).toBe(true);
    expect(verify(null, flip(m, 0, 0x01), publicKey, s)).toBe(false);
    expect(verify(null, m, publicKey, flip(s, 0, 0x01))).toBe(false);
  });
});

describe('signatures: ECDSA-P256', () => {
  it('round-trip via SHA-256', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const m = Buffer.from('m');
    const s = sign('sha256', m, privateKey);
    expect(verify('sha256', m, publicKey, s)).toBe(true);
    expect(verify('sha256', flip(m, 0, 0x01), publicKey, s)).toBe(false);
  });
});

describe('signatures: RSA-PSS', () => {
  it('round-trip with PSS padding', () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const skPem = privateKey.export({ format: 'pem', type: 'pkcs8' });
    const pkPem = publicKey.export({ format: 'pem', type: 'spki' });
    const m = Buffer.from('m');
    const sig = sign('sha256', m, {
      key: skPem, padding: 6, saltLength: 32,
    });
    expect(sig.length).toBe(256);
    expect(verify('sha256', m, {
      key: pkPem, padding: 6, saltLength: 32,
    }, sig)).toBe(true);
    expect(verify('sha256', flip(m, 0, 0x01), {
      key: pkPem, padding: 6, saltLength: 32,
    }, sig)).toBe(false);
  });
});
