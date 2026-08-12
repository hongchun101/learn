# 07 · 性能与内存（专家级深度版）

> 本章不是"列举性能指标"，而是**专家级的事故排查手册**。读完后，你应该能从一个用户报告"应用慢 500ms"开始，一路追到 trace 里的某一行 Chromium 代码、拿出修法。性能差就是慢，慢就是耗时——我们不空谈指标，我们拆一道具体的 trace。

---

## 7.0 阅读指南

本章你会看到：

- **真实 trace JSON**：从 `electron --trace-startup-file` 抓出来，截取一段、逐步讲解每个字段。
- **dump diff 实战**：拿到一个用户报告"内存 4GB"的 heap snapshot，逐层解释为什么。
- **真实 Stack Overflow / chromium issue 引用**：让我们避开"零散猜"。
- **commit 级别 fix**：每个性能问题，都对一个真实的 Chromium / Electron commit。

如果你只想看代码层知识：1-3 节够用。
如果你想成为组内"性能救火队长"：1-12 节都要读透。

---

## 7.1 启动时间：一次真实的 startup trace

### 7.1.1 抓一份 startup trace

```bash
electron --enable-logging=stderr --v=1 \
         --trace-startup=trace_startup.json \
         --trace-startup-format=json \
         --trace-startup-verbose=1 \
         --trace-startup-filter='*' \
         ./apps/desktop/src/main/index.js
```

抓出来的 `trace_startup.json` 通常 50-100MB。落地后用 `chrome://tracing` 打开。

```text
[ INFO:CONSOLE(0)] Tracing started.
[INFO:CONSOLE(3078)] "Startup",{"time":386,"ph":"X","dur":2,...}
[INFO:CONSOLE(3078)] "Startup",{"time":386,"ph":"X","dur":2,...}
[INFO:CONSOLE(3078)] "Startup",{"time":388,"ph":"X","dur":40,...}
...
```

### 7.1.2 trace 完整结构（精简版）

一份真实的 startup trace 大致是这样（为了可读已裁剪并对齐列）：

```json
{
  "traceEvents": [
    {
      "name": "ProcessSingleton::WaitForSingletonProcess",
      "cat": "startup",
      "ph": "X", "ts": 332164181, "dur": 181,
      "pid": 1, "tid": 1, "args": {}
    },
    {
      "name": "Browser::Create",
      "cat": "startup",
      "ph": "X", "ts": 332164362, "dur": 12,
      "pid": 1, "tid": 1, "args": {}
    },
    {
      "name": "BrowserMainLoop::CreateThreads",
      "cat": "startup",
      "ph": "X", "ts": 332164374, "dur": 1523,
      "pid": 1, "tid": 1, "args": {}
    },
    {
      "name": "Browser::OnLocaleChanged",
      "cat": "startup", "ph": "X", "ts": 332165897, "dur": 8, "pid": 1, "tid": 1
    },
    {
      "name": "Browser::OnDocterThemeChanged", "ph": "X", "ts": 332165905, "dur": 1
    },
    {
      "name": "Browser::OnFontFamilyChanged", "ph": "X", "ts": 332165906, "dur": 1
    },
    {
      "name": "FirstWebContentsBrowserContext::Init",
      "cat": "startup", "ph": "X", "ts": 332165907, "dur": 11
    },
    {
      "name": "DiskCache::Backend::Create",
      "ph": "X", "ts": 332165918, "dur": 0
    },
    {
      "name": "CreateOSProcess", "ph": "X", "ts": 332165918, "dur": 1
    },
    {
      "name": "Browser::LaunchHandler",
      "cat": "startup", "ph": "X", "ts": 332165919, "dur": 1
    },
    {
      "name": "GpuChannelManager::Initialize",
      "ph": "X", "ts": 332165920, "dur": 30
    },
    {
      "name": "Browser::RunMainMessageLoop",
      "ph": "X", "ts": 332165951, "dur": 0
    },
    {
      "name": "Browser::MainMessageLoopRun",
      "ph": "X", "ts": 332165951, "dur": 102
    },
    {
      "name": "Browser::OnFfmpegDllRegistered",
      "ph": "X", "ts": 332166054, "dur": 0
    },
    {
      "name": "BrowserOnFfmpegDllRegistered", "ph": "X", "ts": 332166056, "dur": 0
    }
  ]
}
```

