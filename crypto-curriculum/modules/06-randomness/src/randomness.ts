/**
 * Module 06 — Randomness, KDFs, and key management.
 *
 * Demos:
 *   1. Node CSPRNG sanity (no zero bytes; long stretches of zeros are vanishingly rare).
 *   2. `crypto.scrypt` (closest stdlib KDF to Argon2id on memory cost).
 *   3. HKDF chained — derive multiple subkeys from one master with domain separation.
 */

import { randomBytes, scryptSync, hkdfSync } from 'node:crypto';

// ---------------------------------------------------------------------------
// 1. CSPRNG sanity.
// ---------------------------------------------------------------------------

export function csprngSanity(): void {
  console.log('\n=== CSPRNG sanity ===');
  const N = 1024 * 1024;
  const buf = randomBytes(N);
  let zeros = 0;
  for (const b of buf) if (b === 0) zeros++;
  console.log(`  ${N} random bytes, zero-count =`, zeros,
    `(expected ≈ ${N}/256 ≈ ${(N / 256).toFixed(1)}; ⟂ to pattern)`);
}

// ---------------------------------------------------------------------------
// 2. scrypt KDF (closest stdlib KDF).
// ---------------------------------------------------------------------------

export function scryptKdf(): void {
  console.log('\n=== scrypt KDF (salt + password → 32-byte key) ===');
  const pw  = Buffer.from('correct horse battery staple');
  const salt = randomBytes(16);
  const t0 = process.hrtime.bigint();
  const k = scryptSync(pw, salt, 32, { N: 1 << 15, r: 8, p: 1, maxmem: 256 * 1024 * 1024 });
  const t1 = process.hrtime.bigint();
  console.log('  key                 :', k.toString('hex').slice(0, 24) + '…');
  console.log('  derivation time (ms):', Number(t1 - t0) / 1_000_000);
  // Deterministic for same (pw, salt, params)
  const k2 = scryptSync(pw, salt, 32, { N: 1 << 15, r: 8, p: 1, maxmem: 256 * 1024 * 1024 });
  console.log('  deterministic       :', k.toString('hex') === k2.toString('hex'));
}

// ---------------------------------------------------------------------------
// 3. HKDF chained — three subkeys from one master.
// ---------------------------------------------------------------------------

export function hkdfChained(): void {
  console.log('\n=== HKDF chained subkeys ===');
  const master = randomBytes(32);
  const get = (info: string) => Buffer.from(hkdfSync('sha256', master, new Uint8Array(0),
    Buffer.from(info), 32));
  const aesKey  = get('aes-key');
  const macKey  = get('mac-key');
  const tokenKey = get('token-key');
  console.log('  aes-key   :', aesKey.toString('hex').slice(0, 24) + '…');
  console.log('  mac-key   :', macKey.toString('hex').slice(0, 24) + '…');
  console.log('  token-key :', tokenKey.toString('hex').slice(0, 24) + '…');
  console.log('  all distinct             :', !aesKey.equals(macKey) && !aesKey.equals(tokenKey));
}

// ---------------------------------------------------------------------------
// Driver.
// ---------------------------------------------------------------------------

export function execute(): void {
  csprngSanity();
  scryptKdf();
  hkdfChained();
}

if (process.argv[1]?.endsWith('randomness.ts')) execute();
