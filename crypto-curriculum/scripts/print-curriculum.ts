/**
 * 打印课程总表——展示每个模块的教学内容及其运行状态。
 */

import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

// 在 Windows 上，`import.meta.url` 是 "file:///D:/work/…"，经 fileURLToPath
// 得到 "D:/work/…"；随后做 `..` 时我们想要 "D:/work/…/…"。而
// `new URL('..', import.meta.url)` 会插入前导斜杠，使得 `pathname`
// 变成 "/D:/work/…"，所以当斜杠在盘符之前时要去掉，从而保证结果可移植。
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
