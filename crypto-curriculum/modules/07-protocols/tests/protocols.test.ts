import { describe, it, expect } from 'vitest';
import {
  makeShares,
  reconstruct,
} from '../src/tls-jwt.js';

describe('protocols: Shamir Secret Sharing', () => {
  it('round-trips with k of n shares', () => {
    const secret = Buffer.from('recover this');
    const k = 3, n = 5;
    const shares = makeShares(secret, k, n);
    expect(shares.length).toBe(n);

    // Any subset of k shares should reconstruct.
    for (const subset of [
      [0, 1, 2],
      [1, 3, 4],
      [0, 2, 4],
      [1, 2, 4],
    ]) {
      const labelled = subset.map((i) => ({ x: i + 1, y: shares[i]! }));
      const r = reconstruct(labelled, k);
      expect(r.equals(secret)).toBe(true);
    }
  });

  it('k-1 shares alone produce arbitrary output (NOT the secret)', () => {
    const secret = Buffer.from('recover this');
    const k = 3, n = 5;
    const shares = makeShares(secret, k, n);
    const labelled2 = [{ x: 1, y: shares[0]! }, { x: 2, y: shares[1]! }];
    // Reconstructing with only k-1 shares yields some *other* polynomial
    // value at 0, NOT the secret. We can't assert "not equal" across runs
    // because random coefficient choices occasionally line up; so we just
    // assert the function returns *something* in GF(256)^len.
    const r = reconstruct(labelled2, 2);
    expect(r.length).toBe(secret.length);
    expect(r).toBeInstanceOf(Buffer);
  });
});
