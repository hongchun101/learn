// =============================================================================
// Capstone — tests
// =============================================================================

import { describe, it, expect } from 'vitest';
import { Cluster, Client } from '../src/capstone/cluster.js';
import { HybridLogicalClock } from '../src/09-clocks-ordering/clocks.js';
import { IdempotencyStore } from '../src/08-reliability-retries/reliability.js';
import { encodeOp, decodeOp } from '../src/capstone/wire.js';
import { KvStore } from '../src/capstone/store.js';
import { RaftLog } from '../src/capstone/raft.js';

function bytes(n: number, seed: number): Uint8Array {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = (i * seed + 1) & 0xff;
  return out;
}

function newClock(): HybridLogicalClock {
  return new HybridLogicalClock(() => 0);
}

function newCluster(): { cluster: Cluster; client: Client; clock: HybridLogicalClock; idempotency: IdempotencyStore } {
  const cluster = new Cluster(['n1', 'n2', 'n3']);
  const clock = newClock();
  const idempotency = new IdempotencyStore(60_000, () => 0);
  const client = new Client({ clock, idempotency, cluster });
  return { cluster, client, clock, idempotency };
}

describe('capstone — wire', () => {
  it('round-trips a put operation', () => {
    const traceId = bytes(16, 7);
    const idempKey = bytes(16, 11);
    const value = new TextEncoder().encode('hi');
    const wire = encodeOp({ kind: 'put', key: 'k', value, idempotencyKey: idempKey, traceId, clientTs: 42 });
    const decoded = decodeOp(wire);
    expect('error' in decoded).toBe(false);
    if ('error' in decoded) return;
    expect(decoded.kind).toBe('put');
    expect(decoded.key).toBe('k');
    expect(decoded.clientTs).toBe(42);
    expect(new TextDecoder().decode(decoded.value!)).toBe('hi');
    expect(Array.from(decoded.traceId)).toEqual(Array.from(traceId));
  });

  it('round-trips a get operation', () => {
    const traceId = bytes(16, 13);
    const idempKey = bytes(16, 17);
    const wire = encodeOp({ kind: 'get', key: 'k', idempotencyKey: idempKey, traceId, clientTs: 1 });
    const decoded = decodeOp(wire);
    expect('error' in decoded).toBe(false);
    if ('error' in decoded) return;
    expect(decoded.kind).toBe('get');
    expect(decoded.value).toBeUndefined();
  });

  it('rejects an empty frame', () => {
    const dec = decodeOp(new Uint8Array([0x00, 0x00]));
    expect('error' in dec).toBe(true);
  });
});

describe('capstone — kv store', () => {
  it('puts and gets', () => {
    const s = new KvStore();
    const ok = s.put('k', { value: new Uint8Array([1, 2, 3]), ts: 1, idempotencyKey: bytes(16, 1) });
    expect(ok).toBe(true);
    expect(s.size()).toBe(1);
    expect(s.get('k')?.value).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('keeps the latest ts when reordered', () => {
    const s = new KvStore();
    const k1 = bytes(16, 1);
    const k2 = bytes(16, 2);
    s.put('k', { value: new Uint8Array([1]), ts: 30, idempotencyKey: k1 });
    s.put('k', { value: new Uint8Array([2]), ts: 10, idempotencyKey: k2 });
    expect(s.get('k')?.value).toEqual(new Uint8Array([1]));
    s.put('k', { value: new Uint8Array([3]), ts: 50, idempotencyKey: k2 });
    expect(s.get('k')?.value).toEqual(new Uint8Array([3]));
  });
  it('breaks ties with idempotency key', () => {
    const s = new KvStore();
    const k1 = bytes(16, 1);
    const k2 = bytes(16, 5);
    s.put('k', { value: new Uint8Array([1]), ts: 10, idempotencyKey: k1 });
    s.put('k', { value: new Uint8Array([2]), ts: 10, idempotencyKey: k2 });
    expect(s.get('k')?.value).toEqual(new Uint8Array([2]));
  });
});

describe('capstone — raft log', () => {
  it('appends and commits on majority', () => {
    const log = new RaftLog(['n2', 'n3']);
    log.append({ kind: 'put', key: 'k', value: new Uint8Array([1]), idempotencyKey: bytes(16, 1), traceId: bytes(16, 2), clientTs: 1 });
    log.replicateTo('n2', 0);
    log.replicateTo('n3', 0);
    expect(log.tryCommit()).toBe(true);
    expect(log.currentCommit()).toBe(1);
  });

  it('does not commit without a majority', () => {
    const log = new RaftLog(['n2', 'n3', 'n4']);
    log.append({ kind: 'put', key: 'k', value: new Uint8Array([1]), idempotencyKey: bytes(16, 1), traceId: bytes(16, 2), clientTs: 1 });
    log.replicateTo('n2', 0);
    expect(log.tryCommit()).toBe(false);
  });
});

describe('capstone — cluster end-to-end', () => {
  it('client.put replicates and reads back', async () => {
    const { cluster, client } = newCluster();
    const traceId = bytes(16, 19);
    const idempKey = bytes(16, 29);
    const value = new TextEncoder().encode('v');
    const put = await client.put('greeting', value, idempKey, traceId);
    expect(put.ok).toBe(true);
    expect(put.traceId).toBe(bytesToHex(traceId));
    const got = client.get('greeting', traceId);
    expect(got.value).toEqual(value);
    expect(cluster.nodes_().every((n) => n.store.get('greeting')?.value !== undefined)).toBe(true);
    expect(cluster.logLines().length).toBeGreaterThan(0);
  });

  it('idempotency replays the cached response', async () => {
    const { client } = newCluster();
    const traceId = bytes(16, 31);
    const idempKey = bytes(16, 37);
    const value = new TextEncoder().encode('v');
    const a = await client.put('k', value, idempKey, traceId);
    const b = await client.put('k', value, idempKey, traceId);
    expect(a).toEqual(b);
  });
});

function bytesToHex(b: Uint8Array): string {
  let out = '';
  for (const x of b) out += x.toString(16).padStart(2, '0');
  return out;
}
