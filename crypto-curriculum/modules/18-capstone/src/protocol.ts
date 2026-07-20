/**
 * Module 18 — Capstone: A simple authenticated key-exchange protocol.
 *
 * The "naive" version is MITM-able because nothing authenticates the
 * ephemeral DH keys. The "signed" version hardens them via Ed25519.
 *
 * Primitives used (each one built in earlier modules):
 *   - X25519 ECDH: ephemeral keypair per session
 *   - HKDF-SHA-256: derive AES key from DH shared secret
 *   - AES-256-GCM: encrypt the payload
 *   - Ed25519 signatures: authentication of long-term identity
 */

import {
  diffieHellman,
  generateKeyPairSync,
  sign as edSign,
  verify as edVerify,
  createCipheriv,
  createDecipheriv,
  createPublicKey,
  randomBytes,
  type KeyObject,
} from 'node:crypto';
import { HkdfSha256 } from '../../../src/crypto/index.js';

export interface Keypair {
  sk: KeyObject;
  pk: Uint8Array;       // 32-byte raw X25519 public
}

export interface LongTerm {
  signSk: KeyObject;
  signPk: Uint8Array;  // 32-byte raw Ed25519 public
}

const PROTOCOL_LABEL = Buffer.from('mod18/capstone/v1');

/** SPKI header for raw 32-byte X25519 public keys (12 bytes).
 *  Sequence (44 bytes) { sequence (5 bytes) { OID 1.3.101.110 }, BIT STRING (33 bytes) }. */
const X25519_SPKI_HDR = Buffer.from('302a300506032b656e032100', 'hex');
/** SPKI header for raw 32-byte Ed25519 public keys (12 bytes).
 *  Sequence (44 bytes) { sequence (5 bytes) { OID 1.3.101.112 }, BIT STRING (33 bytes) }. */
const ED25519_SPKI_HDR = Buffer.from('302a300506032b6570032100', 'hex');

export function ephemeralX25519(): Keypair {
  const kp = generateKeyPairSync('x25519');
  const pkRaw = kp.publicKey.export({ format: 'der', type: 'spki' }).subarray(-32);
  return { sk: kp.privateKey, pk: new Uint8Array(pkRaw) };
}

export function longTermEd25519(): LongTerm {
  const kp = generateKeyPairSync('ed25519');
  const pkRaw = kp.publicKey.export({ format: 'der', type: 'spki' }).subarray(-32);
  return { signSk: kp.privateKey, signPk: new Uint8Array(pkRaw) };
}

function importX25519Public(raw: Uint8Array): KeyObject {
  return createPublicKey({
    key: Buffer.concat([X25519_SPKI_HDR, Buffer.from(raw)]),
    format: 'der',
    type: 'spki',
  });
}

function importEd25519Public(raw: Uint8Array): KeyObject {
  return createPublicKey({
    key: Buffer.concat([ED25519_SPKI_HDR, Buffer.from(raw)]),
    format: 'der',
    type: 'spki',
  });
}

/** Diffie-Hellman shared secret. */
export function dhShared(mySk: KeyObject, theirPk: Uint8Array): Uint8Array {
  const pkKo = importX25519Public(theirPk);
  return new Uint8Array(diffieHellman({ privateKey: mySk, publicKey: pkKo }));
}

export function deriveSessionKey(dh: Uint8Array): Uint8Array {
  return HkdfSha256.derive(dh, 32, undefined, PROTOCOL_LABEL);
}

export function aesGcmEncrypt(key: Uint8Array, plaintext: Uint8Array): {
  ciphertext: Uint8Array;
  nonce: Uint8Array;
  tag: Uint8Array;
} {
  const nonce = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, nonce);
  const ct = Buffer.concat([c.update(plaintext), c.final()]);
  const tag = c.getAuthTag();
  return {
    ciphertext: new Uint8Array(ct),
    nonce: new Uint8Array(nonce),
    tag: new Uint8Array(tag),
  };
}

export function aesGcmDecrypt(
  key: Uint8Array,
  env: { ciphertext: Uint8Array; nonce: Uint8Array; tag: Uint8Array },
): Uint8Array {
  const d = createDecipheriv('aes-256-gcm', key, env.nonce);
  d.setAuthTag(env.tag);
  return new Uint8Array(Buffer.concat([d.update(env.ciphertext), d.final()]));
}

export function signEphemeral(sk: KeyObject, ePk: Uint8Array): Uint8Array {
  return new Uint8Array(edSign(null, Buffer.from(ePk), sk));
}

export function verifyEphemeral(
  pk: Uint8Array,
  ePk: Uint8Array,
  sig: Uint8Array,
): boolean {
  try {
    const verifyKo = importEd25519Public(pk);
    return edVerify(null, Buffer.from(ePk), verifyKo, Buffer.from(sig));
  } catch {
    return false;
  }
}
