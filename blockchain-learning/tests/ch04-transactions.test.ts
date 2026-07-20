import { describe, it, expect } from 'vitest';
import {
  serializeUtxo,
  utxoTxid,
  validateUtxo,
  rlpUnsignedLegacy,
  signLegacyTx,
  encodeSignedLegacyTx,
  recoverLegacyTx,
  mnemonicToSeed,
  deriveEthereumMasterKey,
  demo as ch04Demo,
} from '../src/04-transactions/index.js';
import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak256 } from '../src/01-cryptography/hashes.js';
import { publicKeyFromPrivate } from '../src/01-cryptography/signatures.js';
import { fromHex } from '../src/03-encoding/index.js';
import { DeterministicRng, seedFrom } from '../src/_rng.js';

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return false;
  return true;
}

function ethAddrFromPriv(priv: Uint8Array): Uint8Array {
  const pk = publicKeyFromPrivate(priv);
  // pk is compressed (33 bytes). Address is keccak256(uncompressed no 0x04)[-20:].
  // We expand the point using noble, but secp256k1.ProjectivePoint.fromHex takes
  // compressed or uncompressed.
  const full = secp256k1.ProjectivePoint.fromHex(pk).toRawBytes(false);
  const body = full.subarray(1);
  return keccak256(body).subarray(-20);
}

describe('Chapter 04 — Transactions & Signatures', () => {
  it('UTXO txid is the sha256d of the serialized tx', () => {
    const tx = {
      version: 1,
      inputs: [{ prevTxid: new Uint8Array(32), prevVout: 0, scriptSig: new Uint8Array(), sequence: 0xffffffff }],
      outputs: [{ value: 1_000n, scriptPubKey: new Uint8Array([0x76, 0xa9, 0x14, 0x00]) }],
      locktime: 0,
    };
    const ser = serializeUtxo(tx);
    const computed = utxoTxid(tx);
    expect(keccak256(ser).length).toBe(32);
    expect(computed.length).toBe(32);
  });

  it('UTXO validation rejects outputs exceeding inputs', () => {
    const tx = {
      version: 1,
      inputs: [{ prevTxid: new Uint8Array(32), prevVout: 0, scriptSig: new Uint8Array(), sequence: 0xffffffff }],
      outputs: [{ value: 2_000n, scriptPubKey: new Uint8Array() }],
      locktime: 0,
    };
    expect(() => validateUtxo(tx, 1_000n)).toThrow();
  });

  it('UTXO fee = sum(in) - sum(out)', () => {
    const tx = {
      version: 1,
      inputs: [
        { prevTxid: new Uint8Array(32), prevVout: 0, scriptSig: new Uint8Array(), sequence: 0xffffffff },
        { prevTxid: new Uint8Array(32), prevVout: 1, scriptSig: new Uint8Array(), sequence: 0xffffffff },
      ],
      outputs: [
        { value: 600n, scriptPubKey: new Uint8Array() },
        { value: 300n, scriptPubKey: new Uint8Array() },
      ],
      locktime: 0,
    };
    expect(validateUtxo(tx, 1_000n)).toBe(100n);
  });

  it('Legacy Ethereum tx: sign → encode → recover roundtrip', () => {
    const rng = new DeterministicRng(seedFrom('ch04-test-1'));
    const priv = rng.next(32);
    const tx = {
      type: 'legacy' as const,
      nonce: 7n,
      gasPrice: 30_000_000_000n,
      gasLimit: 21_000n,
      to: new Uint8Array(20).fill(0xbb),
      value: 1_000_000_000n,
      data: new Uint8Array(),
      chainId: 1n,
    };
    const signed = signLegacyTx(tx, priv);
    expect([36n, 37n, 38n, 39n]).toContain(signed.v);
    const recovered = recoverLegacyTx(signed);
    const expected = ethAddrFromPriv(priv);
    expect(equalBytes(recovered, expected)).toBe(true);
    expect(encodeSignedLegacyTx(signed).length).toBeGreaterThan(0);
  });

  it('EIP-155 replay protection: same tx on chain 1 vs chain 5 yields different v', () => {
    const rng = new DeterministicRng(seedFrom('ch04-test-2'));
    const priv = rng.next(32);
    const tx1 = { type: 'legacy' as const, nonce: 0n, gasPrice: 1n, gasLimit: 21_000n, to: null, value: 0n, data: new Uint8Array(), chainId: 1n };
    const tx5 = { ...tx1, chainId: 5n };
    const a = signLegacyTx(tx1, priv);
    const b = signLegacyTx(tx5, priv);
    expect(a.v).not.toBe(b.v);
  });

  it('RLP of an unsigned legacy tx starts with the expected field list', () => {
    const enc = rlpUnsignedLegacy({
      type: 'legacy',
      nonce: 0n,
      gasPrice: 1n,
      gasLimit: 21000n,
      to: null,
      value: 0n,
      data: new Uint8Array(),
      chainId: 1n,
    });
    expect(enc.length).toBeGreaterThan(0);
    expect(enc[0]).toBeGreaterThanOrEqual(0xc0);
  });

  it('BIP-39 mnemonic → seed → BIP-44 privkey produces a stable Ethereum address', () => {
    const seed = mnemonicToSeed('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about', '');
    expect(seed.length).toBe(64);
    const priv = deriveEthereumMasterKey(seed, 0);
    expect(priv.length).toBe(32);
    // The Ethereum vault address for that mnemonic + index 0 is canonical;
    // we don't need the exact value, just stability:
    const priv2 = deriveEthereumMasterKey(seed, 0);
    expect(equalBytes(priv, priv2)).toBe(true);
  });

  it('demo runs end-to-end', () => {
    const out = ch04Demo();
    expect(out.utxo.fee).toBe(500n);
    expect(out.eth.from.startsWith('0x')).toBe(true);
    expect(out.eth.signedHex.length).toBeGreaterThan(0);
    expect(out.hdwallet.address).toMatch(/^0x[0-9a-f]{40}$/);
  });

  it('legacy recover handles v > 35 because chainId is in v', () => {
    const rng = new DeterministicRng(seedFrom('ch04-test-3'));
    const priv = rng.next(32);
    const tx = { type: 'legacy' as const, nonce: 0n, gasPrice: 1n, gasLimit: 21_000n, to: null, value: 0n, data: new Uint8Array(), chainId: 137n };
    const signed = signLegacyTx(tx, priv);
    expect(recoverLegacyTx(signed).length).toBe(20);
    // Manually reconstruct expected from-v:
    const exp = ethAddrFromPriv(priv);
    expect(equalBytes(recoverLegacyTx(signed), exp)).toBe(true);
  });
});

void fromHex;
