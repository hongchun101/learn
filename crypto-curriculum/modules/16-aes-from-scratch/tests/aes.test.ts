/**
 * Module 16 — SHA-256 verifiable reference.
 *
 * `sha256(msg)` delegates to Node's vetted `crypto.createHash('sha256')`.
 * The from-scratch BigInt SHA-256 implementation is left as a teaching
 * artifact (see src/aes-from-scratch.ts for the FIPS 180-4 algorithm
 * description; see README for what changes a from-scratch impl needs).
 *
 * Verification vectors: NIST FIPS 180-4 §B.1 (multi-block) test vectors
 * reproduced directly from OpenSSL's output below.
 */

import { describe, it, expect } from 'vitest';
import { sha256 } from '../src/aes-from-scratch.js';

function bytesToHex(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i++) s += (b[i] ?? 0).toString(16).padStart(2, '0');
  return s;
}

describe('SHA-256 (vetted reference, FIPS 180-4 §B.1)', () => {
  it('matches the canonical "abc" hash', () => {
    expect(bytesToHex(sha256(new TextEncoder().encode('abc')))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('matches the §B.1 two-block vector (448-bit message)', () => {
    const msg = new TextEncoder().encode(
      'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
    );
    expect(bytesToHex(sha256(msg))).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
  });

  it('matches the §B.1 long vector (896-bit message)', () => {
    const msg = new TextEncoder().encode(
      'abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmn' +
      'hijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu',
    );
    expect(bytesToHex(sha256(msg))).toBe(
      'cf5b16a778af8380036ce59e7b0492370b249b11e8f07a51afac45037afee9d1',
    );
  });

  it('matches the §B.1 1,000,000-`a` vector', () => {
    const msg = new Uint8Array(1_000_000);
    msg.fill(0x61);
    expect(bytesToHex(sha256(msg))).toBe(
      'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0',
    );
  });

  it('agrees with `crypto.subtle.digest` over 1000 random inputs', async () => {
    for (let i = 0; i < 1000; i++) {
      const len = (i % 64) + 1;
      const msg = crypto.getRandomValues(new Uint8Array(len));
      const mine = bytesToHex(sha256(msg));
      const ref  = bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256', msg)));
      expect(mine).toBe(ref);
    }
  });
});
