// =============================================================================
// Chapter 06 — Consensus Protocols
// =============================================================================
// Goal: every consensus family a chain engineer must understand.
//
// Concepts covered:
//   1. Proof-of-Work (PoW) — Hashcash-style puzzles used in Bitcoin: search
//      for a nonce whose block header hash is below the difficulty target.
//   2. Proof-of-Stake — Casper FFG, a minimal viability handler used
//      alongside LMD-GHOST in Ethereum's Beacon Chain.
//   3. BFT-style consensus — HotStuff / Tendermint quorums, lock-replace
//      rules, leader-based two-round voting.
//   4. Proof of History (PoH) — Solana's verifiable delay function built on
//      sequential hashing, used to timestamp events between leader rotations.
//   5. Finality gadgets — Casper FFG checkpoint, justified vs. finalized.
//
// References:
//   - Buterin & Griffith, Casper FFG: https://arxiv.org/abs/1710.09437
//   - Yin et al., HotStuff: https://arxiv.org/abs/1803.05069
//   - Yakovenko, PoH: https://solana.com/solana-whitepaper.pdf
// =============================================================================

import { sha256, sha256d } from '../01-cryptography/hashes.js';
import { aggregateBls, verifyBls } from '../01-cryptography/signatures.js';
import { bls12_381 } from '@noble/curves/bls12-381';
import { toHex } from '../03-encoding/index.js';

// =============================================================================
// 1. Proof of Work
// =============================================================================

export interface MiningTemplate {
  prevBlock: Uint8Array;
  merkleRoot: Uint8Array;
  timestamp: number;
  bits: number;
}

export interface MinedBlock {
  template: MiningTemplate;
  nonce: number;
  hash: Uint8Array;
}

export function mine(template: MiningTemplate, maxIterations: number): MinedBlock | null {
  const target = compactToTarget(template.bits);
  for (let n = 0; n < maxIterations; n++) {
    const header = serializeMiningHeader(template, n);
    const h = sha256d(header);
    if (hashAsBigInt(h) <= target) {
      return { template, nonce: n, hash: h };
    }
  }
  return null;
}

export function serializeMiningHeader(template: MiningTemplate, nonce: number): Uint8Array {
  const out = new Uint8Array(80);
  out.set(template.prevBlock, 0);
  out.set(template.merkleRoot, 32);
  out[64] = template.timestamp & 0xff;
  out[65] = (template.timestamp >> 8) & 0xff;
  out[66] = (template.timestamp >> 16) & 0xff;
  out[67] = (template.timestamp >> 24) & 0xff;
  out[68] = template.bits & 0xff;
  out[69] = (template.bits >> 8) & 0xff;
  out[70] = (template.bits >> 16) & 0xff;
  out[71] = (template.bits >> 24) & 0xff;
  out[72] = nonce & 0xff;
  out[73] = (nonce >> 8) & 0xff;
  out[74] = (nonce >> 16) & 0xff;
  out[75] = (nonce >> 24) & 0xff;
  return out;
}

function compactToTarget(nBits: number): bigint {
  const exp = (nBits >>> 24) & 0xff;
  const mant = BigInt(nBits & 0xffffff);
  return exp <= 3 ? mant >> BigInt(8 * (3 - exp)) : mant << BigInt(8 * (exp - 3));
}

function hashAsBigInt(h: Uint8Array): bigint {
  let v = 0n;
  for (let i = 0; i < h.length; i++) v = (v << 8n) | BigInt(h[i] ?? 0);
  return v;
}

// =============================================================================
// 2. Casper FFG — finality gadget
// =============================================================================

/**
 * A checkpoint is a pair (epoch, block_hash) the validator set "votes for".
 * The validator votes with BLS over (source_epoch, target_epoch, block_hash).
 *
 * The FFG state transition rule (Caspar's "justification-finalization" rules):
 *   - Justified: a checkpoint receiving a vote from 2/3+ of stake.
 *   - Finalized: a checkpoint C is finalized when its child C' is justified
 *     and at least one of C's ancestors (the "supermajority link") exists,
 *     while C is itself justified.
 *   - Slashing condition: conflicting votes (same height, different hash).
 *
 * This module exposes a minimal viable validator-machine so we can simulate
 * rule-outcomes without a full blockchain simulation.
 */

export interface Checkpoint {
  epoch: bigint;
  blockHash: Uint8Array;
}

export interface FfgVote {
  validator: bigint; // BLS public key
  source: Checkpoint;
  target: Checkpoint;
  signature: Uint8Array;
}

export interface FfgState {
  epochs: Map<bigint, bigint>; // epoch → cumulative stake voting into it
  totalStake: bigint;
  justified: Set<string>;
  finalized: Set<string>;
}

export function newFfgState(validators: Uint8Array[], stakePerValidator: bigint): FfgState {
  const total = BigInt(validators.length) * stakePerValidator;
  return {
    epochs: new Map(),
    totalStake: total,
    justified: new Set(),
    finalized: new Set(),
  };
}

export function checkFfgVote(state: FfgState, vote: FfgVote, stake: bigint): boolean {
  void state;
  void vote;
  // Verify the BLS signature over the canonical (source, target) payload.
  // For didactic purposes we skip full verification; real clients check the
  // signature here.
  void stake;
  return true;
}

function checkpointKey(c: Checkpoint): string {
  return `${c.epoch.toString(16)}:${toHex(c.blockHash)}`;
}

/**
 * Apply an FFG vote and return whether the new state has finalized a new
 * checkpoint.
 */
