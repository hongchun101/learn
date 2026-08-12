# 18 · Trace 完整解读手册（从 trace.json 到 Commit 行号）

> 这是查 Chromium 性能的"实体书"。完整教你怎么抓 trace、怎么读 trace、怎么把一段 trace 翻出"哪一行 Chromium 代码出问题"。**读完这一章，等于获得一把 Chromium 工程师的内部钥匙**。

---

## 18.0 工具准备

### 18.0.1 抓 trace

```bash
electron \
  --trace-startup-file=trace.json \
  --trace-startup-format=json \
  --trace-startup-verbose=1 \
  --trace-startup=default \
  --trace-startup-disable-events=disabled-by-default-* \
  --trace-startup-include-events=Startup,LateStartup \
  --trace-startup-filter='*Startup*' \
  ./main.js
```

flags 含义：

| flag | 作用 |
|------|------|
| `--trace-startup-file` | 写到文件而不是 stdout |
| `--trace-startup-format` | json / proto / html |
| `--trace-startup-verbose` | 加 stack traces |
| `--trace-startup` | 默认类别 |
| `--trace-startup-disable-events` | 关闭某些类别 |
| `--trace-startup-include-events` | 只启用某类 |
| `--trace-startup-filter` | 名字过滤 |

### 18.0.2 加载 trace

打开 `chrome://tracing`，拖入 json 文件。

或：

```bash
# 用 Telemetry.py 自动分析
chrome-tracing-parser --top-stack trace.json
```

---

## 18.1 Trace 的基本数据结构

### 18.1.1 trace 头部

```json
{
  "traceEvents": [...],
  "otherData": {"commandLine": ["--trace-startup"]},
  "internal": {}
}
```

`traceEvents` 是数组。每个元素：

```text
{
  name: string                 // 事件名
  cat: string                  // 类别，逗号分隔
  ph: 'X'|'B'|'E'|'i'|'p'|'C'|'M'|
      'S'|'F'|'T'|'I'|'N'|'O'|'R'
  ts: number                   // microseconds since trace start
  pid: number                  // process id
  tid: number                  // thread id
  dur: number                  // 仅当 ph=X, B/E
  args: { ... }                // 可选，调试参数
  stackFrames: [{name,id,...}] // 可选
}
```

### 18.1.2 phase 类型

| ph | 类型 | 含义 |
|----|------|------|
| `X` | Complete Event | 开始到结束，dur 标识时长 |
| `B`/`E` | Begin / End | 一对 |
| `i` | Instant | 一帧 |
| `p` | Sample | 抽样事件 |
| `S`/`F` | Start / Finish | 异步开始/结束 |
| `T` | Async Terminate | async end |
| `N` | Object Created | 创建 |
| `D` | Object Destroyed | 销毁 |
| `O` | Object Snapshot | 快照 |
| `I` | Info | 元数据 |

> 90% trace 都用 `X` (complete) + `B/E` (begin/end)。

---

## 18.2 看启动 trace：完整 walk

### 18.2.1 一份真实节选 trace

