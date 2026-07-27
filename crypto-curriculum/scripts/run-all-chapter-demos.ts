/**
 * 依次运行各章节模块中存在的 demo 入口。每个 demo 的调用形式为
 * `npx tsx <module>/src/<demo>.ts`（当以 `argv[1] === <path>` 触发该文件
 * 时，文件自身会执行打印/导出等副作用）。
 */

import { execSync } from 'node:child_process';
import { readdirSync, statSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const DEMO_TIMEOUT_MS = 30_000;
const SKIP_NETWORK = true;

function moduleRoot(): string {
  const u = new URL(import.meta.url);
  let p = u.pathname;
  if (process.platform === 'win32') p = p.replace(/^\/([A-Za-z]:)/, '$1');
  return dirname(p).replace(/\/scripts$/, '');
}

function findDemos(root: string): Array<{ module: string; file: string }> {
  const modulesDir = join(root, 'modules');
  const demos: Array<{ module: string; file: string }> = [];
  for (const d of readdirSync(modulesDir).sort()) {
    const dir = join(modulesDir, d);
    if (!statSync(dir).isDirectory()) continue;
    const srcDir = join(dir, 'src');
    if (!existsSync(srcDir)) continue;
    for (const f of readdirSync(srcDir)) {
      if (!f.endsWith('.ts')) continue;
      const candidate = join(srcDir, f);
      const text = readFileSync(candidate, 'utf-8');
      if (!text.includes('process.argv[1]?.endsWith(')) continue;
      if (SKIP_NETWORK && text.includes('tlsConnect(')) continue;
      demos.push({ module: d, file: candidate });
    }
  }
  return demos;
}

const root = moduleRoot();
const demos = findDemos(root);
console.log(`Running ${demos.length} demos (network demos skipped)`);
let failures = 0;
for (const d of demos) {
  console.log(`\n--- ${d.module}: ${d.file.split(/[/\\]/).pop()} ---`);
  try {
    execSync(`npx tsx "${d.file}"`, { stdio: 'inherit', timeout: DEMO_TIMEOUT_MS });
  } catch {
    failures++;
    console.error(`  (demo exited non-zero or timed out)`);
  }
}
console.log();
if (failures > 0) {
  console.error(`${failures} demo(s) failed`);
  process.exit(1);
}
console.log('All demos completed.');
