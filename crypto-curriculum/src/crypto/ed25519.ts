/**
 * Challenge 5 — Ed25519 signatures (challenge 5 reference).
 *
 * Uses Node's built-in `crypto.sign` / `verify` with `ed25519`. Node 24
 * delegates to OpenSSL/BoringSSL, which use the djb/Irdeto Ed25519 reference
 * constant-time implementation.
 *
 * Design decision: the cross-module contract returns raw 32-byte seeds
 * (for the private key) and 32-byte compressed points (for the public key).
 * Node ports wrap those raw bytes in the appropriate RFC 8410 DER header so
 * they round-trip through `KeyObject`.
 *
 * Verification algorithm (RFC 8032 §5.1.7, summarised):
 *   decode sig = (R, S)
 *   decode A   = pk
 *   h          = SHA-512(R || A || M) mod L
 *   2^c * S * B = 2^c * R + 2^c * h * A    (cofactored verification)
 *
 * Node does this for us; we just translate bytes.
 */

import { generateKeyPairSync, sign, verify, createPrivateKey, createPublicKey, type KeyObject } from 'node:crypto';
import type { SignaturePair } from './contracts.js';

interface EdKeypairFull {
  skSeed: Uint8Array;        // 32-byte raw seed
  pkPoint: Uint8Array;       // 32-byte compressed point
  skObject: KeyObject;
  pkObject: KeyObject;
}

/**
 * PKCS#8 DER header for an Ed25519 32-byte raw seed (RFC 8410 §7, 16 bytes).
 *   30 2e           SEQUENCE (46 bytes)
 *   02 01 00        INTEGER 0 (version)
 *   30 05 06 03 2b 65 70   OID 1.3.101.112 (id-Ed25519)
 *   04 22 04 20     OCTET STRING (34 bytes, wrapped key)
 *
 * Empirically: Node serialises a fresh Ed25519 keypair as exactly this prefix.
 */
const ED25519_PKCS8_HEADER = Buffer.from('302e020100300506032b657004220420', 'hex');

/**
 * SPKI DER header for an Ed25519 32-byte compressed public point (12 bytes).
 *   30 2a           SEQUENCE (42 bytes)
 *   30 05 06 03 2b 65 70   OID 1.3.101.112 (id-Ed25519)
 *   03 21 00        BIT STRING (33 bytes, 0 unused bits)
 */
const ED25519_SPKI_HEADER  = Buffer.from('302a300506032b6570032100', 'hex');

export function ed25519Sign(sk: KeyObject, message: Uint8Array): Uint8Array {
  return new Uint8Array(sign(null, Buffer.from(message), sk));
}

export function ed25519Verify(pk: KeyObject, message: Uint8Array, signature: Uint8Array): boolean {
  return verify(null, Buffer.from(message), pk, Buffer.from(signature));
}

/** Generate keypair in BOTH raw-bytes and KeyObject forms (tests use this). */
export function generateEd25519Keypair(): EdKeypairFull {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const skDer = privateKey.export({ format: 'der', type: 'pkcs8' });
  const pkDer = publicKey.export({ format: 'der', type: 'spki' });
  return {
    skSeed:  new Uint8Array(skDer.subarray(skDer.length - 32)),
    pkPoint: new Uint8Array(pkDer.subarray(pkDer.length - 32)),
    skObject: privateKey,
    pkObject: publicKey,
  };
}

function importRawSkAsKeyObject(skSeed: Uint8Array): KeyObject {
  return createPrivateKey({
    key: Buffer.concat([ED25519_PKCS8_HEADER, Buffer.from(skSeed)]),
    format: 'der',
    type: 'pkcs8',
  });
}

function importRawPkAsKeyObject(pkPoint: Uint8Array): KeyObject {
  return createPublicKey({
    key: Buffer.concat([ED25519_SPKI_HEADER, Buffer.from(pkPoint)]),
    format: 'der',
    type: 'spki',
  });
}

/** Cross-module `SignaturePair` contract bound to raw 32-byte Ed25519 material. */
export const Ed25519: SignaturePair = {
  generateKeypair() {
    const { skSeed, pkPoint } = generateEd25519Keypair();
    return { sk: skSeed, pk: pkPoint };
  },

  sign(skSeed, message) {
    return ed25519Sign(importRawSkAsKeyObject(skSeed), message);
  },

  verify(pkPoint, message, signature) {
    try {
      return ed25519Verify(importRawPkAsKeyObject(pkPoint), message, signature);
    } catch {
      return false;
    }
  },
};
