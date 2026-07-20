import { LamportClock, VectorClock, HybridLogicalClock, ntpOffset, SimulatedTrueTime, MonotonicClock, FencingTokenIssuer, FencedStorage } from './clocks.js';

export function demo(): void {
  const lc = new LamportClock();
  lc.tick();
  lc.tick();
  lc.receive(5);
  console.log('[09] Lamport after receive(5) =', lc.now());

  const vc = new VectorClock(['A', 'B', 'C']);
  vc.tick('A');
  vc.tick('B');
  console.log('[09] VectorClock after A and B ticked =', vc.now());
  const c1 = { A: 1, B: 0, C: 0 };
  const c2 = { A: 0, B: 1, C: 0 };
  console.log('[09] vc1 vs vc2 =', VectorClock.compare(c1, c2));

  const hlc = new HybridLogicalClock(() => 1000);
  console.log('[09] hlc localEvent =', hlc.localEvent());
  console.log('[09] hlc receive(remote 999) =', hlc.receive({ pt: 999, lt: 1 }));

  const samples: Array<[number, number, number, number]> = [
    [100, 110, 115, 130], // delay 5, offset -2.5
    [200, 220, 230, 250], // delay 0, offset 0
    [300, 305, 320, 330], // delay 5, offset -2.5
  ];
  const ntp = ntpOffset(samples);
  console.log('[09] NTP best estimate =', ntp);

  const tt = new SimulatedTrueTime(50, 5, () => 10000);
  console.log('[09] TrueTime =', tt.now());

  let now = 1000;
  const mc = new MonotonicClock(() => now);
  console.log('[09] mono t=1000 =', mc.now());
  now = 999; // backwards jump
  console.log('[09] mono t=999 (jumped back) =', mc.now(), '(should still be 1000)');
  now = 1005;
  console.log('[09] mono t=1005 =', mc.now());

  const issuer = new FencingTokenIssuer();
  const storage = new FencedStorage();
  const t1 = issuer.issue();
  const t2 = issuer.issue();
  console.log('[09] write t1 =', storage.write('k', 'v1', t1));
  console.log('[09] write t1 again =', storage.write('k', 'v1-stale', t1), '— stale rejected');
  console.log('[09] write t2 =', storage.write('k', 'v2', t2), '— read =', storage.read('k'));
}