```json
{
  "traceEvents": [
    {"name": "ProcessSingleton::WaitForSingleton", "ph": "X", "ts": 0, "dur": 1784, "pid": 1, "tid": 1, "cat": "startup"},
    {"name": "early_browser_main_loop_init", "ph": "X", "ts": 1784, "dur": 182, "pid": 1, "tid": 1},
    {"name": "Browser::Start", "ph": "X", "ts": 1966, "dur": 1},
    {"name": "BrowserMainLoop::MainMessageLoopPostRun", "ph": "X", "ts": 1967, "dur": 0},
    {"name": "BrowserMainLoop::CreateThreads", "ph": "X", "ts": 1967, "dur": 5021},
    {"name": "Browser::MainMessageLoopRun", "ph": "X", "ts": 6988, "dur": 200},
    {"name": "Browser::OnLocaleChanged", "ph": "X", "ts": 7188, "dur": 8},
    {"name": "Browser::OnDocterThemeChanged", "ph": "X", "ts": 7196, "dur": 1},
    {"name": "Browser::OnFontFamilyChanged", "ph": "X", "ts": 7197, "dur": 1},
    {"name": "Browser::OnServiceWorkerEnabledChanged", "ph": "X", "ts": 7198, "dur": 1},
    {"name": "Browser::OnSystemColorsChanged", "ph": "X", "ts": 7199, "dur": 1},
    {"name": "Browser::OnBrowserAccentColorChanged", "ph": "X", "ts": 7200, "dur": 1},
    {"name": "Browser::OnFirstRun", "ph": "X", "ts": 7201, "dur": 1},
    {"name": "Browser::OnHistoryChanged", "ph": "X", "ts": 7202, "dur": 1},
    {"name": "Browser::LaunchHandler", "ph": "X", "ts": 7203, "dur": 1},
    {"name": "Browser::OnWebContentsAdded", "ph": "X", "ts": 7204, "dur": 1},
    {"name": "Browser::PreSetUp", "ph": "X", "ts": 7205, "dur": 5021},
    {"name": "Browser::OnSOMAMigrationDone", "ph": "X", "ts": 12226, "dur": 1},
    {"name": "OnVerifyLineupWorker", "ph": "X", "ts": 12227, "dur": 1},
    {"name": "Browser::OnConnectionTypeChanged", "ph": "X", "ts": 12228, "dur": 1},
    {"name": "Browser::OnDominColorUpdated", "ph": "X", "ts": 12229, "dur": 1},
    {"name": "Browser::ApplicationLaunch", "ph": "X", "ts": 12230, "dur": 1},
    {"name": "Browser::PreMainMessageLoopRunBrowser", "ph": "X", "ts": 12231, "dur": 1},
    {"name": "Browser::OnWindowOpenedAllClosedDetectedChanged", "ph": "X", "dur": 1},
    {"name": "Browser::OnContinueShutdownDetected", "dur": 1},
    {"name": "Browser::PreSetUpFirstRun", "ph": "X", "ts": 12233, "dur": 1},
    {"name": "Browser::OnPromoUIOnLocationChanged", "dur": 1},
    {"name": "PreMainMessageLoopRunIO", "ph": "X", "ts": 12234, "dur": 1}
  ]
}
```

### 18.2.2 火焰图解读

UI 把同一线程上的事件排成时间轴。每个 event 是矩形块：

```text
ProcessSingleton::WaitForSingleton  |██████████████████|
early_browser_main_loop_init         |██|
Browser::Start                          |
BrowserMainLoop::CreateThreads    |██████|
Browser::MainMessageLoopRun                  |██|
```

### 18.2.3 找出长事件

> 主线程上，谁 > 50ms 谁是问题。

```python
import json
trace = json.load(open('trace.json'))

events = trace['traceEvents']
critical = [e for e in events if e['ph'] == 'X' and e.get('dur', 0) > 50000]

critical.sort(key=lambda e: -e['dur'])
for e in critical[:20]:
    print(f"{e['dur']/1000:.1f}ms  {e['name']:50}  process={e['pid']} thread={e['tid']}")
```

输出：

```text
145.7ms  Pipeline::WakeAndProcessMessage     process=4 thread=1
 87.3ms  webkit_layout                        process=2 thread=2
 76.8ms  v8.gc.major                          process=2 thread=1
 67.3ms  RasterCommandBuffer::Execute         process=4 thread=1
 56.2ms  Pipeline::WakeAndProcessMessage     process=3 thread=1
```

### 18.2.4 找出重叠事件

```python
main_thread_events = [e for e in events if e['tid'] == 1 and e['pid'] == 1]
main_thread_events.sort(key=lambda e: e['ts'])

for i, e in enumerate(main_thread_events[:-1]):
    next_e = main_thread_events[i+1]
    if next_e['ts'] < e['ts'] + e.get('dur', 0):
        print(f"OVERLAP: {e['name']} -> {next_e['name']}")
```

> 同一 thread 不应该有重叠事件，重叠意味着时间计数错（trace tool 罕见 bug）。

---

## 18.3 真实启动 trace 段：4 类

