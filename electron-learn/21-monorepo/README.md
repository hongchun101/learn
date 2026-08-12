# 21 · 大型生产级 monorepo 实战

> 这一章我们落地一份**生产级** Electron 项目的完整骨架。它不是"教程示例"——它是**可以立刻 fork 之后成为公司核心 monorepo** 的真实工程。每行配置、每个工具、每条 lint 规则都来自实战沉淀。

**阅读目标**：

- 看到 monorepo 一眼就能画出整个工程的依赖图。
- 任何一个文件，找到它在 monorepo 哪个包。
- 给团队做 5 分钟 onboarding 训练。

---

## 21.1 仓库结构

```text
my-platform/                           ← root
├── apps/
│   └── desktop/                       ← Electron 桌面端
│       ├── electron.vite.config.ts
│       ├── electron-builder.yml
│       ├── scripts/
│       │   ├── notarize.sh
│       │   └── sign-and-upload.cjs
│       ├── src/
│       │   ├── main/                  ← 主进程
│       │   │   ├── index.ts
│       │   │   ├── ipc.ts
│       │   │   ├── window-manager.ts
│       │   │   ├── auto-updater.ts
│       │   │   └── telemetry.ts
│       │   ├── preload/
│       │   │   ├── index.ts
│       │   │   └── api-contract.ts
│       │   └── utilities/
│       │       ├── crasher.ts         ← 测试用
│       │       └── ipc-stream.ts
│       └── tests/
│           ├── unit/
│           ├── integration/
│           └── e2e/
├── packages/
│   ├── core/                          ← 领域逻辑
│   │   └── src/
│   │       ├── domain/
│   │       │   ├── note.ts
│   │       │   ├── folder.ts
│   │       │   └── search.ts
│   │       ├── ipc-contract.ts        ← IPC 类型定义
│   │       └── db/
│   │           ├── schema.sql
│   │           ├── migrations.ts
│   │           └── repositories.ts
│   │
│   ├── ui/                            ← 设计系统
│   │   └── src/
│   │       ├── components/
│   │       ├── theme/
│   │       └── hooks/
│   │
│   ├── utils/                         ← 通用工具
│   │   └── src/
│   │       ├── log.ts
│   │       ├── error.ts
│   │       └── observable.ts
│   │
│   └── native/                        ← Rust N-API（可选用）
│       ├── Cargo.toml
│       └── src/
│           ├── lib.rs
│           └── ...
│
├── infra/                             ← 基础设施
│   ├── scripts/
│   ├── ci/
│   └── release/
│
├── docs/
│   ├── architecture/
│   ├── runbook/
│   └── api/
│
├── .github/
│   ├── workflows/
│   │   ├── ci.yml
│   │   ├── release.yml
│   │   └── e2e.yml
│   └── CODEOWNERS
│
├── .husky/                            ← git hooks
├── pnpm-workspace.yaml
├── turbo.json
├── package.json                       ← root
├── tsconfig.base.json
├── tsconfig.node.json
├── tsconfig.web.json
├── eslint.config.js
├── prettier.config.js
├── commitlint.config.cjs
├── renovate.json
├── .npmrc
├── .nvmrc
└── README.md
```

---

## 21.2 workspace 配置

### 21.2.1 `pnpm-workspace.yaml`

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
  - 'infra/*'

# 在 installs 中只 hoisted 那些节点全局公用
public-hoist-pattern:
  - '*eslint*'
  - '*prettier*'
