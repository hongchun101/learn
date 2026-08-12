# 01 · 架构与源码导读

> 任何 Electron 高级问题的根因分析都离不开对架构的理解。本章带你从 Electron 的二进制产物反推出它的运行时结构，再到 Chromium 与 Node.js 之间的边界，掌握阅读 Electron 源码的抓手。

---

## 1.1 Electron 是什么

Electron = Chromium + Node.js + 一套由 C++ 编写的"胶水"。

更精确地说：

- **渲染进程** (Renderer Process)：一个完整的 Chromium Content Shell + V8，等价于一个被托管的 Chrome 标签页。
- **主进程** (Main Process)：Node.js 运行时 + Chromium 浏览器进程层 (`Browser` / `BrowserContext`)，把 Chromium 的多标签页能力"折叠"成多窗口能力。
- **GPU 进程**：从 Chromium 28 起独立出来的合成器 / 光栅化进程，Electron 默认开启。
- **网络进程**：负责所有渲染进程共享的网络栈。
- **实用工具进程** (Utility Process)：Electron 27+ 引入的轻量级进程模型，承担 off-main-thread 的工作。

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                                Electron App                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│  Main Process  (Node.js + Chromium Browser Process)                          │
│  ├─ app / BrowserWindow / Menu / Tray / ipcMain                              │
│  └─ 持有所有 Native Handle (窗口句柄、托盘图标、菜单、协议)                    │
│                                                                               │
│  ┌─── Renderer Process A ───┐  ┌─── Renderer Process B ───┐                  │
│  │  V8 + Chromium Content    │  │  V8 + Chromium Content    │                 │
│  │  (HTML / JS / WebAssembly)│  │ (HTML / JS / WebAssembly) │                 │
│  └────────┬──────────────────┘  └────────┬──────────────────┘                 │
│           │  IPC (ipcRenderer)            │                                 │
│           └───────────────┬──────────────┘                                 │
│                           ▼                                                  │
│                 ipcMain (Node.js EventEmitter)                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│          Chromium Browser Process Shared Layer (Browser/IO/UI/Network)        │
├─────────────────────────────────────────────────────────────────────────────┤
│                  GPU Process   │   Utility Process   │   Network Process       │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 1.2 看一眼 Electron 的二进制产物

安装一次 Electron 包，看 `node_modules/electron/dist/` 下都有什么：

```text
electron/
├── LICENSE
├── install.js                        # 后安装脚本
├── path.txt                          # 指向当前平台可执行文件
├── dist/
│   ├── electron.exe                  # Windows 主二进制
│   ├── electron                       # Linux/macOS 主二进制
│   ├── resources/
│   │   └── app.asar                  # （你的项目打包后）应用代码
│   ├── locales/                      # Chromium 本地化
│   ├── icudtl.dat                    # ICU（Unicode/International Components）
│   ├── v8_snapshot_data.bin          # V8 快照（V8 冷启动耗时 1/3 在解析这里）
│   ├── chrome-sandbox                # Linux 下的 Chromium 沙箱 setuid 程序
│   ├── libffmpeg.so / .dll / .dylib  # Chromium 自带的多媒体解码
│   ├── swiftshader/                  # 软件 GL 后端（无 GPU 时的兜底）
│   ├── snapshot_blob.bin             # V8 启动快照
│   └── chrome_crashpad_handler       # 崩溃上报守护进程
```

可以快速观察：

```bash
# macOS 看一下 linkage
otool -L node_modules/electron/dist/Electron.app/Contents/Frameworks/Electron\ Framework.framework/Versions/A/Libraries/*.dylib | head -40

# Windows 看一下 dll 依赖
dumpbin /dependents node_modules\electron\dist\electron.exe
```

你会发现 Electron 链接了：

- `d3dcompiler_47.dll` / `libGLESv2.dll` —— DirectX / OpenGL ES，用于 GPU 合成。
- `libVk*.dll` —— Vulkan。
- `node.dll` —— Node.js 主库（被 Electron 启动时整合进 V8 同一进程）。
- `libffmpeg.dll` —— Chromium 的 FFmpeg，H.264 / H.265 / AAC 在沙箱之外解码。
- `chrome_crashpad_handler` —— Crashpad，由 Chromium 的 `components/crash` 提供。

这些 dll/dylib/so 在你升级 Electron 版本时也会一并替换，"升级 Electron" 本质上是替换 Chromium + Node.js + V8 三层。

---

## 1.3 Electron 的三大运行时

### 1.3.1 Chromium

Electron 用的 Chromium 版本号，你可以在 `process.versions` 拿到：