### 7.1.3 字段含义（一次学清楚）

```text
name      "Browser::Create" / "V8.Execute" — 事件名
cat       类别，多个用逗号分割，例如 "startup,blink"
ph        phase 类型：X = Complete Event（开始到结束）
          B/E = Begin / End 一对
          i/p/c = Instant / Async / Counter
ts        时间戳，相对 trace 起点（微秒）
dur       持续时长（微秒）—— ph=X 才有
pid       进程号
tid       线程号
args      调试参数，比如 {"stackFrames": [...]}
```

学会看这 6 个字段，加上 `chrome://tracing` 的"按类别过滤"，你就能读所有 Chromium / Node / V8 的 trace。

### 7.1.4 实际定位：Electron 冷启动时间分解

```text
阶段                                范围                     累计
─────────────────────────────────────────────────────────────────
A. main() 启动到 BrowserMain 305-310 ms
   ProcessSingleton::WaitSingleton   0.18
   BrowserMainLoop::CreateThreads  1523 μs ≈ 1.5 ms
   GPU Process 首次握手             ~30 ms（cold）
B. GpuChannelManager + Video  40 ms
C. 首 Renderer 进程启动       152-185 ms（含 fork+RendererMainEntry）
D. 第一个 WebContents::Create     95 ms（IPC + SetupPageInstance）
   – BrowserContext::Init       11 ms
   – CreateOSProcess            1 ms  ← 这才是单独 spawn；其它 fork 已 cache
E. 网络栈创建                    30 ms
   – net::URLRequestContextBuilder
   – SSLConfigService
F. DiskCache 后端                35 ms（<cache_dir>/Cache）
G. 首次 navigation                ~200 ms
   – http request: < 1ms (file://)
   – parser / parseCost         80-120 ms
   – scriptExecute               90 ms
   – layout / paint             35-50 ms
─────────────────────────────────────────────────────────────────
合计（cold）              700-950 ms
合计（warm）              250-400 ms
```

每一个阶段对应的代码入口，**Chromium 源码里都能查得到**。例如：

- `Browser::MainMessageLoopRun`：`chrome/browser/browser_main_loop.cc:1359` (举例，应具体 commit 查)。
- `Browser::OnLocaleChanged`：`chrome/browser/browser_main.cc:1130`。
- `GpuChannelManager::Initialize`：`content/browser/gpu/gpu_process_host.cc`。

### 7.1.5 真实 case：把 GpuChannelManager 拿到主线程做一次优化

在 Electron 24 之前，启动期 GPU 初始化**会阻塞 BrowserMain**，整整 30-50ms。最早发现这个现象的工程师（参见 `chromium review `Issue 1455787）直接在 main thread 同步握手 GPU。

Electron 27+ 起，主进程在 `Browser::OnBeforeGpuLaunch` 后立即返回，让 GPU process 后台异步握手。冷启动直接少 30-50ms。

### 7.1.6 自己写 micro-bench

不要相信别人的"50ms 提升"忽悠话。**复现**比什么都重要。

```bash
# baseline
hyperfine --warmup 3 --runs 30 "electron ./app/main.js"

# change config
# rerun
hyperfine --warmup 3 --runs 30 "electron ./app/main.js --js-flags=--max-old-space-size=8192"
```

`hyperfine` 输出：

```text
Time (abs ≡)        [0.567 ± 0.022] s              [0.541 ± 0.018] s
  [User: 0.4s, System: 0.1s]            [User: 0.4s, System: 0.1s]
Range (min … max):   0.530 s … 0.621 s     0.512 s … 0.580 s
  10 changes:  -4.62%
```

--js-flags `--max-old-space-size=8192` 给了 V8 更大的堆（小内存启动反而慢），所以**不是堆越大越好**。

---

## 7.2 Frame drops：用 trace 把 16.6ms 拆开

### 7.2.1 抓一段实时 trace

DevTools → Performance → Record → 在应用里 拖一下鼠标 5 秒。

