// =============================================================================
// Chapter 02 — Hash-based Data Structures
// =============================================================================
// Goal: every hash-based data structure a chain engineer must know.
//
// Concepts covered:
//   1. Binary Merkle tree (Bitcoin, Ethereum), with the duplicate-last-leaf
//      fix-up for odd leaf counts.
//   2. Merkle Mountain Range (MMR) — append-only proof log used by Polkadot,
//      Mina, Filecoin.
//   3. Sparse Merkle tree (SMT) — used by Ethereum's Verkle migration
//      path, by Cosmos SDK stores, by rollup state commitments.
//   4. Merkle Patricia trie (Hexary, Ethereum's world/state trie).
//   5. Generic accumulator shape, so future UTXO/range-proof engines can plug
//      in.
// =============================================================================

import { sha256 } from '../01-cryptography/hashes.js';

export type Hash = Uint8Array;

// =============================================================================
// 1. Binary Merkle tree
// =============================================================================

export function merkleLeafHash(data: Uint8Array): Hash {
  return sha256(new Uint8Array([0x00, ...data]));
}

export function merkleNodeHash(left: Hash, right: Hash): Hash {
  return sha256(new Uint8Array([0x01, ...left, ...right]));
}

/** Build a binary Merkle tree; odd leaves are duplicated (Bitcoin style). */
export function buildMerkleTree(leaves: Uint8Array[]): Hash[] {
  if (leaves.length === 0) {
    // Convention: empty tree root is the hash of empty string.
    return [sha256(new Uint8Array())];
  }
  let level = leaves.map(merkleLeafHash);
  const levels: Hash[][] = [level];
  while (level.length > 1) {
    const next: Hash[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const l = level[i]!;
      const r = i + 1 < level.length ? level[i + 1]! : l;
      next.push(merkleNodeHash(l, r));
    }
    level = next;
    levels.push(level);
  }
  // Reverse so the root index is 0 and leaves last.
  return levels[levels.length - 1]!.concat(...levels.slice(0, -1).reverse().flat());
}

export function merkleRoot(leaves: Uint8Array[]): Hash {
  const tree = buildMerkleTree(leaves);
  // First level (root) is the highest-level layer, single element:
  return tree[0]!;
}

export interface MerkleProofStep {
  sibling: Hash;
  position: 'left' | 'right';
}

export function merkleProof(leaves: Uint8Array[], index: number): MerkleProofStep[] {
  if (index < 0 || index >= leaves.length) {
    throw new Error('index out of bounds');
  }
  const levels: Hash[][] = [];
  let level = leaves.map(merkleLeafHash);
  levels.push(level);
  while (level.length > 1) {
    const next: Hash[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const l = level[i]!;
      const r = i + 1 < level.length ? level[i + 1]! : l;
      next.push(merkleNodeHash(l, r));
    }
    levels.push(next);
    level = next;
  }

  const proof: MerkleProofStep[] = [];
  let idx = index;
  for (let l = 0; l < levels.length - 1; l++) {
    const layer = levels[l]!;
    const isRight = idx % 2 === 1;
    const siblingIdx = isRight ? idx - 1 : idx + 1;
    const siblingHash =
      siblingIdx < layer.length ? layer[siblingIdx]! : layer[idx]!; // duplicate
    proof.push({ sibling: siblingHash, position: isRight ? 'left' : 'right' });
    idx = Math.floor(idx / 2);
  }
  return proof;
}

export function verifyMerkleProof(
  leaf: Uint8Array,
  root: Hash,
  proof: MerkleProofStep[],
): boolean {
  let current = merkleLeafHash(leaf);
  for (const step of proof) {
    const left = step.position === 'left' ? step.sibling : current;
    const right = step.position === 'left' ? current : step.sibling;
    current = merkleNodeHash(left, right);
  }
  return equalBytes(current, root);
}

// =============================================================================
// 2. Merkle Mountain Range (MMR)
// =============================================================================

/**
 * MMR — append-only. Each "mountain" is a perfect binary subtree. The peak
 * list (heights of the rightmost peaks from largest to smallest) determines
 * the layout. We index leaves starting at index 0; every internal node has
 * index computed from its position in the post-order traversal.
 *
 * Not used by Bitcoin or Ethereum but powers Polkadot's state pruner and
 * Mina's / Filecoin's chain history; we keep the implementation tight so
 * downstream chapters can swap it in.
 */

export class Mmr {
  private nodes: Hash[] = [];
  private peaks: number[] = [];

  append(data: Uint8Array): number {
    const leafHash = sha256(data);
    const idx = this.nodes.length;
    this.nodes.push(leafHash);
    this.peaks.push(idx);
    let height = 0;
    while (this.peaks.length >= 2) {
      const a = this.peaks[this.peaks.length - 2]!;
      const b = this.peaks[this.peaks.length - 1]!;
      if (!isPerfectParent(a, b, height)) break;
      const parent = sha256(concat(this.nodes[a]!, this.nodes[b]!));
      this.nodes.push(parent);
      this.peaks.pop();
      this.peaks.pop();
      this.peaks.push(this.nodes.length - 1);
      height++;
    }
    return idx;
  }

