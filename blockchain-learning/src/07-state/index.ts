// =============================================================================
// Chapter 07 — State Machine: Account, Storage, Snapshots
// =============================================================================
// Goal: how a chain represents world state, manages journal-and-revert,
//       and constructs/commit fixes from snapshots.
//
// Concepts covered:
//   1. Account state: nonce, balance, code hash, storage root.
//   2. Storage trie: per-account keyed merkle-patricia store.
//   3. World state trie: 32-byte address -> 4-tuple (account RLP).
//   4. Journal and revert: a per-tx accumulator of touched/deleted/orig values.
//   5. Snapshots and snapshots in commit/replay.
//   6. Pruning: state expiry, weak subjectivity, history pruning.
// =============================================================================

import { keccak256, sha256 } from '../01-cryptography/hashes.js';
import { rlpEncode } from '../03-encoding/index.js';
// Account
// =============================================================================

export interface Account {
  nonce: bigint;
  balance: bigint;
  codeHash: Uint8Array;
  storageRoot: Uint8Array;
}

export function emptyAccount(): Account {
  return { nonce: 0n, balance: 0n, codeHash: keccak256(new Uint8Array()), storageRoot: keccak256(new Uint8Array()) };
}

export function encodeAccount(acc: Account): Uint8Array {
  return rlpEncode([
    u256(acc.nonce),
    u256(acc.balance),
    acc.storageRoot,
    keccak256(acc.codeHash), // Real EVM: the keccak of the code is stored; we use the value directly here.
    ...[acc.codeHash],
  ]);
}

function u256(n: bigint): Uint8Array {
  if (n < 0n) throw new Error('u256 negative');
  const out: number[] = [];
  let v = n;
  while (v > 0n) {
    out.unshift(Number(v & 0xffn));
    v >>= 8n;
  }
  return new Uint8Array(out);
}

// =============================================================================
// Storage
// =============================================================================

/**
 * A flat storage is a Map<256-bit key, 256-bit value>. We persist changes via
 * journal-and-revert: each `sstore(k, v)` records the previous value so we
 * can roll back the transaction.
 */
export class Storage {
  private map = new Map<string, Uint8Array>();

  get(key: Uint8Array): Uint8Array {
    const k = bytesKey(key);
    return this.map.get(k) ?? new Uint8Array(32);
  }

  put(key: Uint8Array, value: Uint8Array): { prev: Uint8Array } {
    const k = bytesKey(key);
    const prev = this.map.get(k) ?? new Uint8Array(32);
    this.map.set(k, value);
    return { prev };
  }

  commit(): Uint8Array {
    // For didactic purposes we return the keccak of the canonical encoding
    // of all (k, v) pairs; the real trie uses a patricia-walk.
    const entries: Uint8Array[] = [];
    for (const [k, v] of [...this.map.entries()].sort()) {
      entries.push(sha256(new TextEncoder().encode(k)), sha256(v));
    }
    return keccak256(rlpEncode(entries));
  }
}

function bytesKey(b: Uint8Array): string {
  // Deterministic canonical key (right-padded to 32 bytes).
  const padded = new Uint8Array(32);
  padded.set(b.subarray(0, 32), 0);
  let s = '0x';
  for (let i = 0; i < 32; i++) s += (padded[i] ?? 0).toString(16).padStart(2, '0');
  return s;
}

// =============================================================================
// World state trie (in-memory)
// =============================================================================

export interface WorldState {
  accounts: Map<string, Account>;
  storage: Map<string, Storage>;
  code: Map<string, Uint8Array>; // codeHash → bytecode
}

export function emptyWorldState(): WorldState {
  return { accounts: new Map(), storage: new Map(), code: new Map() };
}

export function getOrCreateAccount(state: WorldState, address: Uint8Array): Account {
  const k = addressKey(address);
  let a = state.accounts.get(k);
  if (!a) {
    a = emptyAccount();
    state.accounts.set(k, a);
    state.storage.set(k, new Storage());
  }
  return a;
}

export function setCode(state: WorldState, address: Uint8Array, code: Uint8Array): void {
  const codeHash = keccak256(code);
  state.code.set(bytesKey(codeHash), code);
  const acc = getOrCreateAccount(state, address);
  acc.codeHash = codeHash;
}

function addressKey(a: Uint8Array): string {
  const padded = new Uint8Array(20);
  padded.set(a.subarray(0, 20), 0);
  let s = '0x';
  for (let i = 0; i < 20; i++) s += (padded[i] ?? 0).toString(16).padStart(2, '0');
  return s;
}

// =============================================================================
// Journal and revert
// =============================================================================

export type JournalEntry =
  | { type: 'sstore'; address: Uint8Array; key: Uint8Array; prev: Uint8Array }
  | { type: 'balance'; address: Uint8Array; prev: bigint }
  | { type: 'nonce'; address: Uint8Array; prev: bigint };