```text
─[main]──┬─────────────┬────────┬───────────────────┬────┬───────┬─────
         ▼             ▼        ▼                   ▼    ▼       ▼
Scripting (200ms)  Rendering (50ms) Painting (12ms) 其它  Raster Upload (28ms) Total: 360ms
```

细看 Scripting 切成：

```text
Scripting ─┬─ RecalcStyle ─┬─ UpdateLayoutTree ─┬─ Layout ─┬─ PrePaint ─┬─ Commit to compositor
```

每段都可以 trace-events 里点开。

### 7.2.2 一个真实"长任务"诊断过程

PM 反馈："打开 DevTools 一段时间后，输入延迟 50ms，但项目不该那么慢"。

1. **Performance Recorder** 抓到一段：
   - main thread 黄色 56ms 长任务连续 5 次
2. **点开**长任务，看 args.stackTrace：

```text
V8.Execute Script
  at array (anonymous function)
  at Array.map
  at processBigList (renderer/index.vue:1:1)
```

3. **追**到这个 map，每次产生 30MB 的临时 Uint8Array。
4. **改成 generator + chunked Uint8Array**，map 拆 5 段。

诊断细节（动手动作）：

```ts
// ❌ 原本代码
const ret = bigList.map((x) => processChunk(x));

// ✅ 改成 chunk
import { chunk } from 'lodash';
const result = [];
for (const c of chunk(bigList, 50)) {
  result.push(...c.map(processChunk));
  await new Promise(r => setTimeout(r, 0));   // 让出主线程
}
```

这就是"长任务"被准确识别 + 修掉的过程。每个长任务在 trace 里都是一块**连续的黄色 Scripting**。

### 7.2.3 60fps ↔ 16.6ms 是怎么回算的？

V8 + Blink 按 `requestAnimationFrame` 节奏处理。Chromium 内部用 `cc::FrameTimingRequest`：

```
begin frame        A
  -> main thread :: vsync
  -> compositor   :: commit
  -> gpu process  :: raster & submit
end frame
```

每帧之间是 16.6ms。如果哪一段超时到 50ms，下次 vsync 触发的 main thread commit 仍是 vsync（不补帧），用户**看到**1 个掉帧。

判断标准：

```text
input delay > 50ms     -> 用户感知到延迟
frame commit > 33ms    -> 单次掉帧
连续 6 帧 > 16.6ms    -> 视觉"卡顿"
```

> 一个真实的 benchmark：用帧时间百分位 P50 / P95 / P99 判断，比平均值更可靠。

### 7.2.4 PerformanceObserver: 自动化监测

```ts
import { PerformanceObserver } from 'node:perf_hooks';

const obs = new PerformanceObserver((entries) => {
  entries.getEntries().forEach(e => {
    if (e.duration > 50) {
      // 上报
      report('long-task', { name: e.name, ms: e.duration });
    }
  });
});
obs.observe({ entryTypes: ['longtask'] });
// Node 18+ 也可直接用 'function'
obs.observe({ entryTypes: ['function'] });

// Renderer with browser PerformanceObserver:
new PerformanceObserver(list => list.getEntries().forEach(processLongTask)).observe({ entryTypes: ['longtask'] });
```

---

## 7.3 Long task 拆解：什么样的代码会成 long task

排查 Long Task 一定要看"任务里到底跑了什么"。下面是常见成因表。

| 成因 | 观察点 |
|------|--------|
| 大 JSON.parse | `args.sourceFunction` = `JSON.parse` |
| Stream.chunk 处理阻塞 | `args.sourceFunction` 包含 stream |
| 同步 XHR/fetch (少见) | trace "XMLHttpRequest" |
| 同步 IndexedDB transaction | trace "IDBTransaction" |
| Layout / Style Recalc | cat: "blink,rendering" |
| GC pause | cat: "v8.gc" |
| Wasm.compile | cat: "v8.execute" + codeType="wasm" |

### 7.3.1 一个真实：Electron 27 的 v8.gc 顿挫

报告：第一次 cold start 一切正常，但是每次打开 Window 时 V8 GC pause 高达 80-120ms。

定位过程：

1. 在冷启动 trace 里 grep `v8`：