```

### 21.2.2 `.npmrc`

```ini
registry=https://registry.npmjs.org/
strict-peer-dependencies=false
auto-install-peers=true
shamefully-hoist=false
package-import-method=hardlink
```

### 21.2.3 `turbo.json`

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"],
      "inputs": ["src/**", "package.json", "tsconfig.json"]
    },
    "lint": {
      "inputs": ["src/**", ".eslintrc.cjs", "eslint.config.js"]
    },
    "test": {
      "dependsOn": ["build"],
      "outputs": ["coverage/**"],
      "inputs": ["src/**", "tests/**"]
    },
    "type-check": {
      "dependsOn": ["^build"],
      "outputs": []
    },
    "package": {
      "dependsOn": ["build", "test"],
      "outputs": ["release/**"]
    },
    "e2e": {
      "dependsOn": ["build"],
      "outputs": ["playwright-report/**"]
    }
  },
  "globalDependencies": ["tsconfig.base.json"]
}
```

### 21.2.4 root `package.json`

```json
{
  "name": "my-platform",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20.10.0", "pnpm": ">=9" },
  "scripts": {
    "dev": "pnpm -F @app/desktop dev",
    "build": "turbo run build",
    "test": "turbo run test",
    "lint": "turbo run lint",
    "type-check": "turbo run type-check",
    "format": "prettier --write .",
    "package": "pnpm -F @app/desktop package",
    "package:all": "pnpm -F @app/desktop package:all",
    "e2e": "turbo run e2e",
    "prepare": "husky"
  },
  "devDependencies": {
    "@types/node": "^20.10.0",
    "eslint": "^9.0.0",
    "prettier": "^3.2.0",
    "turbo": "^2.0.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0",
    "husky": "^9.0.0",
    "lint-staged": "^15.0.0",
    "@commitlint/cli": "^19.0.0",
    "@commitlint/config-conventional": "^19.0.0"
  },
  "packageManager": "pnpm@9.0.0"
}
```

---

## 21.3 TypeScript 配置

### 21.3.1 `tsconfig.base.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true,
    "useUnknownInCatchVariables": true,
    "noUncheckedIndexedAccess": true,
    "noFallthroughCasesInSwitch": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "experimentalDecorators": true,
    "incremental": true
  }
}
```

### 21.3.2 `tsconfig.node.json`

```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "types": ["node", "electron"],
    "outDir": "./dist",
    "sourceMap": true,
    "declaration": true,
    "composite": true
  },
  "include": [
    "apps/desktop/src/main/**/*",
    "apps/desktop/src/preload/**/*",
    "apps/desktop/src/utilities/**/*",
    "packages/core/src/**/*",
    "packages/utils/src/**/*",
    "packages/native/binding.cjs"
  ]
}
```

### 21.3.3 `tsconfig.web.json`

```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "types": [],
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "noEmit": true,
    "useDefineForClassFields": true,
    "allowSyntheticDefaultImports": true,
    "resolveJsonModule": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "customConditions": ["browser"]
  },
  "include": [
    "apps/desktop/src/renderer/**/*",
    "packages/ui/src/**/*",
    "packages/utils/src/**/*"
  ]
}
```

---

## 21.4 Lint / Format

### 21.4.1 ESLint 9 flat config

```js
// eslint.config.js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import hooksPlugin from 'eslint-plugin-react-hooks';
import electronPlugin from 'eslint-plugin-electron';
import importPlugin from 'eslint-plugin-import';

