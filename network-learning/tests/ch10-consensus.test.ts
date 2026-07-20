import { describe, it, expect } from 'vitest';
import {
  TwoPcCoordinator, TwoPcParticipant, PaxosAcceptor, PaxosProposer, RaftNode,
  demo as ch10Demo,
} from '../src/10-consensus/index.js';

describe('10 — 2PC', () => {
  it('commits if all vote yes', () => {
    const c = new TwoPcCoordinator();
    const ps = [new TwoPcParticipant(), new TwoPcParticipant()];
    expect(c.run(ps)).toBe('committed');
    for (const p of ps) expect(p.state).toBe('committed');
  });
  it('aborts if any vote no', () => {
    const c = new TwoPcCoordinator();
    const ps = [new TwoPcParticipant(), new TwoPcParticipant()];
    ps[0]!.state = 'aborted';
    expect(c.run(ps)).toBe('aborted');
  });
});

describe('10 — Paxos', () => {
  it('chooses the first value with a majority', () => {
    const accs = [new PaxosAcceptor(), new PaxosAcceptor(), new PaxosAcceptor()];
    const p = new PaxosProposer(accs, 2);
    const r = p.propose('v1');
    expect(r.chosen).toBe('v1');
  });
  it('preserves an already-chosen value', () => {
    const accs = [new PaxosAcceptor(), new PaxosAcceptor(), new PaxosAcceptor()];
    const p = new PaxosProposer(accs, 2);
    p.propose('chosen');
    // A second proposal from the same proposer (with a higher number) must
    // still pick 'chosen' because the acceptors already accepted it.
    const r = p.propose('override');
    expect(r.chosen).toBe('chosen');
  });
});

describe('10 — Raft', () => {
  it('append + replicate advances commitIndex', () => {
    const a = new RaftNode('A', ['B', 'C']);
    a.role = 'leader';
    a.currentTerm = 1;
    a.append('x=1');
    a.append('y=2');
    a.recordMatch('B', 0);
    expect(a.commitIndex).toBe(0);
    a.recordMatch('B', 1);
    expect(a.commitIndex).toBe(1);
  });
  it('rejects AppendEntries with wrong prevTerm', () => {
    const a = new RaftNode('A', []);
    a.currentTerm = 1;
    a.log.push({ term: 1, index: 0, command: 'x' });
    expect(a.appendEntries('L', 1, 0, 2, [], 0)).toBe('rejected');
  });
  it('requestVote grants to first candidate with up-to-date log', () => {
    const a = new RaftNode('A', []);
    expect(a.requestVote('B', 1, -1, 0)).toBe('granted');
    expect(a.requestVote('C', 1, -1, 0)).toBe('denied');
  });
});

describe('10 — demo', () => {
  it('runs end-to-end', () => {
    expect(() => ch10Demo()).not.toThrow();
  });
});
