/**
 * run-all-demos.ts — runs every chapter demo in order and prints a
 * summary. Pure functions only; no network, no filesystem.
 */
import { demo as ch01 } from '../src/01-fundamentals/demo.js';
import { demo as ch02 } from '../src/02-user-research/demo.js';
import { demo as ch03 } from '../src/03-requirements-prd/demo.js';
import { demo as ch04 } from '../src/04-design-ux/demo.js';
import { demo as ch05 } from '../src/05-metrics-data/demo.js';
import { demo as ch06 } from '../src/06-growth-monetization/demo.js';
import { demo as ch07 } from '../src/07-pm-collaboration/demo.js';
import { demo as ch08 } from '../src/08-strategy-lifecycle/demo.js';
import { demo as ch09 } from '../src/09-advanced-topics/demo.js';

const chapters: ReadonlyArray<{ id: string; fn: () => void }> = [
  { id: '01 fundamentals', fn: ch01 },
  { id: '02 user research', fn: ch02 },
  { id: '03 requirements & prd', fn: ch03 },
  { id: '04 design & ux', fn: ch04 },
  { id: '05 metrics & data', fn: ch05 },
  { id: '06 growth & monetization', fn: ch06 },
  { id: '07 pm collaboration', fn: ch07 },
  { id: '08 strategy & lifecycle', fn: ch08 },
  { id: '09 advanced topics', fn: ch09 },
];

let failed = 0;
for (const c of chapters) {
  try {
    console.log(`\n=== ${c.id} ===`);
    c.fn();
  } catch (e) {
    failed++;
    console.error(`FAIL ${c.id}: ${(e as Error).message}`);
  }
}
console.log(`\n${chapters.length - failed}/${chapters.length} chapters OK`);
process.exit(failed === 0 ? 0 : 1);