export default [
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  {
    plugins: {
      react,
      'react-hooks': hooksPlugin,
      electron: electronPlugin,
      import: importPlugin,
    },
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'no-restricted-syntax': [
        'warn',
        {
          selector: "TSAsExpression[typeAnnotation.typeName.name='any']",
          message: 'Avoid `as any`',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      'import/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', ['parent', 'sibling', 'index']],
          'newlines-between': 'always',
        },
      ],
      'electron/no-deprecated-api': 'error',
      'electron/no-unsafe-node-integration': 'error',
    },
    settings: {
      react: { version: 'detect' },
      'import/resolver': {
        typescript: { project: ['apps/*/tsconfig*.json', 'packages/*/tsconfig*.json'] },
      },
    },
  },

  // 测试文件宽松
  {
    files: ['**/*.test.ts', '**/*.test.tsx'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
    },
  },

  // 排除
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/release/**',
      '**/.next/**',
      '**/coverage/**',
      '**/.turbo/**',
    ],
  },
];
```

### 21.4.2 Prettier

```js
// prettier.config.js
export default {
  printWidth: 100,
  tabWidth: 2,
  useTabs: false,
  semi: true,
  singleQuote: true,
  trailingComma: 'all',
  arrowParens: 'always',
  endOfLine: 'lf',
  bracketSpacing: true,
  plugins: ['prettier-plugin-tailwindcss'],
};
```

### 21.4.3 commitlint

```js
// commitlint.config.cjs
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat',
        'fix',
        'docs',
        'style',
        'refactor',
        'test',
        'chore',
        'revert',
        'perf',
        'build',
        'ci',
        'release',
      ],
    ],
    'scope-empty': [2, 'never'],
    'subject-full-stop': [2, 'never', '.'],
  },
};
```

### 21.4.4 lint-staged

```json
// .lintstagedrc.json
{
  "*.ts": ["prettier --write", "eslint --max-warnings=0 --fix"],
  "*.tsx": ["prettier --write", "eslint --max-warnings=0 --fix"],
  "*.json": ["prettier --write"],
  "*.md": ["prettier --write"]
}
```

---

## 21.5 Git Hooks (Husky)

### 21.5.1 commit-msg

```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

npx --no-install commitlint --edit "$1"
```

### 21.5.2 pre-commit

```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

npx --no-install lint-staged
```

### 21.5.3 pre-push

```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

npx turbo run type-check test
```

---

## 21.6 Electron 构建配置

### 21.6.1 electron-builder.yml

```yaml
appId: com.example.myplatform
productName: MyPlatform
copyright: Copyright © 2025 Example Inc.

asar: true
compression: normal

asarUnpack:
  - "**/*.node"
  - "**/*.dll"
  - "**/*.dylib"
  - "**/*-glibc*/**"
  - "**/natives/**"
  - "**/vendor/**"

directories:
  output: release/${version}
  buildResources: build
  cache: build/cache

files:
  - dist/**/*
  - package.json

extraResources:
  - from: build/data
    to: data
    filter: ["**/*"]

electronLanguages:
  - en-US
  - zh-CN

# 跨平台发布到 CDN
publish:
  provider: generic
  url: https://updates.example.com/${productName}/${env.UPDATE_CHANNEL:-latest}
  channel: ${env.UPDATE_CHANNEL:-latest}
  useMultipleRangeRequest: false
  vFeedToken: ${env.UPDATER_TOKEN}

# macOS
mac:
  category: public.app-category.productivity
  target:
    - target: dmg
      arch: [x64, arm64]
    - target: zip
      arch: [x64, arm64]
  hardenedRuntime: true
  gatekeeperAssess: false
  notarize:
    teamId: ${env.APPLE_TEAM_ID}
    tool: notarytool
    options:
      keychainProfile: AC_PASSWORD

  # 个性化
  darkModeSupport: true
  extendInfo:
    NSHumanReadableCopyright: Copyright © 2025 Example Inc.

dmg:
  writeUpdateInfo: true

# Windows
win:
  target:
    - target: nsis
      arch: [x64, arm64]
    - target: portable
      arch: [x64]
  signtoolOptions:
    publisherName: Example Inc.
    signingHashAlgorithms: [sha256]
    rfc3161TimeStampServer: http://timestamp.digicert.com

nsis:
  oneClick: false
  perMachine: false
  allowToChangeInstallationDirectory: true
  allowElevation: true
  deleteAppDataOnUninstall: false
  createDesktopShortcut: true
  createStartMenuShortcut: true
  shortcutName: MyPlatform
  artifactName: ${productName}-${version}-setup.${ext}

# Linux
linux:
  target:
    - target: deb
      arch: [x64, arm64]
    - target: rpm
      arch: [x64]
    - target: AppImage
      arch: [x64]
  vendor: Example Inc.
  maintainer: developer@example.com
  synopsis: A platform built on Electron
  description: A serious business-critical desktop app
  category: Office
  executableName: myplatform
