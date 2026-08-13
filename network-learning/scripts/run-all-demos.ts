// =============================================================================
// Run every chapter's demo in sequence. Invoked by `npm run demo`.
// =============================================================================

import { demo as ch01 } from '../src/01-bytes-framing/index.js';
import { demo as ch02 } from '../src/02-encoding-wire/index.js';
import { demo as ch03 } from '../src/03-link-physical/index.js';
import { demo as ch04 } from '../src/04-ethernet-ip/index.js';
import { demo as ch05 } from '../src/05-transport/index.js';
import { demo as ch06 } from '../src/06-app-protocols/index.js';
import { demo as ch07 } from '../src/07-routing/index.js';
import { demo as ch08 } from '../src/08-reliability-retries/index.js';
import { demo as ch09 } from '../src/09-clocks-ordering/index.js';
import { demo as ch10 } from '../src/10-consensus/index.js';
import { demo as ch11 } from '../src/11-replication-sharding/index.js';
import { demo as ch12 } from '../src/12-advanced/index.js';
import { demo as capstone } from '../src/capstone/index.js';

const demos: Array<[string, () => void]> = [
  ['01 bytes & framing',       ch01],
  ['02 encoding & wire',       ch02],
  ['03 link & physical',        ch03],
  ['04 ethernet / ip / arp',   ch04],
  ['05 transport (udp/tcp/quic)', ch05],
  ['06 app protocols',          ch06],
  ['07 routing',                ch07],
  ['08 reliability & retries',  ch08],
  ['09 clocks & ordering',      ch09],
  ['10 consensus',              ch10],
  ['11 replication & sharding', ch11],
  ['12 advanced',               ch12],
  ['capstone',                  capstone],
];

for (const [name, fn] of demos) {
  console.log(`\n========== ${name} ==========`);
  try {
    fn();
  } catch (e) {
    console.error(`[error in ${name}]`, e);
  }
}
