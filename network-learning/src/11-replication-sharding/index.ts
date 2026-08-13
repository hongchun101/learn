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
//
// STUDY (read alongside docs/STUDY/ch11-replication-sharding.md)
// -----------------------------------------------------------------------------
// Prerequisites: Chapter 10 (consensus).
// Why it matters: every large-scale store is a combination of replication
// (for availability), sharding (for scale), and a storage engine (for
// throughput). The patterns in this chapter are the ones every
// data-system engineer will reach for.
// Key invariants:
//   * `(R, W, N)` with `R + W > N` gives a strong read (any read quorum
//     overlaps with any write quorum).
//   * Consistent hashing with virtual nodes balances load and limits
//     movement to `~1/N` on add/remove.
//   * Gossip is bandwidth-efficient and robust; pull is more accurate but
//     costlier.
//   * LSM: write amplification (compaction), read amplification (bloom +
//     binary search), space amplification (overlap).
//   * MVCC: readers don't block writers; old versions accumulate and need
//     garbage collection.
// Common pitfalls:
//   * Hot keys: consistent hashing balances distribution, not access.
//   * Choosing a quorum that cannot make progress in a network partition.
//   * Forgetting compaction; LSM is unbounded without it.
// Interview-ready summary: I can pick `(R, W, N)` for a workload, design a
// sharding scheme, and reason about the cost of LSM compaction.
// -----------------------------------------------------------------------------
// Study guide: docs/STUDY/ch11-replication-sharding.md
// Test:        tests/ch11-replication-sharding.test.ts
// Demo:        npx tsx src/11-replication-sharding/demo.ts
// =============================================================================

export { PrimaryBackupGroup, ChainReplication, ConsistentHash, GossipNode, LsmTree, MvccStore } from './replication.js';
export type { Replica, ReplicaRole, ConsistentHashOptions, GossipMessage, SSTable, VersionedValue } from './replication.js';
export { demo } from './demo.js';
