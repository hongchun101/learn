/**
 * 模块 5：模块、声明文件、环境类型
 *
 * 涵盖：
 *  - ES module 语法：named/default/namespace exports、re-exports
 *  - 模块解析：classic、node 与 bundler
 *  - 使用 `import type` 进行仅类型导入
 *  - 声明合并（interface + interface、interface + namespace、module + namespace）
 *  - 通过 `.d.ts` 进行环境声明
 *  - `declare module` 扩展
 *  - `globalThis` 类型标注
 *  - `satisfies` 与导出类型
 */

import type { Brand as _Brand } from './types.js';

// ---------------------------------------------------------------------------
// 1. 模块再导出模式
// ---------------------------------------------------------------------------

export * from './barrel.js';

export { default as TaggedError } from './errors.js';

export type { UserId, OrderId, Iso8601, Page } from './types.js';

// ---------------------------------------------------------------------------
// 2. 声明合并：interface + interface
// ---------------------------------------------------------------------------

export interface User {
  id: string;
  name: string;
}

export interface User {
  email: string;
  createdAt: Date;
}

// 合并后的 `User` 包含全部四个字段。

// ---------------------------------------------------------------------------
// 3. 声明合并：interface + namespace
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
// 4. 模块扩展：扩展 NodeJS.ProcessEnv
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
// 5. 环境模块声明（用于没有类型的库）
// ---------------------------------------------------------------------------

// 在真实的 `.d.ts` 文件中：
//   declare module 'left-pad' {
//     export function leftPad(str: string, len: number, ch?: string): string;
//     export default leftPad;
//   }

// ---------------------------------------------------------------------------
// 6. 仅类型导出
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
// 7. `verbatimModuleSyntax` 与 `import type` 规范
// ---------------------------------------------------------------------------

// 任何仅供类型层使用的导入都必须使用 `import type`。
// （已在此文件顶部完成。）

// ---------------------------------------------------------------------------
// 8. `barrel.ts` 模式——示例请参见 `./barrel.ts`。
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 9. 条件导出 / package.json 中的 `exports` 字段
// ---------------------------------------------------------------------------

// `package.json` 可以使用 `"exports"` 映射多个入口点：
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
// 10. `globalThis` 类型标注
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

// 需要此语句才能在 `isolatedModules` 下将本文件视为模块。
export {};
