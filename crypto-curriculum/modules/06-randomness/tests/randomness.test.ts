import { describe, it, expect } from 'vitest';
import { randomBytes, scryptSync, hkdfSync } from 'node:crypto';

describe('randomness: CSPRNG', () => {
  it('produces a 1 MiB stream with no more than 0.5% zero bytes', () => {
    const buf = randomBytes(1024 * 1024);
    let zeros = 0;
    for (const b of buf) if (b === 0) zeros++;
    expect(zeros).toBeLessThan(1024 * 1024 * 0.005);
  });

  it('two 16-byte outputs are distinct over 50k draws', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50_000; i++) {
      seen.add(randomBytes(16).toString('hex'));
    }
    expect(seen.size).toBe(50_000);
  });
});

describe('randomness: scrypt', () => {
  it('deterministic for (pw, salt, params)', () => {
    const pw = Buffer.from('pw');
    const salt = Buffer.from('salt');
    const params = { N: 1 << 12, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
    const a = scryptSync(pw, salt, 16, params);
    const b = scryptSync(pw, salt, 16, params);
    expect(a.equals(b)).toBe(true);
  });

  it('different salt yields different key', () => {
    const pw = Buffer.from('pw');
    const params = { N: 1 << 12, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
    const a = scryptSync(pw, Buffer.from('s1'), 16, params);
    const b = scryptSync(pw, Buffer.from('s2'), 16, params);
    expect(a.equals(b)).toBe(false);
  });
});

describe('randomness: HKDF (chain — domain-separation yields distinct keys)', () => {
  it('three different info strings yield three distinct subkeys', () => {
    const master = randomBytes(32);
    const a = Buffer.from(hkdfSync('sha256', master, new Uint8Array(0), Buffer.from('a'), 32));
    const b = Buffer.from(hkdfSync('sha256', master, new Uint8Array(0), Buffer.from('b'), 32));
    const c = Buffer.from(hkdfSync('sha256', master, new Uint8Array(0), Buffer.from('c'), 32));
    expect(a.equals(b)).toBe(false);
    expect(a.equals(c)).toBe(false);
    expect(b.equals(c)).toBe(false);
  });
});
