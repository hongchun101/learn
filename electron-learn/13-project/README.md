# 13 · 实战项目：从零到生产级

> 这一章我们把前面 12 章的知识落到一个具体项目上：**Notes for Researchers** —— 一个 Markdown 笔记 + 内部知识库桌面应用。它覆盖一个生产应用所需的所有关键工程决策。

---

## 13.1 目标

- **多窗口**：主窗口 + 单文档窗口 + 设置面板。
- **多平台**：macOS / Windows / Linux（自动签名 / 自动更新）。
- **本地存储**：SQLite 加密 + Keychain 凭据。
- **快捷键 + 系统菜单**：全局快捷键呼出搜索、Copy / Paste / 标号。
- **导出**：PDF、HTML。
- **更新**：Squirrel 自动更新，三渠道 stable/beta/dev。
- **诊断**：Sentry 上报、Crashpad + minidump。
- **测试**：单元 + 端到端。

---

## 13.2 仓库结构

```text
notes-app/
├── apps/
│   └── desktop/                ← Electron 工程
│       ├── electron.vite.config.ts
│       ├── package.json
│       └── src/
│           ├── main/           ← 主进程
│           ├── preload/
│           └── renderer/       ← 渲染进程（React + Vite）
├── packages/
│   ├── core/                   ← 笔记模块（领域业务）
│   ├── ipc/                    ← 共享 IPC 类型
│   ├── native/                 ← Rust N-API（可选）
│   └── ui/                     ← 设计系统
├── scripts/                    ← 构建脚本
├── docs/                       ← 设计文档
└── README.md
```

实际工程里我们用 pnpm workspaces 和 turborepo 组织。

---

## 13.3 业务场景

### 13.3.1 实体

```ts
// packages/core/src/domain.ts
export interface Note {
  id: string;                // ULID
  title: string;
  content: string;           // Markdown
  tags: string[];
  folder: string;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
}

export interface Tag {
  id: string;
  name: string;
}
```

### 13.3.2 领域行为

```ts
export const searchNotes = async (q: string): Promise<Note[]> => { /* ... */ };
export const exportNote = async (id: string, kind: 'pdf' | 'html'): Promise<Buffer> => { /* ... */ };
export const moveNote = async (id: string, folderId: string): Promise<void> => { /* ... */ };
```

### 13.3.3 加密 / 迁移

`packages/core/src/migration.ts`：

```ts
export const migrations = [
  { v: 1, run: async (db) => db.exec(`CREATE TABLE …`) },
  { v: 2, run: async (db) => db.exec(`ALTER TABLE … ADD …`) },
];
```

---

## 13.4 主进程

```ts
// apps/desktop/src/main/index.ts
import { app, BrowserWindow, ipcMain, dialog, Menu, Tray } from 'electron';
import path from 'node:path';
import { createDatabase } from '@core/db';
import { setupIpcHandlers } from './ipc';
import { createTrayMenu } from './tray';
import { setupAutoUpdater } from './updater';
import { logger } from '@core/log';

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) app.quit();
else app.on('second-instance', () => mainWindow.show());

app.whenReady().then(async () => {
  const db = await createDatabase(path.join(app.getPath('userData'), 'notes.db'), app.getVersion());
  await db.migrate();

  await setupIpcHandlers(db);

  mainWindow = createMainWindow();
  setupAutoUpdater(mainWindow);
  createTrayMenu(() => mainWindow.show());

  Menu.setApplicationMenu(buildAppMenu());
});
```

### 13.4.1 窗口策略

`createMainWindow`：

```ts
const mainWindow = new BrowserWindow({
  width: 1280,
  height: 800,
  minWidth: 960,
  minHeight: 600,
  show: false,
  backgroundColor: '#0f1116',
  title: 'Notes for Researchers',
  webPreferences: {
    preload: path.join(__dirname, '../preload/index.js'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    spellcheck: true,
    webSecurity: true,
    partition: 'persist:main',
  },
});

mainWindow.once('ready-to-show', () => mainWindow.show());
mainWindow.loadURL(process.env.NODE_ENV === 'development' ? 'http://localhost:5173' : 'app://localhost/index.html');
```

### 13.4.2 系统菜单

