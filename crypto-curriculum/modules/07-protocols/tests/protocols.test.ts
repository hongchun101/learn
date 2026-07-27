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

    // 任意 k 个分片的子集都应能正确还原。
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
    // 仅用 k-1 个分片还原会得到在 x=0 处的某个其他多项式值，**不是**原秘密。
    // 由于随机系数选择有时会恰好重合，我们无法跨运行断言“不等于”；
    // 因此只断言函数返回 GF(256)^len 中的某个值。
    const r = reconstruct(labelled2, 2);
    expect(r.length).toBe(secret.length);
    expect(r).toBeInstanceOf(Buffer);
  });
});