```

### 21.6.2 electron.vite.config.ts

```ts
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { visualizer } from 'rollup-plugin-visualizer';

const isDev = process.env.NODE_ENV === 'development';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist/main',
      rollupOptions: {
        input: resolve(__dirname, 'src/main/index.ts'),
        external: ['electron', 'better-sqlite3', '*.node'],
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs',
        },
      },
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify(isDev ? 'development' : 'production'),
    },
  },

  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist/preload',
      rollupOptions: {
        input: resolve(__dirname, 'src/preload/index.ts'),
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs',
        },
      },
    },
  },

  renderer: {
    plugins: [
      react(),
      visualizer({ filename: 'dist/bundle.html', gzipSize: true }),
    ],
    root: resolve(__dirname, 'src/renderer'),
    build: {
      outDir: resolve(__dirname, 'dist/renderer'),
      rollupOptions: {
        input: resolve(__dirname, 'src/renderer/index.html'),
      },
    },
    resolve: {
      alias: {
        '@app': resolve(__dirname, 'src/renderer'),
        '@core': resolve(__dirname, '../../../packages/core/src'),
        '@ui': resolve(__dirname, '../../../packages/ui/src'),
      },
    },
    server: { port: 5173 },
  },
});
```

---

## 21.7 主进程结构

### 21.7.1 `apps/desktop/src/main/index.ts`

```ts
import path from 'node:path';
import { app, BrowserWindow, session } from 'electron';
import { setupIpc } from './ipc';
import { WindowManager } from './window-manager';
import { setupAutoUpdater } from './auto-updater';
import { setupTelemetry } from './telemetry';
import { logger } from '@utils/log';

// 单实例锁
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    WindowManager.showMain();
  });

  // 启动之前必须设置的命令
  app.commandLine.appendSwitch('disable-features', 'OutOfBlinkCors');

  app.whenReady().then(async () => {
    // 0) Crashpad / Sentry
    setupTelemetry();

    // 1) 配置 session / CSP
    session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
      cb({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' wss://api.example.com",
          ],
        },
      });
    });

    // 2) IPC handlers
    setupIpc();

    // 3) 启动主窗口
    await WindowManager.createMain();

    // 4) 自动更新
    if (!process.env.DISABLE_AUTOUPDATER) {
      setupAutoUpdater(WindowManager.main);
    }

    logger.info({ msg: 'app started', version: app.getVersion() });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      WindowManager.createMain();
    }
  });

  app.on('web-contents-created', (_, contents) => {
    contents.on('will-attach-webview', (event) => event.preventDefault());
    contents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('app://')) return { action: 'allow' };
      require('electron').shell.openExternal(url);
      return { action: 'deny' };
    });
  });
}
```

### 21.7.2 `apps/desktop/src/main/window-manager.ts`

```ts
import path from 'node:path';
import { BrowserWindow } from 'electron';

class WindowManagerImpl {
  private _main: BrowserWindow | null = null;
  private _settings: BrowserWindow | null = null;

  get main() {
    if (!this._main || this._main.isDestroyed()) {
      throw new Error('main window not available');
    }
    return this._main;
  }

  async createMain() {
    if (this._main && !this._main.isDestroyed()) {
      this._main.show();
      return this._main;
    }

    const isDev = process.env.NODE_ENV === 'development';

    this._main = new BrowserWindow({
      width: 1280,
      height: 800,
      minWidth: 960,
      minHeight: 600,
      show: false,
      backgroundColor: '#0f1116',
      title: 'MyPlatform',
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: true,
        webSecurity: true,
        webviewTag: false,
      },
    });

    this._main.once('ready-to-show', () => this._main?.show());

    if (isDev) {
      await this._main.loadURL('http://localhost:5173');
    } else {
      await this._main.loadFile(path.join(__dirname, '../renderer/index.html'));
    }