export function applyFfgVote(state: FfgState, vote: FfgVote, voteStake: bigint): 'new-justified' | 'new-finalized' | null {
  const key = checkpointKey(vote.target);
  if (state.justified.has(key)) return null;
  const currentStake = state.epochs.get(vote.target.epoch) ?? 0n;
  const newStake = currentStake + voteStake;
  state.epochs.set(vote.target.epoch, newStake);
  if (newStake * 3n >= state.totalStake * 2n) {
    state.justified.add(key);
    // Finalization: target is finalized if its source is also justified.
    const srcKey = checkpointKey(vote.source);
    if (state.justified.has(srcKey)) {
      state.finalized.add(key);
      return 'new-finalized';
    }
    return 'new-justified';
  }
  return null;
}

// =============================================================================
// 3. HotStuff / Tendermint BFT — leader-based two-round voting
// =============================================================================

/**
 * Minimal HotStuff voting simulator. Validators cast votes over a proposal;
 * safety requires that any two of them overlap in the quorum (2/3+). We
 * implement only the quorum check, not the full Pacemaker.
 */
export class HotStuffQuorum {
  private readonly validators: Uint8Array[];
  private readonly quorum: number; // floor(2N/3) + 1

  constructor(validators: Uint8Array[]) {
    this.validators = validators;
    this.quorum = Math.floor((validators.length * 2) / 3) + 1;
  }

  size(): number {
    return this.validators.length;
  }

  hasQuorum(signerCount: number): boolean {
    return signerCount >= this.quorum;
  }

  /**
   * Aggregate BLS votes. Returns the aggregate signature + bitmap of signers.
   * Real HotStuff additionally checks that all signers are in the active set.
   */
  aggregate(votes: Uint8Array[]): Uint8Array {
    return aggregateBls(votes);
  }

  verifyAggregate(agg: Uint8Array, msg: Uint8Array, signers: Uint8Array[]): boolean {
    return verifyBls(agg, msg, bls12_381.aggregatePublicKeys(signers));
  }
}

// =============================================================================
// 4. Proof of History (PoH)
// =============================================================================

/**
 * Sequentially hash a counter to produce a verifiable delay function (VDF).
 * Each output depends on the previous one, so producing N outputs requires
 * at least N hashes — parallel hardware cannot shortcut it.
 */
export class Poh {
  private counter: bigint = 0n;
  private state: Uint8Array;

  constructor(seed: Uint8Array) {
    this.state = sha256(seed);
  }

  /** Append `ticks` hashes; return the latest hash and counter. */
  tick(n: number): { state: Uint8Array; counter: bigint } {
    for (let i = 0; i < n; i++) {
      this.state = sha256(this.state);
      this.counter += 1n;
    }
    return { state: new Uint8Array(this.state), counter: this.counter };
  }

  /** Append an external event into the sequence so its timestamp is recorded. */
  recordEvent(event: Uint8Array): { hash: Uint8Array; counter: bigint } {
    this.state = sha256(this.state);
    this.counter += 1n;
    this.state = sha256(new Uint8Array([...this.state, ...event]));
    this.counter += 1n;
    return { hash: new Uint8Array(this.state), counter: this.counter };
  }

  current(): { state: Uint8Array; counter: bigint } {
    return { state: new Uint8Array(this.state), counter: this.counter };
  }
}

// =============================================================================
// 5. demo
// =============================================================================

import { DeterministicRng, seedFrom } from '../_rng.js';

export interface Chapter06DemoResult {
  pow: { nonce: number; hash: string };
  poh: { ticks: number; hash: string };
  hotstuff: { quorum: number; validatorCount: number };
  ffgFinalized: number;
}

export function demo(): Chapter06DemoResult {
  const rng = new DeterministicRng(seedFrom('ch06-demo-v1'));
  void rng.next(8);

  // PoW: mine a tiny block (high target so we find a solution quickly).
  const tpl: MiningTemplate = {
    prevBlock: new Uint8Array(32),
    merkleRoot: sha256(new Uint8Array(10).fill(0xab)),
    timestamp: 1_700_000_000,
    bits: 0x207fffff,
  };
  const mined = mine(tpl, 100_000);
  if (!mined) throw new Error('no nonce found');

  // PoH: produce 100 ticks.
  const poh = new Poh(new Uint8Array(32));
  poh.tick(100);
  const pohState = poh.current();

  // HotStuff: 4 validators → quorum 3.
  const validators = [0, 1, 2, 3].map((i) => bls12_381.getPublicKey(new Uint8Array(32).fill(i + 1)));
  const hs = new HotStuffQuorum(validators);

  // FFG: simulate a 1-validator state and 1 vote.
  const state = newFfgState(validators, 32n);
  // Construct a minimal FFG vote; the sig check passes by definition in the demo.
  const ckA: Checkpoint = { epoch: 0n, blockHash: new Uint8Array(32) };
  const ckB: Checkpoint = { epoch: 1n, blockHash: sha256(new Uint8Array([1])) };
  const sigs = signPlaceholder(ckB);
  const vote: FfgVote = { validator: 1n, source: ckA, target: ckB, signature: sigs };
  state.justified.add(checkpointKey(ckA));
  applyFfgVote(state, vote, 32n);

  return {
    pow: { nonce: mined.nonce, hash: toHex(mined.hash) },
    poh: { ticks: Number(pohState.counter), hash: toHex(pohState.state) },
    hotstuff: { quorum: hs.hasQuorum(3) ? 3 : 4, validatorCount: hs.size() },
    ffgFinalized: state.finalized.size,
  };
}

function signPlaceholder(_ck: Checkpoint): Uint8Array {
  // Demo placeholder: produce a 96-byte zero signature. Real FFG requires a
  // real BLS signature over (source, target) payload.
  return new Uint8Array(96);
}
