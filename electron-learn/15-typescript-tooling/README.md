# 附录 B · TypeScript 与工具链

> 现代 Electron 工程几乎都是 TypeScript + Electron + 一些插件。这一章讨论主进程、preload、renderer 三类代码如何在 TS 下"无缝衔接"，以及常见工具链（ESLint/Prettier/Vitest/Playwright/swc/Vite）的选型与踩坑。

---

## B.1 工程的典型分层

```text
tsconfig.json
├── tsconfig.node.json        ← main + preload + utility
├── tsconfig.web.json         ← renderer
└── tsconfig.json             ← inherit only

src/
├── main/                     ← Node-style 代码 + electron
├── preload/                  ← 桥接层
├── renderer/                 ← Web 风格代码
├── shared/                   ← 跨进程共享类型
└── utility/                  ← 独立的 JS
```

### B.1.1 tsconfig 示例

`tsconfig.json`：

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.node.json" },
    { "path": "./tsconfig.web.json" }
  ]
}
```

`tsconfig.node.json`：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "types": ["node", "electron"],
    "outDir": "./dist/main",
    "esModuleInterop": true,
    "strict": true,
    "sourceMap": true,
    "skipLibCheck": true,
    "noImplicitAny": true,
    "isolatedModules": true,
    "incremental": true
  },
  "include": ["src/main/**/*", "src/preload/**/*", "src/utility/**/*", "src/shared/**/*"]
}
```

`tsconfig.web.json`：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "useDefineForClassFields": true,
    "esModuleInterop": true,
    "strict": true,
    "outDir": "./dist/renderer",
    "noEmit": true
  },
  "include": ["src/renderer/**/*", "src/shared/**/*"]
}
```

注意区别：

- Node 侧：`types: ["node", "electron"]`，可 emit。
- Web 侧：`noEmit`（由 Vite 处理）。

---

## B.2 类型安全的 Electron

### B.2.1 自动暴露窗口类

```ts
class MainWindow extends BrowserWindow { /* ... */ }
class SettingsWindow extends BrowserWindow { /* ... */ }

import electron from 'electron';
function getWindowById<T extends BrowserWindow>(cls: new (...args: any[]) => T, id: number): T | null {
  for (const w of BrowserWindow.getAllWindows()) {
    if (w.id === id && w instanceof cls) return w;
  }
  return null;
}
```

### B.2.2 自定义全局类型

`src/preload/global.d.ts`：

```ts
import type { IpcContract } from '@app/ipc/contract';

declare global {
  interface Window {
    api: {
      note: {
        list: (q?: string) => Promise<Note[]>;
        get: (id: string) => Promise<Note | null>;
        create: (input: { title: string; content: string }) => Promise<string>;
        update: (id: string, patch: Partial<Note>) => Promise<void>;
        remove: (id: string) => Promise<void>;
        onShortcutSearch: (cb: () => void) => () => void;
      };
      system: {
        openPath: (path: string) => Promise<string>;
        showItemInFolder: (path: string) => Promise<void>;
      };
    };
  }
}

export {};
```

### B.2.3 IPC Contract

`src/shared/ipc/contract.ts`：

```ts
export interface Note {
  id: string;
  title: string;
  content: string;
  tags: string[];
  folder: string;
  updatedAt: number;
  createdAt: number;
}

export interface IpcContract {
  'note.list': (args: { q?: string }) => Promise<Note[]>;
  'note.create': (args: Omit<Note, 'id' | 'createdAt' | 'updatedAt'>) => Promise<string>;
  'note.update': (args: { id: string; patch: Partial<Note> }) => Promise<void>;
  'note.delete': (args: { id: string }) => Promise<void>;
  'system.openPath': (args: { path: string }) => Promise<string>;
}
```

生成 `invoke<K extends keyof IpcContract>(...)` 签名：

```ts
type Channel = keyof IpcContract;
type Args<C extends Channel> = Parameters<IpcContract[C]>[0];

