# 12 · 进阶与生态

> 这一章讨论 Electron 在边缘场景下的"硬骨头"：OS 集成、PlatformView、Offscreen、Extensions、WebContents 替换渲染。掌握这些，可以让你进入 Electron 工程师第一梯队。

---

## 12.1 Offscreen 渲染

### 12.1.1 什么是 Offscreen

Offscreen 是不显示窗口、对 BrowserWindow / WebContents 进行离屏渲染。常用于：

- PDF 截屏。
- 缩略图生成。
- 服务端渲染 HTML 转图（需要 GPU + Window Server）。

```ts
const win = new BrowserWindow({
  webPreferences: {
    offscreen: true,
    nodeIntegration: false,
    contextIsolation: true,
  },
  show: false,
  width: 1024,
  height: 768,
});

win.webContents.on('paint', (event, dirty, image) => {
  // image 是 NativeImage
  fs.writeFileSync(`./out-${Date.now()}.png`, image.toPNG());
});
```

注意：`offscreen: true` 时 GPU 在 utility / browser 进程。

### 12.1.2 性能与坑点

- 离屏渲染会占 GPU 显存，与窗口渲染不可同时。
- 关闭 `paintWhenInitiallyHidden`，否则首个帧不绘制。
- 切换 `frameRate` 控制 fps：

```ts
win.webContents.setFrameRate(60);
```

---

## 12.2 WebContentsView 与 BaseWindow

替代 BrowserView 的方案（更接近 Web 平台 view）。

```ts
import { BaseWindow, WebContentsView } from 'electron';

const bw = new BaseWindow({ width: 1200, height: 800 });
const view1 = new WebContentsView({ webPreferences: { ... } });
view1.webContents.loadURL('app://localhost/index.html');
bw.contentView.addChildView(view1);
view1.setBounds({ x: 0, y: 0, width: 1200, height: 800 });

const view2 = new WebContentsView({});
view2.setBounds({ x: 0, y: 600, width: 1200, height: 200 });
bw.contentView.addChildView(view2);
```

BaseWindow 没有 chrome（标题栏 / menu），适合自定义 UI。视图可直接拖拽、删除、缩放。

---

## 12.3 全屏画中画 (PIP)

macOS / Windows 都支持 PIP：

```ts
import { BrowserWindow } from 'electron';
const cam = new BrowserWindow({ width: 300, height: 200 });
cam.setParentWindow(mainWindow);   // 子窗口
cam.webContents.loadURL('app://localhost/call-window.html');
```

新版本（v24+）可以 `setPictureInPictureEnabled(true)`：

```ts
const videoEl = doc.querySelector('video');
videoEl.requestPictureInPicture().then(() => {});
```

---

## 12.4 Chrome 扩展协议加载

Electron 不直接支持加载 Chrome Web Store 扩展，但可以加载 unpacked 扩展：

```ts
import { session } from 'electron';
session.defaultSession.loadExtension('/path/to/unpacked-ext', { allowFileAccess: true });
```

注意：每个扩展是一个孤立的世界视图。Electron 28+ 的扩展系统从 Chromium 内部 ManifestV3 改造而来。

---

## 12.5 View 层拆分（多窗口进程拓扑）

可以同时拥有：

- BrowserWindow (传统)
- BaseWindow + WebContentsView
- WebFrame (主 frame + subframe)
- Offscreen BrowserWindow (OSR)
- Utility Process + Service Worker

把"传输"理解为：每个进程都有自己的 V8 context。规划进程 ≈ 规划权限域。

---

## 12.6 协议服务器与代理

### 12.6.1 protocol.handle 处理请求

```ts
protocol.handle('myproto', (request) => {
  if (new URL(request.url).pathname === '/api/data') {
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'content-type': 'application/json' },
    });
  }
  return new Response('not found', { status: 404 });
});
```

### 12.6.2 自定义 webRequest 拦截

