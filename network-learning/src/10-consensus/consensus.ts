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

// -----------------------------------------------------------------------------
// Two-phase commit
// -----------------------------------------------------------------------------

export type TwoPcRole = 'coordinator' | 'participant';
export type TwoPcState = 'init' | 'waiting' | 'committed' | 'aborted';

export class TwoPcParticipant {
  state: TwoPcState = 'init';
  /** Vote yes/no on a prepare. The participant decides based on its own state. */
  votePrepare(): 'yes' | 'no' {
    if (this.state === 'init') return 'yes';
    return 'no';
  }
  /** Receive a commit. */
  receiveCommit(): void { this.state = 'committed'; }
  /** Receive an abort. */
  receiveAbort(): void { this.state = 'aborted'; }
}

export class TwoPcCoordinator {
  state: TwoPcState = 'init';
  private votes: Array<'yes' | 'no'> = [];

  /** Send prepare, collect votes, then commit or abort. */
  run(participants: TwoPcParticipant[]): 'committed' | 'aborted' {
    this.state = 'waiting';
    this.votes = participants.map((p) => p.votePrepare());
    if (this.votes.every((v) => v === 'yes')) {
      this.state = 'committed';
      for (const p of participants) p.receiveCommit();
      return 'committed';
    } else {
      this.state = 'aborted';
      for (const p of participants) p.receiveAbort();
      return 'aborted';
    }
  }
}

// -----------------------------------------------------------------------------
// Paxos (single-decree) — proposers, acceptors, learners
// -----------------------------------------------------------------------------

export interface PaxosProposal {
  number: number; // strictly increasing, globally unique
  value: string;
}

export interface PaxosAcceptorState {
  /** Highest prepare number seen. */
  highestPrepare: number;
  /** Highest proposal accepted: (n, value). */
  accepted: { n: number; value: string } | null;
}

export class PaxosAcceptor {
  state: PaxosAcceptorState = { highestPrepare: 0, accepted: null };
  /** Phase 1: promise to not accept any proposal numbered < n. */
  prepare(n: number): { ok: true; accepted: PaxosAcceptorState['accepted'] } | { ok: false } {
    if (n <= this.state.highestPrepare) return { ok: false };
    this.state.highestPrepare = n;
    return { ok: true, accepted: this.state.accepted };
  }
  /** Phase 2: accept a proposal if we haven't promised a higher number. */
  accept(p: PaxosProposal): boolean {
    if (p.number < this.state.highestPrepare) return false;
    this.state.accepted = { n: p.number, value: p.value };
    return true;
  }
}

export class PaxosProposer {
  private proposalNum: number;
  constructor(private readonly acceptors: PaxosAcceptor[], private readonly quorum: number) {
    this.proposalNum = 0;
  }
  /** Run a single round of Paxos. */
  propose(value: string): { chosen: string | null; proposalNumber: number } {
    this.proposalNum++;
    const p: PaxosProposal = { number: this.proposalNum, value };
    // Phase 1: prepare.
    const promises = this.acceptors.map((a) => a.prepare(p.number));
    if (promises.filter((pr) => pr.ok).length < this.quorum) {
      return { chosen: null, proposalNumber: p.number };
    }
    // If any acceptor has already accepted a value, we must use it.
    const accepted = promises
      .map((pr) => (pr.ok ? pr.accepted : null))
      .filter((a): a is { n: number; value: string } => a !== null)
      .sort((a, b) => b.n - a.n)[0];
    if (accepted) p.value = accepted.value;
    // Phase 2: accept.
    const accepts = this.acceptors.map((a) => a.accept(p));
    if (accepts.filter(Boolean).length >= this.quorum) {
      return { chosen: p.value, proposalNumber: p.number };
    }
    return { chosen: null, proposalNumber: p.number };
  }
}

// -----------------------------------------------------------------------------
// Raft — leader election + log replication (compact didactic form)
// -----------------------------------------------------------------------------