```ts
const buildAppMenu = () => Menu.buildFromTemplate([
  { role: 'editMenu' },
  { label: 'Find', submenu: [
    { label: 'Quick Search', accelerator: 'CmdOrCtrl+K',
      click: () => mainWindow.webContents.send('shortcut:search') },
  ]},
  { role: 'viewMenu' },
  { role: 'windowMenu' },
]);
```

### 13.4.3 托盘

```ts
const createTrayMenu = (show: () => void) => {
  const icon = nativeImage.createFromPath(path.join(__dirname, '../../build/tray.png'));
  const tray = new Tray(icon.resize({ width: 18, height: 18 }));
  tray.setToolTip('Notes for Researchers');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show', click: show },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]));
};
```

### 13.4.4 IPC

```ts
export const setupIpcHandlers = (db: Database) => {
  const handlers = {
    'note.list':   z.object({ query: z.string().default('') }),
    'note.create': z.object({ title: z.string().min(1), folder: z.string().nullish() }),
    'note.update': z.object({ id: z.string(), patch: z.record(z.any()) }),
    'note.delete': z.object({ id: z.string() }),
    'note.export': z.object({ id: z.string(), format: z.enum(['pdf', 'html']) }),
  };

  ipcMain.handle('note.list', async (_e, raw) => {
    const req = handlers['note.list'].parse(raw);
    return db.listNotes(req.query);
  });

  ipcMain.handle('note.create', async (_e, raw) => {
    const req = handlers['note.create'].parse(raw);
    return db.createNote(req);
  });

  // ...
};
```

---

## 13.5 preload

```ts
// apps/desktop/src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron';
import type { IpcContract } from '@ipc/contract';

const invoke = <K extends keyof IpcContract>(channel: K, payload: any) => {
  return ipcRenderer.invoke(channel, payload);
};

contextBridge.exposeInMainWorld('api', {
  note: {
    list: (q: string) => invoke('note.list', { query: q }),
    create: (input: any) => invoke('note.create', input),
    update: (id: string, patch: any) => invoke('note.update', { id, patch }),
    remove: (id: string) => invoke('note.delete', { id }),
    export: (id: string, format: 'pdf' | 'html') => invoke('note.export', { id, format }),
  },
  onShortcut: (event: 'search' | 'newwindow', cb: () => void) => {
    const channel = `shortcut:${event}`;
    const fn = () => cb();
    ipcRenderer.on(channel, fn);
    return () => ipcRenderer.off(channel, fn);
  },
});
```

---

## 13.6 Renderer

### 13.6.1 目录

```text
src/
├── components/
├── store/         ← Zustand
├── pages/
├── styles/
└── index.tsx
```

### 13.6.2 全局状态

```ts
// store/useApp.ts
import { create } from 'zustand';

export const useApp = create<AppState>((set) => ({
  activeNote: null,
  setActiveNote: (n) => set({ activeNote: n }),
  // … others
}));
```

### 13.6.3 React 树

```tsx
function App() {
  return (
    <div className="app">
      <Sidebar />
      <Editor />
      <StatusBar />
    </div>
  );
}
```

### 13.6.4 拦截不安全导航

```ts
window.api.onShortcut('search', () => openCommandPalette());

window.addEventListener('will-navigate', (e) => e.preventDefault());
```

### 13.6.5 注入 CSP

```ts
// 在 main 通过 session.onHeadersReceived
session.defaultSession.webRequest.onHeadersReceived(({ responseHeaders }) => {
  responseHeaders['content-security-policy'] = [
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:;",
  ];
  return { responseHeaders };
});
```

---

## 13.7 数据层

```ts
// @core/db/index.ts
import BetterSqlite3 from 'better-sqlite3';
import path from 'node:path';

export const createDatabase = (file: string, appVersion: string) => {
  const db = new BetterSqlite3(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('cipher');              // 加密模式 (sqlcipher)
  db.pragma(`key='${process.env.DB_KEY}'`);

  return {
    db,
    migrate: async () => {
      const v = db.prepare('PRAGMA user_version').get() as { user_version: number };
      // … calls migrations
    },
    listNotes: (q) => db.prepare('SELECT id, title FROM notes WHERE title LIKE ?').all(`%${q}%`),
    createNote: (input) => { /* … */ },
    // …
  };
};
```

`DB_KEY` 从 Keychain 取出（safeStorage.encryptString）。

---

## 13.8 自动更新

