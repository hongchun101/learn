# 05 · Native 集成

> Native 集成是把 Electron 从"Web 容器"升级为"桌面应用"的真正分水岭。这一章，我们从 N-API、原生模块到系统菜单、托盘、协议处理器，建立完整的 Native 能力图谱。

---

## 5.1 三大能力维度

Electron 的 Native 能力可以归为三大类：

```text
                ┌──────────────────────────────┐
                │         Native 能力           │
                └──────────────┬───────────────┘
                               │
   ┌───────────────────────────┼───────────────────────────┐
   ▼                           ▼                           ▼
┌──────────┐               ┌──────────┐               ┌──────────────┐
│ OS UI    │               │ 进程间   │               │ 任意进程    │
│ - 菜单   │               │ - Utility│               │ - Native     │
│ - 托盘   │               │ - Native │               │   Modules    │
│ - Dock   │               │   C++    │               │ - N-API      │
│ - 通知   │               │   插件    │               │ - Node-API   │
└──────────┘               └──────────┘               └──────────────┘
```

每类各自有不可替代的"长处"。

---

## 5.2 N-API 与 Native Module 入门

### 5.2.1 N-API 是什么

N-API 是 Node.js 的 ABI（C 头文件）稳定的 C/C++ API 集合；只要按规范实现 `.node` 文件，可以在不同 Node ABI 上直接加载。Electron 升级 Node ABI 时，常用 N-API 模块只需要重新构建（或 electron-rebuild 自动跟进）。

Node.js 也叫它 `node-addon-api`，是 N-API 的 C++ 封装。

### 5.2.2 写一个最小模块

`sum.cc`：

```cpp
#include <napi.h>

Napi::Value Sum(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsArray()) {
    Napi::TypeError::New(env, "expected array").ThrowAsJavaScriptException();
    return env.Null();
  }
  Napi::Array arr = info[0].As<Napi::Array>();
  double total = 0.0;
  for (uint32_t i = 0; i < arr.Length(); ++i) {
    Napi::Value v = arr.Get(i);
    if (!v.IsNumber()) {
      Napi::TypeError::New(env, "expected number").ThrowAsJavaScriptException();
      return env.Null();
    }
    total += v.As<Napi::Number>().DoubleValue();
  }
  return Napi::Number::New(env, total);
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("sum", Napi::Function::New(env, Sum));
  return exports;
}

NODE_API_MODULE(sum, Init)
```

`binding.gyp`：

```python
{
  "targets": [
    {
      "target_name": "sum",
      "sources": ["sum.cc"],
      "include_dirs": ["<!@(node -p \"require('node-addon-api').include\")"],
      "defines": ["NAPI_VERSION=8"],
      "cflags!": ["-fno-exceptions"],
      "cflags_cc!": ["-fno-exceptions"],
      "xcode_settings": {
        "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
        "CLANG_CXX_LANGUAGE_STANDARD": "c++17"
      },
      "msvs_settings": {
        "VCCLCompilerTool": { "ExceptionHandling": 1, "AdditionalOptions": ["/std:c++17"] }
      }
    }
  ]
}
```

构建：

```bash
npm i -D node-addon-api node-gyp
npm run build        # 通过 node-gyp / cmake-js / neon-cli
```

注意 ABI：

```bash
ELECTRON_VERSION=28.0.0 npx electron-rebuild
# 或
npx node-gyp rebuild --target=28.0.0 --dist-url=https://electronjs.org/headers
```

### 5.2.3 Node.js Worker Threads for hot loops

对纯 CPU 计算，写成 C++ 不经济的时候，可以写 Worker：

```ts
// sum.worker.ts
import { parentPort } from 'node:worker_threads';

parentPort?.on('message', (data: { arr: number[] }) => {
  let total = 0;
  for (let i = 0; i < data.arr.length; i++) total += data.arr[i];
  parentPort!.postMessage(total);
});
```

主进程使用：

```ts
import { Worker } from 'node:worker_threads';
const w = new Worker('./sum.worker.ts');
w.on('message', (result) => console.log('sum:', result));
w.postMessage({ arr: new Array(1e7).fill(0).map((_, i) => i) });
```

CPU 密集型场景用 Worker / Utility Process 都能好很多。

### 5.2.4 选择标准

| 计算量 | IO 密集 | 简单 |
|--------|--------|------|
| 大量数学/算法 | N-API / Rust crate | Worker Thread |
| 加密/压缩 | N-API + libssl / libzstd | 库 |
| 系统调用 | 不适合 N-API（直接 subprocess） | subprocess / Utility |

