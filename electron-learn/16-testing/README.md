# 附录 C · 测试深入

> Electron 项目的测试金字塔非常特殊：渲染层测 Web、preload 测 Bridge、main 测 IPC、native 测 ABI。本章给出一套可行的"测试金字塔+集成测试方案"。

---

## C.1 测试金字塔

```text
                            ────────────────────
                            /  E2E Playwright    \         (~ 30 mins, CI)
                            \  跑 1 套 / PR      /
                            ────────────────────
                       ──────────────────────────────────
                       / 集成: 主进程 + utility + 渲染 \      (~ 10 mins)
                       ──────────────────────────────────
                ─────────────────────────────────────────
                / 单元: 主进程 IPC handler + preload utils \   (~ 1 min)
                ─────────────────────────────────────────
       ─────────────────────────────────────────────────────────────
       / 工程能力测试: 类型、Lint、Sourcemap、ASAR build sanity /      (~ 30s)
       ─────────────────────────────────────────────────────────────
```

---

## C.2 单元测试

### C.2.1 主进程 IPC handler 单元测试

`main/ipc/note.test.ts`：

```ts
import { describe, expect, test, vi } from 'vitest';
import { noteHandlers } from './note';

describe('noteHandlers', () => {
  test('list returns empty when no notes', async () => {
    const db = { listNotes: vi.fn().mockResolvedValue([]) };
    const ctx: any = { senderFrame: { url: 'app://localhost' }, sender: { id: 1 } };

    const handler = noteHandlers.list(db, ctx);
    expect(await handler(null, { q: 'a' })).toEqual([]);
    expect(db.listNotes).toHaveBeenCalledWith('a');
  });

  test('create must validate title', async () => {
    const db = { createNote: vi.fn() };
    const handler = noteHandlers.create(db);

    await expect(handler(null, { title: '' })).rejects.toThrow();
  });
});
```

要点：把 db、ctx、senderFrame 注入到 handler，让 handler 是纯函数。

### C.2.2 preload 测试

```ts
import { exposeInMainWorld } from 'electron';
import { defineApi } from './api';

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld },
  ipcRenderer: {
    invoke: vi.fn().mockResolvedValue('ok'),
    on: vi.fn(),
  },
}));

import { getApi } from './index';

test('exposes correctly', () => {
  const api = getApi();
  expect(api.note.list).toBeTypeOf('function');
});
```

注意 preload 测试时 mock `electron` 整个模块。

### C.2.3 renderer 单元

```ts
// 用 happy-dom
import { test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

test('Sidebar shows notes', () => {
  render(<Sidebar notes={[{ id: '1', title: 'a' }]} />);
  expect(screen.getByText('a')).toBeInTheDocument();
});
```

---

## C.3 集成测试

### C.3.1 启动 Electron 子进程

```ts
import { _electron as electron, ElectronApplication, Page } from 'playwright';
import path from 'node:path';

let app: ElectronApplication;
let window: Page;

beforeAll(async () => {
  app = await electron.launch({
    args: [path.join(__dirname, 'dist/main/index.js')],
    env: { ...process.env, NODE_ENV: 'test' },
  });
  window = await app.firstWindow();
});

afterAll(async () => {
  await app.close();
});

test('should show main window', async () => {
  await expect(window).toHaveTitle(/Notes/);
});

test('should list notes via API', async () => {
  const result = await window.evaluate(() => (window as any).api.note.list(''));
  expect(result).toEqual([]);
});
```

### C.3.2 模拟用户输入

```ts
await window.click('[data-test=new-note]');
await window.fill('[data-test=title]', 'MyNote');
await window.click('[data-test=save]');
await expect(window.locator('.notes__item')).toContainText('MyNote');
```

### C.3.3 验证 IPC + 主进程副作用

```ts
test('save updates local db', async () => {
  await window.click('button:has-text("Save")');
  const all = await window.evaluate(() => (window as any).api.note.list(''));
  expect(all.find(n => n.title === 'MyNote')).toBeTruthy();
});
```

