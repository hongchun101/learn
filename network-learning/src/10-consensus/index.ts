// =============================================================================
// Chapter 10 — Consensus Foundations
// =============================================================================
// Goal: consensus is the heart of every replicated state machine. This
// chapter covers the canonical algorithms in textbook form:
//
//   * Two-phase commit (2PC) — blocking, coordinator-failure sensitive.
//   * Three-phase commit (3PC) — non-blocking under some assumptions.
//   * Paxos — the original Leslie Lamport algorithm. Single-decree and
//     multi-decree (log replication).
//   * Raft — an easier-to-understand alternative to Paxos (Diego Ongaro,
//     2014).
//   * FLP impossibility (1985) — why consensus is impossible in an
//     asynchronous system with even one faulty process.
//   * Safety vs liveness — what each algorithm chooses to give up.
//
// We implement the core state machines and demonstrate them with simple
// scenarios. The implementations are compact, didactic, and not production-
// ready (production Paxos/Raft need persistence, networking, and many
// optimizations).
// =============================================================================
//
// STUDY (read alongside docs/STUDY/ch10-consensus.md)
// -----------------------------------------------------------------------------
// Prerequisites: Chapter 09 (clocks and ordering).
// Why it matters: every replicated system stands on a consensus algorithm.
// A senior engineer must be able to read a Paxos or Raft paper and map it
// to an implementation. This chapter gives you the working code so the
// paper becomes concrete.
// Key invariants:
//   * FLP: in an asynchronous system with one faulty process, consensus is
//     impossible. Raft and Paxos get around this by adding timeouts.
//   * 2PC is blocking on coordinator failure; participants cannot decide
//     alone once they have voted "yes".
//   * Raft commits only entries from the current term.
//   * Paxos acceptors reject lower-numbered proposals.
// Common pitfalls:
//   * Confusing 2PC (commit protocol) with Paxos (consensus).
//   * Forgetting snapshot handling in Raft.
//   * Single-server changes are easy; joint consensus is not.
// Interview-ready summary: I can walk 2PC, 3PC, Paxos, and Raft on paper,
// state FLP, and pick the right algorithm for a workload.
// -----------------------------------------------------------------------------
// Study guide: docs/STUDY/ch10-consensus.md
// Test:        tests/ch10-consensus.test.ts
// Demo:        npx tsx src/10-consensus/demo.ts
// =============================================================================

export { TwoPcCoordinator, TwoPcParticipant, PaxosAcceptor, PaxosProposer, RaftNode } from './consensus.js';
export type { TwoPcRole, TwoPcState, PaxosProposal, PaxosAcceptorState, RaftRole, RaftState, RaftLogEntry } from './consensus.js';
export { demo } from './demo.js';
