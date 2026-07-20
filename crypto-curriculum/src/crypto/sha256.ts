/**
 * Challenge 3 — SHA-256 (challenge 3 reference).
 *
 * We deliberately use Node's `crypto.createHash`, which on Linux is wired to
 * OpenSSL. We do NOT use a "pure-JS" SHA-256 here because side-channel and
 * performance guarantees only hold for the OpenSSL/BoringSSL/CNG path.
 */

import { createHash } from 'node:crypto';
import type { Hash } from './contracts.js';

export const Sha256: Hash = {
  outputLength: 32,

  hash(message) {
    const h = createHash('sha256');
    h.update(Buffer.from(message));
    return new Uint8Array(h.digest());
  },
};
