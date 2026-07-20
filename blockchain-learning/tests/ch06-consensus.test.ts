import { describe, it, expect } from 'vitest';
import {
  mine,
  serializeMiningHeader,
  Poh,
  HotStuffQuorum,
  newFfgState,
  applyFfgVote,
  type Checkpoint,
  type FfgVote,
  type MiningTemplate,
  demo as ch06Demo,
} from '../src/06-consensus/index.js';
import { sha256, sha256d } from '../src/01-cryptography/hashes.js';
import { bls12_381 } from '@noble/curves/bls12-381';
import { seedFrom, DeterministicRng } from '../src/_rng.js';

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return false;
  return true;
}

function ck(epoch: bigint, hash: Uint8Array): Checkpoint {
  return { epoch, blockHash: hash };
}

describe('Chapter 06 — Consensus', () => {
  it('PoW finds a nonce whose header hash is below a high target', () => {
    const tpl: MiningTemplate = {
      prevBlock: new Uint8Array(32),
      merkleRoot: sha256(new Uint8Array()),
      timestamp: 1_700_000_000,
      bits: 0x207fffff, // very easy
    };
    const m = mine(tpl, 50_000);
    expect(m).not.toBeNull();
    if (m) {
      // The hash must equal sha256d of the serialized header with the winning nonce.
      const h = sha256d(serializeMiningHeader(tpl, m.nonce));
      expect(equalBytes(h, m.hash)).toBe(true);
    }
  });

  it('PoW returns null when the target is impossibly small', () => {
    const tpl: MiningTemplate = {
      prevBlock: new Uint8Array(32),
      merkleRoot: sha256(new Uint8Array()),
      timestamp: 1,
      bits: 0x03000001,
    };
    expect(mine(tpl, 1000)).toBeNull();
  });

  it('PoH state changes monotonically per tick and is deterministic', () => {
    const a = new Poh(new Uint8Array(32));
    const b = new Poh(new Uint8Array(32));
    for (let i = 0; i < 10; i++) a.tick(1);
    for (let i = 0; i < 10; i++) b.tick(1);
    expect(a.current().counter).toBe(10n);
    expect(equalBytes(a.current().state, b.current().state)).toBe(true);
  });

  it('PoH recordEvent advances counter by 2 hashes', () => {
    const p = new Poh(new Uint8Array(32));
    p.tick(5);
    const before = p.current().counter;
    p.recordEvent(new Uint8Array([1, 2, 3]));
    const after = p.current().counter;
    expect(after - before).toBe(2n);
  });

  it('HotStuff quorum = ⌊2N/3⌋ + 1', () => {
    const validators = [1, 2, 3, 4, 5, 6, 7].map((i) => bls12_381.getPublicKey(new Uint8Array(32).fill(i)));
    const h = new HotStuffQuorum(validators);
    expect(h.hasQuorum(2)).toBe(false); // 7 → quorum 5
    expect(h.hasQuorum(5)).toBe(true);
  });

  it('FfgState records justified checkpoint when 2/3 stake votes', () => {
    const validators = [1, 2, 3, 4].map((i) => bls12_381.getPublicKey(new Uint8Array(32).fill(i)));
    const state = newFfgState(validators, 100n);
    const src = ck(0n, new Uint8Array(32));
    // First, justify the source via votes:
    expect(['new-justified', 'new-finalized']).toContain(applyFfgVote(state, { validator: 1n, source: src, target: src, signature: new Uint8Array(96) }, 350n));
    const target = ck(1n, sha256(new Uint8Array([1])));
    const r = applyFfgVote(state, { validator: 1n, source: src, target, signature: new Uint8Array(96) }, 350n);
    expect(['new-justified', 'new-finalized']).toContain(r);
  });

  it('FfgState finalizes when both source and target are justified', () => {
    const validators = [1, 2, 3].map((i) => bls12_381.getPublicKey(new Uint8Array(32).fill(i)));
    const state = newFfgState(validators, 100n);
    const src = ck(0n, new Uint8Array(32));
    state.justified.add(`${src.epoch.toString(16)}:${Array.from(src.blockHash).map((x) => x.toString(16).padStart(2, '0')).join('')}`);
    const target = ck(1n, sha256(new Uint8Array([1])));
    const vote: FfgVote = { validator: 1n, source: src, target, signature: new Uint8Array(96) };
    // Total stake 300; need >= 200.
    expect(applyFfgVote(state, vote, 250n)).toBe('new-finalized');
  });

  it('ch06 demo runs end-to-end', () => {
    const out = ch06Demo();
    expect(out.pow.nonce).toBeGreaterThanOrEqual(0);
    expect(out.pow.hash.length).toBe(64);
    expect(out.poh.ticks).toBe(100);
    expect(out.poh.hash.length).toBe(64);
    expect(out.hotstuff.validatorCount).toBe(4);
    expect(out.hotstuff.quorum).toBe(3);
    expect(out.ffgFinalized).toBe(0);
  });

  // Use DeterministicRng so vitest doesn't warn about unused.
  it('deterministic rng helper still works', () => {
    const rng = new DeterministicRng(seedFrom('ch06-test'));
    expect(rng.next(8).length).toBe(8);
  });
});
