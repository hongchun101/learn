# 02 · 进程模型与生命周期

> 谁负责什么、能做什么、什么时候退出？这是判断 Electron 工程结构是否合理的三个基本问题。本章先讲清每个进程的角色与生命周期，再给出一套稳健的进程拓扑方案。

---

## 2.1 完整进程清单

| 进程 | 数量 | JS 上下文 | Node 能力 | 主要职责 |
|------|------|----------|----------|---------|
| **Browser/Main** | 单例 | V8 + Node | 完全 | 控制应用生命周期、浏览器进程单例、命令参数、CSP、协议、Session、单点窗口/菜单/托盘 |
| **Renderer** | 多个（每个 BrowserWindow + WebContentsGuest 一个） | V8 + 默认仅 WebPlatform | 受控（默认裁掉） | HTML / CSS / Blink / V8 |
| **GPU** | 单例 | 无 | 无 | 合成、光栅化、纹理上传、硬件加速 |
| **Network** | 单例 | 无 | 无 | 网络栈 |
| **Storage** | 单例 | 无 | 无 | LocalStorage / IndexedDB / Cache 的中央进程 |
| **Audio** | 单例（按需） | 无 | 无 | 音频进程 |
| **Utility** | 多个 | 可注入 Node | 受控 | 跑耗时任务、原生模块、压缩、解码，Electron 27+ 提供的"业务子进程" |
| **Crashpad Handler** | 单例 | 无 | 无 | 监视其它进程崩溃并写出 dump |
| **Zygote** | Linux only | 无 | 无 | 复用 V8 isolate 的预启动子进程 |

直观图：

```text
┌─────────────────────────────────────────────────────────────────┐
│                       Electron App                                │
│                                                                   │
│   ┌───────────┐                                                    │
│   │  Browser  │  hold Window List, Session, Menu, Tray            │
│   │ (Main)    │  all privileged APIs (file/dialog/shell/…)         │
│   └────┬──────┘                                                    │
│        │  ipc / gpu_init / net_init / storage_init                 │
│        ▼                                                           │
│   ┌─────────┐  ┌──────────┐  ┌────────────┐                        │
│   │ Renderer│  │ Renderer │  │ Utility    │                        │
│   │ #A      │  │ #B       │  │ (Worker)   │                        │
│   └────┬────┘  └────┬─────┘  └────┬───────┘                        │
│        │            │             │                                 │
│        └────────────┴──────┬──────┘                                │
│                             ▼                                      │
│              ┌─────────────────────────────┐                       │
│              │  GPU / Network / Storage /  │                       │
│              │  Audio / Crashpad processes │                       │
│              └─────────────────────────────┘                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2.2 主进程（Browser Process）

### 2.2.1 主进程的边界

主进程 = Node.js + Chromium Browser Process。它能够：

- 文件系统（`fs`、`fs/promises`）。
- 子进程（`child_process`、`utilityProcess`）。
- 系统能力（`dialog`、`shell.openPath`、`powerSaveBlocker`、`screen`、`clipboard`）。
- 网络服务端（`http`、`https`、`net`）。
- 桌面 UI（菜单、托盘、`BrowserWindow`）。
- 跨进程协调（`Session`、`app.setAsDefaultProtocolClient`、`webRequest`）。

主进程 **不是** 唯一的——Electron 也允许 BrowserWindow 在沙箱下运行，渲染进程虽然有权受限，但仍可以建立 `BrowserWindowGuest` 等。

### 2.2.2 主进程生命周期

```js
const { app } = require('electron');

console.log('1. whenReady?', app.isReady());         // false

app.whenReady().then(() => {
  console.log('3. whenReady:', app.isReady());       // true
});

app.on('will-finish-launching', () => {
  console.log('2. will-finish-launching');
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  // macOS 重新点击 Dock 图标
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
});

app.on('before-quit', () => { /* 让 next=true 允许 electron.quit() */ });
app.on('will-quit', (e) => { /* 在这里做最后清理 */ e.preventDefault() });
app.on('quit', () => { /* 真的退出了 */ });

app.on('render-process-gone', (event, webContents, details) => {
  // Renderer 挂了
});

app.on('child-process-gone', (event, details) => {
  // Utility/子进程挂了
});

