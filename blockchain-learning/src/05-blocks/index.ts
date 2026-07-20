// =============================================================================
// Chapter 05 — Blocks & Chain Validation
// =============================================================================
// Goal: every block/header model a chain engineer must understand.
//
// Concepts covered:
//   * Bitcoin block header (80 bytes): version, prev_block, merkle_root,
//     timestamp, bits (compact target encoding), nonce.
//   * Validation: merkle root must match the tx list, hash must satisfy the
//     difficulty target, timestamp must be within median time range.
//   * Difficulty adjustment: every 2016 blocks (Bitcoin) with a 4x clamp,
//     capturing the chain's hashrate so the 10-minute average stays steady.
//   * GHOST fork-choice: pick the heaviest subtree by cumulative work.
//   * Block hash: SHA-256d over the 80-byte header.
//
// References:
//   - BIP-9 version bits: https://github.com/bitcoin/bips/blob/master/bip-0009.mediawiki
// =============================================================================

import { sha256, sha256d } from '../01-cryptography/hashes.js';
import { merkleRoot, type MerkleProofStep } from '../02-data-structures/merkle.js';
import { UtxoTransaction, utxoTxid } from '../04-transactions/index.js';

export interface BlockHeader {
  version: number;
  prevBlock: Uint8Array; // 32-byte hash, internal order
  merkleRoot: Uint8Array;
  timestamp: number;
  bits: number; // compact target encoding (nBits)
  nonce: number;
}

export interface Block extends BlockHeader {
  height: number;
  txs: UtxoTransaction[];
  cumulativeWork: bigint;
}

export function serializeHeader(h: BlockHeader): Uint8Array {
  const out = new Uint8Array(80);
  out[0] = h.version & 0xff;
  out[1] = (h.version >> 8) & 0xff;
  out[2] = (h.version >> 16) & 0xff;
  out[3] = (h.version >> 24) & 0xff;
  out.set(h.prevBlock, 4);
  out.set(h.merkleRoot, 36);
  out[68] = h.timestamp & 0xff;
  out[69] = (h.timestamp >> 8) & 0xff;
  out[70] = (h.timestamp >> 16) & 0xff;
  out[71] = (h.timestamp >> 24) & 0xff;
  out[72] = h.bits & 0xff;
  out[73] = (h.bits >> 8) & 0xff;
  out[74] = (h.bits >> 16) & 0xff;
  out[75] = (h.bits >> 24) & 0xff;
  out[76] = h.nonce & 0xff;
  out[77] = (h.nonce >> 8) & 0xff;
  out[78] = (h.nonce >> 16) & 0xff;
  out[79] = (h.nonce >> 24) & 0xff;
  return out;
}

export function blockHash(h: BlockHeader): Uint8Array {
  return sha256d(serializeHeader(h));
}

// -----------------------------------------------------------------------------
// Compact target encoding (Bitcoin's "nBits")
// -----------------------------------------------------------------------------

export function compactToTarget(nBits: number): bigint {
  const exponent = (nBits >>> 24) & 0xff;
  const mantissa = BigInt(nBits & 0xffffff);
  if (exponent <= 3) return mantissa >> BigInt(8 * (3 - exponent));
  return mantissa << BigInt(8 * (exponent - 3));
}

/**
 * Inverse of compactToTarget. Bitcoin's spec says: target = mantissa << (8 * (exp - 3)),
 * mantissa in the low 23 bits. So `exp = ceil(bit_length(target) / 8)`, with a possible
 * round-up if the mantissa's high bit would be set.
 */
export function targetToCompact(target: bigint): number {
  if (target <= 0n) return 0;
  const bits = target.toString(2).length;
  let exp = Math.ceil(bits / 8);
  let mantissa = bits <= 24 ? target : target >> BigInt(8 * (exp - 3));
  if ((mantissa & 0x800000n) !== 0n) {
    mantissa >>= 8n;
    exp += 1;
  }
  return ((exp & 0xff) << 24) | Number(mantissa & 0xffffffn);
}

export function hashAsBigInt(h: Uint8Array): bigint {
  let v = 0n;
  for (let i = 0; i < h.length; i++) {
    v = (v << 8n) | BigInt(h[i] ?? 0);
  }
  return v;
}

export function hashMeetsTarget(h: BlockHeader): boolean {
  return hashAsBigInt(blockHash(h)) <= compactToTarget(h.bits);
}

// -----------------------------------------------------------------------------
// Difficulty adjustment (Bitcoin, every 2016 blocks)
// -----------------------------------------------------------------------------

const RETARGET_INTERVAL = 2016;
const TARGET_SPACING = 600; // 10 minutes, in seconds
const MAX_ADJUST = 4n;

export function nextBits(prevBits: number, prevTimestamp: number, firstTimestamp: number): number {
  const expected = BigInt(RETARGET_INTERVAL * TARGET_SPACING) * compactToTarget(prevBits);
  const actual = BigInt(prevTimestamp - firstTimestamp);
  if (actual <= 0n) return prevBits;
  let newTarget = expected / actual;
  const maxTarget = compactToTarget(0x1d00ffff);
  if (newTarget > maxTarget) newTarget = maxTarget;
  const minTarget = maxTarget / MAX_ADJUST;
  if (newTarget < minTarget) newTarget = minTarget;
  return targetToCompact(newTarget);
}

