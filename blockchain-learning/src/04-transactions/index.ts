// =============================================================================
// Chapter 04 — Transactions & Signatures
// =============================================================================
// Goal: every transaction model and signing scheme a chain engineer must know.
//
// Concepts covered:
//   1. UTXO model (Bitcoin, Cardano). Each input consumes a previous output
//      fully; each output generates new UTXOs. Transaction validity is
//      double-spend protection + script satisfaction + fee = sum(in) - sum(out).
//   2. Account model (Ethereum + forks). Each transaction has nonce, gas
//      limit, gas price (legacy) or max-fee/max-priority (EIP-1559), to, value,
//      data, signature (v, r, s). EIP-155 wraps replay protection via chain id.
//   3. Transaction types:
//        - Legacy (EIP-155) for simple transfers and most contracts.
//        - EIP-2930 (access list) for warm/cold storage pricing.
//        - EIP-1559 (fee market) for base fee + priority fee.
//        - EIP-4844 (blob-carrying, "Type-3") L2 rollup data.
//        - EIP-7702 (account abstraction authorization, recent).
//   4. ECDSA signing. Derive the address from the recovered public key via
//      keccak256 of the uncompressed 65-byte point, dropping the first byte.
//   5. BIP-32 / BIP-39 HD wallet basics, mnemonic → seed → master key.
// =============================================================================

import { keccak256, sha256d } from '../01-cryptography/hashes.js';
import {
  publicKeyFromPrivate,
  ecrecover,
  signEcdsa,
  verifyEcdsa,
  normalizeLowS,
  isLowS,
  type EcdsaSignature,
} from '../01-cryptography/signatures.js';
import { rlpEncode } from '../03-encoding/index.js';
import { mnemonicToSeedSync } from '@scure/bip39';
import { HDKey } from '@scure/bip32';

// =============================================================================
// UTXO model (Bitcoin-flavored)
// =============================================================================

export interface Utxo {
  txid: Uint8Array; // 32 bytes, reversed (or BE depending on convention)
  vout: number;
  value: bigint; // satoshis
  scriptPubKey: Uint8Array; // locking script
}

export interface UtxoInput {
  prevTxid: Uint8Array;
  prevVout: number;
  scriptSig: Uint8Array; // unlocking script
  sequence: number;
}

export interface UtxoOutput {
  value: bigint;
  scriptPubKey: Uint8Array;
}

export interface UtxoTransaction {
  version: number;
  inputs: UtxoInput[];
  outputs: UtxoOutput[];
  locktime: number;
}

export function serializeUtxo(tx: UtxoTransaction): Uint8Array {
  const parts: Uint8Array[] = [];
  // version (LE 4 bytes)
  parts.push(u32le(tx.version));
  parts.push(compactLen(tx.inputs.length));
  for (const i of tx.inputs) {
    parts.push(zeroPadTo32(i.prevTxid));
    parts.push(u32le(i.prevVout));
    parts.push(compactScript(i.scriptSig));
    parts.push(u32le(i.sequence));
  }
  parts.push(compactLen(tx.outputs.length));
  for (const o of tx.outputs) {
    parts.push(u64le(o.value));
    parts.push(compactScript(o.scriptPubKey));
  }
  parts.push(u32le(tx.locktime));
  return concat(...parts);
}

/** Compute the canonical txid (SHA-256d of the serialized tx). */
export function utxoTxid(tx: UtxoTransaction): Uint8Array {
  return sha256d(serializeUtxo(tx));
}

/**
 * Validate the basic shape of a transaction: outputs are non-negative, fee is
 * implied by the spent inputs vs. outputs. The real chain would verify each
 * script with the spent UTXO's scriptPubKey.
 */
export function validateUtxo(tx: UtxoTransaction, spentValue: bigint): bigint {
  if (tx.outputs.length === 0) throw new Error('tx: no outputs');
  for (const o of tx.outputs) {
    if (o.value < 0n) throw new Error('tx: negative output');
  }
  let outSum = 0n;
  for (const o of tx.outputs) outSum += o.value;
  if (outSum > spentValue) throw new Error('tx: outputs exceed inputs');
  return spentValue - outSum;
}

// =============================================================================
// Account model (Ethereum)
// =============================================================================

