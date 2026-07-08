/**
 * Module 10: Build & Project Configuration
 *
 * Covers (in code comments, not runtime — these are configuration recipes):
 *  - tsconfig matrix: base, build, test, lib
 *  - `composite: true` + project references
 *  - ESM vs CJS: `"type": "module"`, `.cjs`/`.mjs` extensions
 *  - `moduleResolution: "Bundler" | "NodeNext" | "Node"`
 *  - Path aliases in tsconfig vs. runtime
 *  - `isolatedModules`, `verbatimModuleSyntax`, `noUncheckedIndexedAccess`
 *  - Library declarations: `declaration: true`, `declarationMap: true`
 *  - Source maps: `sourceMap: true`, `inlineSources: true`
 *  - OutDir structure
 *  - Worker / DOM lib selection
 *  - Type-only package exports
 *
 * The runtime code in this file is intentionally tiny — it's the comments
 * that are the lesson.
 */

// ---------------------------------------------------------------------------
// 1. tsconfig matrix — what each config is for
// ---------------------------------------------------------------------------

//   tsconfig.json        — base: shared compilerOptions, includes src + tests
//   tsconfig.build.json  — extends base, sets noEmit:false + outDir + rootDir
//   tsconfig.test.json   — extends base, sets types: ["vitest/globals", "node"]
//   tsconfig.lib.json    — extends build, adds composite:true for project refs
//   tsconfig.react.json  — extends build, swaps target/lib to ES2020+DOM+ES2022
//
//   Each consumer (vite, tsc, eslint) picks the right one.

// ---------------------------------------------------------------------------
// 2. Project references — incremental builds
// ---------------------------------------------------------------------------

//   In a monorepo, packages reference each other with:
//     {
//       "references": [
//         { "path": "./packages/core" },
//         { "path": "./packages/ui" }
//       ]
//     }
//   And the referenced tsconfigs use:
//     "composite": true,
//     "declaration": true,
//     "declarationMap": true
//   Run: `tsc -b` to build incrementally using `.tsbuildinfo` files.

// ---------------------------------------------------------------------------
// 3. ESM/CJS interop matrix
// ---------------------------------------------------------------------------

//   "type": "module" in package.json ⇒ all .js treated as ESM.
//   .cjs files are always CJS, .mjs always ESM, regardless of "type".
//   `import x from './y.js'` — the .js extension is mandatory in ESM
//   unless `moduleResolution: "Bundler"` is set.
//
//   When depending on a CJS module from ESM:
//     import pkg from 'cjs-pkg';
//     const { named } = pkg; // access named export via .default or destructure
//   Or with `esModuleInterop: true` (the default) you can `import pkg from 'cjs-pkg'`.
//
//   For dual-publishing: see the "Conditional exports" block in module 05.

// ---------------------------------------------------------------------------
// 4. `isolatedModules` and `verbatimModuleSyntax`
// ---------------------------------------------------------------------------

//   `isolatedModules: true` forces each file to be parseable in isolation
//   (e.g. esbuild, swc). Implications:
//     - You can't `const x = foo + bar` where foo is type-only.
//     - You must use `import type` for type-only imports.
//   `verbatimModuleSyntax: true` is stricter: any unused import that the
//   compiler would have elided must be marked `import type`.
//   Always pair these with `tsc --noEmit` in CI.

// ---------------------------------------------------------------------------
// 5. `noUncheckedIndexedAccess`
// ---------------------------------------------------------------------------

//   With this on, `arr[i]` is `T | undefined`, not just `T`.
//   Forces you to handle "missing" explicitly — catches off-by-one bugs.
//   Trade-off: more nullish checks. Keep it on; the safety is worth it.

// ---------------------------------------------------------------------------
// 6. Path aliases — tsconfig + runtime
// ---------------------------------------------------------------------------

//   tsconfig.json has:
//     "paths": { "@/*": ["src/*"] }
//   Node won't read tsconfig. You need a runtime mirror:
//     - tsx: reads tsconfig automatically.
//     - vitest: configure `resolve.alias` in `vitest.config.ts`.
//     - ts-node: `--paths` flag or `tsconfig-paths` package.
//     - bundlers (Vite/esbuild/webpack): configure alias in their config.
//   Keep them in sync — or use a tool like `tsconfig-paths` to load them at runtime.

// ---------------------------------------------------------------------------
// 7. Library declaration output
// ---------------------------------------------------------------------------

//   For publishing:
//     "declaration": true,                  // emit .d.ts files
//     "declarationMap": true,               // emit .d.ts.map files (for go-to-def)
//     "sourceMap": true,                    // emit .js.map files
//     "inlineSources": true,                // embed source in source maps
//     "removeComments": false,              // keep JSDoc
//   This lets consumers get typed imports AND navigation that follows into
//   your source code.

// ---------------------------------------------------------------------------
// 8. Library target & lib selection
// ---------------------------------------------------------------------------

//   target  ES2022 + lib ES2022 ⇒ can use class fields, top-level await, ??., etc.
//   For older runtimes (Node 14), target ES2020 or ES2019.
//   For browser: add "DOM" or "DOM.Iterable" to lib.
//   For workers: omit DOM; the worker globals come from "WebWorker" lib.

// ---------------------------------------------------------------------------
// 9. Build performance
// --------------------------------------------------------------------------

//   - `incremental: true` writes a .tsbuildinfo cache.
//   - `tsc -b` uses project references and parallelizes builds.
//   - `skipLibCheck: true` skips type-checking .d.ts files (huge speedup).
//   - `isolatedModules` enables parallel transpilation in esbuild/swc.

// ---------------------------------------------------------------------------
// 10. Enforcing boundaries between modules
// ---------------------------------------------------------------------------

//   - Use path aliases: `import from '@core/x'` not `import from '../../core/x'`.
//   - ESLint `no-restricted-imports` rule can ban deep imports or
//     relative paths beyond a depth.
//   - Lint rules:
//       import/no-internal-modules
//       import/no-cycle
//       import/order (alphabetical + grouped)

// ---------------------------------------------------------------------------
// Runtime demo: print which `moduleResolution` is active in the project.
// ---------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
function readJson<T>(p: string): T {
  return JSON.parse(readFileSync(p, 'utf-8')) as T;
}

interface PackageJson {
  readonly type?: string;
  readonly engines?: { readonly node?: string };
}

const pkg = readJson<PackageJson>(resolve(here, '../../package.json'));
const tsconfig = readJson<{ compilerOptions?: { moduleResolution?: string; target?: string; strict?: boolean } }>(
  resolve(here, '../../tsconfig.json'),
);

export function readProjectMeta(): {
  moduleType: string;
  moduleResolution: string;
  target: string;
  strict: boolean;
} {
  return {
    moduleType: pkg.type ?? 'commonjs',
    moduleResolution: tsconfig.compilerOptions?.moduleResolution ?? 'classic',
    target: tsconfig.compilerOptions?.target ?? 'es5',
    strict: tsconfig.compilerOptions?.strict ?? false,
  };
}

if (import.meta.url === `file:///${process.argv[1]}`) {
  console.info('project meta =', readProjectMeta());
}
