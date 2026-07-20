// =============================================================================
// Chapter 01 — Cryptography Primitives
// =============================================================================
// Goal: every cryptographic primitive a blockchain engineer must understand —
// not in isolation, but in the form a chain actually calls them.
//
// Concepts covered:
//   * Hashes used by chains: SHA-256 (BTC, mining, block/transaction hashes),
//     Keccak-256 (ETH), RIPEMD-160 (BTC addresses), BLAKE2b (Zcash, Polkadot).
//   * MAC and KDF: HMAC-SHA256, HKDF (BIP-32 chains, Noise IK).
//   * Curve choice: secp256k1 (BTC, ETH), ed25519 (Solana, Aptos, Cosmos),
//     BLS12-381 (Eth2 aggregation), secp256r1 (WebAuthn, not implemented).
//   * Signature schemes: ECDSA-secp256k1 (low-S, EIP-2098 compact form),
//     Schnorr-secp256k1 (BIP-340 Taproot), Ed25519 (RFC 8032),
//     BLS12-381 single + aggregate.
//   * Multisig constructions: OP_CHECKMULTISIG (script), MuSig2 sketch
//     (BIP-327), tagged-hash building block shared with FROST.
// =============================================================================

export {
  sha256,
  keccak256,
  ripemd160,
  sha256d,
  hash160,
  blake2b256,
  blake2b,
} from './hashes.js';
export { hmacSha256, hkdfSha256, deriveEthereumChainKey } from './kdf.js';
export {
  generateKeypair,
  publicKeyFromPrivate,
  decompressSecp256k1,
  isLowS,
  normalizeLowS,
  signEcdsa,
  verifyEcdsa,
  ecrecover,
  signSchnorr,
  verifySchnorr,
  signEd25519,
  verifyEd25519,
  signBls,
  verifyBls,
  aggregateBls,
  aggregateVerifyBls,
  taggedHash,
} from './signatures.js';
export {
  buildP2shMultisigScript,
  isValidMultisigScript,
  buildMuSig2Nonce,
  aggregateMuSig2Nonces,
} from './multisig.js';
export { demo } from './demo.js';

export type { CurveName, KeyPair, EcdsaSignature } from './signatures.js';
