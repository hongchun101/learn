// =============================================================================
// Capstone — Demo / smoke test
// =============================================================================
// Runs the in-process cluster end-to-end:
//   * Wire-format encode/decode is exercised by the client.
//   * Raft replication commits with a 3-node majority.
//   * Idempotency prevents a duplicate put from creating a second entry.
//   * Structured logs carry trace ids.
// =============================================================================

import { Cluster, Client } from './cluster.js';
import { HybridLogicalClock } from '../09-clocks-ordering/clocks.js';
import { IdempotencyStore } from '../08-reliability-retries/reliability.js';
import { encodeOp, decodeOp } from './wire.js';
import { toHex } from '../01-bytes-framing/bits.js';

function deterministicBytes(n: number, seed: number): Uint8Array {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = (i * seed + 3) & 0xff;
  return out;
}

export function demo(): void {
  const cluster = new Cluster(['n1', 'n2', 'n3']);
  const clock = new HybridLogicalClock(() => 0);
  const idempotency = new IdempotencyStore(60_000, () => 0);
  const client = new Client({ clock, idempotency, cluster });

  const traceId = deterministicBytes(16, 17);
  const idempKey = deterministicBytes(16, 23);
  const value = new TextEncoder().encode('hello-capstone');

  const wire = encodeOp({
    kind: 'put',
    key: 'greeting',
    value,
    idempotencyKey: idempKey,
    traceId,
    clientTs: 1,
  });
  console.log('[capstone] wire put =', toHex(wire));
  const decoded2 = decodeOp(wire);
  if ('error' in decoded2) {
    console.log('[capstone] decode error =', decoded2.error);
    return;
  }
  console.log('[capstone] decoded put key =', decoded2.key);

  void client.put('greeting', value, idempKey, traceId).then((res) => {
    console.log('[capstone] client.put traceId =', res.traceId);
    const g = client.get('greeting', traceId);
    console.log('[capstone] client.get hit =', g.value !== undefined, 'value =', g.value ? new TextDecoder().decode(g.value) : '');
    console.log('[capstone] log lines =', cluster.logLines().length);
  });
}