```js
console.log(process.versions.chrome);    // '124.0.6367.91' 之类
console.log(process.versions.electron);  // '28.x.x'
console.log(process.versions.node);      // '18.18.0'
console.log(process.versions.v8);        // '12.4'
```

Chromium 提供了：

- **Content 层** (Content Shell)：多进程沙箱化的页面渲染环境。
- **Blink**：HTML / CSS / Layout / Paint。
- **V8**：JS / WebAssembly。
- **Skia**：2D 图形。
- **GPU 子系统**：Command Buffer / Raster / Display Compositor。
- **网络栈**：URLRequest / CookieMonster / DiskCache。
- **Device API**：Geolocation / Notification / Media 等（Electron 大部分被替换为自己的实现）。

具体到源码路径，记住这两条：

- chromium/third_party/blink/renderer/  —— Web 引擎。
- chromium/content/                       —— 进程管理、Renderer 沙箱、消息循环。

### 1.3.2 Node.js

主进程复用 Node.js 的主线程、V8 isolate、以及：

- libuv（事件循环 + 线程池 + 文件系统）。
- http-parser / c-ares / nghttp2（HTTP 客户端与服务端）。
- OpenSSL（TLS / 加密）。

渲染进程默认拿到的 Node 能力非常有限：通过 `nodeIntegration: true` 才会把 require/process/Buffer 注入到渲染进程的 `window` 上下文。**我们将在第 3 章详细讨论这件事为什么危险。**

### 1.3.3 V8

V8 在 Electron 里同时被 **主进程** 和 **渲染进程** 使用，但两者生命周期不同：

- 主进程的 V8 在 app 启动前跑完 `v8::Platform::InitializePlatform()` 之类。
- 每个 Renderer 进程都是一个 `blink::WorkerOrWindowGlobalScope` 关联的 V8 context。

Electron 暴露的 `app.commandLine.appendSwitch('js-flags', '--max-old-space-size=4096')` 直接透传到 V8 启动参数：

```js
app.commandLine.appendSwitch('js-flags', '--harmony-top-level-await --max-old-space-size=4096');
```

---

## 1.4 Electron 主源码导读

Electron 仓库 https://github.com/electron/electron 的目录结构：

```text
electron/
├── shell/
│   ├── app/                # Electron 应用入口、命令参数解析、命令行启动
│   ├── browser/            # BrowserProcess、WindowList、NativeWindow、NativeMenu、Session
│   │                       #     ── 含 api/ 子目录，承载大部分 JS ↔ C++ 绑定
│   ├── renderer/           # Renderer 注入、V8 扩展、NodeIntegration
│   ├── common/             # 不依赖 Chromium 的公共代码：IPC 类型、消息定义、Options
│   └── utility/            # Utility Process 宿主
├── lib/                    # JS 公共层（process、ipcRenderer、Module require map 等）
├── typings/                # TypeScript 类型定义
├── docs/                   # 由 docs 工程生成文档站点
├── patches/                # 修改上游依赖的 patch（常看这里能学到很多）
└── BUILD.gn / gn build ……
```

### 1.4.1 一个 API 从 JS 到 C++ 的链路

以 `BrowserWindow` 为例：

```text
JS (你的代码)
    │ const { BrowserWindow } = require('electron')
    ▼
lib/browser/api/browser-window.js        # JS 包装层
    │ module.exports = electron.internalBinding('browser_window')
    │ + extension of BrowserWindow.prototype (new-method-wrap)
    ▼
shell/browser/api/electron_api_browser_window.{h,cc}
    │ 通过 gin::Wrappable + gin::ObjectTemplateBuilder 暴露方法到 V8
    ▼
shell/browser/native_window.cc / native_browser_window_*.cc
    │ 创建 Aura/Views/Cocoa/Win32 的真实 OS 窗口
    ▼
content::WebContents::Create           # Chromium Content 层
    │ 启动一个 Renderer Process
    ▼
content::RenderProcessLauncherDelegate → ipc_crashed
```

读源码的时候两个关键：

1. **`shell/browser/api/`** 是 C++ API 的"句柄"，每个 `.cc` 文件对应一个 JS API。
2. **`shell/browser/native_window*.cc`** 和 `api/*.cc` 是松耦合的：native 层管 OS 窗口，API 层通过 gin 把 V8 桥到 native 层。

### 1.4.2 几个值得追踪的实现

