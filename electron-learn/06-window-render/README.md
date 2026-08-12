# 06 · 窗口与渲染管线

> 这一章拆解一个 BrowserWindow 从创建到首帧的完整管道，定位 WebContents、GPU 进程、Render Process 三方协作的瓶颈。学习这部分，是在为后面"性能调优"打地基。

---

## 6.1 启动一个 BrowserWindow 之前

```ts
const win = new BrowserWindow({
  width: 1200,
  height: 800,
  minWidth: 800,
  minHeight: 600,
  show: false,                         // 不显示，避免白闪
  backgroundColor: '#1f2024',
  title: 'MyApp',
  icon: process.platform === 'win32' ? 'icon.ico' : 'icon.png',
  autoHideMenuBar: true,
  webPreferences: {
    preload: path.join(__dirname, 'preload.js'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    spellcheck: true,
    backgroundThrottling: false,        // 视频/白板场景需要
  },
});

win.once('ready-to-show', () => win.show());
```

`show: false` + `ready-to-show` 是大部分专业 Electron 应用的标配，避免窗口先弹出来再画背景的"白闪"。

---

## 6.2 浏览器层（Browser Process）

BrowserWindow 在主进程里是一个 `NativeWindow` + `WebContents` 句柄：

```text
new BrowserWindow(opts)
    │
    ▼
shell/browser/native_window.cc ::NativeWindow::Create
    │
    ▼
shell/browser/native_browser_window_views.cc  (Linux / Windows)
shell/browser/native_browser_window_mac.mm   (macOS)
    │
    ▼
Aura/Views/NSWindow 创建成功
    │
    ▼
WebContents::Create          ← 这一步创建 Renderer 进程
```

重点参数：

| webPreferences | 说明 |
|---|---|
| `width`, `height` | 内部 ContentView 大小（不算 chrome） |
| `frame`, `titleBarStyle`, `titleBarOverlay` | 自定义标题栏 |
| `transparent`, `backgroundColor` | 透明 + 自定义背景色 |
| `webPreferences.vibrancy` | macOS 模糊背景 |
| `webPreferences.spellcheck`, `spellcheckLanguages` | 拼写检查 |
| `webPreferences.enablePreferredSizeMode` | 首选大小通知 |

### 6.2.1 自定义标题栏

macOS：

```ts
new BrowserWindow({
  titleBarStyle: 'hiddenInset',
  trafficLightPosition: { x: 12, y: 14 },
});
```

Windows：

```ts
new BrowserWindow({
  titleBarStyle: 'hidden',
  titleBarOverlay: {
    color: '#2f2f2f',
    symbolColor: '#fff',
    height: 36,
  },
});
```

Linux：常用固定菜单栏 + BrowserWindow autoHideMenuBar。

### 6.2.2 窗口层级

```ts
win.setAlwaysOnTop(true, 'screen-saver');
win.setVisibleOnAllWorkspaces(true);  // macOS
win.setFullScreenable(true);
win.setOpacity(0.95);
```

辅助 API：

- `win.setFocusable(false)` —— 辅助类窗口。
- `win.setBackgroundThrottling(true)` —— 离开屏幕时不阻塞计时器。

---

## 6.3 WebContents 的加载流水线

```text
loadURL('app://localhost/index.html')
  │
  ▼
URLRequest -> net/http -> file or app handler -> Response Headers
  │
  ▼
FrameLoader::commitNavigation
  │
  ▼
HTML 解析 -> DOM 树 -> Resource Loader (CSS / JS / Image)
  │
  ▼
Script Stream -> V8 Compile -> 执行顶层脚本
  │
  ▼
Style Reload -> Layout -> Paint -> Layer Tree
  │
  ▼
GPU 进程 Raster + Composite -> 上屏
```

WebContents 的事件大致对应上面这条流水线：

| 事件 | 含义 |
|------|------|
| `did-start-loading` | 整个 navigation 开始 |
| `did-start-navigation` | URL 改变 |
| `dom-ready` | DOM 树构建完成（不一定有样式与渲染） |
| `did-finish-load` | `load` 事件触发，所有同步资源加载完成 |
| `did-frame-finish-load` | 指定 frame 的 load 完成 |
| `did-stop-loading` | loading 状态机停止 |
| `did-fail-load` | 加载失败 |
| `did-fail-provisional-load` | 初次加载失败 |
| `did-navigate` | URL 完成 |
| `did-navigate-in-page` | 锚点或 pushState |
| `did-frame-navigate` | 主 frame / 子 frame |
| `did-commit-provisional-load` | 切换 |
| `did-display-friendly-page` | 大致于 `did-finish-load` 后，自 Chromium 110+ 引入 |
| `render-process-gone` | renderer 崩溃 |

### 6.3.1 加载进度与监控

