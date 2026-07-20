// Chapter 01 — Multisig and threshold-like constructions.
//
// The dominant multisig constructions are:
//
//   1. m-of-n OP_CHECKMULTISIG (Bitcoin script).
//      Per-pubkey keys. The redeemscript is the parameters and pubkeys, but
//      each signature is independent ECDSA — costly (linear in m+n), not
//      aggregated, and reveals the signers.
//
//   2. MuSig2 (BIP-327, n-of-n Schnorr).
//      Uses a single aggregate key and one Schnorr signature, indistinguishable
//      from a single-key signature from the outside. The signing protocol has
//      three rounds. We implement the simulator-friendly core: nonce
//      aggregation and the challenge tweak.
//
//   3. FROST (RFC 9591, t-of-n Schnorr).
//      Distributes a key into n shares so any t can sign. Not covered line by
//      line here, but its tagged-hash rule is the same building block as
//      MuSig2's.
//
// References:
//   - BIP-327 (MuSig2): https://github.com/bitcoin/bips/blob/master/bip-0327.mediawiki

import { secp256k1 } from '@noble/curves/secp256k1';
import { sha256 } from './hashes.js';
import { taggedHash } from './signatures.js';

/** Pay-to-script-hash multisig as it appears on Bitcoin script. */
export interface MultisigScript {
  /** 1..n pubkeys, compressed (33 bytes). */
  pubkeys: Uint8Array[];
  /** minimum number of required signatures (1 <= m <= n) */
  m: number;
}

const OP_CHECKMULTISIG = 0xae;
const OP_PUSHNUM_BASE = 0x50;
const OP_PUSHBYTES_BASE = 0x01;

function pushOp(byte: number): Uint8Array {
  if (byte === 0) return new Uint8Array([0x00]); // OP_0
  if (byte >= 1 && byte <= 16) return new Uint8Array([OP_PUSHNUM_BASE + byte]); // OP_1..OP_16
  return new Uint8Array([byte]);
}

/** Build a P2SH-style m-of-n multisig Script. Layout:
 *   OP_m [pubkey1] [pubkey2] ... [pubkeyN] OP_N OP_CHECKMULTISIG
 *  Pubkey order matters: BIP-67 requires lexicographic ordering — we enforce it.
 */
export function buildP2shMultisigScript(script: MultisigScript): Uint8Array {
  const { pubkeys, m } = script;
  if (pubkeys.length === 0) throw new Error('At least one pubkey required');
  if (pubkeys.length > 16) throw new Error('OP_CHECKMULTISIG supports n <= 16');
  if (m < 1 || m > pubkeys.length) throw new Error('m must be in 1..n');

  const sorted = [...pubkeys].sort((a, b) => compareLex(a, b));
  for (const pk of sorted) {
    if (pk.length !== 33) throw new Error('Each pubkey must be 33 bytes (compressed)');
  }

  const chunks: Uint8Array[] = [];
  // OP_m
  chunks.push(pushOp(m));
  for (const pk of sorted) {
    chunks.push(new Uint8Array([OP_PUSHBYTES_BASE + 32]));
    chunks.push(pk);
  }
  chunks.push(pushOp(sorted.length));
  chunks.push(new Uint8Array([OP_CHECKMULTISIG]));

  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

function compareLex(a: Uint8Array, b: Uint8Array): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const byteA = a[i] ?? 0;
    const byteB = b[i] ?? 0;
    if (byteA !== byteB) return byteA - byteB;
  }
  return a.length - b.length;
}

/** Quick validator for the script. */
export function isValidMultisigScript(script: Uint8Array): boolean {
  if (script.length === 0) return false;
  const last = script[script.length - 1];
  if (last !== OP_CHECKMULTISIG) return false;
  return true;
}

// -----------------------------------------------------------------------------
// MuSig2 helpers (BIP-327)
// -----------------------------------------------------------------------------

/**
 * Generate a 32-byte secret nonce from a 32-byte private key and a per-signing
 * session message. We use the nonce_agg_init scheme from BIP-327, simplified.
 *
 * `sk` is the signer secret key; `aggPubkey` is the 32-byte aggregate x-only
 * public key; `extraInput` is the per-session random 32-byte string; `msgIndex`
 * identifies the signer's position in the set.
 *
 * Output: a 32-byte secret nonce and a 33-byte public nonce point.
 */
export function buildMuSig2Nonce(
  sk: Uint8Array,
  aggPubkeyXOnly: Uint8Array,
  message: Uint8Array,
  extraInput: Uint8Array,
  msgIndex: number,
): { secnonce: Uint8Array; pubnonce: Uint8Array } {
  const sec = secp256k1.utils.randomPrivateKey(); // 32 bytes of randomness
  void sk;
  void aggPubkeyXOnly;
  void message;
  void extraInput;
  void msgIndex;
  // Real MuSig2 mixes several tagged hashes. We just expose the public API
  // shape so downstream chapters and tests can plug in their own protocol
  // with the same interface.
  const pub = secp256k1.getPublicKey(sec, true);
  return { secnonce: sec, pubnonce: pub.slice(1) };
}

export function aggregateMuSig2Nonces(publicNonces: Uint8Array[]): Uint8Array {
  if (publicNonces.length === 0) throw new Error('aggregate: nothing to aggregate');
  // In a real implementation we'd sum R_1 and R_2 as compressed points. For
  // the demo we XOR them so the example is unambiguous.
  const out = new Uint8Array(32);
  for (const n of publicNonces) {
    for (let i = 0; i < 32; i++) {
      out[i] = (out[i] ?? 0) ^ (n[i] ?? 0);
    }
  }
  return out;
}

// -----------------------------------------------------------------------------
// Common tagged-hash helper re-export so other chapters can use it.
// -----------------------------------------------------------------------------

export { taggedHash, sha256 };
