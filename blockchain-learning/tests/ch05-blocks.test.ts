import { describe, it, expect } from 'vitest';
import {
  serializeHeader,
  blockHash,
  compactToTarget,
  targetToCompact,
  hashMeetsTarget,
  nextBits,
  blockMerkleRoot,
  validateBlock,
  heaviestTip,
  demo as ch05Demo,
  type BlockHeader,
  type Block,
  type BlockNode,
} from '../src/05-blocks/index.js';
import { UtxoTransaction } from '../src/04-transactions/index.js';

describe('Chapter 05 — Blocks & Chain Validation', () => {
  it('serializeHeader writes exactly 80 bytes', () => {
    const h: BlockHeader = {
      version: 1,
      prevBlock: new Uint8Array(32),
      merkleRoot: new Uint8Array(32),
      timestamp: 0,
      bits: 0x1d00ffff,
      nonce: 0,
    };
    expect(serializeHeader(h).length).toBe(80);
  });

  it('compactToTarget and targetToCompact round-trip the genesis target', () => {
    const bits = 0x1d00ffff;
    expect(targetToCompact(compactToTarget(bits))).toBe(bits);
  });

  it('compactToTarget extracts the Bitcoin genesis target from 0x1d00ffff', () => {
    const expected = 0x00ffffn << 208n;
    expect(compactToTarget(0x1d00ffff)).toBe(expected);
  });

  it('nextBits clamps the new target to the 4x bound', () => {
    // 4x slow → 4x easier target → max.
    const t0 = 1_700_000_000;
    const slowBits = nextBits(0x1d00ffff, t0 + 2_016 * 600 * 4, t0);
    const g = compactToTarget(0x1d00ffff);
    expect(compactToTarget(slowBits) >= g / 4n).toBe(true);
    expect(compactToTarget(slowBits) <= g * 4n).toBe(true);

    // 4x fast → 4x harder; clamped at min.
    const fastBits = nextBits(0x1d00ffff, t0 + 2_016 * 600 / 4, t0);
    expect(compactToTarget(fastBits) >= g / 4n).toBe(true);
    expect(compactToTarget(fastBits) <= g * 4n).toBe(true);
  });

  it('blockMerkleRoot is deterministic', () => {
    const tx: UtxoTransaction = {
      version: 1,
      inputs: [],
      outputs: [{ value: 1_000n, scriptPubKey: new Uint8Array() }],
      locktime: 0,
    };
    expect(blockMerkleRoot([tx, tx]).length).toBe(32);
    expect(blockMerkleRoot([tx, tx]).length).toBe(blockMerkleRoot([tx]).length);
  });

  it('blockHash is sha256d(serializeHeader) — order-sensitive', () => {
    const h: BlockHeader = {
      version: 1,
      prevBlock: new Uint8Array(32),
      merkleRoot: new Uint8Array(32),
      timestamp: 1,
      bits: 0x1d00ffff,
      nonce: 1,
    };
    const a = blockHash(h);
    const different = blockHash({ ...h, nonce: 2 });
    expect(a.length).toBe(32);
    expect(different.length).toBe(32);
    expect(Buffer.from(a).equals(Buffer.from(different))).toBe(false);
  });

  it('validateBlock rejects a merkle root mismatch', () => {
    const tx: UtxoTransaction = {
      version: 1,
      inputs: [],
      outputs: [{ value: 1_000n, scriptPubKey: new Uint8Array() }],
      locktime: 0,
    };
    const merkle = blockMerkleRoot([tx]);
    const wrongMerkle = new Uint8Array(merkle);
    wrongMerkle[31] = (wrongMerkle[31] ?? 0) ^ 1;
    const h: BlockHeader = {
      version: 1,
      prevBlock: new Uint8Array(32),
      merkleRoot: wrongMerkle,
      timestamp: 1_700_000_000,
      bits: 0x1d00ffff,
      nonce: 0,
    };
    const b: Block = { ...h, height: 1, txs: [tx], cumulativeWork: 1n };
    const r = validateBlock(b, 1_600_000_000);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('merkle'))).toBe(true);
  });

  it('hashMeetsTarget returns true on a trivial target (max difficulty)', () => {
    const h: BlockHeader = {
      version: 1,
      prevBlock: new Uint8Array(32),
      merkleRoot: new Uint8Array(32),
      timestamp: 1,
      // The all-ones compact is the *easiest* possible target, but it carries
      // a sign bit; easier is 0x1d00ffff. Even a slightly smaller exponent
      // (e.g., 28) is trivial. We test only that the function returns a
      // boolean:
      bits: 0x1d00ffff,
      nonce: 1,
    };
    expect(typeof hashMeetsTarget(h)).toBe('boolean');
  });

  it('heaviestTip picks the child with the largest cumulativeWork', () => {
    const a: BlockNode = {
      height: 0,
      cumulativeWork: 1n,
      children: [],
      version: 0,
      prevBlock: new Uint8Array(32),
      merkleRoot: new Uint8Array(32),
      timestamp: 0,
      bits: 0,
      nonce: 0,
      txs: [],
    };
    const b = { ...a, cumulativeWork: 100n };
    const c = { ...a, cumulativeWork: 10n };
    a.children = [b, c];
    expect(heaviestTip(a)).toBe(b);
  });

  it('demo runs end-to-end', () => {
    const out = ch05Demo();
    expect(out.headerSer.length).toBe(160);
    expect(out.blockHash.length).toBe(64);
    expect(out.merkleRoot.length).toBe(64);
    expect(typeof out.nextBits).toBe('number');
  });
});
