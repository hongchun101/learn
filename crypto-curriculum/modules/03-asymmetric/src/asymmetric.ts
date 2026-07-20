/**
 * Module 03 — Asymmetric primitives in Node 24.
 *
 * Three demos:
 *   1. RSA-OAEP — the *only* RSA encryption anyone should ship.
 *   2. X25519 ECDH — modern default for key exchange.
 *   3. Ed25519 sign + verify — modern default for signatures.
 *
 * The Bleichenbauch-style signature forgery against raw PKCS#1 v1.5 is shown
 * conceptually in the README; reproducing a live attack requires a malformed
 * PKCS#1 verifier on the server side, so we keep it documented rather than
 * demonstrated here.
 */

import {
  generateKeyPairSync,
  publicEncrypt,
  privateDecrypt,
  diffieHellman,
  sign,
  verify,
  createPrivateKey,
} from 'node:crypto';

// ---------------------------------------------------------------------------
// 1. RSA-OAEP — the safe default.
// ---------------------------------------------------------------------------

export function rsaOaepDemo(): void {
  console.log('\n=== RSA-OAEP ===');
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const skPem = privateKey.export({ format: 'pem', type: 'pkcs8' });
  const pkPem = publicKey.export({ format: 'pem', type: 'spki' });

  const plaintext = Buffer.from('a top secret message');
  const c1 = publicEncrypt(pkPem, plaintext);
  const c2 = publicEncrypt(pkPem, plaintext);
  console.log('  same plaintext → different ciphertexts:', !c1.equals(c2));
  const r1 = privateDecrypt(skPem, c1);
  console.log('  decrypts back to plaintext          :', r1.toString() === plaintext.toString());

  void publicKey; void privateKey;
}

// ---------------------------------------------------------------------------
// 2. X25519 ECDH.
// ---------------------------------------------------------------------------

export function x25519Demo(): void {
  console.log('\n=== X25519 ECDH ===');
  const a = generateKeyPairSync('x25519');
  const b = generateKeyPairSync('x25519');
  const sharedA = diffieHellman({ privateKey: a.privateKey, publicKey: b.publicKey });
  const sharedB = diffieHellman({ privateKey: b.privateKey, publicKey: a.publicKey });
  console.log('  shared length      :', sharedA.length, 'bytes');
  console.log('  both parties match :', Buffer.compare(sharedA, sharedB) === 0);
  console.log('  hex of shared secret (32 chars):', sharedA.toString('hex').slice(0, 32) + '…');
}

// ---------------------------------------------------------------------------
// 3. Ed25519 signatures.
// ---------------------------------------------------------------------------

export function ed25519Demo(): void {
  console.log('\n=== Ed25519 sign/verify ===');
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const message = Buffer.from('a signed message');
  const sig = sign(null, message, privateKey);
  const ok = verify(null, message, publicKey, sig);
  console.log('  sig length:', sig.length, '(==64 for Ed25519)');
  console.log('  verify(original) :', ok);

  const flipped = Buffer.from(message);
  flipped[0] = (flipped[0] ?? 0) ^ 0x01;
  const ok2 = verify(null, flipped, publicKey, sig);
  console.log('  verify(bit-flipped) :', ok2);
}

// ---------------------------------------------------------------------------
// Driver.
// ---------------------------------------------------------------------------

export function execute(): void {
  rsaOaepDemo();
  x25519Demo();
  ed25519Demo();
}

// Silence unused-import — `createPrivateKey` is for callers that pass raw bytes.
void createPrivateKey;

if (process.argv[1]?.endsWith('asymmetric.ts')) execute();