```ts
win.webContents.on('did-start-navigation', (e, url, isInPlace, isMainFrame, frameProcessId, frameRoutingId) => {
  console.log('start', url);
});

win.webContents.on('did-finish-load', () => {
  console.log('finish');
});

win.webContents.on('did-fail-load', (e, code, desc, url) => {
  console.log('fail', code, desc, url);
});
```

这套事件用于"网络层自适应"：

- 网络切回本地 → 切换到低分辨率；
- 长加载 → 显示骨架屏；
- 加载失败 → 弹错误页 + 重试按钮。

---

## 6.4 帧与合成

### 6.4.1 V8 字节码、AOT 与 LightHouse-like 工具

V8 会做：

- **Parsing**：源码 → AST。
- **Pre-parsing**：跳过未调用函数，更快。
- **Compilation**：AST → TurboFan / Sparkplug bytecode。
- **Tier-up**：热函数 jit。

主线程"长任务"会让 V8 mark 出红色警告：

```bash
# chrome devtools
performance-trace > DevTools → Performance → Record
```

### 6.4.2 Raster 与 GPU 合成

- **Layer Tree**：CSS `transform`、`filter`、`opacity`、`will-change` 都会新建 compositing layer。
- **Tile**：每个 layer 切成 256×256 的 tile，raster 到 GPU 内存。
- **Display Compositor**：把 tile 合成上屏。

性能调优建议：

| 现象 | 原因 | 对策 |
|------|------|------|
| 滚动掉帧 | 滚动期间重新 raster | `transform: translateZ(0)` 提升 layer |
| 拖动卡顿 | paint 太多 | 减少重绘；用 `requestAnimationFrame` 重排 |
| 视频花屏 | GPU 合成异常 | `setBackgroundThrottling(false)` + 自定义解码 |
| 内容不可见但 GPU 占用高 | 显存 tile 未释放 | 主动 `display: none` |

### 6.4.3 `did-frame-finish-load` 与 `did-paint`

`did-frame-finish-load` 是布局完成；真正"上屏"还有：

- `did-paint`（首次 paint）
- `did-paint-after-reload`
- `did-show`、`did-hide`

`win.showInactive` 会让 window 不抢焦点。

---

## 6.5 窗口生命周期

```ts
const win = new BrowserWindow({ show: false });
win.loadURL(`app://localhost/dashboard`);

win.webContents.once('did-finish-load', () => {
  // 此时发送前置数据
  win.webContents.send('init', { userId, role: 'admin' });
});

// 避免重复打开
app.on('second-instance', () => {
  if (win.isMinimized()) win.restore();
  win.focus();
});