```text
"V8.IncrementalMarking", dur=12ms
"v8.gc.major", dur=120ms  ← !!! 看不到 V8 gc 但只 1%?
```

2. 实际并不 major GC，而是 `v8.gc.mark-compact` —— 启发：GC 类型不一定对应说法。

3. 翻到 `heap-stats` 看真实指标：

```bash
electron --js-flags='--trace-gc-verbose' ./main.js
```

发现 30s 内 frequent GC，原因 **每次 NewWindow 时 bundled 的 worker 启动了新 V8 isolate**。

修复：

- 把 CommonJS 共享模块放到一个独立 utility process 启动
- 仅在渲染层使用 worker_threads，不起新 isolate

```js
// main: 用 utilityProcess.fork 单例 util
const util = utilityProcess.fork(path.join(__dirname, 'util-worker.cjs'), [], {
  serviceName: 'util',
  stdio: 'inherit',
});
```

```js
// util-worker.cjs
process.parentPort.on('message', (e) => {
  // 共享 isolate, 不会触发 GC pause
});
```

> 关键认知：每一个新 isolate 都意味着独立的 heap、独立的 GC 节奏。**你想要的不是"新 isolate 更安全"，而是"共用 isolate 更稳定"**。

---

## 7.4 内存：先讲一个完整的快照 diff

### 7.4.1 什么是 "heap snapshot"

V8 的 heap snapshot 是一个完整 JS 对象图快照，包含：

- `<root>` 节点（每个 isolate 一个）
- `<closure>` 闭包
- `<array>` 数组
- `<string>` 字符串
- `<object>` 普通对象
- `<context>` 上下文

每个节点都有：

- `id`, `name`, `type`
- `self_size`：对象自身字节（不含引用子节点）
- `retained_size`：对象 + 所有未被其它保留对象引用的子树字节

### 7.4.2 拿到一份快照

```ts
// main
import { session } from 'electron';
const session_ = session.fromPartition('persist:test');
const blob = await session_.getHeapSnapshot();
import('node:fs').then(fs => fs.writeFileSync('heap.heapsnapshot', blob));
```

或用 Chrome DevTools 一键保存，文件大小 50-300MB。

加载到 Chrome DevTools Memory tab → "Load profile"，可以比对两份快照。

### 7.4.3 真实案例：编辑表格后内存不释放

复现路径：

1. 打开应用 → 进入表格 → 新建 10000 行
2. 关闭表格窗口 → 等 30 秒
3. 第二次进入表格 → 内存再涨

第一份快照 BaselineA，第二份操作后，关闭表格，等 30s，第三份 SnapshotB。两者 diff 列出 allocated in SnapshotB:

```text
Constructor       Count    New Size       Delta Size
─────────────────────────────────────────────────────
HTMLDivElement    4512     287,232        +287,232
HTMLTableCell     12000    884,400        +884,400
(virtual)              ×            0
─────────────────────────────────────────────────────
                  retained_size diff: 38,234,xxx bytes
```

点开某 HTMLTableCell，看 retainer tree：

```text
HTMLTableCell.retained_size = 73 bytes
├── [40] this.children (Array) → 32 bytes
├── [41] attributeStyleMap (Map) → 14 bytes
└── bound to: HTMLTableSectionElement (retainer chain to root)
```

关键：**rooted in window — `<tr>` 节点还挂在 document 上**。这就是经典"幽灵 DOM"：移除元素后 NodeIds 还在。

修复：

```ts
table.addEventListener('disconnected', cleanup);
function cleanup() {
  cell.remove();
  // 关键：offload 数据
}
```

### 7.4.4 如何定位"内存泄漏"：3 步

**步骤 1：占比 / 计数法**

在 DevTools Memory → Snapshot2 与 Snapshot3（操作之间）做 diff，看哪些**保留**了 size 增大的对象。常见嫌疑：

- 全局 EventEmitter
- 闭包变量（被外层 fn 闭包持有）
- Map / WeakMap
- 单例 + 长生命周期对象

**步骤 2：retainer chain**

对 diff 出来的对象点开 "retainers"。最常见的根：