```ts
session.defaultSession.webRequest.onBeforeRequest({ urls: ['*://api.example.com/*'] }, (details, cb) => {
  // decide
  cb({ cancel: false /*, redirectURL: 'app://...' */ });
});
```

应用场景：跨域代理 / 测试桩。

### 12.6.3 拦截 HTTP/2 / WebSocket

Electron 的 webRequest 拦截基于网络层栈，也覆盖 WebSocket upgrade 之外的请求。

---

## 12.7 OS 集成细节

### 12.7.1 macOS

- `app.dock.setBadge`、`dock.setMenu` —— 提供 dock 增强。
- `app.setAboutPanelOptions` —— 弹出 About 面板。
- `touchBar` —— Touch Bar（macOS TouchBar + 控制条 API）。
- `setUserActivity()`、HandOff（做部分 Handoff 集成）。

```ts
const { nativeTheme } = require('electron');
nativeTheme.on('updated', () => console.log(nativeTheme.shouldUseDarkColors));
```

`nativeTheme.themeSource: 'system' | 'light' | 'dark'`。

### 12.7.2 Windows

- `app.setUserTasks` —— 任务栏 Jump List。
- `app.setJumpList` —— 程序跳转菜单（含 recent / frequent / custom）。
- Taskbar 上的进度条：

```ts
mainWindow.setProgressBar(0.5);
mainWindow.flashFrame(true);   // 高亮闪烁
```

- UAC 弹窗：`requestSingleInstanceLock` + `app.commandLine.appendSwitch('elevate')`。

### 12.7.3 Linux

- libnotify：通知。
- xdg 标准：Menu、Trash、openURI。
- Kwallet / Gnome-Keyring：

```ts
import { safeStorage } from 'electron';
console.log(safeStorage.isEncryptionAvailable());
```

要使用 Linux 上的 Keychain：

```bash
sudo apt install libsecret-1-dev
```

---

## 12.8 AI / LLM 桌面整合

```ts
// 调用本地 LLM
import { spawn } from 'node:child_process';
const proc = spawn('llama-server', ['-m', 'model.gguf', '--port', '8080']);

// Renderer 通过 fetch 调用
await fetch('http://127.0.0.1:8080/v1/chat/completions', {
  method: 'POST',
  headers: { authorization: 'Bearer NONE' },
  body: JSON.stringify({
    model: 'local',
    messages: [{ role: 'user', content: 'hi' }],
    stream: true,
  }),
}).then(r => r.body?.pipeTo(/* stream */ ));
```

Electron 在 LLM 桌面化中的角色：

- 通用 LLM 桌面前端。
- 模型热加载。
- 本地 GPU 调度（Vulkan / CUDA）。

---

## 12.9 与系统级安全模块的协作

### 12.9.1 macOS Sandbox

macOS 上要打开 App Sandbox：

```xml
<!-- entitlements.mac.plist -->
<dict>
  <key>com.apple.security.app-sandbox</key><true/>
  <key>com.apple.security.network.client</key><true/>
  <key>com.apple.security.files.user-selected.read-write</key><true/>
</dict>
```

```ts
new BrowserWindow({
  webPreferences: { sandbox: true },
});
```

配合 macOS sandbox 后，部分 API 不可用：网络、文件系统、URIs。

### 12.9.2 Windows 沙箱

Electron 项目不能在 Windows 上自带 app sandbox，但可以通过 OS 提供的 container / sandbox 工具运行。我们有：

- Windows Sandbox (`sboptions`)。
- App-V、MSIX Container。

---

## 12.10 内部能力扩展

### 12.10.1 自定义 V8 协议

通过 `v8.setFlagsFromString` 与 `app.commandLine.appendSwitch` 都有限，可以：

- 用 `electron-rebuild` 自定义 Chromium。
- 写 patch。

不建议，建议"用平台 API 解决平台问题"。

### 12.10.2 衍生项目推荐

