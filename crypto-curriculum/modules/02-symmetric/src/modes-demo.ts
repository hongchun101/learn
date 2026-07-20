/**
 * Module 02 — Modes of operation & their classic pitfalls.
 *
 * Educational reference implementations of:
 *   - AES-ECB leak (identical plaintext blocks → identical ciphertext blocks)
 *   - AES-CTR nonce reuse → recovers XOR of plaintexts
 *   - AES-GCM bit-flip protection (positive control; see tests/crypto.test.ts)
 *
 * We use Node's `crypto.createCipheriv('aes-256-ecb' | 'aes-256-ctr' | 'aes-256-gcm', …)`.
 * AES-ECB takes only a key (no IV). CBC requires an explicit 16-byte IV.
 *
 * Why no live padding-oracle demo here: a working attack needs the *server*
 * to leak one bit — text describes it, but reproducing an attack against a
 * real server would cross the line.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toBuf(b: Uint8Array): Buffer {
  return Buffer.from(b);
}
function printHex(label: string, b: Uint8Array, max = 32): void {
  const s = b.length > max ? toHex(b).slice(0, max * 2) + '…' : toHex(b);
  console.log(`  ${label.padEnd(20)} ${s} (${b.length} B)`);
}
function toHex(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i++) s += (b[i] ?? 0).toString(16).padStart(2, '0');
  return s;
}

// ---------------------------------------------------------------------------
// ECB leak — encrypt a long message of all-zero blocks; ciphertext is repeated.
// ---------------------------------------------------------------------------

export function ecbLeakDemo(): void {
  console.log('\n=== ECB mode leak ===');
  const key = randomBytes(32);
  const plaintext = new Uint8Array(32); // 32 zero bytes — two 16-byte blocks.
  const cipher = createCipheriv('aes-256-ecb', key, null);
  const c = Buffer.concat([cipher.update(toBuf(plaintext)), cipher.final()]);
  console.log('  plaintext (64 hex):', toHex(plaintext));
  console.log('  ciphertext (64 hex):', toHex(c));
  console.log('  ECB reveals identical block structure:',
    c.slice(0, 16).equals(c.slice(16, 32)));
}

// ---------------------------------------------------------------------------
// CTR with nonce reuse — XOR of plaintexts leaks.
// ---------------------------------------------------------------------------

export function ctrNonceReuseDemo(): void {
  console.log('\n=== CTR nonce reuse ===');
  const key = randomBytes(32);
  const nonce = randomBytes(16); // REUSED — by construction.
  const m1 = new TextEncoder().encode('attack at dawn          ');
  const m2 = new TextEncoder().encode('attack at dusk          ');
  const e1 = createCipheriv('aes-256-ctr', key, nonce);
  const c1 = Buffer.concat([e1.update(toBuf(m1)), e1.final()]);
  const e2 = createCipheriv('aes-256-ctr', key, nonce);
  const c2 = Buffer.concat([e2.update(toBuf(m2)), e2.final()]);
  const recovery = xorBytes(c1, c2);
  console.log('  recovered (m1 ⊕ m2):', new TextDecoder().decode(recovery).replace(/[^\x20-\x7e]/g, '.'));
}

function xorBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(Math.min(a.length, b.length));
  for (let i = 0; i < out.length; i++) out[i] = (a[i] ?? 0) ^ (b[i] ?? 0);
  return out;
}

// ---------------------------------------------------------------------------
// GCM positive control — bit flip throws.
// ---------------------------------------------------------------------------

export function gcmBitFlipDemo(): void {
  console.log('\n=== AES-GCM bit flip ===');
  const key = randomBytes(32);
  const pt  = new TextEncoder().encode('a very secret string');
  const iv  = randomBytes(12);
  const enc = createCipheriv('aes-256-gcm', key, iv);
  const ct  = Buffer.concat([enc.update(toBuf(pt)), enc.final()]);
  const tag = enc.getAuthTag();

  // Decrypt once — works.
  const dec = createDecipheriv('aes-256-gcm', key, iv);
  dec.setAuthTag(tag);
  const pt1 = Buffer.concat([dec.update(ct), dec.final()]);
  printHex('plaintext recovered', new Uint8Array(pt1));

  // Flip a bit.
  const cFlipped = new Uint8Array(ct);
  cFlipped[0] = (cFlipped[0] ?? 0) ^ 0x01;
  try {
    const dec2 = createDecipheriv('aes-256-gcm', key, iv);
    dec2.setAuthTag(tag);
    dec2.update(cFlipped);
    dec2.final();
    console.log('  BIT FLIP UNDETECTED — broken!');
  } catch {
    console.log('  bit flip rejected by authentication (correct)');
  }
}

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

export function execute(): void {
  ecbLeakDemo();
  ctrNonceReuseDemo();
  gcmBitFlipDemo();
}

if (process.argv[1]?.endsWith('modes-demo.ts')) execute();
