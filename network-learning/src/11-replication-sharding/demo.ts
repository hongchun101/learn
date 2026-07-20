import { PrimaryBackupGroup, ChainReplication, ConsistentHash, GossipNode, LsmTree, MvccStore, Replica } from './replication.js';

function r(id: string, role: 'primary' | 'backup' | 'down' = 'backup'): Replica {
  return { id, state: new Map(), role };
}

export function demo(): void {
  // ---- Primary-backup ----
  const pg = new PrimaryBackupGroup([r('A', 'primary'), r('B'), r('C')]);
  console.log('[11] primary-backup sync write =', pg.put('k', 'v1', 1, 'sync'));
  console.log('[11] primary-backup read(quorum 2) =', pg.get('k', 2));

  // ---- Chain replication ----
  const cr = new ChainReplication([r('A', 'primary'), r('B'), r('C')]);
  cr.put('k', 'chain-v');
  console.log('[11] chain get =', cr.get('k'));

  // ---- Consistent hashing ----
  const ch = new ConsistentHash(['n1', 'n2', 'n3'], { replicas: 16 });
  const owners = new Map<string, number>();
  for (let i = 0; i < 1000; i++) {
    const owner = ch.pick(`key-${i}`);
    owners.set(owner, (owners.get(owner) ?? 0) + 1);
  }
  console.log('[11] consistent-hash distribution =', Array.from(owners.entries()).map(([k, v]) => `${k}:${v}`).join(' '));
  console.log('[11] pickN(key-0, 2) =', ch.pickN('key-0', 2));

  // ---- Gossip ----
  let t = 0;
  const a = new GossipNode('A', '10.0.0.1', () => t);
  const b = new GossipNode('B', '10.0.0.2', () => t);
  a.touch('B', '10.0.0.2');
  b.merge(a.buildMessage());
  t = 2000;
  a.markStale(1000, 5000);
  console.log('[11] gossip A known =', a.knownMembers());
  console.log('[11] gossip B known =', b.knownMembers());

  // ---- LSM tree ----
  const lsm = new LsmTree();
  for (let i = 0; i < 50; i++) lsm.put(`k${i.toString().padStart(3, '0')}`, `v${i}`);
  lsm.flush();
  for (let i = 0; i < 10; i++) lsm.put(`k${i.toString().padStart(3, '0')}`, `v${i}-new`);
  console.log('[11] lsm size =', lsm.size(), 'get k000 =', lsm.get('k000'));

  // ---- MVCC ----
  const mv = new MvccStore();
  const tx1 = mv.beginTx();
  tx1.write('k', 'v1');
  const v1 = tx1.commit();
  const tx2 = mv.beginTx(v1);
  tx2.write('k', 'v2');
  const v2 = tx2.commit();
  console.log('[11] mvcc snapshot at v1 =', tx2 ? null : null);
  // tx1 was committed, tx2 reads current state.
  const r1 = mv.read('k');
  console.log('[11] mvcc current =', r1);
  void v1; void v2;
}
