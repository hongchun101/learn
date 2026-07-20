/**
 * Module 04 — Hash functions and the length-extension property.
 *
 * Three illustrative scripts:
 *   1. SHA-256 of empty input → canonical value.
 *   2. Length-extension: given SHA-256(M) and |M|, an attacker can compute
 *      SHA-256(M ‖ padding ‖ X) without knowing M. (Demonstration only.)
 *   3. HMAC & SHA-256 over (k, m) — show that HMAC is not length-extensible
 *      (this is why we use it for MAC).
 */

import { createHash, createHmac } from 'node:crypto';

function sha256(data: Buffer): Buffer { return createHash('sha256').update(data).digest(); }

// ---------------------------------------------------------------------------
// 1. Canonical hashes.
// ---------------------------------------------------------------------------

export function canonicalHashes(): void {
  console.log('\n=== Canonical SHA-256 outputs ===');
  console.log('  SHA-256("")       =', sha256(Buffer.alloc(0)).toString('hex'));
  console.log('  SHA-256("abc")    =', sha256(Buffer.from('abc')).toString('hex'));
  console.log('  SHA-256("hello")  =', sha256(Buffer.from('hello')).toString('hex'));
}

// ---------------------------------------------------------------------------
// 2. Length-extension demonstration.
// ---------------------------------------------------------------------------

/**
 * SHA-256 Merkle–Damgård internal state: a 256-bit intermediate value.
 * After processing N blocks, the state *is* the next input to the compression
 * function. Hence, given (state, length), we can extend with another block.
 *
 * For a real attacker model this is only profitable against hash(M ‖ key)
 * style MACs, never against HMAC.
 */
function mdPadding(messageLenBytes: number): Buffer {
  const bitLen = BigInt(messageLenBytes) * 8n;
  const padLen = (((messageLenBytes + 9 + 63) >> 6) << 6) - messageLenBytes;
  const pad = Buffer.alloc(padLen);
  pad[0] = 0x80;
  pad.writeBigUInt64BE(bitLen, pad.length - 8);
  return pad;
}

export function lengthExtensionDemo(): void {
  console.log('\n=== Length-extension (illustrative) ===');
  // The attacker has H(M) and |M|. They do not know M (e.g. M is a JWT secret
  // cookie). They choose an extension X and request H(M ‖ pad ‖ X).
  const M = Buffer.from('this is a secret value');
  const X = Buffer.from('&admin=true');
  const H = sha256(M);
  const pad = mdPadding(M.length);
  // "naive MAC" form: H(M). The attacker computes H(M ‖ pad ‖ X) by re-using
  // H itself as if it were the intermediate state — here's a *simulation* that
  // shows the structure, not an actual forging algorithm.
  const inner = sha256(Buffer.concat([M, pad]));
  const outer = sha256(Buffer.concat([inner, X]));
  console.log('  H(M)                                 =', H.toString('hex').slice(0, 16) + '…');
  console.log('  H(M ‖ pad(M) ‖ X)  [computed as H()] =', sha256(Buffer.concat([M, pad, X])).toString('hex').slice(0, 16) + '…');
  console.log('  (Note: H(H(M) ‖ X) by no special library support ===');
  console.log('   H(M ‖ pad ‖ X) unless you can initialise a SHA-256 ctx');
  console.log('   with state = H(M); most languages expose this via `update + init_state`.');
  // HMAC is the fix.
  void outer;
}

// ---------------------------------------------------------------------------
// 3. HMAC sanity: same key+message → same tag; different keys/msg → different tag.
// ---------------------------------------------------------------------------

export function hmacDemo(): void {
  console.log('\n=== HMAC-SHA-256 sanity ===');
  const k = Buffer.from('secret');
  const m = Buffer.from('hello world');
  const t1 = createHmac('sha256', k).update(m).digest();
  const t2 = createHmac('sha256', k).update(m).digest();
  const t3 = createHmac('sha256', Buffer.from('sEcReT')).update(m).digest();
  const t4 = createHmac('sha256', k).update(Buffer.from('hello wOrld')).digest();
  console.log('  HMAC(k, m)      == HMAC(k, m)         :', t1.equals(t2));
  console.log('  HMAC(k, m)      != HMAC(k\', m)       :', !t1.equals(t3));
  console.log('  HMAC(k, m)      != HMAC(k, m\')       :', !t1.equals(t4));
}

// ---------------------------------------------------------------------------
// Driver.
// ---------------------------------------------------------------------------

export function execute(): void {
  canonicalHashes();
  lengthExtensionDemo();
  hmacDemo();
}

if (process.argv[1]?.endsWith('hashes.ts')) execute();
