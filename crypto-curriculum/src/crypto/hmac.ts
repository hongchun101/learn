/**
 * Challenge 2 — HMAC-SHA-256 (challenge 2 reference).
 *
 * `crypto.createHmac('sha256', key)` implements RFC 2104 HMAC. The tag length
 * is fixed at 32 bytes for SHA-256. We expose both `sign` and `verify`, with
 * `verify` using `crypto.timingSafeEqual` for constant-time comparison.
 *
 * Why constant-time: a non-constant-time `==` on the tag leaks the position
 * of the first differing byte via timing. A remote attacker has in practice
 * recovered HMAC tags byte-by-byte from network-facing endpoints this way.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Mac } from './contracts.js';

export const HmacSha256: Mac = {
  tagLength: 32,

  sign(key, message) {
    const mac = createHmac('sha256', Buffer.from(key));
    mac.update(Buffer.from(message));
    return new Uint8Array(mac.digest());
  },

  verify(key, message, tag) {
    const expected = this.sign(key, message);
    if (expected.length !== tag.length) return false;
    return timingSafeEqual(Buffer.from(expected), Buffer.from(tag));
  },
};
