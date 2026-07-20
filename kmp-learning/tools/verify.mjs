#!/usr/bin/env node
/**
 * tools/verify.mjs — static verifier for kmp-learning.
 *
 * Runs without a Kotlin toolchain. Walks the source tree and:
 *  1. Verifies every .kt file declares a package matching its directory.
 *  2. Verifies every expect declaration has at least one actual.
 *  3. Verifies every test class has at least one @Test method.
 *  4. Verifies every chapter (ch01..ch18) has source and test files.
 *  5. Verifies docs/{00-taxonomy,01-how-to-run,02-idioms}.md exist.
 *  6. Maps the README "What an expert can do" checklist to code paths.
 *  7. Writes tools/chapter-coverage-matrix.md with public-API + tests.
 *
 * Run: `node tools/verify.mjs`
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const DOCS = path.join(ROOT, 'docs');

function readText(p) {
  try { return fs.readFileSync(p, 'utf-8'); }
  catch { return ''; }
}

function walkKtFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkKtFiles(p));
    else if (entry.isFile() && p.endsWith('.kt')) out.push(p);
  }
  return out;
}

function relToSrc(p) { return path.relative(SRC, p); }

// ---------------------------------------------------------------------------
// 1. Package vs directory
// ---------------------------------------------------------------------------

const SOURCE_SETS = new Set([
  'commonMain','jvmMain','androidMain','iosMain','jsMain','nativeMain',
  'commonTest','jvmTest','androidTest','iosTest','jsTest',
]);

function verifyPackages(ktFiles) {
  const errs = [];
  const packageRe = /^\s*package\s+([\w.]+)/m;
  for (const kt of ktFiles) {
    const text = readText(kt);
    const m = text.match(packageRe);
    if (!m) {
      errs.push(`${relToSrc(kt)}: no package declaration`);
      continue;
    }
    const pkg = m[1];
    // Directory relative to SRC: e.g. 'commonMain/kotlin/ch01_basics'
    const relDir = path.relative(SRC, path.dirname(kt));
    const parts = relDir.split(path.sep);
    // parts[0] is the source set; parts[1] is 'kotlin'; remainder is the package directory.
    const expected = parts.slice(2).join('/');
    let actualParts = pkg.split('.');
    if (SOURCE_SETS.has(actualParts[0])) actualParts = actualParts.slice(1);
    const actual = actualParts.join('/');
    if (actual !== expected) {
      errs.push(`${relToSrc(kt)}: package '${pkg}' does not match directory '${expected}'`);
    }
  }
  return errs;
}

// ---------------------------------------------------------------------------
// 2. expect / actual pairing
// ---------------------------------------------------------------------------

function verifyExpectActual(ktFiles) {
  const errs = [];
  const expectRe = /^\s*expect\s+(?:class|fun|object|interface|val|var)\s+(\w+)/gm;
  const actualRe = /^\s*actual\s+(?:class|fun|object|interface|val|var)\s+(\w+)/gm;
  const expectsByName = new Map();
  const actualsByName = new Set();
  for (const kt of ktFiles) {
    const text = readText(kt);
    let m;
    expectRe.lastIndex = 0;
    while ((m = expectRe.exec(text)) !== null) {
      const arr = expectsByName.get(m[1]) || [];
      arr.push(path.basename(kt));
      expectsByName.set(m[1], arr);
    }
    actualRe.lastIndex = 0;
    while ((m = actualRe.exec(text)) !== null) {
      actualsByName.add(m[1]);
    }
  }
  for (const [name, paths] of expectsByName) {
    if (!actualsByName.has(name)) {
      errs.push(`expect ${name} (in ${paths.join(', ')}) has no matching actual`);
    }
  }
  return errs;
}

// ---------------------------------------------------------------------------
// 3. Test classes have @Test
// ---------------------------------------------------------------------------

function verifyTestClasses(ktFiles) {
  const errs = [];
  for (const kt of ktFiles) {
    if (!path.basename(kt).includes('Test')) continue;
    const text = readText(kt);
    if (!text.includes('@Test')) {
      errs.push(`${relToSrc(kt)}: no @Test methods`);
    }
  }
  return errs;
}

// ---------------------------------------------------------------------------
// 4. Chapter files present
// ---------------------------------------------------------------------------

const CHAPTERS = [
  'ch01_basics','ch02_oop','ch03_generics','ch04_collections','ch05_functional',
  'ch06_coroutines','ch07_flow','ch08_concurrency','ch09_kmp_fundamentals',
  'ch10_serialization','ch11_datetime','ch12_io_logging','ch13_testing',
  'ch14_di','ch15_http','ch16_sql','ch17_architecture','ch18_capstone',
];

function verifyChapters() {
  const errs = [];
  for (const ch of CHAPTERS) {
    const srcDir = path.join(SRC, 'commonMain', 'kotlin', ch);
    if (!fs.existsSync(srcDir)) errs.push(`chapter ${ch} has no commonMain/kotlin directory`);
    const testDir = path.join(SRC, 'commonTest', 'kotlin', ch);
    if (!fs.existsSync(testDir)) {
      errs.push(`chapter ${ch} has no tests`);
    } else {
      const tests = fs.readdirSync(testDir).filter(f => f.endsWith('.kt'));
      if (tests.length === 0) errs.push(`chapter ${ch} has no tests`);
    }
  }
  return errs;
}

// ---------------------------------------------------------------------------
// 5. Docs exist
// ---------------------------------------------------------------------------

function verifyDocs() {
  const errs = [];
  for (const d of ['00-taxonomy.md','01-how-to-run.md','02-idioms.md']) {
    if (!fs.existsSync(path.join(DOCS, d))) errs.push(`docs/${d} is missing`);
  }
  return errs;
}

// ---------------------------------------------------------------------------
// 6. Expert skill mapping
// ---------------------------------------------------------------------------

const EXPERT_SKILLS = [
  ['Read & write expect/actual',                       'ch09_kmp_fundamentals/Platform.kt'],
  ['Design a source-set hierarchy',                    'ch09_kmp_fundamentals/SourceSets.kt'],
  ['Use coroutineScope / supervisorScope',             'ch06_coroutines/Ch06Coroutines.kt, ch08_concurrency/Ch08Concurrency.kt'],
  ['Compose cold + hot flows',                         'ch07_flow/Ch07Flow.kt'],
  ['Pick the right SharingStarted',                    'ch17_architecture/Ch17Architecture.kt'],
  ['Channel vs Flow vs SharedFlow vs StateFlow',       'ch07_flow/Ch07Flow.kt, ch08_concurrency/Ch08Concurrency.kt'],
  ['Migrate a JVM API to KMP',                         'ch09_kmp_fundamentals/Platform.kt, ch18_capstone/Ch18Capstone.kt'],
  ['kotlinx-serialization across platforms',           'ch10_serialization/Ch10Serialization.kt'],
  ['Handle timezones correctly',                       'ch11_datetime/Ch11DateTime.kt'],
  ['Test multiplatform code',                          'ch13_testing/Ch13Testing.kt'],
  ['Audit a PR for platform leakage',                  'ch09_kmp_fundamentals/SourceSets.kt'],
  ['Decide when NOT to use KMP',                       'docs/00-taxonomy.md'],
];

function verifyExpertSkills() {
  const errs = [];
  for (const [label, paths] of EXPERT_SKILLS) {
    for (let p of paths.split(',')) {
      p = p.trim();
      const candidate = p.startsWith('docs/')
        ? path.join(ROOT, p)
        : path.join(SRC, 'commonMain', 'kotlin', p);
      if (!fs.existsSync(candidate)) errs.push(`Expert skill '${label}' references missing path: ${p}`);
    }
  }
  return errs;
}

// ---------------------------------------------------------------------------
// 7. Coverage matrix
// ---------------------------------------------------------------------------

function buildCoverageMatrix() {
  const lines = [];
  lines.push('# Chapter coverage matrix');
  lines.push('');
  lines.push('Auto-generated by `tools/verify.mjs`. Do not edit by hand.');
  lines.push('');
  lines.push('| Chapter | Source files | Test files | Public API count |');
  lines.push('|---------|--------------|------------|------------------|');
  for (const ch of CHAPTERS) {
    const srcDir = path.join(SRC, 'commonMain', 'kotlin', ch);
    const testDir = path.join(SRC, 'commonTest', 'kotlin', ch);
    const srcFiles = fs.existsSync(srcDir) ? fs.readdirSync(srcDir).filter(f => f.endsWith('.kt')) : [];
    const testFiles = fs.existsSync(testDir) ? fs.readdirSync(testDir).filter(f => f.endsWith('.kt')) : [];
    let api = 0;
    for (const f of srcFiles) {
      const t = readText(path.join(srcDir, f));
      api += (t.match(/\bfun\s+/g) || []).length;
      api += (t.match(/\bclass\s+/g) || []).length;
    }
    lines.push(`| ${ch} | ${srcFiles.length} | ${testFiles.length} | ${api} |`);
  }
  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  console.log('verifying kmp-learning...');
  const ktFiles = walkKtFiles(SRC);
  console.log(`  found ${ktFiles.length} Kotlin files`);

  const checks = [
    ['package/directory',     () => verifyPackages(ktFiles)],
    ['expect/actual pairing', () => verifyExpectActual(ktFiles)],
    ['test classes have tests', () => verifyTestClasses(ktFiles)],
    ['chapter files present',  verifyChapters],
    ['docs exist',             verifyDocs],
    ['expert skill mapping',   verifyExpertSkills],
  ];

  let allErrors = [];
  for (const [name, fn] of checks) {
    const errs = fn();
    if (errs.length > 0) {
      allErrors.push(...errs);
      console.log(`  ${name}: ${errs.length} error(s)`);
      for (const e of errs) console.log(`    - ${e}`);
    } else {
      console.log(`  ${name}: OK`);
    }
  }

  const matrix = buildCoverageMatrix();
  const out = path.join(__dirname, 'chapter-coverage-matrix.md');
  fs.writeFileSync(out, matrix, 'utf-8');
  console.log(`  coverage matrix: wrote ${path.relative(ROOT, out)}`);

  if (allErrors.length > 0) {
    console.log(`\nBUILD FAILED: ${allErrors.length} error(s)`);
    process.exit(1);
  }
  console.log('\nBUILD OK');
}

main();
