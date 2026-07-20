// Chapter 01 — MAC and KDF primitives.
//
// HMAC-SHA256 is the canonical message authentication code: it turns a hash
// function into a keyed MAC and is used for:
//   * the Bitcoin BIP-32 chain-code mixing,
//   * the handshake transcripts of the Noise protocol used by Lightning and
//     libp2p.
//
// HKDF (RFC 5869) is the canonical way to derive session keys from a high-
// entropy master. BIP-32 uses HKDF-shaped derivation (though with a custom
// domain separation). Noise uses HKDF to produce ciphertext keys per turn.
//
// Reference: RFC 5869 — HMAC-based Extract-and-Expand Key Derivation Function.

import { hmac } from '@noble/hashes/hmac';
import { sha256 as nobleSha256 } from '@noble/hashes/sha256';
import { hkdf } from '@noble/hashes/hkdf';
import { bytesToHex, hexToBytes, concatBytes } from '@noble/hashes/utils';

/** HMAC-SHA256 (RFC 2104). */
export function hmacSha256(key: Uint8Array, message: Uint8Array): Uint8Array {
  return hmac(nobleSha256, key, message);
}

/** HKDF-SHA256 with empty salt. Output length is bytes. */
export function hkdfSha256(
  ikm: Uint8Array,
  salt: Uint8Array,
  info: Uint8Array,
  outputLength: number,
): Uint8Array {
  return hkdf(nobleSha256, ikm, salt, info, outputLength);
}

/**
 * Ethereum-style chain-key derivation uses keccak256(priv || i) — but HD
 * wallets (BIP-32) need HKDF-style domain separation. This helper derives a
 * 32-byte child key from a parent chain code, parent key and index.
 *
 * This mirrors BIP-32 non-hardened derivation (BIP-32 spec, section "Public
 * parent key → public child key"). For hardened, the index is offset by
 * 0x80000000 and the parent *private* key is used as the HMAC key instead of
 * the public key.
 */
export function deriveEthereumChainKey(parentPriv: Uint8Array, index: number): Uint8Array {
  if (index < 0 || index >= 0x80000000) {
    throw new RangeError('index must fit in 31 bits');
  }
  const data = new Uint8Array(1 + 32 + 4);
  data.set([0x00], 0);
  data.set(parentPriv, 1);
  // Big-endian index.
  data[33] = (index >>> 24) & 0xff;
  data[34] = (index >>> 16) & 0xff;
  data[35] = (index >>> 8) & 0xff;
  data[36] = index & 0xff;
  // For demonstration only — production uses HMAC-SHA512 with a real chain code.
  return hmac(nobleSha256, parentPriv, data).slice(0, 32);
}

/**
 * Noise IK symmetric state mix used by libp2p / Lightning. We illustrate the
 * handshake transcript hash, not the full handshake.
 *
 * The Noise Protocol Framework (Revision 34, Section 5.3) defines:
 *   - MixKey after each message: chained key and current hash updated.
 */
export function noiseIKSymmetricState(
  chainingKey: Uint8Array,
  inputKeyMaterial: Uint8Array,
): { ck: Uint8Array; h: Uint8Array; k: Uint8Array } {
  const ck1 = hmac(nobleSha256, chainingKey, inputKeyMaterial);
  const tempK = hkdf(nobleSha256, ck1, new Uint8Array(0), new Uint8Array(0), 32);
  const k2 = hkdf(nobleSha256, ck1, tempK, new Uint8Array(1), 32);
  return { ck: ck1, h: tempK, k: k2 };
}

// Re-export often-used helpers so tests + downstream chapters can import from
// one place. We intentionally do not export noble's `utils` to keep the public
// surface small.
export { bytesToHex, hexToBytes, concatBytes };
