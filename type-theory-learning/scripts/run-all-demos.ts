// Runs every chapter's `demo.ts` (where it exists).

import { spawn } from 'node:child_process';
import { readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', 'src');
const chapters = readdirSync(root, { withFileTypes: true })
  .filter((d) => d.isDirectory() && /^\d{2}-/.test(d.name))
  .map((d) => d.name);

let passed = 0;
let skipped = 0;
for (const ch of chapters) {
  const demo = resolve(root, ch, 'demo.ts');
  if (!existsSync(demo)) {
    skipped++;
    continue;
  }
  const ok = await new Promise<boolean>((res) => {
    const p = spawn('npx', ['tsx', demo], { stdio: 'pipe', cwd: resolve(import.meta.dirname, '..') });
    let out = '';
    p.stdout.on('data', (b: Buffer) => (out += b.toString()));
    p.stderr.on('data', (b: Buffer) => (out += b.toString()));
    p.on('close', (code) => {
      if (code === 0) {
        console.log(`[${ch}] OK`);
      } else {
        console.log(`[${ch}] FAILED (exit ${code})\n${out}`);
      }
      res(code === 0);
    });
  });
  if (ok) passed++;
}

console.log(`\n${passed} demos ok, ${skipped} chapters skipped (no demo).`);