---

## 5.3 系统菜单（Menu）

### 5.3.1 角色

macOS / Windows / Linux 都存在"全局菜单栏"，但是行为差异很大：

- **macOS**：永远是应用级菜单栏，多个窗口共享。
- **Windows**：可选，每个 BrowserWindow 都有自己的菜单。
- **Linux**：GNOME / KDE 不一样；常见做法是做成 BrowserWindow 顶部菜单 + 系统托盘。

### 5.3.2 实现

```ts
import { Menu, MenuItemConstructorOptions, app, BrowserWindow } from 'electron';

const isMac = process.platform === 'darwin';

const template: MenuItemConstructorOptions[] = [
  ...(isMac ? [{
    label: app.name,
    submenu: [
      { role: 'about' },
      { type: 'separator' },
      { role: 'services' },
      { type: 'separator' },
      { role: 'hide' },
      { role: 'hideOthers' },
      { role: 'unhide' },
      { type: 'separator' },
      { role: 'quit' },
    ],
  } as MenuItemConstructorOptions] : []),
  { label: 'File', submenu: [
    { label: 'Open…', accelerator: 'CmdOrCtrl+O',
      click: async (item, win) => {
        const r = await dialog.showOpenDialog(win!, { properties: ['openFile'] });
        if (!r.canceled && r.filePaths[0]) {
          win!.webContents.send('file.opened', r.filePaths[0]);
        }
      },
    },
    isMac ? { role: 'close' } : { role: 'quit' },
  ]},
  { role: 'editMenu' },
  { role: 'viewMenu' },
  { role: 'windowMenu' },
  { role: 'help' },
  {
    role: 'help',
    submenu: [
      {
        label: 'About',
        click: () => { /* show dialog */ },
      },
    ],
  },
];

const menu = Menu.buildFromTemplate(template);
Menu.setApplicationMenu(menu);
```

注意：

- macOS 的 `role: 'about'`、`role: 'quit'` 等是必需项，Apple 指南强制要求。
- 多语言：菜单 label 跟着系统语言跑，要多语言资源。

### 5.3.3 子菜单与跨窗口

```ts
win.setMenuBarVisibility(false);     // 不显示窗口菜单栏（自定义 UI）
win.autoHideMenuBar = true;         // macOS 没意义
```

如果你的 UI 是自定义标题栏，菜单需要浮动显示。Electron 提供 `Menu.popup` 在 tray / window 中弹出。

---

## 5.4 系统托盘（Tray）

```ts
import { Tray, Menu, nativeImage, BrowserWindow, app } from 'electron';
import path from 'node:path';

let tray: Tray;

function createTray() {
  const iconPath = path.join(__dirname, '../build/icon.png');
  tray = new Tray(nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 }));
  tray.setToolTip('MyApp - Stay Connected');
  const menu = Menu.buildFromTemplate([
    { label: 'Open Dashboard', click: () => mainWindow.show() },
    { label: 'Pause Sync', type: 'checkbox', checked: false, click: (i) => togglePause(i.checked) },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);

  tray.on('click', () => tray.popUpContextMenu());
  tray.on('double-click', () => mainWindow.show());
  tray.on('balloon-show', () => { /* Windows 8 badge */ });
}

app.on('before-quit', () => {
  tray?.destroy();
});
```

macOS 上还可以 `app.dock.setBadge('3')` 与 `app.dock.setMenu(menu)`。

注意：

- 不同的 OS 托盘 icon 尺寸不一样，macOS 喜欢 @2x PNG，Windows 喜欢 .ico。
- `tray.setImage()` 接受 `nativeImage`，可以动态切换。

---

## 5.5 通知（Notification）

### 5.5.1 HTML5 Notification vs Electron API

```ts
const { Notification } = require('electron');

new Notification({
  title: 'Message received',
  body: 'Alice: 你好',
  silent: false,
  urgency: 'normal',                 // Linux
  timeoutType: 'default',            // Windows
  actions: [
    { text: 'Reply', type: 'button' },   // macOS only, up to 2
    { text: 'Mute',  type: 'button' },
  ],
  replyPlaceholder: 'Reply…',        // macOS 13+, 回复输入框
}).show();
```

### 5.5.2 给通知发送事件

```ts
n.on('action', (_e, index) => {
  if (index === 0) mainWindow.show();
});
n.on('reply', (_e, reply) => {
  // macOS 直接传回输入内容
  api.sendReply(reply);
});
n.on('click', () => mainWindow.show());
```

