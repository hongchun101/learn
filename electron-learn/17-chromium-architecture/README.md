# 附录 D · Chromium 架构深入

> Electron 的底层就是 Chromium + Node.js。本章从 Chromium 的进程间协作、Render Tree、GPU 合成器、IPC 通路四个主题，深入讲清"为什么是这样"。这一章能读懂，说明你已经具备"内核级"调优 Electron 的能力。

---

## D.1 Chromium 的"管道哲学"

```text
                上层                                 下层
┌────────────────────────────────────┬────────────────────────────────────┐
│  Browser UI                        │  Renderer Process                  │
│  (Toolbar, Settings, Tab Manager)  │  (HTML / CSS / JS / WebAssembly)   │
│                                    │                                    │
│  Browser Process                   │  blink, V8, Skia                  │
│  (Browser Main, IO Thread,         │  Renderer Main, Compositor         │
│   UI Thread, Network Service)      │  Thread, Blink Engine              │
│                                    │                                    │
│  GPU Process                       │  Network Process                   │
│  (Shader, Raster,                  │  (URLLoader, Cache)                │
│   Display Compositor)              │                                    │
│                                    │  Storage Process                   │
│                                    │  Service + Utility processes        │
└────────────────────────────────────┴────────────────────────────────────┘
                                       ▲
                                       │
                                       │  Mojo (IPC)
                                       │
                              ┌────────┴───────┐
                              │   Mojo Bus      │
                              │   (system bus)  │
                              └────────────────┘
```

每条消息从一个进程的 `Message Pipe` 到另一进程的 `Message Pipe`。

---

## D.2 进程间通信：Mojo

### D.2.1 接口的定义

```mojom
// src/url/mojom/url.mojom
module url.mojom;

struct Url {
  string spec;
  string scheme;
  string host;
  uint16 port;
  string path;
  string query;
  string ref;
};

interface UrlService {
  Parse(string url) => (Url result);
};
```

通过 `mojo generate_cpp --output_dir out/url/url_mojom url.mojom` 生成：

```cpp
class UrlService {
 public:
  virtual void Parse(const std::string& url, ParseCallback callback) = 0;
};
```

### D.2.2 Electron 是 Mojo Endpoint 的特例

Electron 在 `Browser Process` 提供：

```cpp
class ElectronBrowserMessageFilter : public content::BrowserMessageFilter {
  // 接收来自 renderer 的 IPC 消息
  // 转发到 ipcMain / WebContents 的 JS 层
};
```

每个 WebContents 的 renderer 进程都对应一组 Mojo 接口：

- `Content RenderFrame` 主接口。
- `Electron-specific IPC Channel`。
- `Chrome Extensions`。

### D.2.3 IPC 类型生成

`tools/ipc` 工具会基于 `.fbs` FlatBuffers 生成 Rust / C++ 的 IPC binding，给到所有进程用。

### D.2.4 同步 vs 异步接口

```mojom
interface SyncUrl {
  Parse(url string) => (Url? result);  // 同步阻塞
};

interface AsyncUrl {
  Parse(url string);  // async via callback
};
```

Electron **绝不** 同步阻塞 renderer。因为同步阻塞会让 V8 stop-the-world → 整个窗口卡死。

---

## D.3 渲染管线的内部

### D.3.1 帧的生命周期

```text
1. main thread → Parse HTML → build DOM
2. main thread → load sub-resource
3. main thread → evaluate JS
4. main thread → style recalc
5. main thread → layout (reflow)
6. main thread → record → compositor
7. composited → commit → GPU process
8. GPU process → tile raster → tile upload → display
```

每一步都是 v8/blink 上下文切换。`--enable-precise-memory-info` 与 Tracing 能看到每一步耗时。

### D.3.2 Frame 与 Animations

`Animation` 工作流：

1. JS code set element.style.x = '10px' (on animation frame)
2. Style recalc
3. Layer Tree changed
4. Compositor schedules frame
5. Animations run via `cc::AnimationTimeline` / `cc::Animation`

### D.3.3 主线程 vs Compositor Thread

| Thread | 任务 |
|--------|------|
| 主线程 | JS、Style、Layout、Paint、Compositor commit |
| Compositor | Scroll、Animation、HitTesting |
| Worker | OffscreenCanvas、SW |

合成线程独立意味着输入 / 滚动比主线程快。但 paint 必须回到主线程。

### D.3.4 提交节奏

