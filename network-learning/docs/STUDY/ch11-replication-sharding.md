# Chapter 11 — Replication, Sharding, Storage

## Goal

After this chapter you should be able to:

- Compare primary-backup, chain, and quorum replication.
- Choose `(R, W, N)` for a workload.
- Set up consistent hashing with virtual nodes.
- Implement a gossip protocol for membership.
- Sketch an LSM tree and an MVCC store.

## Prerequisites

Chapter 10 (consensus).

## Walkthrough

1. **Primary-backup.** `PrimaryBackupGroup` has a primary and N
   backups. Sync vs async is a knob.
2. **Chain.** `ChainReplication` writes flow through replicas in
   order; reads hit the tail.
3. **Quorum.** `(R, W, N)` with `R + W > N` for strong reads.
4. **Consistent hashing.** `ConsistentHash` places keys on a ring
   with virtual nodes for balance.
5. **Gossip.** `GossipNode` keeps a membership view with a
   push-based heartbeat.
6. **LSM.** `LsmTree` has a memtable + sorted run + simple
   compaction.
7. **MVCC.** `MvccStore` keeps per-key versions and supports
   snapshot reads.

Run `npx tsx src/11-replication-sharding/demo.ts`.

## Exercises

1. **Quorum.** For `N=5`, choose `(R, W)` for strong consistency.
2. **Consistent hashing.** Add a node and watch a fraction of keys
   move.
3. **Gossip.** Partition a cluster, see the views diverge, then
   heal.
4. **LSM.** Put 1000 keys, then range-scan.
5. **MVCC.** Run two concurrent transactions; verify each sees its
   snapshot.

### Answers (sketch)

1. `R + W > N`, so `(R=3, W=3)` is the safest `(5, 5, 5)` config.
2. Roughly `1/N` of keys move to the new node.
3. Eventually consistent — the views converge with the gossip
   interval.
4. Range-scan is `O(N)` regardless of count.
5. Read your own writes after commit.

## Common pitfalls

- **Quorum latency.** Strong reads are still 1 round-trip in the
  worst case.
- **Hot keys.** Consistent hashing helps with distribution; it does
  nothing for hot keys.
- **Read-repair vs anti-entropy.** Read-repair is synchronous;
  anti-entropy is asynchronous.
- **MVCC garbage.** Old versions accumulate; compaction is required.

## Interview questions

1. **Why does Dynamo use `R + W > N`?** So any read quorum shares a
   node with any write quorum, guaranteeing the latest write.
2. **Why virtual nodes?** Better balance with a smaller ring.
3. **Why gossip?** Scales to thousands of nodes where a heartbeat
   protocol would drown the network.
4. **What's the cost of LSM?** Write amplification (re-write on
   compaction) and read amplification (bloom + binary search).
5. **Why MVCC?** Readers don't block writers.

## What to build

A `kvstore` with a `put`/`get` over a consistent-hash ring of
in-memory replicas. Then add MVCC.

## References

- DeCandia et al., "Dynamo: Amazon's Highly Available Key-value
  Store", SOSP 2007.
- Chang et al., "Bigtable", OSDI 2006.
- O'Neil et al., "The Log-Structured Merge-Tree", Acta Informatica
  1996.
- Lamport, "Time, Clocks, and the Ordering of Events Revisited".