export type Invoke<C extends Channel> = (channel: C, args: Args<C>) => Promise<ReturnType<IpcContract[C]>>;
```

---

## B.3 monorepo 工具

### B.3.1 pnpm workspaces

```yaml
# pnpm-workspace.yaml
packages:
  - apps/*
  - packages/*
```

### B.3.2 Changesets

```bash
pnpm dlx @changesets/cli init
```

```mdc
<!-- .changeset/README.md -->
# Changesets

Hello and welcome! This is Changesets.
```

使用 changeset：

```bash
pnpm changeset add   # 选择影响的包、版本类型、变更说明
pnpm changeset version
pnpm changeset publish
```

### B.3.3 turbo / nx

```yaml
# turbo.json
{
  "pipeline": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**"] },
    "test":  { "dependsOn": ["build"] },
    "lint":  { "dependsOn": ["^build"] }
  }
}
```

### B.3.4 主进程跨包 require

```ts
// main
import { setupDatabase } from '@app/core/db';
import { NoteRepository } from '@app/core/notes';
```

被打包时如果是用 Electron-Vite：自动 bundle。如果用 Vite plugin + esbuild：需要 `external: ['electron', ...]`。

---

## B.4 Build 工具选型

### B.4.1 选项

| 选项 | 特点 |
|------|------|
| Vite + electron-vite | 启动快、HMR 完美 |
| Webpack + electron-builder | 兼容性最好 |
| esbuild | 主进程编译快 |
| swc | 适合辅助工具 |
| tsup | CLI 工具 |
| Rollup | Library |

### B.4.2 electron-vite 推荐配置

```ts
// electron.vite.config.ts
import { defineConfig, externalizeDeps } from 'electron-vite';
import { resolve } from 'path';

export default defineConfig({
  main: {
    build: {
      lib: { entry: resolve(__dirname, 'src/main/index.ts') },
      outDir: 'dist/main',
      rollupOptions: {
        external: ['electron', 'better-sqlite3'],
      },
    },
  },
  preload: {
    build: {
      lib: { entry: resolve(__dirname, 'src/preload/index.ts') },
      outDir: 'dist/preload',
      rollupOptions: {
        external: ['electron'],
      },
    },
  },
  // renderer delegate to vite directly
});
```

### B.4.3 加入 SWC

```ts
// electron.vite.config.ts
export default defineConfig({
  main: {
    plugins: [swcPlugin()],
  },
});
```

---

## B.5 Lint / Format

### B.5.1 ESLint

`.eslintrc.cjs`：

```js
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'eslint-plugin-react', 'eslint-plugin-import'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  rules: {
    '@typescript-eslint/no-explicit-any': 'off',
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  },
  ignorePatterns: ['dist', 'node_modules', 'release'],
  env: { browser: true, node: true, es2022: true },
};
```

### B.5.2 Prettier

`.prettierrc`：

```json
{
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false,
  "semi": true,
  "trailingComma": "all"
}
```

### B.5.3 Lint-staged + commitlint

```json
{
  "scripts": {
    "lint-staged": "lint-staged",
    "commitlint": "commitlint -e -V"
  }
}
```

`commitlint.config.cjs`：

```js
module.exports = { extends: ['@commitlint/config-conventional'] };
```

---

## B.6 测试工具

### B.6.1 Vitest

```ts
// src/preload/index.test.ts
import { describe, expect, test, vi } from 'vitest';

describe('preload api', () => {
  test('exposes expected keys', () => {
    const exposed = require('./index.ts').default;
    expect(exposed).toMatchObject({
      note: expect.any(Object),
      system: expect.any(Object),
    });
  });
});
```

### B.6.2 Playwright Electron

```ts
import { test, expect, _electron as electron } from '@playwright/test';

test('app launches', async () => {
  const app = await electron.launch({ args: ['.'] });
  const win = await app.firstWindow();
  await expect(win).toHaveTitle('Notes');
  await app.close();
});
```

### B.6.3 Spectron 替代

Spectron 已弃用。社区方案：

- `playwright` + `electron`/`_electron`
- `electron-mocha`
- 自行用 CDP 测

### B.6.4 e2e 测试中的 deterministic

- 给 fixed timestamp / clock。
- 注入 mock IPC handler。
- 关闭随机 macOS sequence 动画。

---

## B.7 npm 脚本

```json
{
  "scripts": {
    "dev":         "electron-vite dev",
    "build":       "electron-vite build",
    "package":     "electron-builder",
    "package:win": "electron-builder --win",
    "package:mac": "electron-builder --mac",
    "release":     "electron-builder --publish always",
    "test":        "vitest run",
    "test:watch":  "vitest",
    "lint":        "eslint . --ext .ts,.tsx",
    "format":      "prettier --write .",
    "prepare":     "husky install"
  }
}
```

`npm run dev` 在内部组合：

1. 启动 Vite dev server（renderer）。
2. 编译 main + preload。
3. 启动 Electron 指向 Vite dev server + dist/main。

---

## B.8 常踩坑

### B.8.1 import 路径

```ts
// ❌ 路径不显式
import { foo } from '@/core/foo';

// ✅ 必须显式
import { foo } from '../core/foo';
```

或配 `tsconfig.compilerOptions.baseUrl` + `paths`：

```json
{
  "baseUrl": "./",
  "paths": {
    "@app/*": ["src/*"]
  }
}
```

运行时需要 tsconfig-paths 与 Vite/SWC 配对：

```ts
// vite.config.ts
resolve: {
  alias: { '@app': path.resolve(__dirname, 'src') }
}
```

### B.8.2 Mix Type / JS

`allowJs` + `checkJs` 在 Electron 项目里强推不允许。

### B.8.3 ASAR 内 require

```ts
// ❌ 假设 require 路径在磁盘上
const path = require('path').resolve(__dirname, './file.bin');

// ✅ 优先 env 变量
const path = path.join(__dirname, process.resourcesPath.includes('app.asar') ? './file.bin' : './file.bin');
```

或者直接用 `extraResources` + `app.getPath('exe')`。

### B.8.4 ESM / CommonJS 混合

- Electron main 走 CJS（除非 Vite 编译后 ESM）。
- Renderer 用 Vite 默认 ESM。
- preload 在 ESM/CJS 边界需要 `.cjs`。

`package.json`：

```json
{
  "type": "module"
}
```

但 main 文件应被标记为 `.cjs` 或在 Vite 配置使用 `format: 'cjs'`。

---

## B.9 main 与 preload 的代码组织

### B.9.1 main/index.ts 的导入顺序

```ts
// 1. 全局补丁（early patch）
import path from 'node:path';
import { app, BrowserWindow } from 'electron';
import { setupFiles } from './files';
import { setupMenu } from './menu';

// 2. 启动 app 之前必要的钩子
app.commandLine.appendSwitch('disable-features', 'OutOfBlinkCors');

// 3. whenReady
app.whenReady().then(async () => {
  // 创建窗口
  // 设置 IPC
  // 启动 updater
});
```

### B.9.2 preload 与 contextBridge 的分工

- **preload 只是一段 Node 代码**，能 require Electron。
- **不要把 ipcRenderer 直接挂到 contextBridge.exposeInMainWorld**(暴露的 API 必须是 pre-validated)的"死规矩"。

---

## B.10 写给平台的总结

- 主进程用 Node 类型，渲染层用 DOM 类型，两者通过 IPC 类型共享。
- monorepo + 工具链（pnpm + turbo）能显著降低大型项目的迭代成本。
- TypeScript 的最大收益点是"调用契约"而不是"OO"。

---

## B.11 附录工具

| 用途 | 推荐 |
|------|------|
| 包管理 | pnpm |
| 编译 | esbuild / swc / Vite |
| Lint | ESLint + Prettier |
| 测试 | Vitest + Playwright |
| 仓库 | turbo / nx / Changesets |
| Release | electron-builder + electron-updater |
| 仓库 | Lattice + Semaphore CI |

---

## B.12 总结

- TypeScript + monorepo 是 Electron 工程的标配。
- 主进程、preload、renderer 三层类型的差异要明确。
- 工具链选型影响启动速度和团队认知。

---

## B.13 参考

- [TypeScript 官方手册](https://www.typescriptlang.org/docs/handbook/)
- [electron-vite](https://electron-vite.org/)
- [Electron Forge Vite plugin](https://www.electronforge.io/config/plugins/vite)
- [pnpm workspaces](https://pnpm.io/workspaces)
- [Changesets](https://github.com/changesets/changesets)
