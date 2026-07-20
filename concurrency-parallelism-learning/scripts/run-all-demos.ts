/**
 * run-all-demos.ts — runs every available module demo and reports.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

type Step = { label: string; cwd: string; cmd: string[]; needed: string };

const steps: Step[] = [
  { label: 'top-level cross-language tests (TS)', cwd: ROOT, cmd: ['npx', 'vitest', 'run', '--reporter=basic'], needed: 'npx' },
  { label: 'top-level typecheck (TS)', cwd: ROOT, cmd: ['npx', 'tsc', '--noEmit'], needed: 'npx' },
];

const modules = [
  '01-rust', '02-go', '03-java', '04-csharp', '05-python',
  '06-javascript', '07-typescript', '08-scala', '09-haskell',
  '10-erlang', '11-elixir', '12-c', '13-cpp',
];

// Rust is opt-in (cargo's crates.io is throttled on this host).
const rustEnabled = process.env['RUST'] === '1';

for (const m of modules) {
  const dir = join(ROOT, 'modules', m);
  if (!existsSync(dir)) continue;
  if (m === '01-rust' && existsSync(join(dir, 'Cargo.toml')) && rustEnabled) {
    steps.push({ label: 'rust: cargo test --workspace', cwd: dir, cmd: ['cargo', 'test', '--workspace', '--quiet'], needed: 'cargo' });
  }
  if (m === '02-go' && existsSync(join(dir, 'go.mod'))) {
    steps.push({ label: 'go: go test -race ./...', cwd: dir, cmd: ['go', 'test', '-race', './...'], needed: 'go' });
  }
  if (m === '03-java' && existsSync(join(dir, 'pom.xml'))) {
    steps.push({ label: 'java: mvn test', cwd: dir, cmd: ['mvn', '-q', 'test'], needed: 'mvn' });
  }
  if (m === '04-csharp' && existsSync(join(dir, 'concurrency-parallelism.sln'))) {
    steps.push({ label: 'csharp: dotnet test', cwd: dir, cmd: ['dotnet', 'test'], needed: 'dotnet' });
  }
  if (m === '05-python' && existsSync(join(dir, 'pyproject.toml'))) {
    const python = process.env['PYTHON'] ?? 'D:\\env\\anaconda3\\python.exe';
    steps.push({ label: 'python: pytest', cwd: dir, cmd: [python, '-m', 'pytest', '-q'], needed: python });
  }
  if (m === '06-javascript' && existsSync(join(dir, 'package.json'))) {
    steps.push({ label: 'javascript: npm test', cwd: dir, cmd: ['npm.cmd', 'test', '--silent'], needed: 'npm.cmd' });
  }
  if (m === '07-typescript' && existsSync(join(dir, 'package.json'))) {
    steps.push({ label: 'typescript: npm test', cwd: dir, cmd: ['npm.cmd', 'test', '--silent'], needed: 'npm.cmd' });
  }
  if (m === '08-scala' && existsSync(join(dir, 'build.sbt'))) {
    steps.push({ label: 'scala: sbt test', cwd: dir, cmd: ['sbt', 'test'], needed: 'sbt' });
  }
  if (m === '09-haskell' && existsSync(join(dir, 'cp-haskell.cabal'))) {
    steps.push({ label: 'haskell: cabal test', cwd: dir, cmd: ['cabal', 'test'], needed: 'cabal' });
  }
  if (m === '10-erlang' && existsSync(join(dir, 'rebar.config'))) {
    steps.push({ label: 'erlang: rebar3 eunit', cwd: dir, cmd: ['rebar3', 'eunit'], needed: 'rebar3' });
  }
  if (m === '11-elixir' && existsSync(join(dir, 'mix.exs'))) {
    steps.push({ label: 'elixir: mix test', cwd: dir, cmd: ['mix', 'test'], needed: 'mix' });
  }
  if (m === '12-c' && existsSync(join(dir, 'Makefile'))) {
    steps.push({ label: 'c: make test', cwd: dir, cmd: ['make', 'test'], needed: 'make' });
  }
  if (m === '13-cpp' && existsSync(join(dir, 'CMakeLists.txt'))) {
    steps.push({ label: 'cpp: cmake + ctest', cwd: dir, cmd: ['cmd', '/c', 'cmake -B build && cmake --build build && ctest --test-dir build'], needed: 'cmake' });
  }
}

function have(cmd: string): boolean {
  return spawnSync(cmd, ['--version'], { stdio: 'ignore', shell: true }).status === 0;
}

let failures = 0;
for (const s of steps) {
  if (!have(s.needed)) { console.log(`SKIP  ${s.label}  (${s.needed} not on PATH)`); continue; }
  const r = spawnSync(s.cmd[0]!, s.cmd.slice(1), { cwd: s.cwd, stdio: 'inherit', shell: true });
  if (r.status === 0) console.log(`OK    ${s.label}`);
  else { console.log(`FAIL  ${s.label}`); failures++; }
}
console.log(`\n${steps.length - failures}/${steps.length} steps OK`);
process.exit(failures === 0 ? 0 : 1);