macOS 13 起支持 `replyPlaceholder` 与回复；Windows 走 toast handler。

### 5.5.3 进程要点

- 通知中心在 macOS 需要 App 是 bundle id 注册过，并获得用户授权。
- Windows 第一次需注册 application model id（`app.setAppUserModelId('com.example.app')`），否则通知被归到 `Electron.app`。

---

## 5.6 协议（Protocol）处理器

### 5.6.1 自定义协议作为内部加载协议

```ts
import { protocol, net } from 'electron';
import path from 'node:path';

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);

app.whenReady().then(() => {
  protocol.handle('app', async (request) => {
    const url = new URL(request.url);
    if (url.host !== 'localhost') {
      return new Response('Forbidden', { status: 403 });
    }
    const file = path.join(__dirname, 'renderer', url.pathname);
    return net.fetch(`file://${file}`);
  });
});
```

注册要在 `whenReady` 之前；`protocol.handle` 是新的统一 API（替代 `registerFileProtocol`）。

### 5.6.2 拦截 Stream

```ts
protocol.handle('myproto', (request) => {
  // 这里可以流式生成文件
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('hello'));
      controller.close();
    },
  });
  return new Response(stream, { headers: { 'content-type': 'text/plain' } });
});
```

### 5.6.3 注册 OS 默认协议

```ts
app.setAsDefaultProtocolClient('myproto');
// macOS: 修改 Info.plist
// Windows: 写 registry
// Linux: xdg-mime
```

Linux 实际会写 `~/.config/mimeapps.list`：

```ts
app.setAsDefaultProtocolClient('myproto', process.execPath, ['--']);
```

### 5.6.4 自定义协议 + 沙箱

`privileges.standard` 与 `secure: true` 允许在 sandbox 渲染进程加载。**必须** 同 `ContextIsolation: true` + CSP 允许。

---

## 5.7 深度链接（Deep Link）

macOS `open-url` 事件 / Windows `second-instance` / Linux URI 文件。

```ts
app.on('open-url', (e, url) => {
  e.preventDefault();
  handleDeepLink(url);
});
```

Linux 下需要将 `electron .` 写到 shell：

```bash
xdg-mime default my-app.desktop x-scheme-handler/myproto;
```

### 5.7.1 Universal Links / App Links

```ts
// app.setAsDefaultProtocolClient 不够。要在 Windows 下生成 AUMID + 通过 MSIX 关联
```

### 5.7.2 防 spoofing

`open-url` 来源是其它进程的 OS 唤起。我们前面已经强调过：

- URL 只能作为弱信任通道，token 仅一次性使用。
- 用 server 端发一次性 nonce，并把 nonce + URL 后端的 cookie 绑定。

---

## 5.8 电源管理

### 5.8.1 PowerSaveBlocker

```ts
import { powerSaveBlocker } from 'electron';

const id = powerSaveBlocker.start('prevent-app-suspension');  // 阻止 OS 进入低功耗
// later
powerSaveBlocker.stop(id);
```

适合视频会议、白板等长时间高负载场景。

### 5.8.2 屏幕唤醒

```ts
import { powerMonitor, screen } from 'electron';

powerMonitor.on('resume', () => console.log('system wake up'));
powerMonitor.on('lock-screen', () => mainWindow.webContents.send('locked'));
powerMonitor.on('thermal-state-change', (e, state) => {
  // 'unknown' / 'nominal' / 'fair' / 'serious' / 'critical'
});
```

---

## 5.9 屏幕与多显示器

```ts
import { screen } from 'electron';

const displays = screen.getAllDisplays();
const primary = screen.getPrimaryDisplay();
const cursor = screen.getCursorScreenPoint();

screen.on('display-added', (d) => {});
screen.on('display-removed', (d) => {});
screen.on('display-metrics-changed', (e, d, changed) => {});
```

### 5.9.1 多屏方案

```ts
// 创建窗口在指定显示器
const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
const win = new BrowserWindow({
  x: display.bounds.x + 100,
  y: display.bounds.y + 100,
  width: 1024,
  height: 768,
});
```

### 5.9.2 屏幕共享 / 截屏

```ts
import { desktopCapturer } from 'electron';

desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 1920, height: 1080 } }).then((sources) => {
  // 拿到 desktopCapturerSource[]
});
```

屏幕共享一般通过 `navigator.mediaDevices.getUserMedia({ audio, video })` 配合 `chromeMediaSourceId` 使用。

> **安全**：屏幕共享 API 会泄漏用户屏幕，必须强制在用户授权后才能使用，并且上报到合规审计日志。

---

## 5.10 剪贴板（Clipboard）

```ts
import { clipboard } from 'electron';