// 关闭前的"未保存"提示
win.on('close', (e) => {
  if (unsaved) {
    e.preventDefault();
    const c = await dialog.showMessageBox(win, {
      type: 'question',
      buttons: ['Quit anyway', 'Cancel'],
      defaultId: 1,
    });
    if (c.response === 0) win.destroy();
  }
});
```

### 6.5.1 生命周期事件

- `ready-to-show`：首次绘制完成，可安全显示。
- `show`：窗口显示。
- `hide`：窗口隐藏。
- `focus` / `blur`：聚焦、失焦。
- `maximize` / `minimize` / `restore` / `unmaximize`。
- `move` / `resize`：移动、改变。
- `resize`：layout 重新计算。
- `will-resize`：可拦截（macOS 11+）。
- `close`：可 preventDefault。
- `closed`：资源已释放。

### 6.5.2 帧率与动画

```ts
webContents.on('paint', (event, dirty, image) => {
  // image: NativeImage from given dirty region
});
```

可以监听 `paint` event 自己做帧率统计、导出 PDF 等。生产中常关闭。

---

## 6.6 多窗口架构

### 6.6.1 同源多窗口

```ts
class WindowManager {
  private windows = new Map<string, BrowserWindow>();
  open(id: string, url: string) {
    const w = this.windows.get(id);
    if (w && !w.isDestroyed()) {
      w.focus();
      return w;
    }
    const win = new BrowserWindow({ show: false });
    win.loadURL(url);
    win.once('ready-to-show', () => win.show());
    this.windows.set(id, win);
    win.on('closed', () => this.windows.delete(id));
    return win;
  }
}
```

### 6.6.2 不同源不同进程

给每个客户方不同 `Session`：

```ts
const session1 = session.fromPartition('persist:tenant-1');
const session2 = session.fromPartition('persist:tenant-2');
```

### 6.6.3 View 与 WebContentsView

替代 `BrowserView` 的现代方案：

```ts
import { WebContentsView, BaseWindow } from 'electron';
const view = new WebContentsView({ webPreferences: { ... } });
const win = new BaseWindow({ width: 1200, height: 800 });
win.contentView.addChildView(view);
view.setBounds({ x: 0, y: 0, width: 1200, height: 800 });
view.webContents.loadURL('app://localhost/index.html');
```

这相当于把 BrowserWindow 的视图作为子层，更灵活地拆分窗口。

---

## 6.7 启动优化（实战）

### 6.7.1 启动时间打点

```ts
// main.ts
const t0 = Date.now();
app.on('ready', () => console.log('[main] ready', Date.now() - t0));
app.whenReady().then(() => {
  console.log('[main] whenReady', Date.now() - t0);
  const win = new BrowserWindow({ show: false });
  console.log('[main] new-window', Date.now() - t0);
  win.once('ready-to-show', () => {
    console.log('[main] ready-to-show', Date.now() - t0);
    win.show();
  });
});
```

```ts
// renderer (preload)
window.addEventListener('DOMContentLoaded', () => {
  performance.mark('domready');
});
window.addEventListener('load', () => {
  performance.mark('appready');
  window.api.onMetric(({ key, duration }) => performance.measure(key, ...));
});
```

把这段接到自定义 metric backend（StatsD / Sentry / OTLP）：

```ts
performance.measure('startup');
performance.getEntriesByType('measure').forEach(m => {
  // discard to renderer window.opener or ipc.
});
```

### 6.7.2 首屏可见时间（TTVC）

- **TTFP** Time to First Paint
- **TTVC** Time to Visually Complete
- **TTI** Time to Interactive（业务代码可交互）

### 6.7.3 启动期常见优化

| 措施 | 收益 |
|------|------|
| `show: false` + `ready-to-show` | 避免白闪 |
| ASAR + `asarUnpack` 单独大文件 | 启动 -150ms |
| 预加载 `node_modules` 中常用代码到 preload | 缩小 main -> renderer 通信 |
| 懒加载 IPC handler | 主线程不阻塞 |
| BrowserWindow `paintWhenInitiallyHidden: false` | 隐藏时不绘制 |
| V8 snapshot + `--js-flags=--harmony-*` | tiny |
| Linux `chrome-sandbox` 提权 | 安全 + 性能 |
| Splash + WebContentsView | 首屏降级 |

注意：chromium 110+ 默认开启 partition alloc，将 string → 区段内存，提高 cache line 命中率。

### 6.7.4 实施步骤

1. 用 `app.commandLine.appendSwitch('enable-precise-memory-info')` 与 `process.memoryUsage` 收集 baseline。
2. 在 staging 跑一次 `--trace-startup-file=trace.json`。
3. 打开 `chrome://tracing`，加载 trace，对比每个阶段耗时。
4. 优化后回归，对比指标。

---

## 6.8 跨环境差异

| 维度 | Windows | macOS | Linux |
|------|---------|-------|-------|
| 标题栏 | Aero / 自定义 | Traffic Light | 各自 |
| HiDPI | 系统倍率 | 系统倍率 | X11 / Wayland |
| 字体 | Segoe UI | San Francisco / 系统 | 各 DE 不同 |
| 系统菜单 | 有 | 顶部 | 各自 |
| 任务栏 | 缩略图 | Dock | 各自 |
| 通知 | Toast | Notification Center | libnotify |
| 开机自启动 | 注册表 | LaunchAgent | .desktop |
| 自定义协议 | Registry | Info.plist + setAsDefaultProtocolClient | .desktop |

任何一个细节不同都可能让"看起来一样的应用"在不同 OS 有微妙 UX 差异。代码必须分平台处理。

---

## 6.9 常见问题

### Q1：为什么窗口一直在闪烁？

`backgroundColor` 没设，主进程在画第一帧之间会显示空白。设 `backgroundColor: '#xxx'`。

### Q2：为什么 `did-finish-load` 后还看不到东西？

可能是 layer 在 GPU 端未 raster。再等一帧 `did-frame-finish-load` 或 `did-paint`。

### Q3：GPU 进程崩溃后窗口空白？

Chromium 自动重启 GPU 进程，但首次绘制要 200-500ms。我们监听 `gpu-process-crashed` 决定弹窗。

### Q4：为什么 macOS 上窗口 title 和按钮区域显示错位？

`titleBarStyle: 'hiddenInset'` 在多显示器下需要设置 `trafficLightPosition`。

### Q5：WebContentsView 切到后台渲染卡顿？

打开 `setBackgroundThrottling(false)`，但要小心耗电。

---

## 6.10 小结

- BrowserWindow 是 OS 窗口 + WebContents 的封装，创建后由 Browser Process 与 Renderer Process 协作。
- 加载流水线事件都对应明确的进度点（start-navigation → dom-ready → load → frame-finish）。
- 自定义标题栏、多窗口、View 视图需要了解 OS 差异。
- 启动期打点（TTFP/TTVC/TTI）是定位优化的关键。

下一章 [07 · 性能与内存](./../07-performance/README.md)。
