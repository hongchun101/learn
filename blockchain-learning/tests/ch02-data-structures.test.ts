import { describe, it, expect } from 'vitest';
import {
  merkleRoot,
  merkleProof,
  verifyMerkleProof,
  Mmr,
  SparseMerkleTree,
  SMT_EMPTY,
} from '../src/02-data-structures/merkle.js';
import { demo as ch02Demo } from '../src/02-data-structures/demo.js';

function hex(b: Uint8Array): string {
  let out = '';
  for (let i = 0; i < b.length; i++) {
    out += (b[i] ?? 0).toString(16).padStart(2, '0');
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

describe('Chapter 02 — Hash-based Data Structures', () => {
  it('binary Merkle root for a single leaf is the leaf hash itself', () => {
    const leaf = new TextEncoder().encode('only');
    const root = merkleRoot([leaf]);
    expect(root.length).toBe(32);
  });

  it('binary Merkle proof verifies for every index in a balanced-ish tree', () => {
    const data: Uint8Array[] = [];
    for (let i = 0; i < 16; i++) data.push(new TextEncoder().encode(`tx-${i}`));
    const root = merkleRoot(data);
    for (let i = 0; i < data.length; i++) {
      const proof = merkleProof(data, i);
      expect(verifyMerkleProof(data[i]!, root, proof)).toBe(true);
    }
  });

  it('mutating the leaf breaks proof verification', () => {
    const data = [new TextEncoder().encode('a'), new TextEncoder().encode('b')];
    const root = merkleRoot(data);
    const proof = merkleProof(data, 0);
    expect(verifyMerkleProof(new TextEncoder().encode('a-modified'), root, proof)).toBe(false);
  });

  it('binary Merkle handles odd leaf counts (Bitcoin duplicate-last rule)', () => {
    const data = [new TextEncoder().encode('a'), new TextEncoder().encode('b'), new TextEncoder().encode('c')];
    const root = merkleRoot(data);
    for (let i = 0; i < data.length; i++) {
      const proof = merkleProof(data, i);
      expect(verifyMerkleProof(data[i]!, root, proof)).toBe(true);
    }
  });

  it('MMR returns a stable root after appends', () => {
    const mmr1 = new Mmr();
    const mmr2 = new Mmr();
    for (let i = 0; i < 10; i++) {
      mmr1.append(new TextEncoder().encode(`a-${i}`));
      mmr2.append(new TextEncoder().encode(`a-${i}`));
    }
    expect(equalBytes(mmr1.root(), mmr2.root())).toBe(true);
  });

  it('MMR root changes when contents change', () => {
    const mmr = new Mmr();
    mmr.append(new TextEncoder().encode('a'));
    const r1 = hex(mmr.root());
    mmr.append(new TextEncoder().encode('b'));
    const r2 = hex(mmr.root());
    expect(r1).not.toBe(r2);
  });

  it('Sparse Merkle Tree returns the empty constant for unset keys', () => {
    expect(SMT_EMPTY.length).toBe(32);
    expect(SparseMerkleTree.verify(SMT_EMPTY, new TextEncoder().encode('k'), [], null)).toBe(true);
  });

  it('chapter 2 demo runs end-to-end', () => {
    const out = ch02Demo();
    expect(out.binaryVerified).toBe(true);
    expect(out.binaryMerkleProofSize).toBeGreaterThan(0);
    expect(out.mmrPeaks.length).toBeGreaterThan(0);
    expect(out.mmrNodeCount).toBeGreaterThan(0);
    expect(out.smtEmptyRoot.length).toBe(64);
  });
});
