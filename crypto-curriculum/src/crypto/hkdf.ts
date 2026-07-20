/**
 * Challenge 4 — HKDF-SHA-256 (challenge 4 reference).
 *
 * HKDF = Extract + Expand (RFC 5869):
 *   PRK  = HMAC(salt, IKM)
 *   OKM  = HMAC(PRK, info || 0x01) || HMAC(PRK, info || 0x02) || …
 *
 * Domain separation comes from `info`; that is the standard way to derive
 * multiple independent subkeys from the same master (e.g. AES key + MAC key
 * from a shared secret in TLS 1.3).
 *
 * `salt` can be empty; if absent, the empty string is used (RFC 5869 allows
 * either; Node's `crypto.hkdfSync` differs slightly, so we re-implement).
 */

import { createHmac } from 'node:crypto';
import type { Kdf } from './contracts.js';

const HASH_LEN = 32; // SHA-256 in bytes

export const HkdfSha256: Kdf = {
  derive(master, outLen, opts = {}) {
    const salt = opts.salt ?? new Uint8Array(0);
    const info = opts.info ?? new Uint8Array(0);
    if (outLen <= 0) throw new Error('outLen must be positive');
    if (outLen > 255 * HASH_LEN) throw new Error('outLen too large for HKDF-SHA-256');

    // Extract: PRK = HMAC(salt, IKM)
    const prk = createHmac('sha256', Buffer.from(salt))
      .update(Buffer.from(master))
      .digest();

    // Expand: chain HMAC outputs to fill outLen bytes.
    const out = Buffer.alloc(outLen);
    let prev: Buffer = Buffer.alloc(0);
    let pos = 0;
    for (let counter = 1; pos < outLen; counter++) {
      if (counter > 255) throw new Error('HKDF-SHA-256 overflow');
      const h = createHmac('sha256', prk);
      h.update(prev);
      h.update(Buffer.from(info));
      h.update(Buffer.from([counter]));
      prev = h.digest();
      const toCopy = Math.min(prev.length, outLen - pos);
      prev.copy(out, pos, 0, toCopy);
      pos += toCopy;
    }
    return new Uint8Array(out);
  },
};