```
vsync ~ 60fps
│
├─ frame 1   compositor walks layer tree, tiles rastered if dirty
├─ frame 2   ...
...
```

如果某次 commit 超时（>16.6ms），下一帧延迟；累积下来会卡。

---

## D.4 Blink 与 V8 协作

### D.4.1 V8 isolate

每个 renderer 有独立 V8 isolate。Electron 主进程也跑 V8（Node）。

V8 isolate 包含：

- heap
- microtask queue
- compile cache
- thread-local handles

### D.4.2 Execution & microtask

v8 在执行 macro task 之间插入 micro task。先后顺序：

```text
macrotask A → microtasks → macrotask B → microtasks
```

Promise / MutationObserver 是 microtask。`setTimeout` 是 macrotask。

### D.4.3 GC 三色标记

- **Marking**：暂停 JS（stop-the-world），root-set → 全部 reachable 对象标记。
- **Sweeping**：回收 unmarked 对象。
- **Compacting**：移动对象，合并碎片。

V8 的优化：

- `Generational GC`：young + old generation。
- `Parallel` 和 `Concurrent` GC。
- `Incremental marking` 让 GC pause 缩到 < 10ms。

可以通过 `--trace-gc-verbose` 看：

```bash
electron --js-flags='--trace-gc --trace-gc-verbose' app.js
```

---

## D.5 合成器

### D.5.1 Layer

```text
DOM Tree       Style Tree          Layer Tree
<p>           <p style=..>       layer_root
 <span/>         <span>            layer_text_layer_id_1
</p>          </p>               layer_scroll_layer_id_2
```

Layer Tree 由 `compositor-thread::Layer` 构成。每个 layer 包含：

- transform
- paint records (display list)
- tilings (GPU textures)
- content_layer

### D.5.2 Raster

Raster 把 layer 的 display list 转换成 GPU 纹理。

```text
display list → gpu command buffer
              → tile cache
              → texture
```

Raster Mode：

- `on demand`：未滚到的 layer 不 raster。
- `always`：激进 raster。适合快速滚动。

### D.5.3 视口与 dead reckoning

```
viewport.x += velocity * dt
```

Compositor 在 vsync 之间用线性外推把 viewport 推走，主线程没有参与。这就是为什么滚动流畅。

### D.5.4 输出

GPU process 通过 `Display Compositor` 把 layer tree 合并到 framebuffer → swapout 到 OS 屏幕。

`chrome://gpu`：

- 显示 GPU 进程内存。
- 显示 `CompositorCommitMode` / `DrawMode`。

---

## D.6 网络栈

### D.6.1 网络进程

- 单 network process 持有所有 cookie、cache、disk quota、HTTP cache。
- 浏览器可在 Renderer 内 fetch 资源时，不阻塞 main thread（默认网络 IO 走 network 进程）。

### D.6.2 Service Worker

- Service Worker 注册 → SW UA -> SWController。
- 通过 fetch 事件拦截请求。

### D.6.3 Cache

- `caches.open()` -> Service Worker Cache。
- 在 network process 内的 `Cache Storage`。

### D.6.4 CORS 与 CrossOriginIsolated

- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`
- `Cross-Origin-Resource-Policy: same-origin`

这些 header 由 `content_security_policy` 协同。`window.crossOriginIsolated` 控制能力。

---

## D.7 内存模型

### D.7.1 Renderer 主进程内存

- V8 heap
- Blink heap (CSSOM, document rendering)
- Native heap (Skia textures, GPU textures)
- 网络进程把 cache 指过去

### D.7.2 GPU 进程显存

- `CompositeResource` 包含 `Texture`、`Buffer`、`Sampler`、`RenderPipeline`。
- `gl_texture_estimate` 显示总纹理占用。
- 配置 `WARN_ON_OVERFLOW` 会显示 GPU 资源超限警告。

### D.7.3 跨进程内存

- 每个 BrowserWindow 至少有：
  - V8 isolate (~30-50MB)
  - Blink heap (~10-30MB)
  - Skia / GPU textures (~50-200MB)
  - Native registry (~10-30MB)

把多个 BrowserWindow 合并到同一进程可以节省，但代价是隔离。

---

## D.8 进程生命周期与"暂停"

### D.8.1 Policy

- 后台 tab renderer 在 `display: none` / `page-visibility` 改变时被冻结 CPU 密集任务。
- 这对 audio 不暂停，对 IndexedDB 不暂停。

`webContents.setBackgroundThrottling(false)` 关闭。

### D.8.2 Blink Cache

`memory_cache_size_limit` 与 `disk_cache_size_limit` 控制。给命令行传值：

```bash
electron --disk-cache-size=200000000  # bytes
```

---

## D.9 Tracing 真在做什么

Chromium Tracing 实际记录：

- 一组分类 (`disabled-by-default-*`、`cc`、`blink`、`v8`、`net`)。
- 每条都有 `Begin`、`End`、`Duration`、`Args`。

```json
{ "name": "V8.Execute", "ph": "X", "ts": 1, "dur": 100, ... }
```

在 chrome://tracing 中加载，UI 把数据可视化为瀑布图。

Electron 团队内部也有"启动 trace" 工具：

```bash
electron --trace-startup=output --trace-startup-verbose=1
```

---

## D.10 性能优化"理论"汇总

| 优化 | 理论依据 | 工具 |
|------|---------|------|
| 减小 bundle | 减少 V8 Parse / Compile 成本 | web-vitals / trace |
| 合并 JS 请求 | 减少 IPC 次数 | chrome://net-internals |
| 减少 DOM | 减少 Layout / Paint | perfomance API |
| will-change | 提前 raster | chrome://layers |
| transform 而非 top | 走 GPU compositor | tracing 'cc' |
| OffscreenCanvas | 独立线程 | sanity test |
| 分离 utility | 隔离大任务 | 业务计数器 |
| ASAR + asarUnpack | 文件 IO | startup trace |

---

## D.11 何为"Chrome 平台"

- 自动填充 / 翻译 / 拼写 检查。
- 媒体（`MediaFoundation`、`WebRTC`）。
- PDF viewer (PDFium)。

Electron 默认替换了一些：

- 通知 → 自定义。
- 拼写检查 → Hunspell。
- 协议注册 → 自带。
- PDF viewer → 关掉 (`app.commandLine.appendSwitch('disable-features', 'PDFViewer')`)。

---

## D.12 沙箱原理（Linux）

```text
渲染进程
  │ execve chrome-sandbox  ← setuid binary
  ▼
新的 PID, 然后 chmod 4000 + chmod u+s chrome-sandbox
  │ SUID root briefly
  ▼
启动 child sandbox
  │ seccomp / bpf filter
  ▼
fully sandboxed process
```

macOS 用 sandbox-exec。Windows 用 `MitigationPolicy`。

**如果用户安装包没有带上 chrome-sandbox，Linux 渲染进程会拒绝启动**。这是 Electron 在 Linux 上的典型问题。

---

## D.13 调试 — 自己写 instrumentation

### D.13.1 trace 类别

```cpp
TRACE_EVENT("cc", "RenderLayerTree", arguments);
```

注入到自己的 C++ / OC 代码。

### D.13.2 监控 WebContents frame

```ts
mainWindow.webContents.on('paint', (event, dirty, image) => {
  console.log('paint', dirty, image.getSize());
});
```

### D.13.3 监听 WillBeginFrame

```ts
let frames = 0;
mainWindow.webContents.on('paint', () => frames++);
setInterval(() => {
  console.log('fps', frames);
  frames = 0;
}, 1000);
```

---

## D.14 Web 平台的演进与 Electron

- `WebGPU`：3D 渲染更高效。
- `WebCodecs`：硬件视频解码。
- `WebTransport`：低延迟传输。
- `Sanitizer API`：样式安全。
- `SharedArrayBuffer`：多线程。
- `Trust Token`：跨站点反钓鱼。
- `Fenced Frames`：跨站点嵌入新模型。

Electron 28 起默认开启多数新 API。Web 端最新进展往往能在 Electron 半年内跟进。

---

## D.15 小结

- Chromium 是 Mojo IPC + 多线程 + 合成器的合集。
- Renderer 进程与 Browser 进程通过 Mojo 通信；User-visible IPC 都是 Chromium 提供的能力。
- 性能的关键是"V8 内存占用 / 主线程任务 / GPU 上传带宽"三要素。

---

## D.16 推荐阅读

- [Chromium Architecture](https://chromium.googlesource.com/chromium/src/+/master/docs/)
- [Blink Design Doc](https://chromium.googlesource.com/chromium/src/+/master/third_party/blink/renderer/core/frame/Frame.h)
- [V8 Design Doc](https://v8.dev/docs/torque)
- [Mojo IDL](https://chromium.googlesource.com/chromium/src/+/master/mojo/)
- [Compositor - cc](https://chromium.googlesource.com/chromium/src/+/master/cc/)