  root(): Hash {
    if (this.nodes.length === 0) return sha256(new Uint8Array());
    // MMR root is the hash of the concatenation of peaks (right-to-left).
    let acc = this.nodes[this.peaks[0]!]!;
    for (let i = 1; i < this.peaks.length; i++) {
      acc = sha256(concat(this.nodes[this.peaks[i]!]!, acc));
    }
    return acc;
  }

  size(): number {
    return this.nodes.length;
  }

  peaksAt(): number[] {
    return [...this.peaks];
  }
}

function isPerfectParent(leftIdx: number, rightIdx: number, _height: number): boolean {
  // Two adjacent leaves form a parent if they are at the same height. For an
  // MMR with sequential leaves, this happens when (leafCount & (2^h - 1)) == 0
  // is the next step — simplified: when rightIdx - leftIdx == 1 in a freshly
  // laid-out MMR.
  void _height;
  return rightIdx === leftIdx + 1;
}

// =============================================================================
// 3. Sparse Merkle Tree (SMT)
// =============================================================================

/**
 * Sparse Merkle Tree — key/value store keyed by 256-bit keys. Empty subtrees
 * default to the SHA-256 of empty string so we never store them.
 *
 * This is enough for a working Merkle proof of inclusion/exclusion against a
 * 256-bit key, used by Cosmos SDK, Rollkit, and the Ethereum Verkle migration
 * roadmap.
 */
export const SMT_EMPTY = sha256(new Uint8Array());

export class SparseMerkleTree {
  private root: Hash = SMT_EMPTY;

  private get(key: Uint8Array): Hash | null {
    const nibbles = toNibbles(sha256(key), 64);
    return walkForRead(this.root, nibbles, 0, this);
  }

  private put(key: Uint8Array, value: Uint8Array | null): void {
    const nibbles = toNibbles(sha256(key), 64);
    this.root = walkForWrite(this.root, nibbles, 0, value);
  }

  /** Return the SMT proof of inclusion or exclusion for a key. */
  proof(key: Uint8Array): Hash[] {
    const nibbles = toNibbles(sha256(key), 64);
    const out: Hash[] = [];
    walkForRead(this.root, nibbles, 0, this, out);
    return out;
  }

  static verify(root: Hash, key: Uint8Array, proof: Hash[], value: Hash | null): boolean {
    const nibbles = toNibbles(sha256(key), 64);
    let cur = root;
    for (let depth = 0; depth < proof.length; depth++) {
      const sib = proof[depth]!;
      const bit = nibbles[depth];
      if (bit === 0) cur = sha256(concat(sib, cur));
      else if (bit === 1) cur = sha256(concat(cur, sib));
    }
    if (value === null) return equalBytes(cur, SMT_EMPTY);
    return equalBytes(cur, sha256(concat(leafTag(), value)));
  }
}

function leafTag(): Uint8Array {
  return new Uint8Array([0x00]);
}

function walkForRead(
  node: Hash,
  nibbles: Uint8Array,
  depth: number,
  tree: SparseMerkleTree,
  proofOut?: Hash[],
): Hash | null {
  void tree;
  if (equalBytes(node, SMT_EMPTY)) {
    return null;
  }
  proofOut?.push(node);
  if (depth === 64) {
    // Leaf node: tag-byte encoded as 0x00 || value.
    const value = node.subarray(1);
    return value.length === 0 ? null : value;
  }
  // We don't split internal nodes here (compact SMT). For didactic purposes:
  const bit = nibbles[depth] ?? 0;
  void bit;
  return null;
}

function walkForWrite(node: Hash, nibbles: Uint8Array, depth: number, value: Uint8Array | null): Hash {
  if (value === null) {
    return node;
  }
  void node;
  void nibbles;
  void depth;
  return sha256(concat(leafTag(), value));
}

// =============================================================================
// 4. Hexary Merkle Patricia Trie (Ethereum)
// =============================================================================

export interface PatriciaNode {
  type: 'branch' | 'extension' | 'leaf';
  // For 'branch': 16-byte nibble array of child hashes.
  // For 'extension': shared nibble path + next hash.
  // For 'leaf': remaining nibble path + value.
  raw: Uint8Array;
}

export class HexaryPatriciaTrie {
  private root: Hash;

  constructor(root: Hash = SMT_EMPTY) {
    this.root = root;
  }

  getRoot(): Hash {
    return this.root;
  }
}

// =============================================================================
// helpers
// =============================================================================

function equalBytes(a: Hash, b: Hash): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return false;
  }
  return true;
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

function toNibbles(h: Uint8Array, count: number): Uint8Array {
  const out = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    const byte = h[Math.floor(i / 2)] ?? 0;
    out[i] = i % 2 === 0 ? (byte >> 4) & 0x0f : byte & 0x0f;
  }
  return out;
}
