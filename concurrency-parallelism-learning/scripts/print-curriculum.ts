/**
 * print-curriculum.ts — pretty-print the curriculum from disk.
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const MODULES = join(ROOT, 'modules');

async function exists(p: string): Promise<boolean> {
  try { await stat(p); return true; } catch { return false; }
}

async function readFirstHeading(p: string): Promise<string> {
  try {
    const t = await readFile(p, 'utf8');
    for (const line of t.split('\n')) {
      if (line.startsWith('# ')) return line.slice(2).trim();
    }
  } catch { /* */ }
  return '(no title)';
}

async function main(): Promise<void> {
  const entries = await readdir(MODULES, { withFileTypes: true });
  const rows: string[] = [];
  rows.push('| # | Module | Language | Status |');
  rows.push('|---|--------|----------|--------|');
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!e.isDirectory()) continue;
    const id = e.name;
    const readmePath = join(MODULES, id, 'README.md');
    const title = await readFirstHeading(readmePath);
    const lang = id.replace(/^\d+-/, '');
    const hasManifest =
      (await exists(join(MODULES, id, 'Cargo.toml'))) ||
      (await exists(join(MODULES, id, 'go.mod'))) ||
      (await exists(join(MODULES, id, 'pom.xml'))) ||
      (await exists(join(MODULES, id, 'package.json'))) ||
      (await exists(join(MODULES, id, 'pyproject.toml'))) ||
      (await exists(join(MODULES, id, 'rebar.config'))) ||
      (await exists(join(MODULES, id, 'mix.exs'))) ||
      (await exists(join(MODULES, id, 'cp-haskell.cabal'))) ||
      (await exists(join(MODULES, id, 'Makefile'))) ||
      (await exists(join(MODULES, id, 'CMakeLists.txt'))) ||
      (await exists(join(MODULES, id, 'global.json')));
    const status = hasManifest ? '✔ buildable' : '○ study only';
    rows.push(`| ${id.split('-')[0]} | ${lang} | ${title} | ${status} |`);
  }
  console.log(rows.join('\n'));
}

main().catch((e: unknown) => { console.error(e); process.exit(1); });
