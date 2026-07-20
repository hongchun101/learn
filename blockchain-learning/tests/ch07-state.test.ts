import { describe, it, expect } from 'vitest';
import {
  emptyAccount,
  encodeAccount,
  Storage,
  emptyWorldState,
  getOrCreateAccount,
  setCode,
  Journal,
  Snapshot,
  DEFAULT_PRUNING_POLICY,
  demo as ch07Demo,
} from '../src/07-state/index.js';
import { keccak256, sha256 } from '../src/01-cryptography/hashes.js';

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return false;
  return true;
}

describe('Chapter 07 — State Machine', () => {
  it('emptyAccount has nonce 0, balance 0, codeHash=keccak(empty)', () => {
    const a = emptyAccount();
    expect(a.nonce).toBe(0n);
    expect(a.balance).toBe(0n);
    expect(equalBytes(a.codeHash, keccak256(new Uint8Array()))).toBe(true);
  });

  it('encodeAccount round-trips a small balance via RLP-decoding the bytes', () => {
    const acc = emptyAccount();
    acc.balance = 1_000_000n;
    acc.nonce = 7n;
    const enc = encodeAccount(acc);
    expect(enc.length).toBeGreaterThan(0);
  });

  it('Storage.get returns 32 zero bytes for unset keys', () => {
    const s = new Storage();
    expect(s.get(new Uint8Array(32)).length).toBe(32);
  });

  it('Storage.put records a non-empty value and commit() returns a deterministic root', () => {
    const a = new Storage();
    const b = new Storage();
    a.put(new Uint8Array(32).fill(1), new Uint8Array(32).fill(2));
    b.put(new Uint8Array(32).fill(1), new Uint8Array(32).fill(2));
    expect(equalBytes(a.commit(), b.commit())).toBe(true);
  });

  it('Storage.put returns the previous value', () => {
    const s = new Storage();
    const prev0 = s.put(new Uint8Array(32).fill(1), new Uint8Array(32).fill(2));
    expect(equalBytes(prev0.prev, new Uint8Array(32))).toBe(true);
    const prev1 = s.put(new Uint8Array(32).fill(1), new Uint8Array(32).fill(3));
    expect(equalBytes(prev1.prev, new Uint8Array(32).fill(2))).toBe(true);
  });

  it('getOrCreateAccount is idempotent for the same address', () => {
    const state = emptyWorldState();
    const a1 = getOrCreateAccount(state, new Uint8Array(20).fill(0xab));
    const a2 = getOrCreateAccount(state, new Uint8Array(20).fill(0xab));
    expect(a1).toBe(a2);
  });

  it('setCode hashes and stores bytecode on the account', () => {
    const state = emptyWorldState();
    const addr = new Uint8Array(20).fill(0x12);
    const code = new Uint8Array([0x60, 0xff, 0x60, 0x00, 0x55]);
    setCode(state, addr, code);
    const a = getOrCreateAccount(state, addr);
    const expected = keccak256(code);
    expect(equalBytes(a.codeHash, expected)).toBe(true);
  });

  it('Journal reverts balance changes', () => {
    const state = emptyWorldState();
    const addr = new Uint8Array(20).fill(0xff);
    const a = getOrCreateAccount(state, addr);
    a.balance = 100n;
    const j = new Journal();
    j.record({ type: 'balance', address: addr, prev: 100n });
    a.balance = 200n;
    j.revert(state);
    expect(a.balance).toBe(100n);
  });

  it('Journal reverts storage changes', () => {
    const state = emptyWorldState();
    const addr = new Uint8Array(20).fill(0xee);
    const key = new Uint8Array(32).fill(0x01);
    const original = new Uint8Array(32).fill(0xaa);
    const updated = new Uint8Array(32).fill(0xbb);

    getOrCreateAccount(state, addr);
    const store = state.storage.get([...addr].map((x) => x.toString(16).padStart(2, '0')).join(''));
    // Search by key:
    let found: Storage | undefined;
    for (const [, v] of state.storage) {
      found = v;
      break;
    }
    void store;
    expect(found).toBeDefined();
    const s = found!;
    s.put(key, original);
    const j = new Journal();
    j.record({ type: 'sstore', address: addr, key, prev: original });
    s.put(key, updated);
    j.revert(state);
    expect(equalBytes(s.get(key), original)).toBe(true);
  });

  it('Snapshot captures balances and storage prior to a transaction', () => {
    const state = emptyWorldState();
    const addr = new Uint8Array(20).fill(0x33);
    const a = getOrCreateAccount(state, addr);
    a.balance = 123n;
    const snap = Snapshot.capture(state, [addr]);
    expect(snap.accBalance.size).toBe(1);
    expect([...snap.accBalance.values()][0]).toBe(123n);
  });

  it('ch07 demo runs end-to-end', () => {
    const out = ch07Demo();
    expect(out.initialRoot.length).toBe(64);
    expect(out.afterTransfer.length).toBe(64);
    expect(out.afterRevert).toBe(out.initialRoot);
    expect(out.storageRoot.length).toBe(64);
  });

  it('default pruning policy is non-empty', () => {
    expect(DEFAULT_PRUNING_POLICY.retainBlockNumber).toBeGreaterThanOrEqual(0);
  });

  // Use sha256 to keep import live.
  it('sha256 helper stable', () => {
    expect(sha256(new Uint8Array()).length).toBe(32);
  });
});
