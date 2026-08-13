// =============================================================================
// Capstone — Raft-style log replication (chapter 10)
// =============================================================================
// A minimal, didactic Raft *log replication* layer. The capstone focuses on
// the log; leader election is simulated by always designating the leader
// node (the cluster's first node). Real Raft adds randomised timeouts,
// snapshot transfer, and joint consensus. The point is to show how a single
// committed entry flows from the leader to a majority.
// =============================================================================

import type { Op } from './wire.js';

export interface LogEntry {
  index: number;
  term: number;
  op: Op;
}

export interface Ack {
  /** Highest log index this follower has. */
  matchedIndex: number;
}

export class RaftLog {
  private readonly entries: LogEntry[] = [];
  private readonly followers: { id: string; matchedIndex: number }[];
  private term = 1;
  private commitIndex = 0;

  constructor(followerIds: string[]) {
    this.followers = followerIds.map((id) => ({ id, matchedIndex: 0 }));
  }

  currentTerm(): number {
    return this.term;
  }

  currentCommit(): number {
    return this.commitIndex;
  }

  append(op: Op): LogEntry {
    const entry: LogEntry = {
      index: this.entries.length + 1,
      term: this.term,
      op,
    };
    this.entries.push(entry);
    return entry;
  }

  /** Apply a batch of entries to a follower; returns the new matched index. */
  replicateTo(followerId: string, fromIndex: number): { entries: LogEntry[]; newIndex: number } {
    const f = this.followers.find((x) => x.id === followerId);
    if (!f) return { entries: [], newIndex: 0 };
    const slice = this.entries.slice(fromIndex);
    const newIndex = fromIndex + slice.length;
    if (newIndex > f.matchedIndex) f.matchedIndex = newIndex;
    return { entries: slice, newIndex };
  }

  /**
   * Advance the commit index. Per Raft, a leader commits an entry from the
   * current term when a majority of nodes have it. Returns true if the
   * commit index changed.
   */
  tryCommit(): boolean {
    const indices = [...this.followers.map((f) => f.matchedIndex), this.entries.length];
    indices.sort((a, b) => b - a);
    const majorityIndex = indices[Math.floor(indices.length / 2)] ?? 0;
    if (
      majorityIndex > this.commitIndex &&
      this.entries[majorityIndex - 1]?.term === this.term
    ) {
      this.commitIndex = majorityIndex;
      return true;
    }
    return false;
  }

  log(): readonly LogEntry[] {
    return this.entries;
  }

  appliedAt(commitIndex: number): LogEntry[] {
    return this.entries.slice(0, commitIndex);
  }
}