clipboard.writeText('hello');
clipboard.readText();
clipboard.writeImage(nativeImage.createFromPath('/tmp/a.png'));
clipboard.writeHTML('<b>hi</b>');
clipboard.writeBookmark('my-app', 'https://example.com');

// 监听剪贴板（macOS / Windows）
clipboard.on('read-text', () => mainWindow.webContents.send('cliboard:read'));
```

macOS 读取剪贴板需要 `Info.plist` 标记 `NSPasteboardUsageDescription`，否则苹果审核拒。

---

## 5.11 全局快捷键（Shortcut）

```ts
import { globalShortcut } from 'electron';

app.whenReady().then(() => {
  globalShortcut.register('CommandOrControl+Shift+Y', () => mainWindow.show());
  globalShortcut.register('CommandOrControl+Alt+T', () => createQuickPanel());
});

app.on('will-quit', () => globalShortcut.unregisterAll());
```

注意：

- 全局快捷键在用户未授权时会静默失败（macOS 需要 Accessibility 权限）。
- 不要在 renderer 注册 globalShortcut，只能主进程。

---

## 5.12 进程守护

macOS 上 `app.dock.setBadge()`、Windows 上的 `setUserTasks`、`setJumpList`，加上 Electron `app.requestSingleInstanceLock` 等共同构成"应用入口"的完整性。

```ts
app.setUserTasks([
  {
    program: process.execPath,
    arguments: '--new-window',
    iconPath: process.execPath,
    iconIndex: 0,
    title: 'Open New Window',
    description: 'Create a new workspace',
  },
]);

app.setJumpList([
  { type: 'custom', name: 'Recent', items: [
    { type: 'file', path: '/tmp/report.pdf' },
  ] },
]);
```

---

## 5.13 鼠标、键盘、触屏

```ts
const { app } = require('electron');

// macOS 双击 Dock 时是否有窗口
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
});

// 自定义拖动
window.addEventListener('mousedown', () => {
  // TODO: drag without -webkit-app-region: drag
});
```

CSS 里如果用了 `-webkit-app-region: drag`，请记得给交互元素加 `no-drag` 区域。

---

## 5.14 与浏览器一致性的"高级"控件

### 5.14.1 Auto-launcher

```ts
import { app } from 'electron';
app.setLoginItemSettings({ openAtLogin: true, openAsHidden: false });
```

Windows 上对应注册表 Run；macOS 写 LaunchAgent；Linux 写 `~/.config/autostart/*.desktop`。

### 5.14.2 系统 API

- `app.setAppUserModelId('com.example.myapp')` —— Windows toast。
- `app.commandLine.appendSwitch('--high-dpi-support', '1')` —— Windows HiDPI。
- `app.userAgentFallback = '…'` —— 自定义 UA。

### 5.14.3 沙箱下的 Native 调用

在 sandbox 模式下，preload 不能 `require('fs')`。需要：

```ts
// preload.ts
const { ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  readFile: (path) => ipcRenderer.invoke('fs:read', path),
  openFile: () => ipcRenderer.invoke('fs:open-dialog'),
});
```

---

## 5.15 案例：一个 Notion-类客户端所需的 Native 清单

| 功能 | 实现 |
|------|------|
| 多窗口 | BrowserWindow 池 |
| 系统级菜单 | Menu.setApplicationMenu + Menu.popup |
| 托盘 | Tray + 动态 Menu |
| 通知 | Notification + 行为回调（reply / action） |
| 文件拖入 | 自定义 `drag-and-drop` 事件 + IPC 写盘 |
| 深度链接 | `app.setAsDefaultProtocolClient` + 白名单 |
| 自动启动 | `app.setLoginItemSettings` |
| 屏幕共享 | `desktopCapturer` + webRTC |
| 长期活动 | `powerSaveBlocker` |
| 调试面板 | WebContentsView 嵌入 DevTools |

---

## 5.16 小结

- Native 集成分 OS UI、IPC 到第三方、Native Module 三块。
- 系统菜单、托盘、通知、协议、深度链接一定要做白名单与权限校验。
- Native Module 用 N-API 做 ABI 稳定，CPU 密集任务上 Worker / Utility。
- 自定义协议能替代 file:// 但必须配合 CSP 与权限检查。

下一章 [06 · 窗口与渲染管线](./../06-window-render/README.md)。
