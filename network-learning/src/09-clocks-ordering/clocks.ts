// =============================================================================
// Chapter 09 — Time, Clocks, and Ordering
// =============================================================================
// Goal: every distributed system needs a notion of "what happened first".
// This file covers the algorithms and abstractions that let you answer
// that question when there is no shared clock.
//
//   * Lamport timestamps (1978): a total order on events.
//   * Vector clocks (Mattern 1988): a partial order; detect concurrent events.
//   * Hybrid Logical Clocks (Kulkarni 2014): combine physical time with
//     logical ordering for cross-system correlation.
//   * NTP-style offset estimation: min(round-trip) / 2 as the true offset.
//   * TrueTime (Spanner): an interval API backed by GPS + atomic clocks.
//   * Monotonic clocks: avoid backwards time jumps.
//   * Fencing tokens (Kleppmann 2016): prevent stale writes from corrupting
//     storage.
// =============================================================================

// -----------------------------------------------------------------------------
// Lamport timestamps
// -----------------------------------------------------------------------------

export class LamportClock {
  private t = 0;
  /** Get the current logical time. */
  now(): number { return this.t; }
  /** Observe a local event. */
  tick(): number { this.t++; return this.t; }
  /** Observe a message received with remote timestamp. */
  receive(remote: number): number {
    this.t = Math.max(this.t, remote) + 1;
    return this.t;
  }
  /** Compare two timestamps with a tie-breaker (e.g. process id). */
  static compare(a: { t: number; pid: string }, b: { t: number; pid: string }): number {
    return a.t !== b.t ? a.t - b.t : a.pid.localeCompare(b.pid);
  }
}

// -----------------------------------------------------------------------------
// Vector clocks
// -----------------------------------------------------------------------------

export class VectorClock {
  private readonly clock: Map<string, number>;
  constructor(peers: string[], initial?: Record<string, number>) {
    this.clock = new Map(peers.map((p) => [p, initial?.[p] ?? 0] as const));
  }
  static empty(): VectorClock { return new VectorClock([]); }
  now(): Record<string, number> {
    return Object.fromEntries(this.clock);
  }
  tick(peer: string): void {
    this.clock.set(peer, (this.clock.get(peer) ?? 0) + 1);
  }
  receive(peer: string, remote: Record<string, number>): void {
    for (const [k, v] of Object.entries(remote)) this.clock.set(k, Math.max(this.clock.get(k) ?? 0, v));
    this.tick(peer);
  }
  static compare(a: Record<string, number>, b: Record<string, number>): 'before' | 'after' | 'equal' | 'concurrent' {
    let aLess = false, bLess = false;
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const av = a[k] ?? 0;
      const bv = b[k] ?? 0;
      if (av < bv) aLess = true;
      else if (av > bv) bLess = true;
    }
    if (!aLess && !bLess) return 'equal';
    if (aLess && !bLess) return 'before';
    if (bLess && !aLess) return 'after';
    return 'concurrent';
  }
}

// -----------------------------------------------------------------------------
// Hybrid Logical Clock
// =============================================================================

export class HybridLogicalClock {
  private pt = 0; // physical time
  private lt = 0; // logical time
  constructor(private readonly physicalNow: () => number = () => Date.now()) {}

  now(): { pt: number; lt: number } { return { pt: this.pt, lt: this.lt }; }

  /** Local event: advance to (now, lt+1). */
  localEvent(): { pt: number; lt: number } {
    const pt = this.physicalNow();
    if (pt > this.pt) { this.pt = pt; this.lt = 0; }
    else { this.lt++; }
    return this.now();
  }

  /** Receive event with remote HLC. */
  receive(remote: { pt: number; lt: number }): { pt: number; lt: number } {
    const pt = Math.max(this.physicalNow(), remote.pt);
    if (pt === this.pt && pt === remote.pt) {
      this.lt = Math.max(this.lt, remote.lt) + 1;
    } else if (pt === this.pt) {
      this.lt++;
    } else if (pt === remote.pt) {
      this.lt = remote.lt + 1;
    } else {
      this.lt = 0;
    }
    this.pt = pt;
    return this.now();
  }
}

// -----------------------------------------------------------------------------
// NTP-style offset estimation
// =============================================================================

/**
 * Estimate the offset between two clocks given a list of NTP-style
 * (t1, t2, t3, t4) samples:
 *   t1 = client send time, t2 = server receive time, t3 = server send time,
 *   t4 = client receive time.
 * The true offset is in [offset - θ, offset + θ] where θ = (round-trip)/2.
 */
export function ntpOffset(samples: Array<[number, number, number, number]>): { offset: number; delay: number } {
  if (samples.length === 0) throw new RangeError('no samples');
  let best = { offset: 0, delay: Infinity };
  for (const [t1, t2, t3, t4] of samples) {
    const delay = (t4 - t1) - (t3 - t2);
    const offset = ((t2 - t1) + (t3 - t4)) / 2;
    if (delay < best.delay) best = { offset, delay };
  }
  return best;
}

// -----------------------------------------------------------------------------
// TrueTime-like API
// =============================================================================

export interface TrueTime {
  /** Returns an interval [earliest, latest] during which the real time lies. */
  now(): { earliest: number; latest: number };
}

/** A TrueTime whose error bound is constant. */
export class SimulatedTrueTime implements TrueTime {
  private lastSync = 0;
  constructor(private readonly offsetMs: number, private readonly errorMs: number, private readonly physical: () => number = () => Date.now()) {
    this.lastSync = physical();
  }
  now(): { earliest: number; latest: number } {
    const drift = this.errorMs * (this.physical() - this.lastSync) / 1000;
    const t = this.physical() + this.offsetMs;
    return { earliest: t - drift, latest: t + drift };
  }
  resync(): void { this.lastSync = this.physical(); }
}

// -----------------------------------------------------------------------------
// Monotonic clock wrapper
// =============================================================================

/** A clock that never goes backwards. */
export class MonotonicClock {
  private last = 0;
  private readonly physical: () => number;
  constructor(physical: () => number = () => Date.now()) {
    this.physical = physical;
  }
  now(): number {
    const t = this.physical();
    if (t > this.last) this.last = t;
    return this.last;
  }
}

// -----------------------------------------------------------------------------
// Fencing tokens — strictly increasing tokens issued to lock holders so a
// stale client cannot corrupt storage.
// =============================================================================

export class FencingTokenIssuer {
  private counter = 0;
  issue(): number {
    this.counter++;
    return this.counter;
  }
  get current(): number { return this.counter; }
}

/** A storage write that checks the fencing token before applying. */
export class FencedStorage {
  private highestSeen = 0;
  private values = new Map<string, { value: string; token: number }>();
  write(key: string, value: string, token: number): { ok: boolean; reason?: string } {
    if (token <= this.highestSeen) return { ok: false, reason: 'stale token' };
    this.values.set(key, { value, token });
    this.highestSeen = token;
    return { ok: true };
  }
  read(key: string): string | undefined {
    return this.values.get(key)?.value;
  }
}
