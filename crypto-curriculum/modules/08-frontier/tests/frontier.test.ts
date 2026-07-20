import { describe, it, expect } from 'vitest';
import {
  schnorrKeypair,
  schnorrProve,
  schnorrVerify,
  psiCa,
} from '../src/frontier.js';
import { randomBytes } from 'node:crypto';

describe('frontier: Schnorr identification', () => {
  it('round-trip', () => {
    const seed = randomBytes(32);
    const ctx = Buffer.from('ctx');
    const kp = schnorrKeypair(seed);
    const proof = schnorrProve(kp.sk, ctx);
    expect(schnorrVerify(kp.pk, ctx, proof)).toBe(true);
  });

  it('forgery (bad challenge) fails', () => {
    const seed = randomBytes(32);
    const ctx = Buffer.from('ctx');
    const kp = schnorrKeypair(seed);
    const proof = schnorrProve(kp.sk, ctx);
    expect(schnorrVerify(kp.pk, Buffer.from('other'), proof)).toBe(false);
  });
});

describe('frontier: PSI-CA', () => {
  it('reports the correct cardinality', () => {
    const setA = [Buffer.from('alice'), Buffer.from('bob'), Buffer.from('carol'), Buffer.from('dave')];
    const setB = [Buffer.from('alice'), Buffer.from('eve'), Buffer.from('carol'), Buffer.from('frank')];
    const card = psiCa(setA, setB);
    expect(card).toBe(2);
  });

  it('reports 0 when no overlap', () => {
    const setA = [Buffer.from('a'), Buffer.from('b')];
    const setB = [Buffer.from('c'), Buffer.from('d')];
    expect(psiCa(setA, setB)).toBe(0);
  });
});