| 项目 | 描述 |
|------|------|
| `electron-app` | CLI 生成 boilerplate |
| `vibrancy`（macOS 模糊背景） | 与 BrowserWindow 共同 |
| `electron-serve` | 简易起本地 server 给 renderer |
| `@electron/fiddle` | 官方 Playground |
| `playwright` | 端到端测试 |
| `vitest` + `happy-dom` | 单元测试 |
| `@vue/eslint-config` / `eslint-plugin-electron` | Lint 工具 |

---

## 12.11 Electron Forge 6 / Vite plugin 实战

### 12.11.1 启动速度

`@electron-forge/plugin-vite` 走 Vite HMR：

```ts
// forge.config.ts
import { VitePlugin } from '@electron-forge/plugin-vite';
export default {
  plugins: [VitePlugin({ main: { build: { sourcemap: true } } })],
};
```

调试渲染进程效率高很多。

### 12.11.2 与 Vite 之外的工具

`tsx` + `@swc/core` + `esbuild`，主进程和 preload 单独编译。

---

## 12.12 大型项目的工程实践

### 12.12.1 单一仓库多应用

```text
monorepo/
├── packages/
│   ├── app/        # Electron 主工程
│   ├── core/       # 业务层
│   ├── shared/     # 共享 IPC 类型
│   ├── ui/         # 复用设计系统
│   └── native/     # Native Modules
```

结合 pnpm workspaces。

### 12.12.2 IPC 类型自动生成

```ts
// shared/ipc.ts 由 codegen / trpc 工具生成
type IpcContract = {
  'user.get': (id: number) => Promise<User>;
  'chat.send': (req: SendMessageReq) => Promise<Message>;
};
```

### 12.12.3 跨窗口/跨进程 state management

- Zustand 在 renderer 之间共享状态（除非共享同一 Session）。
- 主进程单例 store；订阅者由 renderer 拉取：
  ```ts
  ipcMain.handle('store.snapshot', () => store.serialize());
  ipcMain.on('store.subscribe', (event) => bus.on('store', (s) => event.sender.send('store', s)));
  ```

---

## 12.13 与 Web 平台的边界

Electron 与浏览器的区别：

| 维度 | Chromium 浏览器 | Electron |
|------|---------------|----------|
| 多窗口 | 浏览器内 | 直接 OS |
| 系统 API | 受限 | 全部 |
| 升级节奏 | Chrome 同步 | 自己定 |
| 服务地址 | 沙箱化 | 用户控制 |

可以做到：

- 完全代替 Cordova（hybrid 移动端？做不到，仅桌面）。
- 替代 PWA（前者灵活度大、性能差不多、UX 受限）。

---

## 12.14 长期演进

- Tauri 出现说明 Electron 体积问题被诟病，但 Electron 在商业支持、API 稳定性、生态丰富度上仍有优势。
- Electron 团队在不断 shrink 安装包、解锁 ASAR 改进 (Sentinel)、增加 `UtilityProcess`。
- Chromium 团队正在推进 Fenced Frames、Privacy Sandbox，Electron 选择是否跟进。

---

## 12.15 推荐学习资源

| 类型 | 资源 |
|------|------|
| 官方 | electronjs.org/docs/latest |
| 源码 | github.com/electron/electron |
| 通讯 | electronjs.org/blog |
| 视频 | Electron 官方 YouTube "Electron App" |
| 中文 | Electron 中文文档 (zh-CN) |
| 实战 | electron-react-starter (社区维护) |
| 测试 | playwright.dev + `electron-playwright` |
| 工具 | `electron-debug`, `electron-context-menu` |

---

## 12.16 小结

- Offscreen + WebContentsView + BaseWindow 让我们在 UI 上不再拘泥 BrowserWindow。
- 多平台集成需要 respect OS 设计。
- Electron 仍在演化，每个大版本值得一次 thorough read。

下一章 [实战项目 · 从零到生产级](./../13-project/README.md)。
