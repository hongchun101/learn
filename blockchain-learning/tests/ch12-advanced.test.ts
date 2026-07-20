import { describe, it, expect } from 'vitest';
import {
  selectBestBundle,
  pbsAuction,
  swap,
  tallyVotes,
  pedersenCommit,
  isLiquidatable,
  verifyCrossChainHeader,
  demo as ch12Demo,
} from '../src/12-advanced/index.js';

describe('Chapter 12 — Advanced Topics', () => {
  it('selectBestBundle returns the highest bid', () => {
    const best = selectBestBundle([
      { searcher: 'a', txBundle: [], bidAmount: 100n, estimatedProfit: 100n },
      { searcher: 'b', txBundle: [], bidAmount: 200n, estimatedProfit: 250n },
    ]);
    expect(best?.searcher).toBe('b');
  });

  it('pbsAuction assigns the highest-total builder to the proposer', () => {
    const r = pbsAuction(
      [
        { builder: 'b1', bundles: [{ searcher: 'a', txBundle: [], bidAmount: 100n, estimatedProfit: 100n }], blockData: new Uint8Array() },
        { builder: 'b2', bundles: [{ searcher: 'b', txBundle: [], bidAmount: 250n, estimatedProfit: 250n }], blockData: new Uint8Array() },
      ],
    );
    expect(r.proposer.chosenBuilder?.builder).toBe('b2');
  });

  it('swap returns an output that maintains the constant product (after fee)', () => {
    const result = swap({ reserveA: 1000n, reserveB: 1000n, feeNumerator: 3n }, 100n, true);
    expect(result.out).toBeGreaterThan(0n);
    expect(result.out).toBeLessThan(100n);
  });

  it('tallyVotes sums weights and counts yes/no', () => {
    const t = tallyVotes(
      { blockNumber: 1n, balances: new Map([['a', 60n], ['b', 40n]]) },
      new Map([['a', true], ['b', false]]),
    );
    expect(t.yes).toBe(60n);
    expect(t.no).toBe(40n);
  });

  it('pedersenCommit returns a compressed 33-byte point', () => {
    const c = pedersenCommit(42n, 7n);
    expect(c.length).toBe(33);
  });

  it('isLiquidatable thresholds correct', () => {
    expect(isLiquidatable({ collateral: 80n, debt: 110n, liquidationThreshold: 8000n })).toBe(true);
    expect(isLiquidatable({ collateral: 90n, debt: 100n, liquidationThreshold: 8000n })).toBe(false);
  });

  it('verifyCrossChainHeader returns a boolean', () => {
    expect(typeof verifyCrossChainHeader({ trustedRoot: new Uint8Array(32), trustedHeight: 0n }, new Uint8Array(32), [])).toBe('boolean');
  });

  it('ch12 demo runs end-to-end', () => {
    const out = ch12Demo();
    expect(out.bestBundleBid).toBe('200');
    expect(out.voteResult.yes).toBe('60');
    expect(out.voteResult.no).toBe('40');
    expect(out.liquidatable).toBe(true);
  });
});
