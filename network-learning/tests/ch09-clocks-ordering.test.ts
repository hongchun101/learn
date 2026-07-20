import { describe, it, expect } from 'vitest';
import {
  LamportClock, VectorClock, HybridLogicalClock, ntpOffset,
  SimulatedTrueTime, MonotonicClock, FencingTokenIssuer, FencedStorage,
  demo as ch09Demo,
} from '../src/09-clocks-ordering/index.js';

describe('09 — Lamport', () => {
  it('ticks monotonically', () => {
    const lc = new LamportClock();
    expect(lc.now()).toBe(0);
    expect(lc.tick()).toBe(1);
    expect(lc.tick()).toBe(2);
  });
  it('receive advances to max(remote, local) + 1', () => {
    const lc = new LamportClock();
    lc.tick(); lc.tick();
    expect(lc.receive(10)).toBe(11);
    expect(lc.receive(5)).toBe(12);
  });
  it('compare breaks ties with process id', () => {
    const r = LamportClock.compare({ t: 1, pid: 'A' }, { t: 1, pid: 'B' });
    expect(r).toBeLessThan(0);
  });
});

describe('09 — Vector clock', () => {
  it('tick and receive update correctly', () => {
    const vc = new VectorClock(['A', 'B']);
    vc.tick('A');
    vc.receive('B', { A: 1, B: 0 });
    expect(vc.now()).toEqual({ A: 1, B: 1 });
  });
  it('compare detects before, after, concurrent, equal', () => {
    expect(VectorClock.compare({ A: 1 }, { A: 2 })).toBe('before');
    expect(VectorClock.compare({ A: 2 }, { A: 1 })).toBe('after');
    expect(VectorClock.compare({ A: 1, B: 0 }, { A: 0, B: 1 })).toBe('concurrent');
    expect(VectorClock.compare({ A: 1, B: 1 }, { A: 1, B: 1 })).toBe('equal');
  });
});

describe('09 — HLC', () => {
  it('local event advances', () => {
    let t = 1000;
    const hlc = new HybridLogicalClock(() => t);
    hlc.localEvent();
    t = 2000;
    hlc.localEvent();
    expect(hlc.now().pt).toBe(2000);
  });
  it('receive keeps pt >= max(physical, remote.pt)', () => {
    let t = 1000;
    const hlc = new HybridLogicalClock(() => t);
    hlc.receive({ pt: 2000, lt: 5 });
    expect(hlc.now().pt).toBe(2000);
  });
});

describe('09 — NTP offset', () => {
  it('picks the sample with the lowest delay', () => {
    const samples: Array<[number, number, number, number]> = [
      [100, 105, 110, 120], // delay 5
      [200, 210, 215, 230], // delay 5
      [300, 300, 300, 302], // delay 2 — best
    ];
    const best = ntpOffset(samples);
    expect(best.delay).toBe(2);
  });
});

describe('09 — TrueTime', () => {
  it('returns an interval', () => {
    const tt = new SimulatedTrueTime(0, 5, () => 1000);
    const t = tt.now();
    expect(t.latest).toBeGreaterThanOrEqual(t.earliest);
  });
});

describe('09 — Monotonic clock', () => {
  it('never goes backwards', () => {
    let t = 1000;
    const mc = new MonotonicClock(() => t);
    expect(mc.now()).toBe(1000);
    t = 999;
    expect(mc.now()).toBe(1000);
    t = 1005;
    expect(mc.now()).toBe(1005);
  });
});

describe('09 — Fencing tokens', () => {
  it('rejects stale writes', () => {
    const issuer = new FencingTokenIssuer();
    const s = new FencedStorage();
    const t1 = issuer.issue();
    const t2 = issuer.issue();
    expect(s.write('k', 'v1', t1).ok).toBe(true);
    expect(s.write('k', 'v1-stale', t1).ok).toBe(false);
    expect(s.write('k', 'v2', t2).ok).toBe(true);
    expect(s.read('k')).toBe('v2');
  });
});

describe('09 — demo', () => {
  it('runs end-to-end', () => {
    expect(() => ch09Demo()).not.toThrow();
  });
});