---

## C.4 启动/退出/错误路径

### C.4.1 启动测试

- 测试基于 production 打包（`pnpm package` → `electron .`），确保 Vite-build 配置可用。
- 测试基于 `electron-vite dev` 模式也行，但生产与 dev 状态尽量分开。

### C.4.2 退出测试

```ts
test('app quits cleanly', async () => {
  await app.evaluate(({ app }) => app.quit());
  expect(await app.evaluate(({ app }) => app.isReady())).toBe(false);
});
```

### C.4.3 模拟崩溃

```ts
test('renderer crash -> fallback', async () => {
  const wc = window;
  wc.evaluate(() => (window as any).api.system.killSelf);   // mock
  await app.waitForEvent('window');
});
```

或者直接派 `killRenderer`：

```ts
import { BrowserWindow } from 'electron';

const win = BrowserWindow.getAllWindows()[0];
const proc = win.webContents.getOSProcessId();
process.kill(proc, 'SIGSEGV');
```

---

## C.5 E2E 测试生命周期

### C.5.1 一次完整测试

```ts
test('end to end', async () => {
  // 1. 启动
  // 2. 创建笔记
  // 3. 切换主题
  // 4. 关闭后重启
  // 5. 数据仍然存在
});
```

### C.5.2 状态保持与重置

```ts
beforeEach(async () => {
  await app.evaluate(async ({ app }) => {
    const dir = app.getPath('userData');
    await fs.remove(path.join(dir, 'notes.db'));
  });
});
```

### C.5.3 同时启动两个实例

```ts
test('requestSingleInstanceLock works', async () => {
  const a = await electron.launch({ args: ['.'] });
  const b = await electron.launch({ args: ['.'] });
  // 只有 a 持有锁，b 应该退出
});
```

---

## C.6 原生模块测试

### C.6.1 简单 ABI smoke

```ts
import { expect, test } from 'vitest';

test('native module ABI matches', () => {
  process.versions;
  const napiVer = process.versions.napi;
  expect(napiVer).toBeTypeOf('string');

  // skip if we don't have the native module
  const mod = require('better-sqlite3');
  const db = mod(':memory:');
  expect(db.prepare('select 1 as v').get()).toEqual({ v: 1 });
});
```

### C.6.2 真实 ABI 不匹配的识别

```ts
// scripts/check-abi.ts
const { execSync } = require('node:child_process');
execSync('electron-rebuild -v', { stdio: 'inherit' });
```

---

## C.7 性能基线测试

### C.7.1 启动时间基线

```ts
test('cold start under 2s', async () => {
  const t0 = Date.now();
  const app = await electron.launch({ args: ['.'] });
  await app.firstWindow();
  await app.close();
  const elapsed = Date.now() - t0;
  expect(elapsed).toBeLessThan(2000);
});
```

### C.7.2 渲染帧率

```ts
const measurements = await window.evaluate(async () => {
  const frames: number[] = [];
  let prev = performance.now();
  return new Promise<number[]>(resolve => {
    function loop() {
      const now = performance.now();
      frames.push(now - prev);
      prev = now;
      if (frames.length < 60) requestAnimationFrame(loop);
      else resolve(frames);
    }
    requestAnimationFrame(loop);
  });
});

const avg = measurements.reduce((a, b) => a + b, 0) / measurements.length;
expect(avg).toBeLessThan(18); // 1000/55 ≈ 18ms，55+ fps
```

### C.7.3 内存压力

```ts
test('memory plateau', async () => {
  await window.evaluate(async () => {
    for (let i = 0; i < 1000; i++) {
      await (window as any).api.note.create({ title: `t${i}`, content: '' });
    }
  });
  const rss = await app.evaluate(({ process }) => process.memoryUsage().rss);
  expect(rss).toBeLessThan(800 * 1024 * 1024);  // < 800MB
});
```

---

## C.8 视觉回归测试

