/**
 * 模块 10：构建与项目配置
 *
 * 涵盖（以代码注释形式给出，不是运行时内容——它们是配置配方）：
 *  - tsconfig 矩阵：base、build、test、lib
 *  - `composite: true` 与项目引用
 *  - ESM 与 CJS：`"type": "module"`，`.cjs`/`.mjs` 扩展名
 *  - `moduleResolution: "Bundler" | "NodeNext" | "Node"`
 *  - tsconfig 中的路径别名与运行时的对应
 *  - `isolatedModules`、`verbatimModuleSyntax`、`noUncheckedIndexedAccess`
 *  - 库的声明输出：`declaration: true`、`declarationMap: true`
 *  - 源码映射：`sourceMap: true`、`inlineSources: true`
 *  - outDir 结构
 *  - Worker / DOM lib 选择
 *  - 仅类型的包导出
 *
 * 本文件中的运行时代码刻意保持极少。
 * 注释才是学习重点。
 */

// ---------------------------------------------------------------------------
// 1. tsconfig 矩阵——每个配置的用途
// ---------------------------------------------------------------------------

//   tsconfig.json        — 基础：共享 compilerOptions，包含 src 与 tests
//   tsconfig.build.json  — 继承 base，设置 noEmit:false + outDir + rootDir
//   tsconfig.test.json   — 继承 base，设置 types: ["vitest/globals", "node"]
//   tsconfig.lib.json    — 继承 build，为项目引用追加 composite:true
//   tsconfig.react.json  — 继承 build，将 target/lib 切换为 ES2020+DOM+ES2022
//
//   每个消费者（vite、tsc、eslint）各自选用合适的配置。

// ---------------------------------------------------------------------------
// 2. 项目引用——增量构建
// ---------------------------------------------------------------------------

//   在 monorepo 中，包之间互相引用：
//     {
//       "references": [
//         { "path": "./packages/core" },
//         { "path": "./packages/ui" }
//       ]
//     }
//   被引用的 tsconfig 需要：
//     "composite": true,
//     "declaration": true,
//     "declarationMap": true
//   运行：`tsc -b` 基于 `.tsbuildinfo` 文件进行增量构建。

// ---------------------------------------------------------------------------
// 3. ESM/CJS 互操作矩阵
// ---------------------------------------------------------------------------

//   在 package.json 中设置 "type": "module" ⇒ 所有 .js 都视为 ESM。
//   .cjs 文件始终是 CJS，.mjs 始终是 ESM，无论 "type" 是什么。
//   `import x from './y.js'`——在 ESM 中必须显式写 .js 扩展名，
//   除非设置了 `moduleResolution: "Bundler"`。
//
//   当 ESM 依赖 CJS 模块时：
//     import pkg from 'cjs-pkg';
//     const { named } = pkg; // 通过 .default 或解构访问具名导出
//   也可以在 `esModuleInterop: true`（默认值）时直接 `import pkg from 'cjs-pkg'`。
//
//   双发布相关：参见模块 05 中的 "Conditional exports" 段落。

// ---------------------------------------------------------------------------
// 4. `isolatedModules` 与 `verbatimModuleSyntax`
// ---------------------------------------------------------------------------

//   `isolatedModules: true` 强制每个文件都能被独立解析（例如 esbuild、swc）。
//   影响：
//     - 不允许 `const x = foo + bar`，其中 foo 是仅类型。
//     - 仅类型的导入必须写成 `import type`。
//   `verbatimModuleSyntax: true` 更严格：编译器原本会移除的未使用导入，
//   必须显式标记为 `import type`。
//   在 CI 中务必搭配 `tsc --noEmit` 使用。

// ---------------------------------------------------------------------------
// 5. `noUncheckedIndexedAccess`
// ---------------------------------------------------------------------------

//   开启后，`arr[i]` 的类型为 `T | undefined`，而不仅是 `T`。
//   强制显式处理“缺失”情形——有助于捕获 off-by-one 错误。
//   代价是更多空值检查；建议保持开启，换来的安全性值得。

// ---------------------------------------------------------------------------
// 6. 路径别名——tsconfig 与运行时
// ---------------------------------------------------------------------------

//   tsconfig.json 中：
//     "paths": { "@/*": ["src/*"] }
//   Node 不会读取 tsconfig，需要运行时镜像：
//     - tsx：自动读取 tsconfig。
//     - vitest：在 `vitest.config.ts` 中配置 `resolve.alias`。
//     - ts-node：使用 `--paths` 标志或 `tsconfig-paths` 包。
//     - 打包器（Vite/esbuild/webpack）：在其配置中设置 alias。
//   需要保持二者同步——或使用 `tsconfig-paths` 之类的工具在运行时加载它们。

// ---------------------------------------------------------------------------
// 7. 库的声明文件输出
// ---------------------------------------------------------------------------

//   发布时：
//     "declaration": true,                  // 生成 .d.ts 文件
//     "declarationMap": true,               // 生成 .d.ts.map 文件（用于跳转到定义）
//     "sourceMap": true,                    // 生成 .js.map 文件
//     "inlineSources": true,                // 把源码嵌入到 source map 中
//     "removeComments": false,              // 保留 JSDoc
//   这样消费者既能获得类型化导入，也能“跳转到定义”跟入你的源码。

// ---------------------------------------------------------------------------
// 8. 库的 target 与 lib 选择
// ---------------------------------------------------------------------------

//   target  ES2022 + lib ES2022 ⇒ 可使用 class fields、top-level await、??. 等。
//   面向更老的运行时（Node 14），可选择 target ES2020 或 ES2019。
//   浏览器端：向 lib 中加入 "DOM" 或 "DOM.Iterable"。
//   Worker：去掉 DOM；Worker 全局对象来自 "WebWorker" lib。

// ---------------------------------------------------------------------------
// 9. 构建性能
// --------------------------------------------------------------------------

//   - `incremental: true` 写入 .tsbuildinfo 缓存。
//   - `tsc -b` 使用项目引用并并行化构建。
//   - `skipLibCheck: true` 跳过对 .d.ts 文件的类型检查（速度大幅提升）。
//   - `isolatedModules` 在 esbuild/swc 中启用并行转译。

// ---------------------------------------------------------------------------
// 10. 强制模块之间的边界
// ---------------------------------------------------------------------------

//   - 使用路径别名：`import from '@core/x'`，而不是 `import from '../../core/x'`。
//   - ESLint 的 `no-restricted-imports` 规则可禁止深层导入
//     或超过特定层级的相对路径。
//   - 相关 Lint 规则：
//       import/no-internal-modules
//       import/no-cycle
//       import/order（按字母顺序 + 分组）

// ---------------------------------------------------------------------------
// 运行时演示：打印当前项目中生效的 `moduleResolution`。
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