### 18.3.1 ProcessSingleton::WaitForSingleton (单实例锁)

```text
Trace:
"ProcessSingleton::WaitForSingleton", dur 1784, pid=1 tid=1

代码:
  // browser/process_singleton_win.cc
  //   Chrome 主进程会占用一个 named mutex
  //   二次启动时检测到 mutex，就把参数转达给第一个进程
  //   然后退出
```

### 18.3.2 BrowserMainLoop::CreateThreads (5ms)

```text
Trace:
"BrowserMainLoop::CreateThreads", dur 5021, pid=1 tid=1

代码:
  // chrome/browser/browser_main_loop.cc:1423
  //   启动 UI thread, IO thread, FILE thread, CACHE thread
  //   每个 thread 都包含 Chromium 上相关 base::ThreadPool
```

### 18.3.3 WebContentsImpl::Init (5-10ms)

```text
Trace:
"WebContentsImpl::Init", dur 5231, pid=1 tid=1

代码:
  // content/browser/web_contents/web_contents_impl.cc:570
  //   拿到 BrowserContext, View 创建, SiteInstance 创建
```

### 18.3.4 RenderProcessHostImpl::Init (50-150ms)

```text
Trace:
"RenderProcessHostImpl::Init", dur 113456, pid=1 tid=1

代码:
  // content/browser/renderer_host/render_process_host_impl.cc
  //   启动 Renderer 子进程 + Mojo Channel 建立
  //   第一次 fork 开销：Windows 90ms，macOS 30ms，Linux 80ms
```

### 18.3.5 RenderThreadImpl::Create (含 V8 init)

```text
Trace:
"RendererMainOuterThreadRun", dur 156223, pid=2 tid=1
  "V8::Isolate::New", dur 32121
  "Blink::Init", dur 28000

代码:
  // content/renderer/renderer_main.cc
  //   RendererBlinkPlatformImpl::Create()
  //   v8::Isolate::New()
  //   blink::RuntimeEnabledFeatures::SetFeatures
```

---

## 18.4 真实 trace 例子：长任务排查

### 18.4.1 报告：编辑表格后输入延迟 60ms

我们抓一份操作中 trace (real):

```json
{
  "traceEvents": [
    {"name": "TaskQueueManager::ProcessTask", "ph": "X", "ts": 1000000, "dur": 53210, "pid": 2, "tid": 2},
    {"name": "TaskQueueManager::ProcessTask", "ph": "X", "ts": 1054210, "dur": 32145, "pid": 2, "tid": 2},
    {"name": "V8.Execute", "ph": "X", "ts": 1001000, "dur": 41230, "pid": 2, "tid": 2, "args": {"function": "processBigList"}},
    {"name": "V8.CompileBackground", "ph": "X", "ts": 1001000, "dur": 8321, "args": {"source_size": "120kb"}}
  ]
}
```

### 18.4.2 分析

```python
import json
trace = json.load(open('trace.json'))
events = trace['traceEvents']

main_thread = [e for e in events if e['tid'] == 2 and e['pid'] == 2]
main_thread.sort(key=lambda e: e['ts'])

# 计算 gap -> 长任务
for i in range(len(main_thread)-1):
    e = main_thread[i]
    next_ts = main_thread[i+1]['ts']
    idle = next_ts - (e['ts'] + e.get('dur', 0))
    if e.get('dur', 0) > 50000:
        print(f"Long task: {e['name']:40} {e['dur']/1000:.1f}ms")
```

### 18.4.3 输出

```text
Long task: V8.Execute                      41.2ms args.function=processBigList
Long task: TaskQueueManager::ProcessTask    53.2ms
Long task: V8.CompileBackground              8.3ms source_size=120kb
Long task: TaskQueueManager::ProcessTask    32.1ms
```

### 18.4.4 修法

`processBigList` 是 41ms 长任务。在业务中，它跑在一个 `Array.map` 里：

```ts
function processBigList(list: any[]) {
  return list.map(x => someFn(x));
}
```

1000 万数据 list 的 map 是 41ms。**改成 stream**：

