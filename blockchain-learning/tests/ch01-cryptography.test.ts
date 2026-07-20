import { describe, it, expect } from 'vitest';
import {
  sha256,
  sha256d,
  keccak256,
  ripemd160,
  hash160,
  blake2b256,
} from '../src/01-cryptography/hashes.js';
import { hmacSha256, hkdfSha256, deriveEthereumChainKey } from '../src/01-cryptography/kdf.js';
import {
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
  publicKeyFromPrivate,
  decompressSecp256k1,
  isLowS,
  normalizeLowS,
  taggedHash,
} from '../src/01-cryptography/signatures.js';
import { ed25519 } from '@noble/curves/ed25519';
import { bls12_381 } from '@noble/curves/bls12-381';
import { schnorr as schnorrSecp256k1 } from '@noble/curves/secp256k1';
import { buildP2shMultisigScript, isValidMultisigScript } from '../src/01-cryptography/multisig.js';
import { demo as ch01Demo } from '../src/01-cryptography/demo.js';
import { DeterministicRng, seedFrom } from '../src/_rng.js';

const SECP256K1_N =
  0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;

function hex(s: string): Uint8Array {
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < s.length; i += 2) {
    out[i / 2] = Number.parseInt(s.slice(i, i + 2), 16);
  }
  return out;
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return false;
  }
  return true;
}

