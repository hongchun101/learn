/**
 * Module 5: Modules, Declaration Files, Ambient Types
 *
 * Covers:
 *  - ES module syntax: named/default/namespace exports, re-exports
 *  - Module resolution: classic vs. node vs. bundler
 *  - `import type` for type-only imports
 *  - Declaration merging (interface + interface, interface + namespace, module + namespace)
 *  - Ambient declarations via `.d.ts`
 *  - `declare module` augmentation
 *  - `globalThis` typing
 *  - `satisfies` and export types
 */

import type { Brand as _Brand } from './types.js';

// ---------------------------------------------------------------------------
// 1. Module re-export patterns
// ---------------------------------------------------------------------------

export * from './barrel.js';

export { default as TaggedError } from './errors.js';

export type { UserId, OrderId, Iso8601, Page } from './types.js';

// ---------------------------------------------------------------------------
// 2. Declaration merging: interface + interface
// ---------------------------------------------------------------------------

export interface User {
  id: string;
  name: string;
}

export interface User {
  email: string;
  createdAt: Date;
}

// A merged `User` has all four fields.

// ---------------------------------------------------------------------------
// 3. Declaration merging: interface + namespace
// ---------------------------------------------------------------------------

export interface Currency {
  readonly code: string;
  readonly amount: number;
}

export namespace Currency {
  export const USD: Currency = { code: 'USD', amount: 1 };
  export function fromMajor(code: string, major: number): Currency {
    return { code, amount: Math.round(major * 100) };
  }
}

// ---------------------------------------------------------------------------
// 4. Module augmentation: extend NodeJS.ProcessEnv
// ---------------------------------------------------------------------------

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      readonly NODE_ENV: 'development' | 'test' | 'production';
      readonly DATABASE_URL: string;
      readonly LOG_LEVEL: 'debug' | 'info' | 'warn' | 'error';
    }
  }
}

export function readEnv(): NodeJS.ProcessEnv {
  return process.env;
}

// ---------------------------------------------------------------------------
// 5. Ambient module declaration (for libraries without types)
// ---------------------------------------------------------------------------

// In a real `.d.ts` file:
//   declare module 'left-pad' {
//     export function leftPad(str: string, len: number, ch?: string): string;
//     export default leftPad;
//   }

// ---------------------------------------------------------------------------
// 6. Type-only exports
// ---------------------------------------------------------------------------

export type { _Brand };

export interface ApiRequest<TBody, TQuery = Record<string, string>> {
  body: TBody;
  query: TQuery;
  headers: ReadonlyMap<string, string>;
}

export type Asyncify<T> = T extends (...args: infer A) => infer R
  ? (...args: A) => Promise<R>
  : T extends object
    ? { [K in keyof T]: Asyncify<T[K]> }
    : T;

// ---------------------------------------------------------------------------
// 7. `verbatimModuleSyntax` and `import type` discipline
// ---------------------------------------------------------------------------

// `import type` is required for any import that only feeds the type layer.
// (Done at the top of this file.)

// ---------------------------------------------------------------------------
// 8. The `barrel.ts` pattern — see `./barrel.ts` for an example.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 9. Conditional exports / `exports` field in package.json
// ---------------------------------------------------------------------------

// `package.json` can use `"exports"` to map multiple entry points:
//   {
//     "exports": {
//       ".": {
//         "import": "./dist/index.mjs",
//         "require": "./dist/index.cjs",
//         "types": "./dist/index.d.ts"
//       },
//       "./internal": "./dist/internal.js"
//     }
//   }

// ---------------------------------------------------------------------------
// 10. `globalThis` typing
// ---------------------------------------------------------------------------

declare global {
  interface GlobalThis {
    __APP_VERSION__: string;
  }
}

export function getVersion(): string {
  const g = globalThis as unknown as { __APP_VERSION__: string };
  return g.__APP_VERSION__;
}

// Required to make this a module under `isolatedModules`.
export {};