```ts
// apps/desktop/src/main/updater.ts
import { autoUpdater } from 'electron-updater';

export const setupAutoUpdater = (mainWindow: BrowserWindow) => {
  if (process.env.NODE_ENV === 'development') return;

  const channel = process.env.UPDATE_CHANNEL ?? 'stable';
  autoUpdater.channel = channel;
  autoUpdater.setFeedURL({
    provider: 'generic',
    url: `https://updates.example.com/notes-app/${channel}`,
  });

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', async (info) => {
    mainWindow.webContents.send('update:available', { version: info.version });
  });

  autoUpdater.on('update-downloaded', () => {
    mainWindow.webContents.send('update:downloaded');
  });

  return autoUpdater.checkForUpdates();
};
```

CI：

```yaml
# .github/workflows/release.yml
jobs:
  release:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix: { os: [macos-latest, windows-latest, ubuntu-latest] }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: 'npm' }
      - run: npm ci
      - run: npm run build
      - run: npm run package
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          CSC_LINK: ${{ secrets.MAC_CERT }}
          CSC_KEY_PASSWORD: ${{ secrets.MAC_CERT_PASSWORD }}
          # Windows
          WIN_CERT_FILE: ${{ secrets.WIN_CERT }}
      - uses: actions/upload-artifact@v4
        with: { name: notes-${{ matrix.os }}, path: release/ }
```

---

## 13.9 测试策略

### 13.9.1 单元测试

```bash
npm i vitest @vitest/coverage-v8 jsdom
```

```ts
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { createDatabase } from '@core/db';
import { tmpdir } from 'node:os';
import fs from 'node:fs';

let db: Awaited<ReturnType<typeof createDatabase>>;

beforeAll(async () => {
  const file = `${tmpdir()}/note-${Date.now()}.db`;
  db = await createDatabase(file, 'test');
  await db.migrate();
});

afterAll(() => db.close());

describe('notes', () => {
  it('creates and lists', async () => {
    const id = await db.createNote({ title: 'hello' });
    expect((await db.listNotes('')).map(n => n.id)).toContain(id);
  });
});
```

### 13.9.2 端到端

```bash
npm i playwright @playwright/test electron-playwright
```

```ts
import { test, expect, _electron as electron } from '@playwright/test';

test('full workflow', async () => {
  const app = await electron.launch({ args: ['.'] });
  const window = await app.firstWindow();
  await expect(window.locator('title')).toContainText('Notes');
  await window.locator('[data-test="new-note"]').click();
  await window.fill('[data-test="title"]', 'Test');
  await window.fill('[data-test="content"]', '# Hello\n\nWorld');
  await window.click('[data-test="save"]');
  await expect(window.locator('.note-list-item')).toContainText('Test');
  await app.close();
});
```

### 13.9.3 Lint / Format

```json
{
  "scripts": {
    "lint": "eslint . --ext .ts,.tsx",
    "format": "prettier --write ."
  }
}
```

---

## 13.10 性能基线

启动目标：3s 冷启动到首屏。

```text
SPLIT 分段
────────────────────────────
cold start (process)         0.0s
v8 init                      0.20s
main ready                   0.45s
window ready-to-show         0.50s
JS bundle parse              0.85s
First Contentful Paint       0.95s
TTI                          1.30s
────────────────────────────
goal: 0.0-1.30s
```

- 50% 在 JS bundle parse：把 vendor 拆出，react+react-dom 单独 chunk。
- 15% 在 main process：原生模块归 utility。
- 15% 在 renderer first paint：lazy load 大组件。

---

## 13.11 安全基线检查

```markdown
- [ ] webPreferences.contextIsolation = true
- [ ] webPreferences.nodeIntegration = false
- [ ] webPreferences.sandbox = true
- [ ] CSP 已设置
- [ ] will-navigate / setWindowOpenHandler 已拦截
- [ ] IPC 入参都用 zod 校验
- [ ] contextBridge 暴露受控 API
- [ ] DB 加密 + Keychain 存 key
- [ ] 自动更新有签名
- [ ] Sentry 已配置
- [ ] Crashpad 默认开
```

---

## 13.12 部署

```bash
git tag v0.1.0
git push origin v0.1.0
# CI 自动构建 + 上传 + 创建 release
```

### 13.12.1 自动测试

CI 跑：

- vitest 单测。
- playwright e2e。
- electron-builder CLI 验签、公证（macOS）。
- SCA 扫描。

### 13.12.2 灰度发布

```text
stable ← main
beta   ← release/beta
dev    ← nightly
```

通过 `UPDATE_CHANNEL` 环境变量切换。

---

## 13.13 团队协作

- **Code owner**：IPC / native 模块 / 主进程变更需要 review。
- **CHANGELOG**：自动生成（standard-version / release-it）。
- **Style Guide**：ESLint + Prettier + commitlint。

---

## 13.14 演练

下面 30 条刻意练习，覆盖了前面 12 章所有要点。建议每周落实其中 2-3 条。

```text
[架构]
 1. 画出应用进程拓扑图
 2. 区分 main / renderer / utility 之间职责
 3. 计算期望冷启动 RT，并准备 metric

