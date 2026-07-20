/**
 * Challenge 1 — AES-GCM authenticated cipher (challenge 1 reference).
 *
 * Uses Node's built-in `crypto.createCipheriv('aes-256-gcm', …)`. The tag is
 * returned in the `auth_tag` slot alongside the ciphertext. The nonce is
 * 96-bit (12 bytes) per RFC 5116.
 *
 * Failure model: if the tag does not match, GCM returns null on `final()`.
 * We translate that into a thrown error so callers can catch the auth failure
 * without checking a Boolean.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { AuthenticatedCipher } from './contracts.js';

export const AesGcm: AuthenticatedCipher = {
  encrypt(key, plaintext, aad) {
    if (key.length !== 32) throw new Error('AES-256-GCM needs 32-byte key');
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, nonce);
    if (aad && aad.length > 0) cipher.setAAD(aad);
    const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    return { ciphertext: new Uint8Array(ct), nonce, tag };
  },

  decrypt(key, ciphertext, nonce, tag, aad) {
    if (key.length !== 32) throw new Error('AES-256-GCM needs 32-byte key');
    const decipher = createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAuthTag(tag);
    if (aad && aad.length > 0) decipher.setAAD(aad);
    // final() returns null on auth-tag mismatch — we throw.
    const pt = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return new Uint8Array(pt);
  },
};
