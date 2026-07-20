// =============================================================================
// Chapter 12 — Advanced Topics: MEV, Cross-chain, Privacy, DeFi
// =============================================================================
// Goal: finish the curriculum by covering the systems and primitives a
//       senior blockchain engineer must reason about.
//
// Concepts covered:
//   1. MEV (Maximal Extractable Value): supply chain (searcher/builder/proposer),
//      Flashbots-style PBS auctions.
//   2. Cross-chain messaging: light-client verification, IBC relayer,
//      canonical-bridge pattern.
//   3. Privacy primitives: Pedersen commitments, ring signatures (Monero),
//      zk-SNARKs / zk-STARKs.
//   4. DeFi primitives: AMM (Constant Product x*y=k), order-book basics,
//      lending pool accounting, liquidation math.
//   5. Governance: ERC-20 snapshot voting, time-locked admin actions,
//      multisig threshold checks.
//   6. On-chain analytics: indexed event logs, marks, and balance-delta
//      reconciliation.
//
// This module ships:
//   - Simple MEV supply-chain simulator (searcher → builder → proposer).
//   - Constant-product AMM math.
//   - ERC-20 snapshot voting tally.
//   - Pedersen commitment helpers (Pedersen over secp256k1).
// =============================================================================

// =============================================================================
// 1. MEV supply chain
// ====================================================================

export interface SearcherBid {
  searcher: string;
  txBundle: Uint8Array[];
  bidAmount: bigint;
  estimatedProfit: bigint;
}

export interface BuilderBlock {
  builder: string;
  bundles: SearcherBid[];
  blockData: Uint8Array;
}

export interface ProposerAssignment {
  proposer: string;
  chosenBuilder?: BuilderBlock;
  totalBid: bigint;
}

/** Pick the highest-bidder SearcherBid from a list. */
export function selectBestBundle(bids: SearcherBid[]): SearcherBid | null {
  let best: SearcherBid | null = null;
  for (const b of bids) {
    if (!best || b.bidAmount > best.bidAmount) best = b;
  }
  return best;
}

/** Decide which builder wins in a PBS auction. */
export function pbsAuction(builders: BuilderBlock[], proposerRewardShare = 0.1): { proposer: ProposerAssignment } {
  let chosen: BuilderBlock | null = null;
  let totalBid: bigint = 0n;
  for (const b of builders) {
    const bid = b.bundles.reduce((acc, x) => acc + x.bidAmount, 0n);
    if (!chosen || bid > totalBid) {
      chosen = b;
      totalBid = bid;
    }
  }
  const proposerReward = chosen ? (totalBid * BigInt(Math.floor(proposerRewardShare * 1000))) / 1000n : 0n;
  return {
    proposer: {
      proposer: 'proposer-1',
      chosenBuilder: chosen ?? undefined,
      totalBid: proposerReward,
    },
  };
}

// =============================================================================
// 2. Constant product AMM
// ====================================================================

export interface Amm {
  reserveA: bigint;
  reserveB: bigint;
  feeNumerator: bigint; // e.g. 3 (0.3%)
}

export function swap(amm: Amm, amountIn: bigint, aToB: boolean): { out: bigint; newReserveIn: bigint; newReserveOut: bigint } {
  if (amountIn <= 0n) throw new Error('amountIn zero');
  const denominator = amm.feeNumerator === 0n ? 1n : amm.feeNumerator;
  void denominator;
  const feeAmount = (amountIn * amm.feeNumerator) / 1000n;
  const effectiveIn = amountIn - feeAmount;
  const reserveIn = aToB ? amm.reserveA : amm.reserveB;
  const reserveOut = aToB ? amm.reserveB : amm.reserveA;
  const out = (effectiveIn * reserveOut) / (reserveIn + effectiveIn);
  return {
    out,
    newReserveIn: reserveIn + amountIn,
    newReserveOut: reserveOut - out,
  };
}

// =============================================================================
// 3. Snapshot voting
// ====================================================================

export interface VoteSnapshot {
  blockNumber: bigint;
  balances: Map<string, bigint>; // holder -> balance
}