app.on('gpu-process-crashed', () => {
  // GPU 挂了，无法恢复时只能重启
});
```

事件顺序与 Node 的 EventEmitter 一致，但要注意：

1. `will-finish-launching` 在 `app.whenReady()` 之前触发，常用于注册 Apple Event handler（macOS）。
2. `window-all-closed` 在 macOS 默认不退出，让用户继续保留在 Dock 里。这是 macOS 与 Win/Linux 的关键差异。
3. `app.on('second-instance')` 可用来检测是否被再次启动，配合单实例锁：

```js
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, argv, cwd) => {
    // 主窗口里把新参数透出去（典型场景：自定义协议唤起）
    mainWindow?.webContents.send('open-argv', argv);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}
```

### 2.2.3 主进程"绝对不能做什么"

主进程不要做：

- 大文件解码、转码、视频处理。
- 长链同步计算，会卡住 Chromium IO/UI 线程，导致整个 GUI 卡死。
- 不必要的 `setInterval`（每一个都会产生 JS 调用）。

把这些任务挪到 Utility Process、Worker Thread、或 OS 子进程。

---

## 2.3 渲染进程（Renderer Process）

### 2.3.1 主进程与渲染进程的对比

| | 主进程 | 渲染进程 |
|--|--|--|
| 入口 | `main` | `index.html` |
| Node | 默认有 | 默认被裁掉 |
| 系统权限 | 高 | 低 |
| 渲染能力 | 无 | Blink / V8 |
| 沙箱 | 无强制 | 默认无；可开启 |
| 默认 `process.type` | `'browser'` | `'renderer'` |

### 2.3.2 渲染进程的启动顺序

```text
BrowserWindow 创建
   ├─ WebContents::Create
   │    ├─ RenderProcessHost
   │    ├─ sandbox policy & seccomp
   │    └─ 拉起 renderer 子进程
   │
   ├─ Renderer 进程
   │    ├─ Blink 初始化 (Document::Shutdown* 之类)
   │    ├─ V8 初始化
   │    ├─ 创建 1+ ScriptContext (Main world, Isolated world)
   │    ├─ 注入 'electron' host bindings（如果开启 nodeIntegration/contextIsolation）
   │    └─ 加载初始 URL（file:// / http(s):// / protocol / custom）
   │
   └─ 第一次合成 → 首屏上屏
```

### 2.3.3 关键事件

```js
const win = new BrowserWindow({ webPreferences: { nodeIntegration: false, contextIsolation: true } });
const wc = win.webContents;

wc.on('did-start-loading', () => {});
wc.on('dom-ready', () => {});
wc.on('did-finish-load', () => {});
wc.on('did-fail-load', (e, code, desc, url) => {});
wc.on('render-process-gone', (e, { reason, exitCode, exitStatus }) => {
  // reason: 'crashed' | 'abnormal-exit' | 'launch-failed' | 'killed' | 'oom'
});
wc.on('unresponsive', () => {});
wc.on('responsive', () => {});
wc.on('will-navigate', (e, url) => {});
wc.on('will-redirect', (e, url) => {});
wc.on('will-prevent-unload', (e) => { e.preventDefault(); dialog.showMessageBox(...); });
wc.on('console-message', (e, level, message, line, sourceId) => { /* level=2 是 error */ });
```

注意：`did-finish-load` 表示 page load，不等于渲染完成（GPU 合成可能还在排队）。要监听 `did-frame-finish-load` 或 `did-paint` 来确认"上屏"。

### 2.3.4 渲染进程的退出

渲染进程可以独立退出并被重新启动：

- `webContents.reload()` 让 renderer 重启。
- 渲染进程崩溃后，可以监听 `render-process-gone` 决定是否 `webContents.reload()` 自动恢复。
- 切换 `webContents.session` 会创建新的 renderer 进程。

---

## 2.4 GPU 进程

### 2.4.1 角色

GPU 进程负责：

- **Command Buffer**：把 GL / Vulkan 调用从 renderer 主线程搬到 GPU 线程执行。
- **Raster**：把网页内容栅格化到位图或 GPU 纹理。
- **Display Compositor**：将多层 surfaces 合成上屏。
- **Video Decoder**：硬件加速的视频解码。

### 2.4.2 启动参数调优

```js
app.commandLine.appendSwitch('disable-gpu');                     // 不推荐
app.commandLine.appendSwitch('disable-gpu-compositing');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('use-gl', 'swiftshader');           // 兜底软件 GL
app.commandLine.appendSwitch('enable-features', 'UseSkiaRenderer'); // Chromium 新渲染后端
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
```

注意 `app.commandLine.appendSwitch` 必须在 `app.whenReady()` 之前调用。

### 2.4.3 GPU 进程崩溃的特殊性

`gpu-process-crashed` 很难恢复。最常见：

- 显卡驱动 bug：上报到 GPU vendor。
- ANGLE / GL 出错：回退 `use-gl=swiftshader`。
- 视频硬解崩：`--disable-features=UseChromeOSDirectVideoDecoder`。

实战通常做法：弹"GPU 进程已退出"对话框，附上"重置设置 / 重启应用"两个按钮。

---

## 2.5 Utility Process

> Electron 27 引入，是替代"把任务卸载到主进程之外"的最佳方式。

### 2.5.1 与 Renderer / Worker 的对比

- 与 Renderer 相比：Utility Process 默认没有 Blink / DOM，纯 V8 + Node。可以隔离原生模块，可以跑任意代码。
- 与 Worker Thread 相比：Worker 还是跑在主进程，只是同一 Node instance 的另一个 JS 线程；Utility 是独立进程，**与主进程不共享内存**、崩溃也不会带崩主进程。

### 2.5.2 创建 Utility Process

主进程：

```js
// main.js
const { utilityProcess } = require('electron');
const { MessageChannelMain } = require('electron');