export type RaftRole = 'follower' | 'candidate' | 'leader';
export type RaftState = 'leader' | 'follower' | 'candidate';

export interface RaftLogEntry {
  term: number;
  index: number;
  command: string;
}

export class RaftNode {
  role: RaftRole = 'follower';
  currentTerm = 0;
  votedFor: string | null = null;
  log: RaftLogEntry[] = [];
  commitIndex = 0;
  lastApplied = 0;
  /** Per-peer nextIndex/ matchIndex, simplified to a single matchIndex map. */
  matchIndex: Map<string, number> = new Map();
  nextIndex: Map<string, number> = new Map();

  constructor(public readonly id: string, public readonly peers: string[]) {
    for (const p of peers) {
      this.matchIndex.set(p, -1);
      this.nextIndex.set(p, 0);
    }
  }

  /** Become a candidate and vote for ourselves. */
  becomeCandidate(): { term: number; votes: number } {
    this.role = 'candidate';
    this.currentTerm++;
    this.votedFor = this.id;
    return { term: this.currentTerm, votes: 1 };
  }

  /** Receive a vote request. */
  requestVote(peer: string, term: number, lastLogIndex: number, lastLogTerm: number): 'granted' | 'denied' {
    if (term < this.currentTerm) return 'denied';
    if (term > this.currentTerm) {
      this.currentTerm = term;
      this.role = 'follower';
      this.votedFor = null;
    }
    const myLastIndex = this.log.length - 1;
    const myLastTerm = myLastIndex >= 0 ? this.log[myLastIndex]!.term : 0;
    const logOk =
      lastLogTerm > myLastTerm ||
      (lastLogTerm === myLastTerm && lastLogIndex >= myLastIndex);
    if (logOk && (this.votedFor === null || this.votedFor === peer)) {
      this.votedFor = peer;
      return 'granted';
    }
    return 'denied';
  }

  /** Append a new command as leader. */
  append(command: string): RaftLogEntry {
    if (this.role !== 'leader') throw new Error('not leader');
    const entry: RaftLogEntry = { term: this.currentTerm, index: this.log.length, command };
    this.log.push(entry);
    return entry;
  }

  /** Receive an AppendEntries RPC. */
  appendEntries(leader: string, term: number, prevIndex: number, prevTerm: number, entries: RaftLogEntry[], leaderCommit: number): 'ok' | 'rejected' {
    if (term < this.currentTerm) return 'rejected';
    if (term > this.currentTerm) {
      this.currentTerm = term;
      this.role = 'follower';
      this.votedFor = null;
    }
    if (prevIndex >= 0) {
      const prev = this.log[prevIndex];
      if (!prev || prev.term !== prevTerm) return 'rejected';
    }
    // Append new entries, truncating any conflicting ones.
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i]!;
      const idx = prevIndex + 1 + i;
      if (idx < this.log.length) {
        if (this.log[idx]!.term !== e.term) {
          this.log = this.log.slice(0, idx);
          this.log.push(e);
        }
      } else {
        this.log.push(e);
      }
    }
    if (leaderCommit > this.commitIndex) {
      this.commitIndex = Math.min(leaderCommit, this.log.length - 1);
    }
    void leader;
    return 'ok';
  }

  /** Update matchIndex for a peer (called by leader after a successful AppendEntries). */
  recordMatch(peer: string, index: number): void {
    this.matchIndex.set(peer, index);
    this.nextIndex.set(peer, index + 1);
    // Compute the highest index replicated on a majority, including the leader.
    const all = [...Array.from(this.matchIndex.values()), this.log.length - 1];
    const sorted = all.sort((a, b) => a - b);
    const majorityIndex = sorted[Math.floor(sorted.length / 2)] ?? -1;
    if (majorityIndex > this.commitIndex) {
      const entry = this.log[majorityIndex];
      if (entry && entry.term === this.currentTerm) {
        this.commitIndex = majorityIndex;
      }
    }
  }
}
