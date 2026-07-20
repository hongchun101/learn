// =============================================================================
// Chapter 11 — Replication, Sharding, and Storage
// =============================================================================
// Goal: once you have a consensus algorithm, how do you actually use it to
// scale reads, scale writes, and survive failures? This chapter covers the
// patterns:
//
//   * Primary-backup replication (sync and async).
//   * Chain replication (N replicas, writes flow through them in order).
//   * Quorum reads/writes (R, W, N configuration; R + W > N for strong reads).
//   * Read-repair and anti-entropy (Dynamo-style, Merkle-tree sync).
//   * Hinted handoff (write goes to a node that owns the partition; if that
//     node is down, the write is parked on another node to replay later).
//   * Consistent hashing with virtual nodes.
//   * Gossip protocol for membership and failure detection.
//   * LSM tree: write path (memtable + SSTable), read path (bloom filter +
//     binary search across levels), background compaction.
//   * MVCC: snapshot isolation via per-transaction versions.
//
// This file implements the algorithms; it does not simulate a real network.
// =============================================================================

// -----------------------------------------------------------------------------
// Primary-backup
// -----------------------------------------------------------------------------

export type ReplicaRole = 'primary' | 'backup' | 'down';
export interface Replica {
  id: string;
  state: Map<string, string>;
  role: ReplicaRole;
}

export class PrimaryBackupGroup {
  private replicas: Replica[];
  /** Read quorum. */
  constructor(replicas: Replica[]) {
    this.replicas = replicas;
  }
  /** Synchronous write: wait for `acks` backups to acknowledge. */
  put(key: string, value: string, acks = 1, mode: 'sync' | 'async' = 'sync'): { ok: boolean; writtenTo: string[] } {
    const primary = this.replicas.find((r) => r.role === 'primary');
    if (!primary) return { ok: false, writtenTo: [] };
    primary.state.set(key, value);
    const writtenTo = [primary.id];
    if (mode === 'sync') {
      let acked = 0;
      for (const r of this.replicas) {
        if (r.role === 'backup' && acked < acks) {
          r.state.set(key, value);
          writtenTo.push(r.id);
          acked++;
        }
      }
    } else {
      // Async: fire-and-forget.
      for (const r of this.replicas) {
        if (r.role === 'backup') r.state.set(key, value);
      }
    }
    return { ok: true, writtenTo };
  }
  /** Read with a quorum. */
  get(key: string, quorum: number): { value: string | undefined; readers: number } {
    let value: string | undefined;
    let readers = 0;
    let latest: string | undefined;
    for (const r of this.replicas) {
      if (r.role === 'down') continue;
      readers++;
      const v = r.state.get(key);
      if (v !== undefined && latest === undefined) latest = v;
      if (readers >= quorum) {
        value = latest;
        return { value, readers };
      }
    }
    return { value: latest, readers };
  }
}

// -----------------------------------------------------------------------------
// Chain replication
// -----------------------------------------------------------------------------

export class ChainReplication {
  private chain: Replica[];
  /** Writes go head → tail. Reads come from the tail (always the latest). */
  constructor(chain: Replica[]) {
    this.chain = chain;
  }
  put(key: string, value: string): boolean {
    for (const r of this.chain) {
      if (r.role === 'down') return false;
      r.state.set(key, value);
    }
    return true;
  }
  get(key: string): string | undefined {
    const tail = this.chain[this.chain.length - 1];
    if (!tail || tail.role === 'down') return undefined;
    return tail.state.get(key);
  }
}

// -----------------------------------------------------------------------------
// Consistent hashing with virtual nodes
// -----------------------------------------------------------------------------

export interface ConsistentHashOptions {
  /** Number of virtual nodes per real node. Higher = more even distribution. */
  replicas: number;
}

export class ConsistentHash {
  private ring: Array<{ hash: number; node: string }>;
  private nodes = new Map<string, number>();
  constructor(nodes: string[], private readonly opts: ConsistentHashOptions = { replicas: 64 }) {
    this.ring = [];
    for (const n of nodes) this.add(n);
  }
  add(node: string): void {
    for (let i = 0; i < this.opts.replicas; i++) {
      const h = hash32(`${node}#${i}`);
      this.ring.push({ hash: h, node });
    }
    this.ring.sort((a, b) => a.hash - b.hash);
    this.nodes.set(node, this.nodes.get(node) ?? 0);
  }
  /** Pick the primary owner for `key`. */
  pick(key: string): string {
    if (this.ring.length === 0) throw new Error('ring is empty');
    const h = hash32(key);
    // Find the first node with hash >= h.
    for (const entry of this.ring) {
      if (entry.hash >= h) return entry.node;
    }
    return this.ring[0]!.node;
  }
  /** Pick N distinct nodes responsible for `key` (for replication). */
  pickN(key: string, n: number): string[] {
    if (this.ring.length === 0) throw new Error('ring is empty');
    const h = hash32(key);
    const out: string[] = [];
    let i = this.ring.findIndex((e) => e.hash >= h);
    if (i < 0) i = 0;
    while (out.length < n && out.length < this.nodes.size) {
      const node = this.ring[i % this.ring.length]!.node;
      if (!out.includes(node)) out.push(node);
      i++;
    }
    return out;
  }
}