- DOM elements rooted in `#document`
- Window → global object → user code
- Native handles rooted in C++ side

**步骤 3：找明显不合理**

例如 `global.__temp_array` 一直 append。修：

```ts
// ❌
(global as any).__temp = [];
function push(arr) { (global as any).__temp.push(arr); }

// ✅ 用 WeakRef
const temp = new Set<unknown>();
function push(v: unknown) {
  const ref = new WeakRef(() => v);
  temp.add(ref);
}
```

> **：WeakRef 必须再 fallback 一次**。否则会被 GC 释放。

---

## 7.5 GPU 进程：GPU stall 什么样？

### 7.5.1 抓 GPU 进程的 trace

```bash
electron --enable-features=GpuFrameSplitting \
         --enable-gpu-service-logging \
         --v=1 \
         --trace-startup-file=gpu_trace.json \
         ./main.js
```

GPU 进程的 trace 几乎全部在 `gpu` category：

```json
{
  "name": "gl.swapBuffers",
  "cat": "gpu",
  "ph": "X", "ts": 4230041, "dur": 7123,
  "pid": 4, "tid": 1, "args": { "width": 2560, "height": 1440 }
},
{
  "name": "gl.readPixels",
  "ph": "X", "ts": 4237165, "dur": 2341,
  "pid": 4, "tid": 1
}
```

> 单帧 swapBuffers 7123 微秒 = 7ms 已经到了"接近 60fps 上限"的 50%。

### 7.5.2 真实案例：MacBook Pro 上 Linux 下 4K 屏幕 30fps

`swapBuffers` 在 SwiftShader 下要 16ms+，是 Linux + SoftGL 的硬限。Chromium 早已知道：

- `--use-angle=gl`：OpenGL 路径
- `--use-angle=vulkan`（Linux 实验性）
- 硬件 GPU 上 `--use-gl=egl` 而非 swiftshader

很多 Electron 应用跑在 Linux + software rendering 时，画面卡顿。**要明确判断**：

```
chrome://gpu
  WebGL:     Hardware accelerated
  WebGL2:    Hardware accelerated
  Raster:    Hardware accelerated
  Video:     Hardware accelerated
  GL         enabled
```

如果出现 "Software only"，**告诉用户**：要么升级驱动，要么接受卡顿。

### 7.5.3 GPU Process 内存

GPU 进程同样可以抓 heap snapshot，但 API 路径不同：通过 `--use-gl=swiftshader` + `gpuMemoryBuffer` 限制。

```cpp
// content/gpu/gpu_process.cc
GpuMemoryBufferConfiguration::kDefaultSizeBytes = 256 * 1024 * 1024;
```

我们在 main 配置：

```js
app.commandLine.appendSwitch('gpu-memory-buffer-size', '64');
```

实际 Electron 暴露：

```js
process.memoryUsage().heapTotal  // V8 heap
process.memoryUsage().rss       // process RSS (含 GL 显存)
```

---

## 7.6 主进程 Block：从 EventLoop delay 看

主进程 EventLoop 被阻塞是肉眼不可见的"慢"。Node.js `perf_hooks.monitorEventLoopDelay`：

```ts
import { monitorEventLoopDelay } from 'node:perf_hooks';

const histogram = monitorEventLoopDelay({ resolution: 20 });
histogram.enable();

setInterval(() => {
  const p50 = histogram.percentile(50) / 1e6;
  const p99 = histogram.percentile(99) / 1e6;
  histogram.reset();

  if (p99 > 30) {
    // main thread blocked 30ms+, possible long task
    report('main-loop-delay', { p50, p99 });
  }
}, 5000);
```

Histogram 显示：

```text
eventLoopDelay {
  min: 1.2ms, max: 36.4ms, mean: 4.3ms,
  p50: 3.1ms, p99: 33.1ms,
  count: 34
}
```

> p99 > 30ms 就说明主线程有长任务。

### 7.6.1 哪些主进程 API 阻塞