const { port1, port2 } = new MessageChannelMain();
const child = utilityProcess.fork('./utility-processor.js', [], {
  serviceName: 'image-conv',
  stdio: 'inherit',
});

child.on('spawn', () => {
  child.postMessage({ kind: 'hello' }, [port2]);
});

child.on('exit', (code) => {
  console.log('utility process exited', code);
});

// 把 port1 透出去给 Renderer
mainWindow.webContents.postMessage('hello-port', null, [port1]);
```

Utility：

```js
// utility-processor.js
process.parentPort.on('message', (event) => {
  const { data, ports } = event;
  if (data.kind === 'hello') {
    const port = ports[0];
    port.on('message', async (e) => {
      const { buf, type } = e.data;
      const sharp = require('sharp');         // 在 utility 里 require
      const out = await sharp(buf).webp().toBuffer();
      port.postMessage({ out: out.buffer });
    });
    port.start();
  }
});
```

Renderer：

```js
// preload.ts
const { ipcRenderer } = require('electron');
ipcRenderer.on('hello-port', (event) => {
  const port = event.ports[0];
  // 把 port 暴露给前端代码
});
```

Electron 团队的官方 Demo "UtilityProcess Demo" 可以直接对照。

### 2.5.3 Utility Process 的限制

- 早期版本（27）需要 Electron 27.0.0-beta.4+。
- `stdio` 默认 `pipe`，日志容易丢；推荐 `stdio: 'inherit'` 或 `stdio: 'pipe'` + 自定义日志。
- 多平台资源占用 ≠ 主进程：每个 utility 都启动了 V8 + io_thread + cache thread。**别开 100 个 utility**，要做池化。

---

## 2.6 网络与存储进程

- **Network**：COEP/COOP、Cookie、Cache、磁盘配额、Proxy 都在这个进程管理。Host 主动设置时，所有 `WebContents` 都会复用 network thread（每个 network 大约 200MB 内存起步）。
- **Storage**：LocalStorage / IndexedDB / DOMCache 的中央进程。Electron 用的 `WebKitDatabaseTracker` 把每个 origin 的数据放在这里。

这两类进程对应用透明，但你会在系统资源监视器里发现 5-7 个相关子进程，**这是正常的**。

---

## 2.7 进程模型设计原则

### 2.7.1 原则 1：尽量少、尽量短

- 一个 BrowserWindow 上不要硬塞 5MB 的 JS chunk，能拆开就拆开。
- 长任务上 utility process / worker。
- 不可恢复的进程（GPU/Storage）退出时，宁可重启应用也别硬撑。

### 2.7.2 原则 2：隔离 + 权限收紧

- BrowserWindow 创建默认 `sandbox: false`（历史原因）。我们建议显式 `sandbox: true` 配合 `preload` + `contextIsolation`。
- 每个 BrowserWindow 限制 `webRequest` 拦截的深度（阻断 JS 钩子）。
- 渲染进程只通过 preload 暴露最小 API。

### 2.7.3 原则 3：失败可恢复

- 监听 `render-process-gone`、`gpu-process-crashed`、`child-process-gone`，按严重程度分级处理。
- 对"非关键"窗口（设置页、登录页），不要因为单窗口崩溃影响整体应用。

### 2.7.4 原则 4：拓扑可视化

把进程依赖画到架构图里：

```text
                        ┌───── Menu IPC ────┐
                        │                   │
                        ▼                   │
              ┌───────────────┐             │
              │ BrowserWindow │────┐        │
              │   (Main UI)   │    │        │
              └──────┬────────┘    │        │
                     │ preload     │ preload│
                     ▼             ▼        ▼
             ┌────────────────────────────┐
             │ ContextBridge (safe API)   │
             └────────────────────────────┘
                            │
        ┌───────────────────┼──────────────────┐
        ▼                   ▼                  ▼
 ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
 │ Renderer A   │    │ Renderer B   │    │ Renderer C   │
 │ Main UI      │    │ Settings     │    │ Login        │
 └──────────────┘    └──────────────┘    └──────────────┘
        │                                            
        │ utility IPC                                     
        ▼                                            
 ┌─────────────────┐                                    
 │ Utility Process │  (image conversion / native)      
 │  / native mod   │                                    
 └─────────────────┘                                    
