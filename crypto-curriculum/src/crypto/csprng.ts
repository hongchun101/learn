/**
 * Challenge 6 — CSPRNG (challenge 6 reference).
 *
 * Node's `crypto.randomBytes` is the OS CSPRNG (Linux: `getrandom()`,
 * Windows: `BCryptGenRandom` via CNG, macOS: `SecRandomCopyBytes`). All of
 * those are vetted to meet NIST SP 800-90A / SP 800-22 expectations.
 *
 * We expose it as `Csprng` so language modules can match the interface.
 */

import { randomBytes } from 'node:crypto';
import type { Csprng } from './contracts.js';

export const NodeCsprng: Csprng = {
  randomBytes(outLen) {
    if (outLen < 0) throw new Error('outLen must be non-negative');
    if (outLen > 1024 * 1024) throw new Error('outLen unreasonably large; chunk it');
    if (outLen === 0) return new Uint8Array(0);
    return new Uint8Array(randomBytes(outLen));
  },
};