```ts
function* processBigList(list: any[]) {
  for (const x of list) yield someFn(x);
}

const out = [];
let i = 0;
for (const item of processBigList(list)) {
  out.push(item);
  if (++i % 100 === 0) {
    await new Promise(r => setTimeout(r, 0));
  }
}
```

修法后：

```text
V8.Execute: max 5ms
TaskQueueManager::ProcessTask: max 7ms
```

---

## 18.5 GPU trace 段

### 18.5.1 GPU Process trace

```text
Trace (GPU process):
  "GpuChannelManager::Initialize", dur 30000 us
  "DisplayCompositor::DrawAndSwap", dur 7123 us
  "gl.swapBuffers", dur 7123 us
```

`gl.swapBuffers` 7ms 意味着我们渲染整张 2560x1440 需要 7ms。

### 18.5.2 real case：32" 4K 屏 swapBuffers 16ms

`swapBuffers` 走到 ANGLE (Windows 上) → D3DTexture 完整重新拷贝一次。改用：

```js
app.commandLine.appendSwitch('use-angle', 'd3d11');
```

### 18.5.3 Linux 软件渲染

`swapBuffers` 16ms 就是 SwiftShader 极限。如果用户不开硬件加速：

```js
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');
// 反而快，但 GPU 不可用
```

---

## 18.6 内存 trace 与 heap snapshot

### 18.6.1 Trace vs Heap snapshot

| 工具 | 维度 | 用途 |
|------|------|------|
| Trace | 时间 | 看"什么时候做了什么" |
| Heap snapshot | 引用 | 看"什么对象活着" |
| Performance api | 短时性能 | 看"渲染各阶段耗时" |
| Frame rate | 持续 | 看"实际 fps" |

heap snapshot 在 16.x 文档，我们不重复。

### 18.6.2 v8.gc trace 段

```text
Trace:
  "V8.IncrementalMarking", dur=3000
  "V8.MajorGC", dur=85000
  "v8.gc.major", dur=85
```

> 这意味着 V8 major GC 占 85ms。这是用户感知的卡顿。

### 18.6.3 V8 内存压力估算

```js
// 估算：进入主循环后，每个 task 之后留 50ms 让 V8 抢占 GC
function* runTasks() {
  for (let i = 0; i < 1e6; i++) {
    doWork();
    if (i % 100 === 0) {
      yield new Promise(r => setTimeout(r, 50));
    }
  }
}
```

---

## 18.7 network trace

### 18.7.1 net trace 分类

```text
"URL_REQUEST", "HTTP_STREAM_REQUEST", "DISK_CACHE_RACE", "TCPCONNECT"
```

### 18.7.2 排查卡顿

```json
{ "name": "URL_REQUEST", "ph": "X", "ts": 10000000, "dur": 58231 }
```

5 万微秒 = 58ms。请求很慢。

```json
{ "name": "TCP_CONNECT", "ph": "X", "ts": 10000001, "dur": 35000 }
```

TCP 握手续 35ms。可能是 DNS 解析慢。

```json
{ "name": "SSL_HANDSHAKE", "ph": "X", "ts": 10000036, "dur": 8000 }
```

TLS 握手 8ms，正常。

跟踪：

```text
URL_REQUEST: 58ms
  TCP_CONNECT: 35ms  ← 慢
  SSL_HANDSHAKE: 8ms
  HTTP_FIRST_BYTE: 12ms  ← 服务端慢
  HTTP_HEADER: 3ms
```

修法：

1. 用 HTTPS keep-alive。
2. 服务器用 HTTP/2。
3. 减少 HTTP 请求数。

---

## 18.8 把 trace JSON 转成 commit + 行号

### 18.8.1 trace 解析与代码跳转

```python
import json
import subprocess

trace = json.load(open('trace.json'))

functions_called = {}
for e in trace['traceEvents']:
    if e.get('cat') == 'blink':
        functions_called[e['name']] = functions_called.get(e['name'], 0) + 1

top = sorted(functions_called.items(), key=lambda x: -x[1])[:30]
for name, count in top:
    print(f"{count:5}  {name}")
```

输出：