```

---

## 2.8 实践：规划一个 IM 桌面客户端

**需求**

- 主窗口
- 设置窗口
- 通知中心（独立窗口）
- 视频预览（独立 utility）

**推荐拓扑**

| 进程 | 数量 | 职责 |
|------|------|------|
| Main | 1 | 应用生命周期、菜单、托盘、Session、登录 |
| Renderer | 3 | main, settings, notification |
| Utility | 1 | 视频硬解 + 缩略图（GPU 兜底） |
| GPU | 1 | 自动 |

```js
// 推荐把 settings 窗口做成隐藏 window + IPC 唤起，避免被多任务压满内存
async function openSettings() {
  const ws = BrowserWindow.getAllWindows().filter(w => w.getTitle() === 'Settings');
  if (ws.length === 0) {
    createSettingsWindow();
  } else {
    ws[0].focus();
  }
}
```

---

## 2.9 进程泄漏与调试

### 2.9.1 通用诊断

```bash
# macOS
vmmap --summary $(pgrep -f 'Electron.app/') | head
lsof -p $(pgrep -f 'Electron.app/') | grep app.asar

# Linux
pmap -x $(pgrep -f electron) | sort -k3

# Windows (PowerShell)
Get-Process electron | Select Id, @{n='RSS(MB)';e={[int]($_.WorkingSet64/1MB)}}
```

### 2.9.2 渲染进程内存上限

- V8 内存默认上限 1.4GB (x64)。
- 渲染进程总 RSS 包括 V8 heap + Blink heap + 各类缓存。
- 长时间挂着的页面（音乐播放器、协作白板）建议使用 `webContents.startFreezing()` / `stopFreezing()`。

### 2.9.3 渲染进程崩溃处理模板

```js
function bindRendererSafeReload(wc) {
  wc.on('render-process-gone', (event, { reason, exitCode }) => {
    if (reason === 'oom') {
      dialog.showMessageBoxSync({
        type: 'info',
        message: '该页面因内存不足被关闭，是否重新加载？',
        buttons: ['重新加载', '退出'],
      }) === 0 ? wc.reload() : app.quit();
    } else if (reason === 'crashed') {
      wc.reload();
    } else {
      // launch-failed、killed、abnormal-exit 通常让用户决定
    }
  });
}
```

---

## 2.10 总结

- 主进程单点，渲染进程可多，Utility 进程隔离原生模块和耗时任务。
- 重视生命周期事件：错过 `will-quit` 会丢 cache/锁，慢 GPU 进程会拖垮全局合成器。
- 进程拓扑应在架构图里画出来，作为后续人员接手和 PR Review 的基线。

下一章 [03 · 安全工程](./../03-security/README.md)。
