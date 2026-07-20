// Chapter 01 — Signatures and curves.
//
// A blockchain engineer must be able to:
//   1. Generate a keypair and reason about which curve it is on.
//   2. Sign and verify with ECDSA-secp256k1 (BTC, ETH).
//   3. Sign and verify with Schnorr-secp256k1 (BIP-340 Taproot).
//   4. Aggregate BLS signatures (Ethereum consensus layer, Filecoin).
//   5. Sign and verify with Ed25519 (Solana, Polkadot, Cosmos SDK chains).
//   6. Apply the Ethereum low-S rule (BIP-62 / EIP-2) so signatures cannot be
//      malleated.
//   7. Recover the signer from an ECDSA signature — used by Ethereum
//      transactions to derive `tx.from` without storing the public key.
//
// References:
//   - SEC1 (ECDSA): https://www.secg.org/sec1-v2.pdf
//   - BIP-340 (Schnorr over secp256k1):
//     https://github.com/bitcoin/bips/blob/master/bip-0340.mediawiki
//   - RFC 8032 (Ed25519): https://datatracker.ietf.org/doc/html/rfc8032
//   - draft-irtf-cfrg-bls-signature-05
//   - EIP-2 (low-S requirement for Ethereum transactions)

import { secp256k1, schnorr } from '@noble/curves/secp256k1';
import { ed25519 } from '@noble/curves/ed25519';
import { bls12_381 } from '@noble/curves/bls12-381';
import { numberToBytesBE } from '@noble/curves/abstract/utils';
import { sha256 } from './hashes.js';

export type CurveName = 'secp256k1' | 'ed25519' | 'bls12-381';
export type PointHex = string;

export interface KeyPair {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
}

export function generateKeypair(curve: CurveName): KeyPair {
  switch (curve) {
    case 'secp256k1': {
      const sk = secp256k1.utils.randomPrivateKey();
      return { privateKey: sk, publicKey: secp256k1.getPublicKey(sk, true) };
    }
    case 'ed25519': {
      const sk = ed25519.utils.randomPrivateKey();
      return { privateKey: sk, publicKey: ed25519.getPublicKey(sk) };
    }
    case 'bls12-381': {
      const sk = bls12_381.utils.randomPrivateKey();
      return { privateKey: sk, publicKey: bls12_381.getPublicKey(sk) };
    }
  }
  const _exhaustive: never = curve;
  throw new Error(`Unknown curve: ${String(_exhaustive)}`);
}

/** Compress a 32-byte secp256k1 private key to a 33-byte compressed point. */
export function publicKeyFromPrivate(privateKey: Uint8Array): Uint8Array {
  return secp256k1.getPublicKey(privateKey, true);
}

export function decompressSecp256k1(compressed: Uint8Array): Uint8Array {
  if (compressed.length !== 33) {
    throw new Error(`Expected 33-byte compressed key, got ${compressed.length}`);
  }
  return secp256k1.ProjectivePoint.fromHex(compressed).toRawBytes(false);
}

// --- secp256k1 ECDSA --------------------------------------------------------

const SECP256K1_N =
  0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;

/** EIP-2 / BIP-62: the S value must sit in the lower half of the curve order. */
export function isLowS(s: bigint): boolean {
  return s >= 1n && s <= SECP256K1_N >> 1n;
}

export function normalizeLowS(s: bigint): bigint {
  return isLowS(s) ? s : SECP256K1_N - s;
}

export interface EcdsaSignature {
  r: bigint;
  s: bigint;
  /** 27 or 28, Ethereum-style recovery id. */
  v: number;
}

export function signEcdsa(digest: Uint8Array, privateKey: Uint8Array): EcdsaSignature {
  const sig = secp256k1.sign(digest, privateKey, { lowS: true });
  if (sig.recovery === undefined) {
    throw new Error('sign() did not return a recovery id');
  }
  return { r: sig.r, s: normalizeLowS(sig.s), v: sig.recovery + 27 };
}

export function verifyEcdsa(
  digest: Uint8Array,
  signature: { r: bigint; s: bigint },
  publicKey: Uint8Array,
): boolean {
  return secp256k1.verify(signature, digest, publicKey);
}

/**
 * Recover the uncompressed 65-byte public key from an ECDSA signature.
 * Ethereum derives tx.from by keccak256 of this point minus the leading byte.
 */
export function ecrecover(digest: Uint8Array, signature: EcdsaSignature): Uint8Array {
  const recId = signature.v - 27;
  const compact = new Uint8Array(64);
  compact.set(numberToBytesBE(signature.r, 32), 0);
  compact.set(numberToBytesBE(signature.s, 32), 32);
  const sig = secp256k1.Signature.fromCompact(compact).addRecoveryBit(recId);
  return sig.recoverPublicKey(digest).toRawBytes(false);
}

// --- secp256k1 Schnorr (BIP-340) --------------------------------------------

export function signSchnorr(message: Uint8Array, privateKey: Uint8Array): Uint8Array {
  return schnorr.sign(message, privateKey);
}

export function verifySchnorr(
  message: Uint8Array,
  signature: Uint8Array,
  publicKey: Uint8Array,
): boolean {
  return schnorr.verify(signature, message, publicKey);
}

// --- Ed25519 (RFC 8032) -----------------------------------------------------

export function signEd25519(message: Uint8Array, privateKey: Uint8Array): Uint8Array {
  return ed25519.sign(message, privateKey);
}

export function verifyEd25519(
  signature: Uint8Array,
  message: Uint8Array,
  publicKey: Uint8Array,
): boolean {
  return ed25519.verify(signature, message, publicKey);
}

// --- BLS12-381 --------------------------------------------------------------

export function signBls(message: Uint8Array, privateKey: Uint8Array): Uint8Array {
  return bls12_381.sign(message, privateKey);
}

export function verifyBls(
  signature: Uint8Array,
  message: Uint8Array,
  publicKey: Uint8Array,
): boolean {
  return bls12_381.verify(signature, message, publicKey);
}

export function aggregateBls(signatures: Uint8Array[]): Uint8Array {
  if (signatures.length === 0) {
    throw new Error('Cannot aggregate zero signatures');
  }
  return bls12_381.aggregateSignatures(signatures);
}

export function aggregateVerifyBls(
  messages: Uint8Array[],
  signature: Uint8Array,
  publicKeys: Uint8Array[],
): boolean {
  if (messages.length !== publicKeys.length) {
    throw new Error('messages.length must equal publicKeys.length');
  }
  return bls12_381.verifyBatch(signature, messages, publicKeys);
}

// --- shared helpers ---------------------------------------------------------

export function taggedHash(tag: string, msg: Uint8Array): Uint8Array {
  const tagHash = sha256(new TextEncoder().encode(tag));
  const out = new Uint8Array(tagHash.length + msg.length);
  out.set(tagHash, 0);
  out.set(msg, tagHash.length);
  return sha256(out);
}
