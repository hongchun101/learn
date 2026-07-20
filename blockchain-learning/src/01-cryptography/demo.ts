// Ch01 demo — end-to-end tour of the chapter, deterministic.

import { sha256, sha256d, keccak256, ripemd160, hash160, blake2b256 } from './hashes.js';
import { hmacSha256, hkdfSha256 } from './kdf.js';
import {
  signEcdsa,
  verifyEcdsa,
  ecrecover,
  signSchnorr,
  verifySchnorr,
  signEd25519,
  verifyEd25519,
  signBls,
  aggregateBls,
  aggregateVerifyBls,
  publicKeyFromPrivate,
  isLowS,
  normalizeLowS,
  generateKeypair,
} from './signatures.js';
import { ed25519 } from '@noble/curves/ed25519';
import { bls12_381 } from '@noble/curves/bls12-381';
import { schnorr as schnorrSecp256k1 } from '@noble/curves/secp256k1';
import { buildP2shMultisigScript, isValidMultisigScript } from './multisig.js';
import { DeterministicRng, seedFrom } from '../_rng.js';

export interface Chapter01DemoResult {
  sha256: string;
  sha256d: string;
  keccak256: string;
  ripemd160: string;
  hash160: string;
  blake2b256: string;
  hmacSha256: string;
  hkdf16: string;
  ecdsa: { r: string; s: string; v: number; verified: boolean; recoveredPubkey: string };
  schnorr: { sig: string; ok: boolean };
  ed25519: { ok: boolean };
  bls: { agg: string; verified: boolean };
  multisigScriptLength: number;
  lowS_negated: string;
}

export function demo(): Chapter01DemoResult {
  const rng = new DeterministicRng(seedFrom('chapter01-demo-v1'));

  const secpPrivA = rng.next(32);
  const secpPrivB = rng.next(32);
  const edPriv = rng.next(32);
  const blsPrivA = rng.next(32);
  const blsPrivB = rng.next(32);

  const aggPubkey = publicKeyFromPrivate(secpPrivA);
  const pubkeyB = publicKeyFromPrivate(secpPrivB);
  const xonlyPub = schnorrSecp256k1.getPublicKey(secpPrivA);

  const msg = new TextEncoder().encode('blockchain-learning chapter 01 demo');

  const h1 = sha256(msg);
  const h2 = sha256d(msg);
  const h3 = keccak256(msg);
  const h4 = ripemd160(msg);
  const h5 = hash160(msg);
  const h6 = blake2b256(msg);

  const mac = hmacSha256(h1, msg);
  const derived = hkdfSha256(h1, h2, msg, 16);

  const digest = sha256(msg);
  const sig = signEcdsa(digest, secpPrivA);
  const verified = verifyEcdsa(digest, sig, aggPubkey);
  const recovered = ecrecover(digest, sig);

  const schnorrSig = signSchnorr(msg, secpPrivA);
  const schnorrVerify = verifySchnorr(msg, schnorrSig, xonlyPub);

  const edPub = ed25519.getPublicKey(edPriv);
  const edSig = signEd25519(msg, edPriv);
  const edVerify = verifyEd25519(edSig, msg, edPub);

  const blsPubA = bls12_381.getPublicKey(blsPrivA);
  const blsPubB = bls12_381.getPublicKey(blsPrivB);
  const blsSigA = signBls(msg, blsPrivA);
  const blsSigB = signBls(msg, blsPrivB);
  const blsAgg = aggregateBls([blsSigA, blsSigB]);
  const blsAggVerify = aggregateVerifyBls([msg, msg], blsAgg, [blsPubA, blsPubB]);

  const multiScript = buildP2shMultisigScript({ m: 2, pubkeys: [aggPubkey, pubkeyB] });

  // exported helpers we want to exercise from the demo but don't otherwise
  // need to surface:
  void isLowS(sig.s);
  void isValidMultisigScript(multiScript);
  void generateKeypair;

  return {
    sha256: hex(h1),
    sha256d: hex(h2),
    keccak256: hex(h3),
    ripemd160: hex(h4),
    hash160: hex(h5),
    blake2b256: hex(h6),
    hmacSha256: hex(mac),
    hkdf16: hex(derived),
    ecdsa: { r: sig.r.toString(16), s: sig.s.toString(16), v: sig.v, verified, recoveredPubkey: hex(recovered) },
    schnorr: { sig: hex(schnorrSig), ok: schnorrVerify },
    ed25519: { ok: edVerify },
    bls: { agg: hex(blsAgg), verified: blsAggVerify },
    multisigScriptLength: multiScript.length,
    lowS_negated: normalizeLowS(0xdeadbeefn * 13n * 100n).toString(16),
  };
}

function hex(b: Uint8Array): string {
  let out = '';
  for (let i = 0; i < b.length; i++) {
    out += (b[i] ?? 0).toString(16).padStart(2, '0');
  }
  return out;
}