export class Journal {
  private entries: JournalEntry[] = [];

  record(entry: JournalEntry): void {
    this.entries.push(entry);
  }

  /** Apply the recorded changes to the storage; returns the rolled-back state. */
  applyTo(
    state: WorldState,
    sets: { address: Uint8Array; sstore: Array<{ key: Uint8Array; value: Uint8Array }>; balance?: bigint; nonce?: bigint }[],
  ): void {
    for (const s of sets) {
      const a = getOrCreateAccount(state, s.address);
      if (s.balance !== undefined) a.balance = s.balance;
      if (s.nonce !== undefined) a.nonce = s.nonce;
      const store = state.storage.get(addressKey(s.address));
      if (!store) continue;
      for (const { key, value } of s.sstore) store.put(key, value);
    }
  }

  revert(state: WorldState): void {
    while (this.entries.length > 0) {
      const e = this.entries.pop()!;
      if (e.type === 'sstore') {
        getOrCreateAccount(state, e.address);
        const store = state.storage.get(addressKey(e.address));
        store?.put(e.key, e.prev);
      } else if (e.type === 'balance') {
        const acc = getOrCreateAccount(state, e.address);
        acc.balance = e.prev;
      } else if (e.type === 'nonce') {
        const acc = getOrCreateAccount(state, e.address);
        acc.nonce = e.prev;
      }
    }
  }
}

// =============================================================================
// Snapshot
// =============================================================================

export class Snapshot {
  constructor(
    public readonly accBalance: Map<string, bigint>,
    public readonly accNonce: Map<string, bigint>,
    public readonly storage: Map<string, Uint8Array[]>,
  ) {}

  static capture(state: WorldState, addresses: Uint8Array[]): Snapshot {
    const balance = new Map<string, bigint>();
    const nonce = new Map<string, bigint>();
    const storage = new Map<string, Uint8Array[]>();
    for (const a of addresses) {
      const k = addressKey(a);
      const acc = state.accounts.get(k);
      if (acc) {
        balance.set(k, acc.balance);
        nonce.set(k, acc.nonce);
        const store = state.storage.get(k);
        if (store) {
          const entries: Uint8Array[] = [];
          for (const v of (store as unknown as { map: Map<string, Uint8Array> }).map.values()) entries.push(v);
          storage.set(k, entries);
        }
      }
    }
    return new Snapshot(balance, nonce, storage);
  }
}

// =============================================================================
// Weak subjectivity and pruning
// =============================================================================

export interface PruningPolicy {
  retainBlockNumber: number; // never prune past N blocks
  retainStateTrieKeys: number; // how many storage slots per account to retain
}

export const DEFAULT_PRUNING_POLICY: PruningPolicy = {
  retainBlockNumber: 128,
  retainStateTrieKeys: 100_000,
};

// =============================================================================
// Demo
// =============================================================================

import { DeterministicRng, seedFrom } from '../_rng.js';

export interface Chapter07DemoResult {
  initialRoot: string;
  afterTransfer: string;
  afterRevert: string;
  storageRoot: string;
}

export function demo(): Chapter07DemoResult {
  const rng = new DeterministicRng(seedFrom('ch07-demo-v1'));
  const k = rng.next(32);

  const state = emptyWorldState();
  const alice = new Uint8Array(20);
  const bob = new Uint8Array(20);
  alice.set(k.subarray(0, 20), 0);

  const a = getOrCreateAccount(state, alice);
  const b = getOrCreateAccount(state, bob);
  a.balance = 1_000_000n;
  b.balance = 0n;
  const initialRoot = rootHash(state);

  const journal = new Journal();
  journal.record({ type: 'balance', address: alice, prev: a.balance });
  journal.record({ type: 'balance', address: bob, prev: b.balance });
  a.balance -= 100n;
  b.balance += 100n;
  const afterTransfer = rootHash(state);

  journal.revert(state);
  const afterRevert = rootHash(state);

  void DEFAULT_PRUNING_POLICY;

  // Storage trie root demo.
  const store = new Storage();
  for (let i = 0; i < 4; i++) store.put(new Uint8Array(32).fill(i), new Uint8Array(32).fill(i + 1));
  return {
    initialRoot,
    afterTransfer,
    afterRevert,
    storageRoot: hexOf(store.commit()),
  };
}

function rootHash(state: WorldState): string {
  // Tiny deterministic hash over accounts and balances.
  const items: Uint8Array[] = [];
  for (const [k, acc] of [...state.accounts.entries()].sort()) {
    items.push(sha256(new TextEncoder().encode(k)));
    items.push(keccak256(encodeAccount(acc)));
  }
  return hexOf(keccak256(rlpEncode(items)));
}

function hexOf(b: Uint8Array): string {
  let out = '';
  for (let i = 0; i < b.length; i++) out += (b[i] ?? 0).toString(16).padStart(2, '0');
  return out;
}
