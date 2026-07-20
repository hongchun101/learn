import { TwoPcCoordinator, TwoPcParticipant, PaxosAcceptor, PaxosProposer, RaftNode } from './consensus.js';

export function demo(): void {
  // ---- 2PC ----
  const c = new TwoPcCoordinator();
  const ps = [new TwoPcParticipant(), new TwoPcParticipant(), new TwoPcParticipant()];
  console.log('[10] 2PC result =', c.run(ps), 'states =', ps.map((p) => p.state));

  // ---- Paxos ----
  const acceptors = [new PaxosAcceptor(), new PaxosAcceptor(), new PaxosAcceptor()];
  const proposer = new PaxosProposer(acceptors, 2);
  const r1 = proposer.propose('v1');
  const r2 = proposer.propose('v2');
  console.log('[10] Paxos chose =', r1.chosen, ', then', r2.chosen);

  // ---- Raft: 3 nodes, leader appends entries ----
  const a = new RaftNode('A', ['B', 'C']);
  const b = new RaftNode('B', ['A', 'C']);
  const c2 = new RaftNode('C', ['A', 'B']);
  a.role = 'leader';
  a.currentTerm = 1;
  const e1 = a.append('SET x=1');
  const e2 = a.append('SET y=2');
  // Replicate to B
  b.appendEntries('A', 1, e1.index - 1, e1.term, [e1, e2], a.commitIndex);
  c2.appendEntries('A', 1, e2.index - 1, e2.term, [e1, e2], a.commitIndex);
  a.recordMatch('B', e2.index);
  a.recordMatch('C', e2.index);
  console.log('[10] Raft A log =', a.log.map((l) => l.command), 'commitIndex =', a.commitIndex);
  console.log('[10] Raft B log =', b.log.map((l) => l.command), 'commitIndex =', b.commitIndex);
  console.log('[10] Raft C log =', c2.log.map((l) => l.command), 'commitIndex =', c2.commitIndex);
}