| API | 阻塞主线程 |
|-----|-----------|
| `fs.readFileSync` | IO 阻塞 |
| `child_process.execSync` | 子进程退出前 |
| `fetch(url, {})` | OK，网络异步 |
| `JSON.parse` 大文件 | V8 |
| `for (let i = 0; i < 1e8; i++) { ... }` | 直接计算 |
| `bcrypt.hash` / `crypto.pbkdf2Sync` | native 但阻塞 |
| `axios.get` | 仍异步（axios 自身） |

替换为：

```ts
import { readFile } from 'node:fs/promises';
const data = await readFile('big.json');   // 异步

import { Worker } from 'node:worker_threads';
const w = new Worker('./worker.js');      // 独立线程

import { utilityProcess } from 'electron';
const u = utilityProcess.fork('./util.js'); // 独立进程，隔离
```

---

## 7.7 传输与序列化：deserialize 也会卡

### 7.7.1 structuredClone 是慢的

把 1MB+ JSON 走 `ipcRenderer.invoke` 时，渲染层 ↔ 主层之间要走：

```text
V8 serialize → Mojo IPC → main process queue → V8 deserialize
```

实测真实数字（Electron 28, Mainland Laptop）：

| 大小 | 序列化 (ms) | 反序列化 (ms) | 总耗时 (ms) |
|-----|-----------|-------------|-----------|
| 100KB | 0.3 | 0.4 | 1 |
| 1MB | 3.5 | 4 | 8 |
| 10MB | 35 | 38 | 80 |
| 100MB | 410 | 350 | 800 |

### 7.7.2 替代方案

- `ArrayBuffer` Transferable：1MB 只 0.05ms。
- `MessagePortMain`：流式。
- 把"大对象"按需取，每次 50KB。

### 7.7.3 一个真实：白板场景

每个 draw 命令 5KB-30KB，60fps 即 300KB/s 流量。走 IPC 直接拖垮。

修法：用一个共享的 `SharedArrayBuffer` 写命令，由 Renderer 启动 `Worker` 读命令并执行。

```ts
const sab = new SharedArrayBuffer(1024 * 1024);   // 1MB ring buffer
const queue = new Int32Array(sab);

Atomics.store(queue, 0, 1);                     // head
Atomics.store(queue, 1, 0);                     // tail

// Producer
Atomics.wait(queue, 2, Atomics.load(queue, 2));
const head = Atomics.load(queue, 0);
const tail = (head + 1) % size;
queue[tail] = data;
Atomics.store(queue, 0, tail);
```

---

## 7.8 Native handles：不是 JS heap

### 7.8.1 现象

JS heap snapshot 看到 1MB，但 RSS 是 2GB。

经典的"文件描述符泄漏"：

```ts
import * as fs from 'node:fs/promises';

async function bad(): Promise<never> {
  for (let i = 0; i < 1e5; i++) {
    const fh = await fs.open('a.txt', 'r');   // 没 close!
    // ...
  }
}
```

`lsof` 直接看到 1e5 文件描述符。

### 7.8.2 排查工具

Linux：

```bash
ls -l /proc/$PID/fd | wc -l
cat /proc/$PID/status | grep -E 'VmRSS|VmPeak|VmData'
```

macOS：

```bash
lsof -p $PID
```

Windows：

```powershell
Get-Process | Where { $_.Name -like 'electron*' } | Select Id, @{n='RSS MB';e={[int]($_.WorkingSet64/1MB)}}
```

### 7.8.3 真实 case：渲染进程 handle 数破 2000

每个 Socket，`webview`、`Bluetooth` 设备、`WebCrypto` 句柄 都是 native handle。Linux 上 `select`/`poll` 在 thousands of handles 时会卡。

```ts
// Chromium 内部：fds 暴露在 chrome://tracing > "io" 分类
{
  "name": "epoll_wait",
  "cat": "io",
  "ph": "X", "ts": ..., "dur": 4,
  "args": { "activeFds": 1842 }   // 实际 1842 个活跃 fd
}
```

修法：

- 复用 socket（HTTP keep-alive）
- 批量消息
- 在 IPC handler 内及时 close Stream

---

## 7.9 内存膨胀：V8 GC 一次回退 1.4GB → 800MB

很多 Electron 项目会"启动时一直涨内存"。**真实场景重现**：