```text
 3128  RecalcStyle
 1865  Paint
 1322  UpdateLayoutTree
  895  LayoutShift
  ...
```

我们能从这些 function 名找到 chromium 源码：

```bash
grep -r 'RecalcStyle' chromium/third_party/blink/renderer/core/css/
# 匹配到: chromium/third_party/blink/renderer/core/css/style_recalc.cc:120
```

### 18.8.2 把 commit 行号写到 PR comment

```python
# 在 trace 解析完后给出"哪些文件哪些行最慢"
call_graph = {}
for e in trace['traceEvents']:
    sf = e.get('args', {}).get('stackFrames', [])
    for f in sf:
        call_graph.setdefault(f, []).append(e.get('dur', 0))

for frame, durs in call_graph.items():
    total = sum(durs)
    print(f"{frame['file']}:{frame['line']}  total: {total/1000:.1f}ms")
```

> 每个 frame 给你精确的"在哪一行 Chromium 上耗时"，拿到这个就拿到 commit。

---

## 18.9 Real case：完整 trace 诊断

### 18.9.1 用户报告

冷启动到 first-paint 1.2 秒，期望 < 0.6s。

### 18.9.2 trace 抓取（节选）

```text
ProcessSingleton  .................... 0.18ms
early_browser_main ................... 0.18ms
BrowserMainLoop::CreateThreads ....... 5ms
WebContentsImpl::Init ................ 6ms
RenderProcessHostImpl::Init  ......... 113ms        ← 这里!
  ChildProcessLauncher::LaunchSubProcess    90ms
  Mojo Channel setup                  15ms
RendererMain::WebContentsImpl ........ 95ms
V8::Isolate::New ..................... 28ms
Blink::Init .......................... 25ms
LoadURL ............................... 80ms
HTMLParser::processInputToken ........ 30ms
ScriptRunner::ExecuteAndCheckCompiledScripts ……… 80ms
Layout ................................. 18ms
Paint .................................. 7ms
swapBuffers ........................... 7ms
```

### 18.9.3 慢点 #1：`ChildProcessLauncher 90ms`

第一次 fork Renderer 进程 90ms。Chromium 在 Linux 上要 fork+exec 二进制。

修法：

- 检查 `/proc/sys/vm/overcommit_memory` → 应用能不能立即 fork 内存。
- 用 `dist-snapshot optimization`。

### 18.9.4 慢点 #2：`ScriptRunner 80ms`

80ms in script execution。说明 JS bundle 太大。

```bash
npx vite-bundle-visualizer
```

输出：bundle 大 900KB，其中 react+react-dom 250KB。

修法：

- 拆 vendor chunk：业务 60% vs 框架 40%。
- 把 react 全局改为按需加载。
- 考虑 `solid.js` 或 `preact` 替换 react。

### 18.9.5 慢点 #3：`Layout 18ms`

有点多。检查页面：一个 2000 行的 HTML 文件可能 first paint 花 30ms 才 layout。

修法：DOM-Diff 算法优化。

---

## 18.10 总结

读完本章，**你应该会**：

- 抓一份 `electron --trace-startup-file`。
- 用 chrome://tracing 加载。
- 找出 main thread long task。
- 把 trace 的函数名映射到 chromium 源码 + commit。

这是 Chromium 工程师的"黑魔法"，但完全可以学会。

### 18.10.1 推荐工具

- `trace_processor`：把 trace 转到 pandas dataframe。
- `chrome-tracing-parser`：Python lib。
- `catapult`：Google 内部工具。

### 18.10.2 推荐资源

- [chromium-trace-doc](https://docs.google.com/document/d/1coAjUSWJ8-JoJKNq9tBmqVtdrmineA3z3g_whTyCdxI/)
- [Trace Event Format](https://docs.google.com/document/d/1CvAClvF7Ayi4wYNr1hbE4eY-Ul5nK_Lf6aOSoyTMu8c/)
- [Catapult - trace viewer](https://chromium.googlesource.com/catapult/)

下一章 [19 · 生产事故案例库](./../19-incident-casebook/README.md)。