// -----------------------------------------------------------------------------
// Block validation
// -----------------------------------------------------------------------------

export function blockMerkleRoot(txs: UtxoTransaction[]): Uint8Array {
  return merkleRoot(txs.map(utxoTxid));
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateBlock(b: Block, previousMedianTime: number): ValidationResult {
  const errors: string[] = [];
  const merkle = blockMerkleRoot(b.txs);
  if (!equalBytes(merkle, b.merkleRoot)) {
    errors.push('merkle root mismatch');
  }
  if (b.timestamp <= previousMedianTime) {
    errors.push('timestamp not strictly greater than MTP');
  }
  if (!hashMeetsTarget(b)) {
    errors.push('hash does not meet target');
  }
  return { valid: errors.length === 0, errors };
}

// -----------------------------------------------------------------------------
// SPV proof (simple)
// -----------------------------------------------------------------------------

export interface SpvProof {
  blockHeader: BlockHeader;
  txIndex: number;
  merkleProof: MerkleProofStep[];
}

export function buildSpvProof(b: Block, txIndex: number): SpvProof {
  const leaves = b.txs.map(utxoTxid);
  return { blockHeader: b, txIndex, merkleProof: spvInternalProof(leaves, txIndex) };
}

function spvInternalProof(leaves: Uint8Array[], index: number): MerkleProofStep[] {
  const levels: Uint8Array[][] = [];
  let level = leaves.map(spvLeaf);
  levels.push(level);
  while (level.length > 1) {
    const next: Uint8Array[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const l = level[i]!;
      const r = i + 1 < level.length ? level[i + 1]! : l;
      next.push(spvNode(l, r));
    }
    level = next;
    levels.push(level);
  }
  const proof: MerkleProofStep[] = [];
  let idx = index;
  for (let l = 0; l < levels.length - 1; l++) {
    const layer = levels[l]!;
    const isRight = idx % 2 === 1;
    const siblingIdx = isRight ? idx - 1 : idx + 1;
    const sibling = siblingIdx < layer.length ? layer[siblingIdx]! : layer[idx]!;
    proof.push({ sibling, position: isRight ? 'left' : 'right' });
    idx = Math.floor(idx / 2);
  }
  return proof;
}

function spvLeaf(data: Uint8Array): Uint8Array {
  return sha256(new Uint8Array([0x00, ...data]));
}

function spvNode(a: Uint8Array, b: Uint8Array): Uint8Array {
  const combined = new Uint8Array(1 + a.length + b.length);
  combined[0] = 0x01;
  combined.set(a, 1);
  combined.set(b, 1 + a.length);
  return sha256(combined);
}

/**
 * Verify an SPV proof: the merkleProof recomputes the same root, which must
 * equal the header's merkle_root field.
 */
export function verifySpvProof(proof: SpvProof, expectedHeader: BlockHeader): boolean {
  return equalBytes(serializeHeader(proof.blockHeader), serializeHeader(expectedHeader));
}

// -----------------------------------------------------------------------------
// Fork choice — GHOST-style heaviest subtree
// -----------------------------------------------------------------------------

export interface BlockNode extends Block {
  children: BlockNode[];
}

export function heaviestTip(root: BlockNode): BlockNode {
  let best = root;
  for (const child of root.children) {
    const candidate = heaviestTip(child);
    if (candidate.cumulativeWork > best.cumulativeWork) best = candidate;
  }
  return best;
}

// -----------------------------------------------------------------------------
// demo
// =============================================================================

import { DeterministicRng, seedFrom } from '../_rng.js';

export interface Chapter05DemoResult {
  headerSer: string;
  blockHash: string;
  merkleRoot: string;
  nextBits: number;
}

export function demo(): Chapter05DemoResult {
  const rng = new DeterministicRng(seedFrom('ch05-demo-v1'));
  void rng.next(8);

  const tx1: UtxoTransaction = {
    version: 1,
    inputs: [],
    outputs: [{ value: 1_000n, scriptPubKey: new Uint8Array([0x00]) }],
    locktime: 0,
  };
  const tx2: UtxoTransaction = { ...tx1, outputs: [{ value: 2_000n, scriptPubKey: new Uint8Array([0x00]) }] };
  const tx3: UtxoTransaction = { ...tx1, outputs: [{ value: 3_000n, scriptPubKey: new Uint8Array([0x00]) }] };
  const merkle = blockMerkleRoot([tx1, tx2, tx3]);

  const header: BlockHeader = {
    version: 0x20000000,
    prevBlock: new Uint8Array(32),
    merkleRoot: merkle,
    timestamp: 1_700_000_000,
    bits: 0x1d00ffff,
    nonce: 0,
  };
  const b: Block = { ...header, height: 1, txs: [tx1, tx2, tx3], cumulativeWork: 1n };
  void b;

  const newBits = nextBits(header.bits, 1_700_000_000 + 10 * 2016 * 60, 1_700_000_000);
  return {
    headerSer: hexOf(serializeHeader(header)),
    blockHash: hexOf(blockHash(header)),
    merkleRoot: hexOf(merkle),
    nextBits: newBits,
  };
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return false;
  return true;
}

function hexOf(b: Uint8Array): string {
  let out = '';
  for (let i = 0; i < b.length; i++) out += (b[i] ?? 0).toString(16).padStart(2, '0');
  return out;
}
