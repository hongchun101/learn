# Module 12 — Distributed

## What you'll learn

Single-node guarantees stop at the network card. To get a database
across machines you must choose between consistency and
availability (CAP) and pay for the choice.

After this chapter you can:

- shard a key with **consistent hashing**;
- implement **vector clocks** for causality;
- run a **2PC** coordinator with votes;
- run a toy **Raft** cluster: leader election, log replication,
  commit-on-quorum;
- explain **linearizability**, **sequential consistency**, and
  **eventual consistency**, and which one your engine delivers.

## Files

```
module_12_distributed/
  __init__.py     # everything in one file: hash, vector clock, 2PC, Raft
```

## Tests

```
tests/modules/test_module_12_distributed.py
```

1. `assign_shard` is stable across reshuffles (one missing shard
   keeps most keys on the same node).
2. `VectorClock.happens_before` is a partial order.
3. `TwoPhaseCommit` commits on unanimous yes-vote.
4. `RaftCluster.elect/append/committed` produces committed log of
   size 2 after two appends.

## Going deeper

- Spanner (Google) — global strong consistency via TrueTime.
- CockroachDB — Raft + 2PC + SSI.
- DynamoDB — eventual consistency with vector clocks.
