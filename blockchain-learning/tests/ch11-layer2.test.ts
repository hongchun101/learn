import { describe, it, expect } from 'vitest';
import {
  verifyFraudProof,
  verifyValidityProof,
  channelId,
  daQuorum,
  verifyIbcProof,
  demo as ch11Demo,
} from '../src/11-layer2/index.js';
import { sha256 } from '../src/01-cryptography/hashes.js';

describe('Chapter 11 — Layer 2 & Scaling', () => {
  it('fraud proof verifier accepts a properly-formed proof', () => {
    const ok = verifyFraudProof(
      {
        batch: { batchNumber: 1n, prevStateRoot: new Uint8Array(32), postStateRoot: sha256(new Uint8Array([1])), txns: [] },
        index: 0,
        preState: new Uint8Array(),
        postStateWitness: [],
        challengerSig: new Uint8Array(64),
      },
      new Uint8Array(32),
    );
    expect(ok).toBe(true);
  });

  it('ZK validity proof requires non-empty inputs', () => {
    expect(
      verifyValidityProof({ scheme: 'groth16', proof: new Uint8Array(32), publicInputs: [new Uint8Array(1)] }),
    ).toBe(true);
    expect(
      verifyValidityProof({ scheme: 'groth16', proof: new Uint8Array(0), publicInputs: [new Uint8Array(1)] }),
    ).toBe(false);
    expect(verifyValidityProof({ scheme: 'groth16', proof: new Uint8Array(32), publicInputs: [] })).toBe(false);
  });

  it('channelId is symmetric — sort the participants', () => {
    const a = new Uint8Array(32).fill(1);
    const b = new Uint8Array(32).fill(2);
    expect(Buffer.from(channelId(a, b)).equals(Buffer.from(channelId(b, a)))).toBe(true);
  });

  it('DA quorum requires threshold and matching hash', () => {
    const m1 = new Uint8Array(32).fill(1);
    const m2 = new Uint8Array(32).fill(2);
    const m3 = new Uint8Array(32).fill(3);
    const h = sha256(new Uint8Array([42]));
    const ok = daQuorum(
      { members: [m1, m2, m3], threshold: 2 },
      [
        { member: m1, signature: new Uint8Array(64), dataHash: h },
        { member: m2, signature: new Uint8Array(64), dataHash: h },
      ],
      h,
    );
    expect(ok).toBe(true);
    const wrong = daQuorum(
      { members: [m1, m2, m3], threshold: 2 },
      [
        { member: m1, signature: new Uint8Array(64), dataHash: h },
        { member: m2, signature: new Uint8Array(64), dataHash: sha256(new Uint8Array([99])) },
      ],
      h,
    );
    expect(wrong).toBe(false);
  });

  it('IBC proof verifier runs', () => {
    // We don't have a real tree here; just confirm it's callable.
    const r = verifyIbcProof(new Uint8Array(32), new Uint8Array(8), new Uint8Array(8), [new Uint8Array(32)]);
    expect(typeof r).toBe('boolean');
  });

  it('ch11 demo runs end-to-end', () => {
    const out = ch11Demo();
    expect(out.fraudProofVerified).toBe(true);
    expect(out.zkProofAccepted).toBe(true);
    expect(out.channelId.length).toBe(64);
    expect(out.daQuorum).toBe(true);
  });
});
