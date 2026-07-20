/**
 * Module 05 — Signatures in Node 24.
 *
 * Demos:
 *   1. Ed25519: round-trip + forgery detection.
 *   2. ECDSA-P256 / SHA-256: signature length is 64-72 bytes (DER-encoded).
 *   3. RSA-PSS: signing with the only safe RSA signature padding.
 */

import { generateKeyPairSync, sign, verify, randomBytes, createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// Ed25519.
// ---------------------------------------------------------------------------

export function ed25519Demo(): void {
  console.log('\n=== Ed25519 ===');
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const m  = Buffer.from('sign me');
  const s1 = sign(null, m, privateKey);
  const s2 = sign(null, m, privateKey); // deterministic under RFC 8032
  console.log('  signature length   :', s1.length, '(==64)');
  console.log('  same m → same sig  :', s1.equals(s2), '(Ed25519 is deterministic)');
  console.log('  verify(original)   :', verify(null, m, publicKey, s1));
  const flipped = Buffer.from(m); flipped[0] = (flipped[0] ?? 0) ^ 0x01;
  console.log('  verify(bit-flipped):', verify(null, flipped, publicKey, s1));
}

// ---------------------------------------------------------------------------
// ECDSA-P256.
// ---------------------------------------------------------------------------

export function ecdsaDemo(): void {
  console.log('\n=== ECDSA-P256 + SHA-256 ===');
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const m = Buffer.from('the message');
  // ECDSA needs an explicit hash because raw signatures are not committed to
  // a particular hash function — the verifier needs to know what to hash.
  const sig = sign('sha256', m, privateKey);
  const ok  = verify('sha256', m, publicKey, sig);
  console.log('  DER signature length:', sig.length, '(varies 70-72 typically)');
  console.log('  verify(original)   :', ok);
  const flipped = Buffer.from(m); flipped[0] = (flipped[0] ?? 0) ^ 0x01;
  console.log('  verify(bit-flipped):', verify('sha256', flipped, publicKey, sig));

  void randomBytes; void createHash;
}

// ---------------------------------------------------------------------------
// RSA-PSS.
// ---------------------------------------------------------------------------

export function rsaPssDemo(): void {
  console.log('\n=== RSA-PSS (the only safe RSA signature padding) ===');
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const skPem = privateKey.export({ format: 'pem', type: 'pkcs8' });
  const pkPem = publicKey.export({ format: 'pem', type: 'spki' });
  // Node defaults to PSS for `sign` on Ed25519/RSA; we explicitly request PSS here.
  const sig = sign('sha256', Buffer.from('message'), {
    key: skPem,
    padding: 6, // crypto.constants.RSA_PKCS1_PSS_PADDING
    saltLength: 32,
  });
  const ok = verify('sha256', Buffer.from('message'), {
    key: pkPem,
    padding: 6,
    saltLength: 32,
  }, sig);
  console.log('  sig length:', sig.length, '(==256 for 2048-bit key)');
  console.log('  verify    :', ok);
}

// ---------------------------------------------------------------------------
// Driver.
// ---------------------------------------------------------------------------

export function execute(): void {
  ed25519Demo();
  ecdsaDemo();
  rsaPssDemo();
}

if (process.argv[1]?.endsWith('signatures.ts')) execute();
