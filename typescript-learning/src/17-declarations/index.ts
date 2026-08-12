/**
 * Module 17 — Declaration Files & JSDoc
 *
 * Topics:
 *  - Writing `.d.ts` files for untyped npm packages
 *  - The `declare` keyword: modules, globals, classes, functions, vars
 *  - Ambient module declarations (`declare module 'name'`)
 *  - Module augmentation (`declare module 'name' { ... }`)
 *  - Conditional exports in package.json (ESM/CJS, types)
 *  - JSDoc-typed JavaScript: `@type`, `@param`, `@returns`, `@template`
 *  - JSDoc generics via `@template T extends U`
 *  - When to ship types in-source vs in `.d.ts`
 *  - DefinitelyTyped / `@types/*` consumption
 *
 * This is the skill that lets you integrate any third-party library into
 * a TS project without losing type safety. It's also the prerequisite
 * for shipping well-typed libraries of your own.
 */

// ---------------------------------------------------------------------------
// 1. Ambient module declarations — typing an untyped npm package
// ---------------------------------------------------------------------------
//
// Suppose the npm package `left-pad` has no types. Create
// `src/types/left-pad.d.ts` with:
//
//   declare module 'left-pad' {
//     export function leftPad(
//       str: string,
//       len: number,
//       ch?: string,
//     ): string;
//     const _default: typeof leftPad;
//     export default _default;
//   }
//
// Once that file is in the project's `include`, every `import` of
// `left-pad` is fully typed. The `.d.ts` is a pure type file — it produces
// no runtime JS.

// ---------------------------------------------------------------------------
// 2. The `declare` keyword — module-scope and global-scope forms
// ---------------------------------------------------------------------------
//
// `declare` introduces a name without producing any runtime value. Used
// inside `declare module '...'` for modules, or inside `declare global`
// for global scope (process.env, globalThis, etc.).

// Equivalent of an `ambient.d.ts`:
declare global {
  interface Window {
    __APP_VERSION__: string;
  }
  // eslint-disable-next-line no-var
  var __BUILD_ID__: string;
}
// Read BUILD_ID from env at module init. The `declare global` makes
// the type known to TS even though the value comes from the runtime.
export const buildId: string = process.env['BUILD_ID'] ?? 'dev';

// ---------------------------------------------------------------------------
// 3. Module augmentation — extending a typed package
// ---------------------------------------------------------------------------
//
// To add a method to a third-party module's existing interface:
//
//   declare module 'express' {
//     interface Request {
//       user?: { id: string; role: string };
//     }
//   }
//
// After this, every `Request` in your codebase knows about `.user`.

// ---------------------------------------------------------------------------
// 4. Generic ambient module declarations
// ---------------------------------------------------------------------------
//
// Some packages export a generic function, e.g. an i18n library. The
// generic survives into the consumer's type space. Documented here;
// a `declare module 'tiny-i18n'` would require that module to be
// installed for TS to recognize the augmentation.

// ---------------------------------------------------------------------------
// 5. Conditional exports in package.json — the multi-target story
// ---------------------------------------------------------------------------
//
// A library that ships both ESM and CJS:
//
//   {
//     "name": "my-lib",
//     "type": "module",
//     "exports": {
//       ".": {
//         "types": "./dist/index.d.ts",
//         "import": "./dist/index.mjs",
//         "require": "./dist/index.cjs"
//       },
//       "./internal": "./dist/internal.mjs"
//     }
//   }
//
// Consumers automatically pick the right file based on their module
// system. The `types` condition is matched by TS's resolver.

// ---------------------------------------------------------------------------
// 6. `tsconfig` settings that affect declaration files
// ---------------------------------------------------------------------------
//
//   "declaration": true       // emit .d.ts files
//   "declarationMap": true    // emit .d.ts.map for "go to definition"
//   "emitDeclarationOnly": true  // only .d.ts, no .js
//   "stripInternal": true     // omit declarations marked with `@internal`
//   "outDir": "./dist"        // output directory