export interface TxLegacyUnsigned {
  type: 'legacy';
  nonce: bigint;
  gasPrice: bigint;
  gasLimit: bigint;
  to: Uint8Array | null;
  value: bigint;
  data: Uint8Array;
  chainId: bigint;
}

export interface TxLegacySigned extends TxLegacyUnsigned {
  type: 'legacy';
  v: bigint;
  r: bigint;
  s: bigint;
}

export function ethAddressFromPubkey(pubkeyUncompressed: Uint8Array): Uint8Array {
  // 65 bytes uncompressed: drop the leading 0x04 byte, keccak256, take last 20.
  const body = pubkeyUncompressed.length === 65 ? pubkeyUncompressed.subarray(1) : pubkeyUncompressed;
  return keccak256(body).subarray(-20);
}
/**
 * Encode a legacy unsigned Ethereum transaction for signing, per EIP-155.
 * Layout: RLP([nonce, gasPrice, gasLimit, to, value, data, chainId, 0, 0]).
 */
export function rlpUnsignedLegacy(tx: TxLegacyUnsigned): Uint8Array {
  const toBytes = tx.to === null ? new Uint8Array() : tx.to;
  return rlpEncode([
    u256(tx.nonce),
    u256(tx.gasPrice),
    u256(tx.gasLimit),
    toBytes,
    u256(tx.value),
    tx.data,
    u256(tx.chainId),
    new Uint8Array(),
    new Uint8Array(),
  ]);
}

/**
 * Sign a legacy unsigned transaction per EIP-155. Returns the recovered
 * address so the test can confirm it matches the signer.
 */
export function signLegacyTx(tx: TxLegacyUnsigned, priv: Uint8Array): TxLegacySigned {
  const encoded = rlpUnsignedLegacy(tx);
  const digest = keccak256(encoded);
  const sig = signEcdsa(digest, priv);
  // v = recId + chainId * 2 + 35
  const v = BigInt(sig.v - 27) + tx.chainId * 2n + 35n;
  return { ...tx, v, r: sig.r, s: sig.s };
}

export function encodeSignedLegacyTx(tx: TxLegacySigned): Uint8Array {
  const toBytes = tx.to === null ? new Uint8Array() : tx.to;
  return rlpEncode([
    u256(tx.nonce),
    u256(tx.gasPrice),
    u256(tx.gasLimit),
    toBytes,
    u256(tx.value),
    tx.data,
    u256(tx.v),
    u256(tx.r),
    u256(tx.s),
  ]);
}

/**
 * Recover the signer address of a signed legacy Ethereum transaction. Used by
 * clients to confirm the unsigned tx would be signed by the claimed address.
 */
export function recoverLegacyTx(tx: TxLegacySigned): Uint8Array {
  // Re-serialize without v, r, s but with chainId for EIP-155 replay protection:
  const unsigned: TxLegacyUnsigned = {
    type: 'legacy',
    nonce: tx.nonce,
    gasPrice: tx.gasPrice,
    gasLimit: tx.gasLimit,
    to: tx.to,
    value: tx.value,
    data: tx.data,
    chainId: tx.chainId,
  };
  const encoded = rlpUnsignedLegacy(unsigned);
  const digest = keccak256(encoded);

  // Recovery id from v per EIP-155: v - chainId*2 - 35 in {0,1}; map to 27/28.
  const recId = Number(tx.v - tx.chainId * 2n - 35n);
  const pk65 = ecrecover(digest, { r: tx.r, s: tx.s, v: recId + 27 });
  return ethAddressFromPubkey(pk65);
}

// =============================================================================
// BIP-32 / BIP-39 HD wallets
// =============================================================================

/** Convert a 12/24-word BIP-39 mnemonic to a 64-byte seed via PBKDF2-HMAC-SHA512. */
export function mnemonicToSeed(mnemonic: string, passphrase = ''): Uint8Array {
  return mnemonicToSeedSync(mnemonic, passphrase);
}

/** Derive a 32-byte private key at the BIP-44 path m/44'/60'/0'/0/0. */
export function deriveEthereumMasterKey(seed: Uint8Array, index = 0): Uint8Array {
  const master = HDKey.fromMasterSeed(seed);
  const child = master.derive(`m/44'/60'/0'/0/${index}`);
  if (!child.privateKey) throw new Error('child has no privkey');
  return child.privateKey;
}