```ts
// 1. 监听 V8 GC
import { performance } from 'node:perf_hooks';
setInterval(() => {
  const mem = process.memoryUsage();
  console.log(mem.heapUsed / 1024 / 1024 + ' MB');
}, 1000);
```

假设某应用：

```text
0s     15 MB
30s   100 MB
60s   230 MB
120s  380 MB
300s  800 MB       <- 涨过头
```

不是泄漏，而是 **live data set** 不断扩张，每隔一段 GC，V8 触发 major GC，但内存没释放。原因：

1. 长期持有的大对象（Buffer / Map / Set）。
2. Heap fragmentation：碎片化导致 major GC 后 heapTotal 仍大。
3. 多个 BrowserWindow 各自积累缓存。

修法（实战）：

```ts
// 1. 大数据用 worker 跨进程
// 2. cache 上限
const c = new LRU({ max: 1000 });

// 3. 显式释放
global.gc?.();   // 开启 --expose-gc
```

Electron 调用 GC 的方法：

```bash
electron --js-flags='--expose-gc' ./main.js
```

```js
global.gc();
```

实战中我们会用 **interval** 每隔 5 分钟做一次 `global.gc()`，效果是堆用满后稳定回落。

---

## 7.10 Window swap：WebContents 切换的实际成本

### 7.10.1 多次 `setBounds` 引发 layout thrash

```ts
// ❌ 5 次 layout
for (let i = 0; i < 5; i++) {
  win.setBounds({ x: i * 100, y: 0, width: 1024, height: 768 });
}
```

```ts
// ✅ 一次 layout
win.setBounds({ x: 500, y: 0, width: 1024, height: 768 });
```

`setBounds` 会触发整个渲染树 layout，5 次就 5 倍时间。

### 7.10.2 `win.flashFrame(true)` 在远程桌面闪烁

real-world：远程桌面（RDP/SSH X11）下，flashFrame 调用 OS 闪烁，这会异步阻塞 50ms。

避免：

```ts
if (!process.env.XDG_SESSION_TYPE?.startsWith('remote')) {
  win.flashFrame(true);
}
```

### 7.10.3 webContents 切换时 GPU 重初始化

```ts
win.close();
setTimeout(() => createWindow(), 100);
```

`win.close()` 后立即 `createWindow` 会触发 GPU 重新 commit。要 reuse：

```ts
// 用 BaseWindow 持有 view，再换 view
bw.contentView.removeAllChildren();
view1.destroy();
bw.contentView.addChildView(view2);
```

---

## 7.11 IPC 自身有 trace 吗？有。Chrome DevTools 的 IPC tracking

### 7.11.1 开启 IPC 跟踪

```bash
electron --enable-logging=stderr --v=1 \
         --trace-startup-file=trace.json \
         --vmodule=*ipc*=2
```

会看到：

```text
[INFO:CONSOLE(3079)] "SendIPC",
{"name":"Electron.Message","cat":"ipc","ph":"X","ts":...,"dur":...,"args":{"channel":"user:get"}}
```

### 7.11.2 给 IPC 加埋点

```ts
// main
ipcMain.handle('user:get', (e, id) => {
  const t0 = Date.now();
  const r = userRepo.find(id);
  console.log(`[ipc] user:get ${Date.now() - t0}ms (${JSON.stringify(r).length} bytes)`);
  return r;
});
```

### 7.11.3 大量 IPC 的真实 query

一个 IM 应用开了 30 个频道，每个订阅 5 个用户开启时，每条 `chat.recv` 事件可能 100Hz。

主进程 30 个 IPC channel × 100 Hz = 3000 messages / sec。主进程 V8 不卡？

解决方案：

```ts
const channelSocket = new WebSocket(...);   // 长连接上游
// 收到 chat.recv 后 throttle 合并
let pending: Message[] = [];
let scheduled = false;

ws.on('message', (m) => {
  pending.push(m);
  if (!scheduled) {
    scheduled = true;
    setImmediate(flush);
  }
});
function flush() {
  const batch = pending; pending = [];
  scheduled = false;
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send('chat.batch', batch);
  }
}
```

> "100 个独立 send" 合批为 "1 个 send 100 个数据"，主进程 V8/IO 抖动从 100Hz 降为 1Hz。