    this._main.on('closed', () => {
      this._main = null;
    });

    return this._main;
  }

  showMain() {
    if (this._main) {
      if (this._main.isMinimized()) this._main.restore();
      this._main.show();
      this._main.focus();
    }
  }

  async createSettings() {
    if (this._settings && !this._settings.isDestroyed()) {
      this._settings.show();
      return this._settings;
    }

    this._settings = new BrowserWindow({
      width: 800,
      height: 600,
      show: false,
      parent: this._main ?? undefined,
      modal: false,
      title: 'Settings',
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    await this._settings.loadFile(path.join(__dirname, '../renderer/settings.html'));
    this._settings.once('ready-to-show', () => this._settings?.show());
    return this._settings;
  }
}

export const WindowManager = new WindowManagerImpl();
```

### 21.7.3 `apps/desktop/src/main/ipc.ts`

```ts
import { ipcMain } from 'electron';
import { z } from 'zod';

import type { IPCChannels } from '@core/ipc-contract';
import { NoteRepository } from '@core/db/repositories';

const repos = {
  notes: new NoteRepository(),
};

const schemas: { [K in keyof IPCChannels]: z.ZodType<any> } = {
  'notes.list': z.object({ q: z.string().optional() }),
  'notes.create': z.object({ title: z.string().min(1).max(256) }),
  'notes.delete': z.object({ id: z.string().uuid() }),
  // ...
};

const handlers: {
  [K in keyof IPCChannels]: (req: z.infer<(typeof schemas)[K]>) => Promise<unknown>;
} = {
  'notes.list': async (req) => repos.notes.list(req.q ?? ''),
  'notes.create': async (req) => repos.notes.create(req),
  'notes.delete': async (req) => repos.notes.delete(req.id),
};

export function setupIpc() {
  for (const ch of Object.keys(handlers) as (keyof IPCChannels)[]) {
    ipcMain.handle(ch, async (_event, raw) => {
      const schema = schemas[ch];
      const parsed = schema.safeParse(raw);
      if (!parsed.success) {
        throw new Error(`invalid payload: ${parsed.error.message}`);
      }
      // @ts-ignore generic 调用，但我们只信任 schema 解析后的对象
      return handlers[ch](parsed.data);
    });
  }
}
```

---

## 21.8 IPC 类型定义（packages/core）

### 21.8.1 `packages/core/src/ipc-contract.ts`

```ts
import type { Note } from './domain/note';

export interface NoteListReq {
  q?: string;
}

export interface NoteCreateReq {
  title: string;
  content?: string;
  folder?: string;
  tags?: string[];
}

export interface NoteDeleteReq {
  id: string;
}

export interface IPCChannels {
  'notes.list': (req: NoteListReq) => Note[];
  'notes.create': (req: NoteCreateReq) => string;        //  返回 note id
  'notes.delete': (req: NoteDeleteReq) => boolean;
}

export type ChannelName = keyof IPCChannels;
```

### 21.8.2 `packages/core/src/db/schema.sql`

```sql
CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT DEFAULT '',
  folder TEXT,
  tags TEXT DEFAULT '[]',
  pinned INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notes_folder ON notes(folder);
CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at DESC);
```

### 21.8.3 `packages/core/src/db/migrations.ts`

```ts
export const migrations = [
  {
    v: 1,
    up: async (db: import('better-sqlite3').Database) => {
      db.exec(`
        CREATE TABLE notes (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          content TEXT DEFAULT '',
          folder TEXT,
          tags TEXT DEFAULT '[]',
          pinned INTEGER DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE INDEX idx_notes_folder ON notes(folder);
      `);
    },
  },
  // v2 加 search 表、加全文搜索
  {
    v: 2,
    up: async (db) => {
      db.exec(`CREATE VIRTUAL TABLE notes_fts USING fts5(content, title, tags);`);
    },
  },
];
```

---

## 21.9 测试策略

### 21.9.1 单测

```ts
// packages/core/src/db/__tests__/note-repository.test.ts
import { describe, expect, it, beforeAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { NoteRepository } from '../repositories';

let db: BetterSqlite3.Database;

beforeAll(() => {
  db = new BetterSqlite3(':memory:');
  db.pragma('journal_mode = MEMORY');
});

describe('NoteRepository', () => {
  it('creates and reads', () => {
    const repo = new NoteRepository(db);
    const id = repo.create({ title: 'hi' });
    expect(repo.list('').find((n) => n.id === id)).toBeTruthy();
  });
});
```

### 21.9.2 e2e（Playwright）

```ts
// apps/desktop/tests/e2e/main.spec.ts
import { test, expect, _electron as electron } from '@playwright/test';
import path from 'node:path';

let app: Awaited<ReturnType<typeof electron.launch>>;
let win: Awaited<ReturnType<typeof app.firstWindow>>;

test.beforeAll(async () => {
  app = await electron.launch({
    args: [path.join(__dirname, '../../../dist/main/index.cjs')],
  });
  win = await app.firstWindow();
});

test.afterAll(async () => {
  await app.close();
});

test('home screen shows', async () => {
  await expect(win).toHaveTitle(/MyPlatform/);
});

test('create note', async () => {
  await win.click('[data-test=new-note]');
  await win.fill('[data-test=title]', 'Hello');
  await win.fill('[data-test=content]', 'World');
  await win.click('[data-test=save]');
  await expect(win.locator('.note-item').filter({ hasText: 'Hello' })).toBeVisible();
});
```

### 21.9.3 Performance bench

```ts
import { Bench } from 'tinybench';
const bench = new Bench({ time: 5000 });

bench
  .add('note.create', () => repo.create({ title: 't' }))
  .add('note.list', () => repo.list(''));

await bench.run();
console.table(bench.table());
```

---

## 21.10 GitHub Actions CI

### 21.10.1 `.github/workflows/ci.yml`

```yaml
name: CI
on: { pull_request: {}, push: { branches: [main] } }

jobs:
  build:
    strategy:
      matrix: { os: [ubuntu-latest, macos-latest, windows-latest] }
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo run build type-check lint test
        env:
          # CI signaling
          NODE_OPTIONS: --max-old-space-size=8192
```

### 21.10.2 `.github/workflows/release.yml`

```yaml
name: Release
on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  release:
    if: github.event_name == 'push'
    runs-on: ${{ matrix.os }}
    strategy:
      matrix: { os: [macos-latest, windows-latest, ubuntu-latest] }
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: 'pnpm' }

      - name: Import Apple code signing cert
        if: matrix.os == 'macos-latest'
        uses: apple-actions/import-codesigncert@v3
        with:
          p12-file-base64: ${{ secrets.MACOS_CERT_P12 }}
          p12-password: ${{ secrets.MACOS_CERT_PASSWORD }}

      - name: Import Windows code signing cert
        if: matrix.os == 'windows-latest'
        uses: azure-actions/setup-msstore-codesigning@v1
        with:
          client-id: ${{ secrets.AZURE_CLIENT_ID }}
          tenant-id: ${{ secrets.AZURE_TENANT_ID }}
          certificate-profile: ${{ secrets.AZURE_CODESIGN_PROFILE }}

      - run: pnpm install --frozen-lockfile

      - name: Set up AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1

      - name: Build and publish
        env:
          UPDATE_CHANNEL: stable
          AWS_S3_BUCKET: my-updates-bucket
          AWS_S3_PREFIX: myplatform/${{ github.sha }}
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
          APPLE_PASSWORD: ${{ secrets.APPLE_PASSWORD }}
          CSC_LINK: ${{ secrets.WIN_CERT }}
          CSC_KEY_PASSWORD: ${{ secrets.WIN_CERT_PASSWORD }}
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          pnpm package:all
          aws s3 sync release/ s3://$AWS_S3_BUCKET/$AWS_S3_PREFIX/

      - uses: softprops/action-gh-release@v2
        with:
          files: |
            release/*.exe
            release/*.dmg
            release/*.zip
            release/*.AppImage
            release/latest*.yml
            release/latest*.yaml
          generate_release_notes: true
```

### 21.10.3 `.github/workflows/e2e.yml`

```yaml
name: E2E
on: { pull_request: {}, push: { branches: [main] } }

jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: 'pnpm' }

      - run: pnpm install --frozen-lockfile
      - run: pnpm -F @app/desktop build

      - run: xvfb-run pnpm -F @app/desktop e2e
        env: { DISPLAY: ':99' }

      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: apps/desktop/playwright-report/
```

---

## 21.11 observability

### 21.11.1 telemetry 初始化

```ts
// apps/desktop/src/main/telemetry.ts
import * as Sentry from '@sentry/electron/main';

let initialized = false;
export function setupTelemetry() {
  if (initialized) return;
  initialized = true;

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    release: `myplatform@${process.env.npm_package_version}`,
    tracesSampleRate: 0.2,
    enableNative: true,
    beforeSendTransaction(event) {
      return process.env.NODE_ENV === 'production' ? event : null;
    },
  });
}
```

### 21.11.2 用户侧埋点

```ts
import * as Sentry from '@sentry/electron/renderer';

Sentry.startTransaction({ name: 'note.create' });
```

### 21.11.3 主进程指标

```ts
import { metrics } from '@core/observability';

metrics.counter('note.create.success').inc();
metrics.gauge('renderer.memory.bytes').set(process.memoryUsage().rss);
```

### 21.11.4 OpenTelemetry 集成（高级）

```ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';

const sdk = new NodeSDK({
  resource: new Resource({ 'service.name': 'myplatform-desktop' }),
  traceExporter: new OTLPTraceExporter({ url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT }),
});
sdk.start();
```

---

## 21.12 可视化 CI / CD 看板

### 21.12.1 分支策略

```
main            ← production
release/2.x     ← 下一个 minor
feature/abc     ← individual
hotfix/abc      ← immediate
```

### 21.12.2 release 流程

1. Create release branch: `git checkout -b release/2.1`
2. Update version: `pnpm changeset version`
3. PR -> CI -> merge to main
4. Create tag: `git tag v2.1.0`
5. CI 自动 build/publish

### 21.12.3 commit 通过 husky + commitlint

```text
feat(core): add full-text search
fix(desktop): window flash on startup
chore(ci): bump electron 28 -> 29
docs(readme): add contribution guide
```

---

## 21.13 推荐库

| 库 | 用 |
|----|---|
| `@core/zod` | 校验 |
| `@trpc/server` + `@trpc/client` | 类型安全 RPC |
| `better-sqlite3` | DB |
| `@electron-toolkit/utils` | Electron helper |
| `@tanstack/query` | renderer 缓存 |
| `@tanstack/router` | 路由 |
| `zustand` | 状态 |
| `react-virtuoso` | 虚拟列表 |
| `playwright` | e2e |
| `@sentry/electron` | 监控 |
| `electron-log` | 本地日志 |

---

## 21.14 5 分钟 onboarding

每个新工程师入职，5 步看完整个 monorepo：

```text
1. pnpm i                                      # install
2. pnpm dev                                    # vite dev server runs Electron
3. pnpm test                                   # run tests
4. pnpm lint                                   # run lint
5. pnpm package                                # build & package
```

每人通过 CI 测试能跑出自己的产品级安装包。

---

## 21.15 总结

这份 monorepo 设计原则真实可靠，每个工具都为生产而存在。它可以在 5 分钟内一个新人上手。一个团队如果以这份为基础，可以省下大量"先 setup，再讨论"的浪费。

下一章 [22 · 完整 type-safe IPC 类型生成](./../22-ipc-types/README.md)，展示 TS 中的 IPC 类型生成器，让 IPC 完美类型安全。
