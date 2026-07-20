import {
  encodeUdp, decodeUdp,
  encodeTcp, decodeTcp, TCP_FLAGS,
  TcpStateMachine,
  RttEstimator, SlidingWindow,
  decodeQuicHeader,
} from './transport.js';
import { toHex } from '../01-bytes-framing/bits.js';

export function demo(): void {
  // UDP
  const u = encodeUdp({ srcPort: 5353, dstPort: 5353, length: 8 + 4, checksum: 0, payload: new Uint8Array([1, 2, 3, 4]) });
  console.log('[05] udp =', toHex(u), 'decoded dst =', decodeUdp(u).dstPort);

  // TCP
  const t = encodeTcp({
    srcPort: 12345, dstPort: 80, seq: 0xdeadbeef, ack: 0xfeedface,
    dataOffset: 5, flags: TCP_FLAGS.SYN, window: 65535, checksum: 0, urgent: 0,
  });
  console.log('[05] tcp =', toHex(t));
  const td = decodeTcp(t);
  console.log(`[05] tcp seq=${td.seq.toString(16)} flags=${td.flags.toString(16)}`);

  // TCP state machine — server side
  const server = new TcpStateMachine();
  server.tick('listen');
  server.tick('syn');         // got client SYN
  server.tick('ack');         // we ack → ESTABLISHED
  server.tick('close');       // we close
  server.tick('fin');         // client also closed
  server.tick('ack');         // final ack
  console.log('[05] server final state =', server.state);

  // RTT estimator
  const rtt = new RttEstimator();
  for (const r of [0.1, 0.11, 0.105, 0.12, 0.09]) rtt.observe(r);
  console.log(`[05] RTT srtt=${rtt.smoothed.toFixed(4)} rto=${rtt.rto().toFixed(4)}`);

  // Sliding window
  const w = new SlidingWindow();
  console.log('[05] window start =', w.delivered);
  w.offer(0, new Uint8Array([1, 2, 3]));
  w.offer(5, new Uint8Array([4, 5]));   // gap
  console.log('[05] window after gap =', w.delivered, '(should still be 3)');
  w.offer(3, new Uint8Array([0, 0]));   // fills the gap
  console.log('[05] window after fill =', w.delivered, '(should be 5)');

  // QUIC long header
  const quic = new Uint8Array([
    0xc0,                 // form=1, fixed=1, type=0 (Initial)
    0x00, 0x00, 0x00, 0x01, // version 1
    0x08,                 // dcid length = 8
    ...new Uint8Array(8), // dcid
    0x08,                 // scid length = 8
    ...new Uint8Array(8), // scid
  ]);
  const qd = decodeQuicHeader(quic);
  if (qd.form === 1) console.log(`[05] quic type=${qd.type} version=0x${qd.version.toString(16)} dcidLen=${qd.dcidLen}`);
}
