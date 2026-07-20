import { describe, it, expect } from 'vitest';
import {
  generateKeyPairSync,
  publicEncrypt,
  privateDecrypt,
  diffieHellman,
  sign,
  verify,
} from 'node:crypto';

describe('asymmetric: RSA-OAEP', () => {
  it('round-trip with OAEP (default in Node)', () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const skPem = privateKey.export({ format: 'pem', type: 'pkcs8' });
    const pkPem = publicKey.export({ format: 'pem', type: 'spki' });
    const msg = Buffer.from('secret payload 1');
    const c   = publicEncrypt(pkPem, msg);
    const r   = privateDecrypt(skPem, c);
    expect(r.toString()).toBe(msg.toString());
  });

  it('different random nonce per encryption (OAEP)', () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const pkPem = publicKey.export({ format: 'pem', type: 'spki' });
    const skPem = privateKey.export({ format: 'pem', type: 'pkcs8' });
    const msg = Buffer.from('same payload twice');
    const c1 = publicEncrypt(pkPem, msg);
    const c2 = publicEncrypt(pkPem, msg);
    expect(c1.equals(c2)).toBe(false);
    const r1 = privateDecrypt(skPem, c1);
    const r2 = privateDecrypt(skPem, c2);
    expect(r1.toString()).toBe(msg.toString());
    expect(r2.toString()).toBe(msg.toString());
  });
});

describe('asymmetric: X25519 ECDH', () => {
  it('both parties derive the same 32-byte secret', () => {
    const a = generateKeyPairSync('x25519');
    const b = generateKeyPairSync('x25519');
    const sharedA = diffieHellman({ privateKey: a.privateKey, publicKey: b.publicKey });
    const sharedB = diffieHellman({ privateKey: b.privateKey, publicKey: a.publicKey });
    expect(sharedA.length).toBe(32);
    expect(sharedA.equals(sharedB)).toBe(true);
  });

  it('different pairs give different secrets', () => {
    const a = generateKeyPairSync('x25519');
    const b = generateKeyPairSync('x25519');
    const sharedAB = diffieHellman({ privateKey: a.privateKey, publicKey: b.publicKey });

    const c = generateKeyPairSync('x25519');
    const sharedAC = diffieHellman({ privateKey: a.privateKey, publicKey: c.publicKey });

    expect(sharedAB.equals(sharedAC)).toBe(false);
  });
});

describe('asymmetric: Ed25519', () => {
  it('round-trip and forgery detection', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const m = Buffer.from('message');
    const s = sign(null, m, privateKey);
    expect(s.length).toBe(64);
    expect(verify(null, m, publicKey, s)).toBe(true);
    const m2 = Buffer.from(m);
    m2[0] = (m2[0] ?? 0) ^ 0x01;
    expect(verify(null, m2, publicKey, s)).toBe(false);
  });
});
