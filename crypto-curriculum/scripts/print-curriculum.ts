/**
 * Print the curriculum table — what each module teaches, with running status.
 */

import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

// On Windows, `import.meta.url` is "file:///D:/work/…" → fileURLToPath yields
// "D:/work/…". When we then `..`, we want "D:/work/…/…".  `new URL('..', import.meta.url)`
// inserts the leading slash, so `pathname` is "/D:/work/…".  Strip the
// leading slash when it precedes a drive letter so the result is portable.
function moduleRoot(): string {
  const u = new URL(import.meta.url);
  let p = u.pathname;
  if (process.platform === 'win32') p = p.replace(/^\/([A-Za-z]:)/, '$1');
  return dirname(p).replace(/\/scripts$/, '');
}

interface ModuleInfo {
  id: string;
  title: string;
  hasTests: boolean;
}

function readTitle(file: string): string {
  if (!existsSync(file)) return '';
  const text = readFileSync(file, 'utf-8');
  const m = text.match(/^# (.+)$/m);
  return m ? m[1]!.trim() : '';
}

function info(root: string): ModuleInfo[] {
  const dirs = readdirSync(root).filter((d) => statSync(join(root, d)).isDirectory()).sort();
  return dirs.map((d) => ({
    id: d,
    title: readTitle(join(root, d, 'README.md')),
    hasTests: existsSync(join(root, d, 'tests')),
  }));
}

const root = moduleRoot();
const modules = info(join(root, 'modules'));

console.log('Curriculum table');
console.log('================');
console.log();
console.log(`${'Module'.padEnd(28)}  ${'Title'.padEnd(56)}  ${'Status'}`);
console.log(`${'-'.repeat(28)}  ${'-'.repeat(56)}  ${'-'.repeat(8)}`);
for (const m of modules) {
  const status = m.hasTests ? '✔' : ' ';
  const t = m.title.length > 56 ? m.title.slice(0, 53) + '…' : m.title;
  console.log(`${m.id.padEnd(28)}  ${t.padEnd(56)}  ${status}`);
}