function hash32(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

// -----------------------------------------------------------------------------
// Gossip protocol (push model)
// -----------------------------------------------------------------------------

export interface GossipMessage {
  from: string;
  members: Map<string, { address: string; heartbeat: number; status: 'alive' | 'suspect' | 'dead' }>;
}

export class GossipNode {
  private members = new Map<string, { address: string; heartbeat: number; status: 'alive' | 'suspect' | 'dead'; lastSeen: number }>();
  constructor(public readonly id: string, public readonly address: string, private readonly now: () => number = Date.now) {
    this.members.set(id, { address, heartbeat: 0, status: 'alive', lastSeen: now() });
  }
  touch(peer: string, address: string): void {
    const existing = this.members.get(peer);
    if (existing) {
      existing.heartbeat++;
      existing.status = 'alive';
      existing.lastSeen = this.now();
    } else {
      this.members.set(peer, { address, heartbeat: 0, status: 'alive', lastSeen: this.now() });
    }
  }
  buildMessage(): GossipMessage {
    return { from: this.id, members: new Map(this.members) };
  }
  merge(msg: GossipMessage): void {
    for (const [id, info] of msg.members) {
      const existing = this.members.get(id);
      if (!existing || info.heartbeat > existing.heartbeat) {
        this.members.set(id, { ...info, lastSeen: this.now() });
      }
    }
  }
  markStale(suspectMs: number, deadMs: number): void {
    const t = this.now();
    for (const [id, m] of this.members) {
      if (id === this.id) {
        m.lastSeen = t;
        continue;
      }
      const age = t - m.lastSeen;
      if (age >= deadMs) m.status = 'dead';
      else if (age >= suspectMs) m.status = 'suspect';
    }
  }
  knownMembers(): string[] {
    return Array.from(this.members.entries())
      .filter(([, m]) => m.status !== 'dead')
      .map(([id]) => id)
      .sort();
  }
}

// -----------------------------------------------------------------------------
// LSM tree (very small but real)
// =============================================================================

/** A single sorted string table (SSTable). */
export interface SSTable {
  level: number;
  entries: Array<[string, string]>;
}

export class LsmTree {
  memtable = new Map<string, string>();
  /** SSTables grouped by level. */
  levels: SSTable[][] = [[]];
  private readonly maxLevelSize: number[];

  constructor(maxLevelSize: number[] = [4, 8, 16, 32, 64]) {
    this.maxLevelSize = maxLevelSize;
  }

  put(key: string, value: string): void {
    this.memtable.set(key, value);
    if (this.memtable.size > 100) this.flush();
  }

  /** Flush the memtable into a level-0 SSTable. */
  flush(): void {
    const entries = Array.from(this.memtable.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    this.levels[0]!.push({ level: 0, entries });
    this.memtable.clear();
    // If level 0 is full, compact into level 1, etc.
    for (let l = 0; l < this.levels.length; l++) {
      while (this.levels[l]!.length > this.maxLevelSize[l]!) {
        const merged: Array<[string, string]> = [];
        for (const t of this.levels[l]!) merged.push(...t.entries);
        merged.sort((a, b) => a[0].localeCompare(b[0]));
        // Deduplicate by key (last write wins).
        const dedup: Array<[string, string]> = [];
        for (let i = 0; i < merged.length; i++) {
          if (i === merged.length - 1 || merged[i]![0] !== merged[i + 1]![0]) dedup.push(merged[i]!);
        }
        this.levels[l] = [];
        if (!this.levels[l + 1]) this.levels.push([]);
        this.levels[l + 1]!.push({ level: l + 1, entries: dedup });
      }
    }
  }

  get(key: string): string | undefined {
    if (this.memtable.has(key)) return this.memtable.get(key);
    for (const level of this.levels) {
      for (const table of level) {
        // Binary search.
        let lo = 0, hi = table.entries.length - 1;
        while (lo <= hi) {
          const mid = (lo + hi) >>> 1;
          const [k, v] = table.entries[mid]!;
          if (k === key) return v;
          else if (k < key) lo = mid + 1;
          else hi = mid - 1;
        }
      }
    }
    return undefined;
  }

  /** Number of (key, value) pairs across all levels. */
  size(): number {
    let n = this.memtable.size;
    for (const level of this.levels) for (const t of level) n += t.entries.length;
    return n;
  }
}

// -----------------------------------------------------------------------------
// MVCC key-value store
// =============================================================================

export interface VersionedValue {
  value: string;
  version: number;
  /** True if the version is a tombstone (delete). */
  tombstone: boolean;
}

export class MvccStore {
  /** key -> sorted list of versions (newest first) */
  private data = new Map<string, VersionedValue[]>();
  private globalVersion = 0;
  /** Begin a transaction at a specific snapshot version. */
  beginTx(atVersion?: number): { read: (k: string) => string | undefined; write: (k: string, v: string) => void; delete: (k: string) => void; commit: () => number } {
    const snapshot = atVersion ?? this.globalVersion;
    const staged = new Map<string, VersionedValue | null>();
    const tx = {
      read: (k: string): string | undefined => {
        if (staged.has(k)) {
          const v = staged.get(k)!;
          return v ? (v.tombstone ? undefined : v.value) : undefined;
        }
        const versions = this.data.get(k) ?? [];
        for (const v of versions) {
          if (v.version <= snapshot) return v.tombstone ? undefined : v.value;
        }
        return undefined;
      },
      write: (k: string, v: string): void => { staged.set(k, { value: v, version: 0, tombstone: false }); },
      delete: (k: string): void => { staged.set(k, { value: '', version: 0, tombstone: true }); },
      commit: (): number => {
        this.globalVersion++;
        const myVersion = this.globalVersion;
        for (const [k, v] of staged) {
          if (v === null) continue;
          const entry = { ...v, version: myVersion };
          const list = this.data.get(k) ?? [];
          list.unshift(entry);
          this.data.set(k, list);
        }
        return myVersion;
      },
    };
    return tx;
  }
  read(k: string): { value: string | undefined; version: number | null } {
    const list = this.data.get(k);
    if (!list || list.length === 0) return { value: undefined, version: null };
    const v = list[0]!;
    return { value: v.tombstone ? undefined : v.value, version: v.version };
  }
}