// =============================================================================
// demo
// =============================================================================

import { DeterministicRng, seedFrom } from '../_rng.js';
import { secp256k1 } from '@noble/curves/secp256k1';

export interface Chapter04DemoResult {
  utxo: { txid: string; fee: bigint };
  eth: { from: string; signedHex: string };
  hdwallet: { address: string; path: string };
}

export function demo(): Chapter04DemoResult {
  // UTXO demo
  const utxo: UtxoTransaction = {
    version: 1,
    inputs: [
      { prevTxid: new Uint8Array(32).fill(0xaa), prevVout: 0, scriptSig: new Uint8Array(), sequence: 0xffffffff },
    ],
    outputs: [
      { value: 1_000n, scriptPubKey: new Uint8Array([0x76, 0xa9, 0x14, 0x00]) },
    ],
    locktime: 0,
  };
  const txid = utxoTxid(utxo);
  const fee = validateUtxo(utxo, 1_500n);

  // Ethereum legacy tx demo
  const rng = new DeterministicRng(seedFrom('ch04-eth-v1'));
  const priv = rng.next(32);
  const from = ethAddressFromPubkey(secp256k1.ProjectivePoint.fromHex(publicKeyFromPrivate(priv)).toRawBytes(false));
  const tx: TxLegacyUnsigned = {
    type: 'legacy',
    nonce: 7n,
    gasPrice: 30_000_000_000n,
    gasLimit: 21_000n,
    to: new Uint8Array(20).fill(0xbb),
    value: 1n * 10n ** 18n,
    data: new Uint8Array(),
    chainId: 1n,
  };
  const signed = signLegacyTx(tx, priv);
  void recoverLegacyTx(signed);
  const signedHex = Array.from(encodeSignedLegacyTx(signed)).map((b) => b.toString(16).padStart(2, '0')).join('');

  // HD wallet demo
  const hdSeed = mnemonicToSeed('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
  const hdPriv = deriveEthereumMasterKey(hdSeed, 0);
  const hdUncompressed = secp256k1.ProjectivePoint.fromHex(publicKeyFromPrivate(hdPriv)).toRawBytes(false);
  const hdAddr = ethAddressFromPubkey(hdUncompressed);

  // unused but keep imports live:
  void normalizeLowS;
  void isLowS;
  void verifyEcdsa;

  return {
    utxo: { txid: Array.from(txid).map((b) => b.toString(16).padStart(2, '0')).join(''), fee },
    eth: { from: '0x' + Array.from(from).map((b) => b.toString(16).padStart(2, '0')).join(''), signedHex },
    hdwallet: { address: '0x' + Array.from(hdAddr).map((b) => b.toString(16).padStart(2, '0')).join(''), path: "m/44'/60'/0'/0/0" },
  };
}

// =============================================================================
// helpers
// =============================================================================

function u32le(n: number): Uint8Array {
  const out = new Uint8Array(4);
  out[0] = n & 0xff;
  out[1] = (n >> 8) & 0xff;
  out[2] = (n >> 16) & 0xff;
  out[3] = (n >> 24) & 0xff;
  return out;
}

function u64le(n: bigint): Uint8Array {
  const out = new Uint8Array(8);
  let v = n;
  for (let i = 0; i < 8; i++) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

function u256(n: bigint): Uint8Array {
  if (n < 0n) throw new Error('u256 must be non-negative');
  const bytes: number[] = [];
  let v = n;
  while (v > 0n) {
    bytes.unshift(Number(v & 0xffn));
    v >>= 8n;
  }
  return new Uint8Array(bytes);
}

function compactLen(n: number): Uint8Array {
  if (n < 0xfd) return new Uint8Array([n]);
  if (n <= 0xffff) {
    return new Uint8Array([0xfd, n & 0xff, (n >> 8) & 0xff]);
  }
  throw new Error('compactLen: too large');
}

function compactScript(script: Uint8Array): Uint8Array {
  return concat(compactLen(script.length), script);
}

function zeroPadTo32(b: Uint8Array): Uint8Array {
  if (b.length === 32) return b;
  const out = new Uint8Array(32);
  out.set(b.subarray(0, 32), 0);
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

export type { EcdsaSignature };