| API | 路径 |
|-----|------|
| `BrowserWindow` | `shell/browser/api/electron_api_browser_window.{h,cc}`、`shell/browser/native_window.cc` |
| `WebContents` | `shell/browser/api/electron_api_web_contents.{h,cc}` |
| `app` | `shell/browser/api/electron_api_app.{h,cc}` |
| `ipcMain` | `lib/browser/api/ipc-main.js`，底层是 `gin->ElectronElectronEvent::Create` |
| `Menu` | `shell/browser/api/electron_api_menu.{h,cc}` + `shell/browser/ui/cocoa/electron_menu_model_mac.mm` 等 |
| `Session` | `shell/browser/api/electron_api_session.{h,cc}` |
| `systemPreferences` | `shell/browser/api/electron_api_system_preferences.{h,cc}` |

---

## 1.5 Chromium 进程模型在 Electron 中的体现

先回顾 Chromium 的进程角色：

- **Browser Process**：单例，管理 IO/UI/Network 子线程，与权限、网络、磁盘、cookie、profile 等打交道。
- **Renderer Process**：每个 tag 一个，配合 sandbox 隔离。
- **GPU Process**：合成 + 光栅 + 视频解码。
- **Utility Process**：网络、存储、CDM 等"浏览器内部 service"。Electron 把这一层拓展成"业务进程"。

Electron 的特殊性：

- 不再创建"标签页"，而是 **BrowserWindow → WebContents → (URL)**。一个 BrowserWindow 可以对应多个 WebContents（窗口拆窗格）。
- 多 BrowserWindow 可以共享 `Session`。
- 渲染进程默认 **没有 sandbox**（直到你显式 `sandbox: true` 并配合 OS 沙箱工具）。这是 Electron 项目反复强调的安全坑，详见第 3 章。
- Utility Process 是 Electron 27+ 引入的正经"同 IPC 协议、不同特权" 进程，原生模块、截图、转码、压缩都可以卸到这里跑。

---

## 1.6 版本号背后的含义

`electron@28.x.y`：

- `28` 是 Major：与 Chromium 对齐。比如 Electron 28 ↔ Chromium 118。Chromium 主要的底层改动会在 Electron major 上有所体现。
- `x` 是 Minor：与 Node.js 主版本对齐。
- `y` 是 Patch：bugfix、安全补丁、Electron 自身修复。

```text
Electron 33   Chromium 130    Node 20.18
Electron 32   Chromium 128    Node 20.16
Electron 31   Chromium 126    Node 20.14
Electron 30   Chromium 124    Node 20.12
Electron 29   Chromium 122    Node 20.10
Electron 28   Chromium 120    Node 18.18  ← LTS
```

选择主版本的两条经验：

1. **与 Chromium 主版本几乎同步的安全修复**。可以快速跟进 CVE。
2. **Node.js 主版本也可能变**，需要重新验证所有原生模块。

可以通过 `npx electron --version` 与 `process.versions` 同时验证：

```js
const { app } = require('electron');
app.whenReady().then(() => {
  console.log({
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    v8: process.versions.v8,
    uv: process.versions.uv,
    zlib: process.versions.zlib,
    openssl: process.versions.openssl,
  });
});
```

---

## 1.7 启动链：发生了什么直到第一帧

桌面应用启动期是最容易出问题的环节。完整链路：

```text
1. 双击 electron(.exe)
   └─ main() (electron/shell/app/electron_main.{h,cc})
      └─ 解析命令行参数
      └─ 加载 crashpad_handler
      └─ 注册 Chromium ThreadPool / SandboxedExecutor / FSE / etc.
      └─ 初始化 V8 platform

2. ElectronContentClient::Initialize()
   └─ 注册自定义的 content::ContentClient（覆盖 ResourceBundle / Schemes）

3. ElectronBrowserMainParts::PreMainMessageLoopRun()
   └─ 一系列 thread pool / preference / IO 初始化
   └─ 注册 NotificationService
   └─ 创建 sandbox policy（Linux）

4. RenderProcessHost / BrowserProcessIOThread 启动
   └─ 第一个 BrowserWindow 创建
   └─ content::WebContents::Create() → 创建 RendererProcess

5. Renderer 启动 V8 → 解析/编译 main HTML/JS → 排版 → 渲染 → 上屏
   └─ 首屏绘制 → compositor 合成 → GPU 进程上屏
```

把这条链路写下来对照分析白屏、闪退、卡顿等问题时非常有用。常见对应：

| 现象 | 可能的阶段 | 排查工具 |
|------|------------|----------|
| 应用图标弹出来没窗口 | 阶段 3.5 之前 | `--enable-logging` |
| 出现窗口但是空白不绘制 | 阶段 4-5 之间 | `chrome://gpu`、开发者工具 |
| 黑屏几秒突然出现 | 阶段 5 JS / Render 慢 | DevTools Performance |
| 启动后立刻闪退 | 5.x 阶段 JS 抛错 | 退出码、stderr、`sentry` |
| 长时间卡 loader | 主进程阻塞 | `--inspect-brk=0.0.0.0:9229` |