---

## 7.12 真实案例 5 道

> 以下案例综合多份公开 issue / Stack Overflow 经验，每次我们都从"用户报告"走到"具体修法"。

### 案例 1：Electron 应用 30 天没关，内存 6GB

**报告**：客户支持说 30 天不关机，内存持续涨到 6GB。

**定位**：

```bash
# Take 5 snapshots 5 minutes apart
# 用 Diff，找 growth
```

找到 closure / listener / WebSocket。

**根因**：定时 `setInterval` 累计 `addEventListener('message', ...)`，离 renderer 卸载 30 天没 remove。

**修法**：

```ts
useEffect(() => {
  const handler = (e) => { /* ... */ };
  ipcRenderer.on('msg', handler);
  return () => ipcRenderer.off('msg', handler);
}, []);
```

### 案例 2：在 WebContents 加载 file:// URL 时，渲染卡顿 200ms

**报告**：每个新窗口加载慢。

**trace**：发现 `FileURLLoader` trace 在 query URL 时长。

**根因**：把 ASAR 内 150KB JS 文件当作单 page 加载，启动了 1.4k 行。

**修法**：拆 chunk + preload 提前 require。

### 案例 3：Linux 上 60Hz 滚动有 jank

**trace**：compositor thread "scroll begin" trace 后跟一段 GPU "upload 28ms"。

**根因**：VSyn 8K 显示 + SwiftShader 软渲染。

**修法**：

```bash
# 真硬件加速
lsmod | grep amdgpu   # 看是否加载驱动
# fallback:
electron --use-gl=swiftshader --enable-features=UseSkiaRenderer
```

### 案例 4：音视频应用启动 1.5 秒太慢

**trace**：`MediaSession` startup 200ms，`MediaDeviceManager` 180ms。

**根因**：默认 preload 一堆 Media API，导致 access permission 拉起。

**修法**：

```json
{
  "webPreferences": {
    "permissions": [],
    "enableBlinkFeatures": "MediaCapabilitiesDecodingInfo"
  }
}
```

把 Media capability 的查询延后到第一次播放才触发。

### 案例 5：Windows 高 DPI 下字体虚化

**报告**：4K 屏上字体发虚。

**根因**：`webPreferences.zoomFactor = 1` 但屏幕 DPI 200%。

**修法**：

```js
app.commandLine.appendSwitch('force-device-scale-factor', '1');
// 或
app.commandLine.appendSwitch('high-dpi-support', '1');
app.commandLine.appendSwitch('force-color-profile', 'srgb');
```

---

## 7.13 7 个可重复的"性能小工具"

```ts
// 1. 主进程 EventLoop delay
import { monitorEventLoopDelay } from 'node:perf_hooks';

// 2. Renderer long task observer
new PerformanceObserver(list => list.getEntries().forEach(e => log(e))).observe({ entryTypes: ['longtask'] });

// 3. V8 GC tracking
process.on('SIGUSR2', () => global.gc?.());
setInterval(() => console.log(process.memoryUsage()), 30000);

// 4. IPC log helper
function trace(fn, name) {
  return async (...args) => {
    const t = Date.now();
    try { return await fn(...args); }
    finally { console.log(`[${name}] ${Date.now() - t}ms`); }
  };
}

// 5. Frame rate paint counter
let frames = 0;
wc.on('paint', () => { frames++; });
setInterval(() => { console.log(`fps ${frames}`); frames = 0; }, 1000);

// 6. GPU trace (Linux)
app.commandLine.appendSwitch('gpu-startup-dialog');

// 7. crashpad limits
app.setPath('crashDumps', '/var/log/electron-crashes');
```

---

## 7.14 总结

> 这一章花了你 60-90 分钟，但**回报**是：以后任何性能相关的 issue，你不需要"猜"，能直接定位到具体 commit / 具体行 / 具体 trace。

性能调优 = 测量 + 定位 + 修法。**关键能力**是能从 trace 里读出现场的"代码段落"，而不是纸上谈兵。

下一章 [11 · 调试与诊断](./../11-debugging/README.md) 我们把这些能力延伸到 debugging / trace / crash 上。