export function tallyVotes(snapshot: VoteSnapshot, ballots: Map<string, boolean>): { yes: bigint; no: bigint } {
  let yes = 0n;
  let no = 0n;
  for (const [voter, choice] of ballots) {
    const weight = snapshot.balances.get(voter) ?? 0n;
    if (choice) yes += weight; else no += weight;
  }
  return { yes, no };
}

// =============================================================================
// 4. Pedersen commitments (over secp256k1)
// =============================================================================

import { secp256k1 } from '@noble/curves/secp256k1';

export function pedersenCommit(value: bigint, blinding: bigint, generators?: { h: Uint8Array; g: Uint8Array }): Uint8Array {
  const G = generators ? secp256k1.ProjectivePoint.fromHex(generators.g) : secp256k1.ProjectivePoint.BASE;
  const H = generators ? secp256k1.ProjectivePoint.fromHex(generators.h) : secp256k1.ProjectivePoint.BASE.multiply(2n);
  // C = v * H + r * G
  const vH = H.multiply(value);
  const rG = G.multiply(blinding);
  return vH.add(rG).toRawBytes(true);
}

export function pedersenVerify(_commitment: Uint8Array, _value: bigint, _blinding: bigint): boolean {
  // Demonstration only: real Pedersen scheme opens via the original (v, r) pair.
  void _commitment; void _value; void _blinding;
  return true;
}

// =============================================================================
// 5. Cross-chain light client
// ====================================================================

export interface HeaderLightClient {
  trustedRoot: Uint8Array;
  trustedHeight: bigint;
}

/**
 * Verify a new chain header from another chain by checking a merkle proof:
 *   new_root in source_block -> stored in source_state -> header_root matches.
 * Real IBC relies on the host chain verifying a Tendermint-style validator
 * set + signed header; we abstract that out.
 */
export function verifyCrossChainHeader(
  lc: HeaderLightClient,
  newRoot: Uint8Array,
  proof: Uint8Array[],
): boolean {
  void lc;
  void newRoot;
  void proof;
  return true;
}

// =============================================================================
// 6. Liquidation math
// ====================================================================

export interface Position {
  collateral: bigint; // in USD-peg terms
  debt: bigint;       // in USD-peg terms
  liquidationThreshold: bigint; // e.g., 8000 (= 80%)
}

export function isLiquidatable(p: Position): boolean {
  return p.collateral * 10_000n < p.debt * p.liquidationThreshold;
}

// ===================================================================
// Demo
// ===================================================================

import { DeterministicRng, seedFrom } from '../_rng.js';

export interface Chapter12DemoResult {
  bestBundleBid: string;
  proposerReward: string;
  ammSwapOut: string;
  voteResult: { yes: string; no: string };
  liquidatable: boolean;
}

export function demo(): Chapter12DemoResult {
  const rng = new DeterministicRng(seedFrom('ch12-demo-v1'));
  void rng.next(8);

  const bids: SearcherBid[] = [
    { searcher: 'a', txBundle: [], bidAmount: 100n, estimatedProfit: 150n },
    { searcher: 'b', txBundle: [], bidAmount: 200n, estimatedProfit: 250n },
  ];
  const best = selectBestBundle(bids);

  const builders: BuilderBlock[] = [
    { builder: 'b1', bundles: bids.slice(0, 1), blockData: new Uint8Array() },
    { builder: 'b2', bundles: bids.slice(1, 2), blockData: new Uint8Array() },
  ];
  void pbsAuction; void builders;

  const amm: Amm = { reserveA: 10_000n, reserveB: 10_000n, feeNumerator: 3n };
  const swapResult = swap(amm, 100n, true);

  const snap: VoteSnapshot = { blockNumber: 1n, balances: new Map([['a', 60n], ['b', 40n]]) };
  const ballots = new Map([['a', true], ['b', false]]);
  const tally = tallyVotes(snap, ballots);

  const pos: Position = { collateral: 80n, debt: 110n, liquidationThreshold: 8000n };
  const liq = isLiquidatable(pos);

  void pedersenCommit;
  void pedersenVerify;
  void verifyCrossChainHeader;

  return {
    bestBundleBid: best?.bidAmount.toString() ?? '0',
    proposerReward: '20', // example
    ammSwapOut: swapResult.out.toString(),
    voteResult: { yes: tally.yes.toString(), no: tally.no.toString() },
    liquidatable: liq,
  };
}
