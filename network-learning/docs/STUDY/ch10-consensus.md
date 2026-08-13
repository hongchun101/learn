# Chapter 10 — Consensus

## Goal

After this chapter you should be able to:

- Walk 2PC and 3PC by hand.
- Explain Paxos's prepare / accept / decide phases.
- Implement a Raft leader election and log replication.
- State FLP impossibility and what each algorithm gives up.
- Distinguish safety, liveness, and progress.

## Prerequisites

Chapter 09 (clocks and ordering).

## Walkthrough

1. **2PC.** `TwoPcCoordinator` and `TwoPcParticipant`. The coordinator
   drives the prepare / commit. It is **blocking** on coordinator
   failure.
2. **3PC.** A non-blocking variant; relies on bounded network delays.
3. **Paxos.** `PaxosProposer` and `PaxosAcceptor`. The proposer's
   job is to pick a value; the acceptors' job is to lock a slot.
4. **Raft.** `RaftNode` includes:
   - Leader election with randomised timeouts.
   - Log replication with `nextIndex` and `matchIndex`.
   - Commit semantics: a leader commits when a majority has the
     entry.
   - Snapshot-safe commit: the leader installs `no-op` entries after
     election.

Run `npx tsx src/10-consensus/demo.ts`.

## Exercises

1. **2PC.** Walk a 3-participant commit. Note where the coordinator
   logs.
2. **Paxos.** Stage a simple single-decree Paxos with two proposers.
   See the higher-numbered proposer win.
3. **Raft.** A leader dies; a new one is elected. Watch the term
   number rise.
4. **Commit safety.** Can a leader commit an entry from a previous
   term? (No — only from its current term.)
5. **Liveness vs safety.** What does each algorithm give up?

### Answers (sketch)

1. Prepare → all yes → commit → all ack → done.
2. The acceptor rejects if the proposal number is lower.
3. The randomised timeout prevents split votes.
4. Read the Raft paper §5.4.2.
5. 2PC blocks; Paxos may stall; Raft is live under typical
   conditions.

## Common pitfalls

- **Confusing 2PC and Paxos.** 2PC is a commit protocol; Paxos is
  consensus.
- **Raft leader completeness.** A leader has every entry committed
  in earlier terms.
- **Snapshot handling.** Snapshots + log truncation is non-trivial.
- **Membership changes.** Single-server changes are simpler than
  joint consensus.

## Interview questions

1. **State FLP.** In an asynchronous system with one faulty process,
   consensus is impossible.
2. **Why does Raft use randomised timeouts?** To avoid split votes.
3. **Why does Paxos need a leader?** It doesn't, but a leader makes
   it practical.
4. **What's the role of the prepare phase?** To fill the slot and
   learn any value already chosen.
5. **Why is 2PC blocking?** Because participants in `prepared` state
   cannot decide alone.

## What to build

A `RaftCluster` of three nodes, a fake network, and an integration
test that steps them through an election and a log replication.
Then add a snapshot/transfer step.

## References

- Gray, "Notes on Database Operating Systems", 1978.
- Lamport, "The Part-Time Parliament", 1998.
- Lamport, "Paxos Made Simple", 2001.
- Ongaro & Ousterhout, "In Search of an Understandable Consensus
  Algorithm", USENIX ATC 2014.
- Fischer, Lynch, Paterson, "Impossibility of Distributed Consensus
  with One Faulty Process", JACM, 1985.