### C.8.1 playwright 自带 snapshot

```ts
await expect(window).toHaveScreenshot('home.png', { maxDiffPixels: 200 });
```

### C.8.2 处理 HiDPI / 暗色

```ts
test('home dark', async () => {
  await window.evaluate(() => document.body.classList.add('theme-dark'));
  await window.waitForTimeout(100);
  await expect(window).toHaveScreenshot('home-dark.png');
});
```

---

## C.9 Snapshot 测试

### C.9.1 主进程 IPC message 快照

```ts
// 用 jest-snapshots
const out = await mainStub('note.list', { q: 'a' });
expect(out).toMatchSnapshot();
```

### C.9.2 渲染 DOM

```ts
expect(window.locator('.editor').innerHTML()).toMatchSnapshot();
```

---

## C.10 Fuzz 测试

### C.10.1 渲染层 fuzz

用 [Electron-Fuzz](https://github.com/electron/fuzz) 或自写：

```ts
for (let i = 0; i < 1000; i++) {
  await window.fill('[data-test=content]', randomBytes(10000));
  await window.click('button:has-text("Save")');
}
```

### C.10.2 IPC fuzz

```ts
for (const ch of Object.keys(IPCContract)) {
  for (let i = 0; i < 100; i++) {
    try {
      await window.evaluate(({ channel }) => (window as any).api.invoke(channel, garbage()), { channel: ch });
    } catch (e) { /* Zod would throw */ }
  }
}
```

---

## C.11 报告与覆盖率

### C.11.1 c8 / vite coverage

```ts
// vitest.config.ts
coverage: { provider: 'v8', reporter: ['html', 'text', 'lcov'] }
```

### C.11.2 监控与 CI

```yaml
- uses: codecov/codecov-action@v3
  with:
    files: ./coverage/lcov.info
```

---

## C.12 调试测试本身

- `DEBUG=1` 时打开 DevTools。
- `--keep-open` 避免窗口自动关闭。
- 用 `await app.waitForEvent('window')` 等待第二窗口。

---

## C.13 测试矩阵

| 测试 | 频率 | 平台 |
|------|------|------|
| Lint/Type/Format | 每 PR | 所有 |
| Vitest 单元 | 每 PR | 所有 |
| Playwright e2e | 每 PR | Ubuntu + macOS |
| 启动基线 | 每天 | 所有 |
| UI Snapshot | 每 PR | Linux |
| ABI smoke | 每 release | 所有 |
| 自动更新 smoke | 每周手动 | staging |

---

## C.14 测试数据

### C.14.1 fixture 生成

```ts
// scripts/gen-fixture.ts
import { writeFileSync } from 'node:fs';
const out = Array.from({ length: 1000 }).map((_, i) => ({
  id: i.toString(),
  title: `note ${i}`,
  content: `# heading\nbody ${i}`.repeat(50),
}));
writeFileSync('tests/fixtures/notes.json', JSON.stringify(out));
```

### C.14.2 Fuzz corpus

利用 `electron-fuzz` corpus；如果是自己写的 IPC handler fuzz，把诡异输入保存到 `fuzz/corpus`。

---

## C.15 总结

- 测试金字塔要平衡：单元要快，集成要覆盖关键路径，e2e 要稳定。
- Electron 启动 + 销毁比较慢，尽量共享实例。
- 原生模块、ABI、平台兼容要单独测。
- Snapshot 测试是回归保障，但要挑剔 baseline 的变更。

---

## C.16 推荐工具

- Vitest 1.x
- Playwright 1.x
- @testing-library/react
- jsdom / happy-dom
- electron-rebuild（也支持 ABI 检查）
- faker.js
- uvu（在 main 进程自测好用）

---

## C.17 总结

- 测试金字塔要从"基础能力 + 集成 + e2e"三层覆盖。
- 主进程 IPC 与 preload 单元测试很值钱，因为它们覆盖绝大部分业务逻辑。
- 真机 e2e + UI snapshot 让回归变直白。
