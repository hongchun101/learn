import { describe, it, expect } from 'vitest';
import { createHash, createHmac, randomBytes } from 'node:crypto';

function sha256(d: Buffer): Buffer { return createHash('sha256').update(d).digest(); }

describe('hash: SHA-256', () => {
  it('canonical empty-input hash', () => {
    expect(sha256(Buffer.alloc(0)).toString('hex'))
      .toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
  it('canonical "abc" hash', () => {
    expect(sha256(Buffer.from('abc')).toString('hex'))
      .toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
  it('collision-resistance spot check (1k inputs)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      seen.add(sha256(randomBytes(32)).toString('hex'));
    }
    expect(seen.size).toBe(1000);
  });
});

describe('hash: HMAC-SHA-256', () => {
  it('deterministic for same (k, m)', () => {
    const k = Buffer.from('k'), m = Buffer.from('m');
    expect(createHmac('sha256', k).update(m).digest().equals(createHmac('sha256', k).update(m).digest())).toBe(true);
  });
  it('key sensitivity', () => {
    const m = Buffer.from('m');
    const a = createHmac('sha256', Buffer.from('k1')).update(m).digest();
    const b = createHmac('sha256', Buffer.from('k2')).update(m).digest();
    expect(a.equals(b)).toBe(false);
  });
});
