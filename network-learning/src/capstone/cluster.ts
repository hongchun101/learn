// =============================================================================
// Capstone — Cluster + client (chapters 08, 09, 11, 12)
// =============================================================================
// This file ties the rest of the capstone together. The cluster has a leader
// (the first node) and N followers; each runs a KvStore. The client uses
// jittered backoff + idempotency keys (ch08) and an HLC (ch09) for ordering.
// Every operation carries a W3C trace id (ch12) and emits a structured log
// line.
//
// The transport is in-process: there is no real network. The cluster and the
// client run in the same JavaScript realm; "wire" bytes pass via method
// calls. The encoding/decoding in `wire.ts` is exercised end-to-end so the
// byte-level protocol is the very same one a real network would carry.
// =============================================================================

import { encodeOp, decodeOp, type Op } from './wire.js';
import { KvStore } from './store.js';
import { RaftLog } from './raft.js';
import { HybridLogicalClock } from '../09-clocks-ordering/clocks.js';
import { IdempotencyStore, backoffDelay } from '../08-reliability-retries/reliability.js';
import { StructuredLogger } from '../12-advanced/index.js';

function bytesToHex(b: Uint8Array): string {
  let out = '';
  for (const x of b) out += x.toString(16).padStart(2, '0');
  return out;
}

function keyHex(b: Uint8Array): string {
  return bytesToHex(b);
}

// -----------------------------------------------------------------------------
// Cluster
// -----------------------------------------------------------------------------

export interface ClusterNode {
  id: string;
  store: KvStore;
  log: RaftLog;
}

export class Cluster {
  private readonly nodes: ClusterNode[];
  private readonly logger: StructuredLogger;

  constructor(nodeIds: string[]) {
    this.logger = new StructuredLogger();
    this.nodes = [];
    for (const id of nodeIds) {
      const otherIds = nodeIds.filter((x) => x !== id);
      this.nodes.push({
        id,
        store: new KvStore(),
        log: new RaftLog(otherIds),
      });
    }
  }

  leader(): ClusterNode {
    return this.nodes[0]!;
  }

  nodes_(): readonly ClusterNode[] {
    return this.nodes;
  }

  /** Apply a put at the leader; replicate to followers; commit when majority. */
  put(op: Op): { ok: boolean; traceId: string } {
    const leader = this.leader();
    const entry = leader.log.append(op);
    // Replicate to every follower (small N; full re-sync is fine here).
    for (const f of this.nodes.slice(1)) {
      leader.log.replicateTo(f.id, 0);
    }
    let committed = false;
    if (leader.log.tryCommit()) {
      committed = true;
      const applied = leader.log.appliedAt(leader.log.currentCommit());
      for (const e of applied) {
        if (e.op.kind === 'put' && e.op.value) {
          for (const node of this.nodes) {
            node.store.put(e.op.key, {
              value: e.op.value,
              ts: op.clientTs,
              idempotencyKey: e.op.idempotencyKey,
            });
          }
        }
      }
    }
    const traceId = bytesToHex(op.traceId);
    this.logger.log('info', 'cluster.put', null, {
      key: op.key,
      ok: true,
      index: entry.index,
      committed,
      traceId,
    });
    return { ok: true, traceId };
  }

  get(key: string, traceId: Uint8Array): { value?: Uint8Array; ts?: number; traceId: string } {
    const entry = this.leader().store.get(key);
    const id = bytesToHex(traceId);
    this.logger.log('info', 'cluster.get', null, { key, hit: !!entry, traceId: id });
    if (!entry) return { traceId: id };
    return { value: entry.value, ts: entry.ts, traceId: id };
  }

  logLines(): readonly { timestamp: number; level: string; message: string; attributes: Record<string, unknown> }[] {
    return this.logger.lines_;
  }
}

// -----------------------------------------------------------------------------
// Client
// -----------------------------------------------------------------------------

export interface ClientOptions {
  maxAttempts?: number;
  baseMs?: number;
  clock: HybridLogicalClock;
  idempotency: IdempotencyStore;
  cluster: Cluster;
}

export class Client {
  private readonly maxAttempts: number;
  private readonly baseMs: number;
  private readonly clock: HybridLogicalClock;
  private readonly idempotency: IdempotencyStore;
  private readonly cluster: Cluster;

  constructor(opts: ClientOptions) {
    this.maxAttempts = opts.maxAttempts ?? 3;
    this.baseMs = opts.baseMs ?? 10;
    this.clock = opts.clock;
    this.idempotency = opts.idempotency;
    this.cluster = opts.cluster;
  }

  async put(key: string, value: Uint8Array, idempotencyKey: Uint8Array, traceId: Uint8Array): Promise<{ ok: boolean; traceId: string }> {
    const op: Op = {
      kind: 'put',
      key,
      value,
      idempotencyKey,
      traceId,
      clientTs: this.clock.localEvent().pt,
    };
    const wire = encodeOp(op);
    const decoded = decodeOp(wire);
    if ('error' in decoded) throw new Error(`wire: ${decoded.error}`);

    const keyId = keyHex(idempotencyKey);
    let attempt = 0;
    while (true) {
      const existing = this.idempotency.get(keyId);
      if (existing && existing.status === 'completed') {
        return existing.result as { ok: boolean; traceId: string };
      }
      try {
        const result = this.cluster.put(decoded);
        this.idempotency.complete(keyId, result);
        return result;
      } catch (e) {
        attempt++;
        if (attempt >= this.maxAttempts) throw e;
        const delay = backoffDelay(
          { baseMs: this.baseMs, maxMs: 1000, maxAttempts: this.maxAttempts, jitter: 'full' },
          attempt,
          this.baseMs,
        );
        const { promise, resolve } = Promise.withResolvers<void>();
        setTimeout(resolve, delay);
        await promise;
      }
    }
  }

  get(key: string, traceId: Uint8Array): { value?: Uint8Array; ts?: number; traceId: string } {
    return this.cluster.get(key, traceId);
  }
}