describe('Chapter 01 — Cryptography', () => {
  it('sha256 matches FIPS empty-string vector', () => {
    expect(
      equalBytes(
        sha256(new Uint8Array()),
        hex('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'),
      ),
    ).toBe(true);
  });

  it('sha256("abc") matches FIPS vector', () => {
    expect(
      equalBytes(
        sha256(new TextEncoder().encode('abc')),
        hex('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'),
      ),
    ).toBe(true);
  });

  it('sha256d composes sha256 twice', () => {
    const x = new TextEncoder().encode('Block 0');
    expect(equalBytes(sha256d(x), sha256(sha256(x)))).toBe(true);
  });

  it('keccak256("") matches published reference vector', () => {
    expect(
      equalBytes(
        keccak256(new TextEncoder().encode('')),
        hex('c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470'),
      ),
    ).toBe(true);
  });

  it('hash functions return expected lengths', () => {
    const input = new Uint8Array(32);
    expect(keccak256(input).length).toBe(32);
    expect(ripemd160(input).length).toBe(20);
    expect(hash160(input).length).toBe(20);
    expect(blake2b256(input).length).toBe(32);
  });

  it('HMAC is deterministic and key/message-sensitive', () => {
    const k = new Uint8Array(32);
    const m = new TextEncoder().encode('message');
    expect(equalBytes(hmacSha256(k, m), hmacSha256(k, m))).toBe(true);
    expect(equalBytes(hmacSha256(k, m), hmacSha256(k, new TextEncoder().encode('diff')))).toBe(false);
  });

  it('HKDF request for N bytes returns exactly N bytes', () => {
    const ikm = sha256(new TextEncoder().encode('input'));
    const salt = new Uint8Array(32);
    const info = new TextEncoder().encode('app-context');
    expect(hkdfSha256(ikm, salt, info, 42).length).toBe(42);
  });

  it('ECDSA signs with low-S and recovers the expected public key', () => {
    const rng = new DeterministicRng(seedFrom('test-ecdsa-v1'));
    const sk = rng.next(32);
    const pk = publicKeyFromPrivate(sk);
    const msg = new TextEncoder().encode('hello');
    const digest = sha256(msg);
    const sig = signEcdsa(digest, sk);
    expect(isLowS(sig.s)).toBe(true);
    expect(verifyEcdsa(digest, { r: sig.r, s: sig.s }, pk)).toBe(true);
    const recovered = ecrecover(digest, sig);
    expect(equalBytes(recovered, decompressSecp256k1(pk))).toBe(true);
  });

  it('ECDSA normalization: high-S flips to low-S', () => {
    const highS = (SECP256K1_N >> 1n) + 5n;
    expect(isLowS(highS)).toBe(false);
    expect(isLowS(normalizeLowS(highS))).toBe(true);
    expect(normalizeLowS(highS)).toBe(SECP256K1_N - highS);
    const low = 123n;
    expect(normalizeLowS(low)).toBe(low);
  });

  it('Schnorr signs and verifies; mutating message breaks verification', () => {
    const rng = new DeterministicRng(seedFrom('test-schnorr-v1'));
    const sk = rng.next(32);
    const xonly = schnorrSecp256k1.getPublicKey(sk);
    const msg = new TextEncoder().encode('Taproot');
    const sig = signSchnorr(msg, sk);
    expect(verifySchnorr(msg, sig, xonly)).toBe(true);
    expect(verifySchnorr(new TextEncoder().encode('TaprooT'), sig, xonly)).toBe(false);
  });

  it('Ed25519 signs deterministically (RFC 8032)', () => {
    const rng = new DeterministicRng(seedFrom('test-ed25519-v1'));
    const sk = rng.next(32);
    const pk = ed25519.getPublicKey(sk);
    const msg = new TextEncoder().encode('Solana-style');
    const a = signEd25519(msg, sk);
    const b = signEd25519(msg, sk);
    expect(equalBytes(a, b)).toBe(true);
    expect(verifyEd25519(a, msg, pk)).toBe(true);
  });

  it('BLS aggregate verify holds for a small set of (msg,pk)', () => {
    const rng = new DeterministicRng(seedFrom('test-bls-v1'));
    const sk1 = rng.next(32);
    const sk2 = rng.next(32);
    const pk1 = bls12_381.getPublicKey(sk1);
    const pk2 = bls12_381.getPublicKey(sk2);
    const m1 = new TextEncoder().encode('vote-1');
    const m2 = new TextEncoder().encode('vote-2');
    const s1 = signBls(m1, sk1);
    const s2 = signBls(m2, sk2);
    expect(verifyBls(s1, m1, pk1)).toBe(true);
    expect(verifyBls(s2, m2, pk2)).toBe(true);
    const agg = aggregateBls([s1, s2]);
    expect(aggregateVerifyBls([m1, m2], agg, [pk1, pk2])).toBe(true);
  });

  it('BLS aggregate verify rejects when one message is changed', () => {
    const rng = new DeterministicRng(seedFrom('test-bls-v2'));
    const sk1 = rng.next(32);
    const sk2 = rng.next(32);
    const pk1 = bls12_381.getPublicKey(sk1);
    const pk2 = bls12_381.getPublicKey(sk2);
    const s1 = signBls(new TextEncoder().encode('a'), sk1);
    const s2 = signBls(new TextEncoder().encode('b'), sk2);
    const agg = aggregateBls([s1, s2]);
    expect(
      aggregateVerifyBls(
        [new TextEncoder().encode('a'), new TextEncoder().encode('WRONG')],
        agg,
        [pk1, pk2],
      ),
    ).toBe(false);
  });

  it('BIP-67 multisig script enforces lexicographic pubkey ordering', () => {
    const a = new Uint8Array(33);
    a[0] = 0x02;
    a[32] = 0x01;
    const b = new Uint8Array(33);
    b[0] = 0x03;
    b[32] = 0x02;
    const script = buildP2shMultisigScript({ m: 2, pubkeys: [b, a] });
    expect(script[script.length - 1]).toBe(0xae);
    expect(isValidMultisigScript(script)).toBe(true);
  });

  it('taggedHash ties the hash to the tag', () => {
    const m = new Uint8Array();
    const a = taggedHash('BIP-340/challenge', m);
    const b = taggedHash('BIP-340/challenge', m);
    expect(equalBytes(a, b)).toBe(true);
    const c = taggedHash('BIP-340/aux', m);
    expect(equalBytes(a, c)).toBe(false);
  });

  it('deriveEthereumChainKey is deterministic per index', () => {
    const sk = new Uint8Array(32);
    const a = deriveEthereumChainKey(sk, 0);
    const b = deriveEthereumChainKey(sk, 0);
    expect(equalBytes(a, b)).toBe(true);
    expect(a.length).toBe(32);
    expect(equalBytes(a, deriveEthereumChainKey(sk, 1))).toBe(false);
  });

  it('demo() returns expected shape for chapter 1', () => {
    const result = ch01Demo();
    expect(typeof result.sha256).toBe('string');
    expect(typeof result.keccak256).toBe('string');
    expect(result.ecdsa.v === 27 || result.ecdsa.v === 28).toBe(true);
    expect(result.ecdsa.verified).toBe(true);
    expect(result.schnorr.ok).toBe(true);
    expect(result.ed25519.ok).toBe(true);
    expect(result.bls.verified).toBe(true);
  });
});