// ---------------------------------------------------------------------------
// 7. JSDoc-typed JavaScript: when you can't (or don't want to) write .ts
// ---------------------------------------------------------------------------
//
// JSDoc lets you type plain `.js` files. This is the engine that powers
// `// @ts-check` — a comment at the top of a `.js` file that turns on
// TS's type checker for that file.
//
// Example (a `.js` file):
//
//   // @ts-check
//   /**
//    * @param {string} name
//    * @returns {string}
//    */
//   function greet(name) {
//     return `Hello, ${name}`;
//   }
//
//   /** @type {(n: number) => number} */
//   const double = (n) => n * 2;

// ---------------------------------------------------------------------------
// 8. JSDoc generics via `@template`
// ---------------------------------------------------------------------------
//
// In a `.js` file with `// @ts-check`:
//
//   /**
//    * @template T
//    * @param {T} x
//    * @returns {T}
//    */
//   const id = (x) => x;
//
//   /** @type {string} */
//   const r = id('hi'); // T inferred as string
//
//   // With constraints:
//   /**
//    * @template {string | number} T
//    * @param {T} a
//    * @param {T} b
//    * @returns {T}
//    */
//   function add(a, b) { return a; }

// ---------------------------------------------------------------------------
// 9. JSDoc in TS — doc preservation through compilation
// ---------------------------------------------------------------------------
//
// JSDoc comments on a declaration are picked up and copied into the
// generated `.d.ts`. This is how you get rich documentation in your
// published types.

/**
 * Greets a user by name. Use this at most once per session — calling it
 * twice logs a warning.
 *
 * @param name - The user's display name
 * @returns A greeting string
 */
export function greet(name: string): string {
  return `Hello, ${name}`;
}

// ---------------------------------------------------------------------------
// 10. Shipping types: source vs `.d.ts`
// ---------------------------------------------------------------------------
//
// Two strategies:
//   (a) Source-level: ship `.ts` source. `tsc --declaration` emits `.d.ts`.
//       Consumers get type-checking AND source maps for "go to definition".
//   (b) Hand-written `.d.ts`: only ship types, keep source private.
//       Smaller payload but no jump-to-source.
//
// For internal use within a monorepo, use project references and let
// `tsc` handle `.d.ts` emission. For public npm packages, prefer (a).

// ---------------------------------------------------------------------------
// 11. DefinitelyTyped — `@types/*` packages
// ---------------------------------------------------------------------------
//
// When a third-party package lacks types, install its DefinitelyTyped
// types: `npm i -D @types/left-pad`. TS's resolver finds them
// automatically because `@types/*` packages have `"types"` field in
// their package.json pointing at the `.d.ts` file.

// ---------------------------------------------------------------------------
// 12. Type-only imports/exports
// ---------------------------------------------------------------------------
//
// `import type { Foo } from './bar'` — under `verbatimModuleSyntax`,
// this is required for type-only references. Under the default mode, TS
// is smart enough to elide them, but explicit `import type` is clearer.

import type { User as _User } from '../16-real-world/index.js';
export type AppUser = _User;

// ---------------------------------------------------------------------------
// 13. Declaration file templates you should keep handy
// ---------------------------------------------------------------------------
//
//   // types/left-pad.d.ts
//   declare module 'left-pad' {
//     export function leftPad(
//       str: string,
//       len: number,
//       ch?: string,
//     ): string;
//     export default leftPad;
//   }
//
//   // types/css-modules.d.ts
//   declare module '*.module.css' {
//     const classes: Readonly<Record<string, string>>;
//     export default classes;
//   }
//
//   // types/json.d.ts
//   declare module '*.json' {
//     const value: unknown;
//     export default value;
//   }

// ---------------------------------------------------------------------------
// Demo runner
// ---------------------------------------------------------------------------

if (import.meta.url === `file:///${process.argv[1]}`) {
  console.info('greet =', greet('Ada'));
  console.info('buildId =', buildId);
}