[安全]
 4. 把所有 webPreferences 锁到最低
 5. 写一个 zod schema 给每个 IPC handler
 6. 设置 CSP 并通过 chrome://inspect 验证

[IPC]
 7. 把 1 条 invoke 改为 MessagePort 并 benchmark
 8. 用 `setSourceMapsEnabled` 接住 `console-message`
 9. 把 1 个老 ipcMain.on 改成 ipcMain.handle

[Native]
10. 写一个最小 N-API 模块在 utility 里跑
11. 给 tray 加自定义菜单
12. 注册自定义协议并测 secure / corsEnabled

[窗口]
13. 让 ready-to-show 替代 show
14. 把 BrowserView 替换成 WebContentsView
15. macOS 上 titleBarStyle = hiddenInset

[性能]
16. 启动关键路径打 performance.measure 上报
17. 用 chrome://tracing 录一段找长任务
18. 优化 1 个长列表为虚拟滚动

[存储]
19. SQLite WAL 模式打开
20. 数据迁移写 backup + rollback
21. 凭据用 safeStorage

[更新]
22. 集成 electron-updater 并打开 verifyUpdateCodeSignature
23. macOS 公证 + staple
24. 配置 3 个渠道 stable/beta/dev

[打包]
25. 配置 electron-builder 多平台产物
26. CI 上传 S3 / GitHub Release
27. 把 50MB 资源走 extraResources

[调试]
28. 配置 Sentry 上报
29. 用 Crashpad dump 跑一次 minidump-stackwalker
30. 主进程接 --inspect，写完拆下
```

---

## 13.15 后续扩展方向

| 方向 | 难度 | 价值 |
|------|------|------|
| AI 助手（生成总结） | ★ | 高 |
| 端到端加密同步 | ★★★ | 高 |
| Web Clipper（Chrome 扩展协议） | ★★★ | 高 |
| 公司内部 OAuth 集成 | ★★ | 中 |
| PDF 阅读器 | ★★ | 中 |
| Voice Note + 语音转写 | ★★★ | 高 |
| WebView 嵌入式 PDF.js | ★ | 中 |

---

## 13.16 总结

- 学完这份实战项目，你已经从"会用 Electron"过渡到"能设计 Electron 工程"。
- 真正的进步来自反复做侧项目 + 复盘生产事故。
- Electron 不是"包装 HTML 的小工具"，而是一个完整的"桌面运行时平台"。

## 收尾

到这里 Electron 全部章节完成。**你应该做、也建议你做的回顾：**

1. 重新读 [01-architecture/README.md](../01-architecture/README.md) 与 [02-process-model/README.md](../02-process-model/README.md) 的「进程拓扑」一节，把"理想拓扑 → 你的项目现实" 做一次审视。
2. 在你最近的项目里挑选一个最长 30 分钟的任务，照本章 13.14 的 30 条刻意练习挑 3-5 条落实。
3. 把你的项目放进 git，结束一个工作日。

**能力清单**——完成后请确认你已经达成：

- 能用 5 分钟画出项目进程拓扑。
- 能说出每个 webPreferences 选项的危害等级。
- 能解释 electron 自动更新的签名链条。
- 能在生产事故现场打开 chrome://tracing 做性能 trace。
- 能写 N-API 模块或在 utility process 隔离长任务。
- 能用 electron-builder 配出三平台 + 自动签名 + 自动更新。

如果你觉得这些做到了，你就达到 Electron 专家水平了。

```text
                                            —— Happy shipping, and may your Chromium be evergreen.
```