我们会在第 7 章深入讨论，并给出一份"启动时间"打点表。

---

## 1.8 我们怎么阅读 Electron 源码

### 1.8.1 起点选择

- 如果你关心的是 **窗口行为**：从 `BrowserWindow` JS API → `electron_api_browser_window.cc` → `NativeWindow::Create` → `NativeBrowserWindowViews/Aura/Cocoa`。
- 如果你关心的是 **渲染进程**：从 `WebContents` → `content::WebContents::Create` → IPC Channel 建立。
- 如果你关心的是 **IPC**：从 `ipcMain` JS → `ElectronEvent::Create` → `ElectronBrowserMessageFilter` → Renderer's `ipcRenderer` 通过 `ContentScript` 桥。
- 如果你想知道 **某个选项的含义**：在 `electron/typings/internal-ambient.d.ts` 里搜 API，再去 `common/api/electron_api_<name>.cc` 看 `Options::Create` 之类的实现。

### 1.8.2 工具

- 生成一份 `compile_commands.json`（`gn gen out/Testing --export-compile-commands` 或 `out.gn/...`）。
- 配合 `clangd` 跳转。
- Electron 仓库已经放好 `docs-yaml/`、`docs/api/*.md`，文档与源码一一对应。

### 1.8.3 关注 patch 目录

`patches/` 是 Electron 团队向上游打的补丁，常常能告诉我们 Web 平台缺失什么能力：

- `node_modules/`：Node 集成、contextify（`process` 注入到 v8）。
- `chromium/`：PDF、Sandbox、Fonts、自定义代理、SpellChecker 等等。
- `v8/`：V8 isolate 调整。

---

## 1.9 常见架构疑问精解

### Q1：为什么渲染进程可以访问 Node？

`nodeIntegration: true` 时，Electron 会在 Renderer 进程启动时把 Node 的 require / process / Buffer 等注入到 `window`。在底层是 `NodeBindings::StartPollingThread` 和 `RendererClient::DidCreateScriptContext`。

### Q2：为什么 GPU 进程和 Utility 进程没有 JS？

它们是 C++ 层的"浏览器内部 service"，只暴露 C++ 接口给主进程和渲染进程使用。GPU 进程接收 `gl_surface` 的 CommandBuffer；Utility 进程接收 native module / 业务 JS。

### Q3：为什么重启安装包如此慢？

`electron-builder` 默认启用 ASAR 打包：所有 JS / 资源打成一个 .asar。冷启动要遍历 + 解压 1.4 万 ~ 3 万文件，是 Chromium 自带的 `ResourceBundle` 速度的 1/3～1/2。这就是为什么 `electron-builder` 推荐把 `asarUnpack` 留到大文件、动态加载的二进制文件。

### Q4：什么是 V8 snapshot？

`v8_snapshot_data.bin` 是 V8 启动期的字节码快照。V8 在 parse/compile 内置对象（Array、Map、Promise、Node、HTMLCollection...）会复用这些字节码，省下 100-200ms 的 parse 时间。

---

## 1.10 推荐阅读清单

1. https://www.electronjs.org/docs/latest/tutorial/ —— 官方教程，先走一遍。
2. https://chromium.googlesource.com/chromium/src/+/master/docs/ —— Chromium 设计文档。
3. https://github.com/electron/electron/tree/main/shell —— 直接读源码。
4. https://www.electronjs.org/blog/ —— 官方博客：每个版本都会写 changelog & migration notes。
5. https://docs.google.com/document/d/1nBrjUqpVtFeRLdfN_MKz8pV9SAvnn-MKG5AXc0Alz4w  —— Chromium 进程模型内部文档，公开可搜。

---

## 1.11 本章小结

- Electron 是一个 "Chromium + Node.js + V8" 的合体，每个 Electron 主版本都锚定特定版本的 Chromium。
- 主进程与渲染进程共用 V8，但特权不同；渲染进程默认 Node 能力被裁掉，是为了安全。
- 读 Electron 源码的两大路径：`shell/browser/api/` 看 JS 接口，`shell/browser/native_window*.cc` 看 OS 窗口。
- 启动链的 4-5 个关键阶段，每个阶段都有相应的诊断工具与典型问题。

下一章 [02 · 进程模型与生命周期](./../02-process-model/README.md) 我们展开进程的角色、生命周期与 Utility Process。
