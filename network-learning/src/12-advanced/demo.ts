import { Saga, GCounter, PNCounter, LwwRegister, OrSet, PartitionedLog, parseTraceParent, formatTraceParent, isSampled, childContext, newSpanId, newTraceId, Tracer, StructuredLogger } from './advanced.js';

export function demo(): void {
  // ---- Saga ----
  const saga = new Saga([
    { name: 'reserve-inventory', forward: async () => { /* ... */ }, compensate: async () => { /* release */ } },
    { name: 'charge-card',       forward: async () => { /* ... */ }, compensate: async () => { /* refund */ } },
    { name: 'ship-order',        forward: async () => { /* ... */ }, compensate: async () => { /* cancel */ } },
  ]);
  void saga.run();

  // ---- CRDTs ----
  const a = new GCounter('A');
  const b = new GCounter('B');
  a.inc('A', 3); b.inc('B', 5);
  const merged = GCounter.merge(a, b);
  console.log('[12] G-Counter merged value =', merged.value());

  const pn = new PNCounter('A');
  pn.inc('A', 5); pn.dec('A', 2);
  console.log('[12] PN-Counter value =', pn.value());

  const r1 = new LwwRegister<string>();
  r1.set('hello', 1); r1.set('world', 2);
  const r2 = new LwwRegister<string>(); r2.set('foo', 0);
  const mergedR = LwwRegister.merge(r1, r2);
  console.log('[12] LWW-Register merged =', mergedR.get());

  const s1 = new OrSet<string>('n1');
  s1.add('apple'); s1.add('banana');
  const s2 = new OrSet<string>('n2');
  s2.add('cherry');
  const mergedS = OrSet.merge(s1, s2);
  console.log('[12] OR-Set merged =', mergedS.values().sort());

  // ---- Log-based messaging ----
  const log = new PartitionedLog(3);
  for (let i = 0; i < 10; i++) {
    const r = log.append(`k${i}`, new TextEncoder().encode(`msg-${i}`));
    if (i === 4) log.commit('consumer-1', r.partition, r.offset + 1);
  }
  console.log('[12] log size =', log.size());
  console.log('[12] read partition 0 =', log.read(0, 'consumer-1').length, 'records');

  // ---- Trace context ----
  const traceId = newTraceId();
  const spanId = newSpanId();
  const flags = 0x01;
  const parent = formatTraceParent({ traceId, spanId, flags });
  console.log('[12] traceparent =', parent);
  const parsed = parseTraceParent(parent)!;
  console.log('[12] parsed sampled =', isSampled(parsed));
  const child = childContext(parsed, newSpanId());
  console.log('[12] child traceparent =', formatTraceParent(child));

  // ---- Tracer + structured logger ----
  const tracer = new Tracer();
  const logger = new StructuredLogger();
  const span = tracer.startSpan('GET /orders', null, { 'http.method': 'GET' });
  logger.log('info', 'starting request', span.ctx);
  span.end('ok');
  console.log('[12] finished spans =', tracer.finishedSpans().length);
  console.log('[12] log lines =', logger.lines_.length);
}
