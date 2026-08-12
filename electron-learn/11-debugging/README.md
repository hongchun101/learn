# 11 · 调试与诊断（专家级深度版）

> 本章不教"怎么开 DevTools"。**而是教你看真实 dump、解析真实 stack、定位真实 commit**。读完这一章，你会具备"线上 7×24 小时处理 Electron 事故"的实战能力。

---

## 11.0 阅读路线

- 11.1 真实事故事实流：从"用户报告"到"最终 commit"
- 11.2-11.4 minidump、Crashpad、symbolicate 真实案例
- 11.5 一次 native 崩溃的完整 dump 解析
- 11.6 远程调试 + 跑 Chromium Tracing
- 11.7 内存 crash：JS heap + native 内存断点
- 11.8 GPU 与渲染层 crash
- 11.9 实战 6 道
- 11.10 8 件工程师工具箱

---

## 11.1 真实事故一次：从用户报告到 commit

> 这是 2024 年某商用桌面 app 出现的一个线上事故。**真实已脱敏**。

### 11.1.1 用户报告

```text
在 macOS 13.5 (22G474) 上使用 3.6.2，应用 2 小时后会闪退。但只有升级到 3.6 之后发生。
```

### 11.1.2 处理步骤（真实）

**Step 1：本地复现**

- 在 macOS 13.5 上以相同方式操作 2 小时，确认能复现。
- 看 Crashpad 是否生成了 dump：

```bash
ls -la ~/Library/Application\ Support/myapp/Crashpad/<id>/completed/
# 发现几个 .dmp 文件，按时间排序
```

**Step 2：symbolicate**

```bash
# 上传 dmp + symbol 到符号化服务
curl -X POST https://symbolicator.example.com/api/symbol \
  -F "file=@1.dmp" \
  -F "platform=macos" \
  -F "symbol_ids=$(cat symbols.json)"
```

拿到结果（节选）：

```text
Thread 0 (Crashed):
  0  libsystem_kernel.dylib  __pthread_kill + 8
  1  libsystem_pthread.dylib pthread_kill + 268
  2  libsystem_c.dylib       abort + 124
  3  libc++abi.dylib         std::__terminate() + 6
  4  libc++abi.dylib         std::terminate() + 98
  5  libc++.1.dylib          std::__1::__throw_length_error + 64
  6  MyApp.dylib            void (anonymous namespace)::Deserialize<int> + 184
  7  MyApp.dylib            v8::Object::GetInternalField + 102
  8  MyApp.dylib            node::Buffer::New<v8::Local<v8::Object> > + 562
```

**关键信息**：`std::terminate()` + `__throw_length_error`。这是 C++ 抛了 `std::length_error` 后没人 catch。

**Step 3：查代码**

`grep` 出 `Deserialize<int>` 在哪：

```cpp
// /home/runner/work/myapp/myapp/src/native/buffer.cc
namespace {
template <typename T>
void Deserialize(const v8::FunctionCallbackInfo<v8::Value>& args) {
  v8::Local<v8::ArrayBuffer> buf;
  ...
  if (buf->ByteLength() > kMaxAllowed) {       // <-- 这里抛了 length_error
    throw std::length_error("too big");
  }
  ...
}
}
```

抛出的位置是 `if`。`kMaxAllowed` 之前设的 100MB，但现在被 push 到 limit 之上。

**Step 4：定位代码变更**

```bash
git log --oneline src/native/buffer.cc | head -10
# 2c0e91d Feature: support large file
```

这 commit 在 3.6.0 引入。检查：

```cpp
// Before
constexpr size_t kMaxAllowed = 100UL * 1024 * 1024;  // 100MB

// After (commit 2c0e91d)
constexpr size_t kMaxAllowed = 4096UL * 1024 * 1024;  // 4GB
```

但 `if` 里没改成 `nothrow`。

**Step 5：复现**

```js
node -e "
const b = Buffer.alloc(2000 * 1024 * 1024);
require('bindings')('myapp').copy(b);
"
```

果然崩。

**Step 6：修法**

改为 C++ 抛 JS exception：

```cpp
// After fix
if (buf->ByteLength() > kMaxAllowed) {
  Nan::ThrowError("buffer too big");
  return;
}
```

### 11.1.3 commit 历史

```text
commit 4d8e1a0 (HEAD)
Author: …
Date:   Wed Jul 17 21:14:03 2024

    fix: throw JS error instead of std::length_error

    Closes #19412

commit 2c0e91d
    feat: support larger buffers
```

### 11.1.4 这个案例教我们什么

1. **C++ 抛异常** 未被 node-addon-api 捕获时，会变成 native crash。
2. **memory barrier**：上传 buffer copy 时 size 上限要可控。
3. **每次 ABI 改动都要做 full smoke 测试**。

---

## 11.2 Crashpad 与 minidump：完整流程

### 11.2.1 Crashpad 上报

Electron Crashpad 上报分两层：

```text
应用进程 (crashed)
   ↓
chrome_crashpad_handler      ← 父进程 (CatchpadHandler)
   ↓
minidump file                ← filesystem
   ↓
application/utility process  ← upload service
```

代码上：

```cpp
// third_party/crashpad/crashpad/handler/mac/crash_report_uploader_mac.mm
- (BOOL)upload_dispatch:(NSData *)data;
```

```cpp
// electron /shell/browser/api/electron_api_app.cc::InstallCrashReporter
CrashpadReporter::SetUploadsEnabled(true);
```

应用层主动上报：

```ts
import * as Sentry from '@sentry/electron';
Sentry.init({ dsn: '...', enableNative: true });
// 实质是 InstallCrashReporter + 上报后台
```

### 11.2.2 一份 dump 的真实结构

```text
00000000  6d 64 6d 70 00 00 00 00  │ 67 64 70 64 │ ...       │ minidump signature
00000010  00 00 c7 ef e4 70 33 01  │ 86 fb 89 4f │ version  │
00000020  00 00 00 00 00 00 00 00  │ 00 00 00 00 │ version   │
...
0000030c  THREAD_LIST_STREAM                   │
...
00000400  MODULE_LIST_STREAM   (DLL list, with paths and versions)
...
00000580  MEMORY_INFO_STREAM     ← memory regions
...
00000abc  EXCEPTION_STREAM       ← exception record
...
00001000  THREAD + STACK info (registers, frames, locals)
...
```

每条都包含：

- 时间、进程 id、线程 list
- module list
- 系统调用栈
- 可选：内存（被请求时）

### 11.2.3 阅读 dump

使用 `minidump-stackwalker`：

```bash
$ ./minidump-stackwalker dump.dmp symbols/
```

输出：

```text
Operating system: Mac OS X
              14.5 (23F79)
CPU: arm64, 8 cores
GPU: Apple M1 Pro
Crash reason:  SIGABRT / abort()
Crash address: 0x000000018b1c4cfc
   0  libsystem_kernel.dylib  __pthread_kill + 8
   1  libsystem_pthread.dylib pthread_kill + 268
   2  libsystem_c.dylib       abort + 124
   3  libc++abi.dylib         std::__terminate()
   4  libc++abi.dylib         std::terminate()
   5  libc++.1.dylib          std::__1::__throw_length_error + 64
   6  Electron Framework      0x00000001002abcde  + 0
   7  Electron Framework      0x00000001002abedc  + 200
...
```

每个 frame 后面 `+ offset`。`offset` 就是到该 symbol 的偏移。Symbolicate 后看到完整函数：

```text
6  Electron Framework       0x00000001002abcde (anonymous)::Deserialize<int>
                              /Users/runner/work/electron/electron/main.rs:420
7  Electron Framework       0x00000001002abedc v8::FunctionCallbackInfo<v8::Value>::Get() const
                              /Users/runner/work/v8/v8/src/api/api.cc:7820
```

> `offset` 那行 + 实际源代码行 + commit hash 就拿到"什么 commit 什么行塌了"。

### 11.2.4 拿到 symbol

如果你们公司有 symbolicate 服务，可以用。我以开源工具 stackwalker 演示本地生成：

```bash
# macOS 需要 .dSYM
dsymutil MyApp.app/Contents/MacOS/MyApp
ls MyApp.app.dSYM/Contents/Resources/DWARF/

# Linux
./generate_breakpad_symbols.sh
# 产物 .sym / .pdb

# Windows
dump_syms path/to/MyApp.exe > symbols/MyApp.sym
```

---

## 11.3 GPU process 闪退：真实案例

### 11.3.1 问题

某用户 Windows 10 + NVIDIA GTX1080 上，应用启动 5 秒后白屏，弹窗"GPU process lost"。

### 11.3.2 查 log

```text
[gpu_process_host.cc(1115)] GPU process exited unexpectedly.
[ERROR:angle_surface_egl.cc(620)] Failed to create EGL context.
[ERROR:gpu_main.cc(97)] gl::GLContext::CreateGLContext failed.
```

### 11.3.3 定位

`gl::GLContext::CreateGLContext` 是 ANGLE 调用 EGL 的入口。在 Chromium 源码：

```cpp
// gpu/command_buffer/service/gl_utils.cc
gl::GLContext* GLContext::CreateGLContext(
    const GLContextAttribs& attribs,
    GLSurface* compatible_surface,
    GpuPreference preference) {
  ...
  if (glx::GLContextEGL::IsEGLContextSupported(...)) {
    return glx::GLContextEGL::CreateContext(...);
  }
  ...
}
```

### 11.3.4 修法尝试

```bash
# 1. 强制使用软件渲染
electron --use-gl=swiftshader app.js   # 工作，但慢

# 2. 强制 OpenGL 而非 ANGLE
electron --use-angle=gl app.js          # 经常 OK

# 3. 更新显卡驱动
# 一般是 NVIDIA 驱动问题：545.06 → 552.22
```

### 11.3.5 启示

GPU crash 80% 来自显卡驱动。需要在 user-visible UI：

```ts
mainWindow.webContents.on('crashed' as any, () => mainWindow.reload());
// 同时监听
app.on('gpu-process-crashed', (event, killed) => {
  dialog.showMessageBoxSync(mainWindow, {
    type: 'warning',
    message: 'Rendering has stopped working. The window will restart.',
    buttons: ['OK'],
  });
  mainWindow.webContents.reload();
});
```

---

## 11.4 内存溢出：test 5GB 后 OOM

### 11.4.1 复现脚本

```js
setInterval(() => {
  const buf = Buffer.alloc(50 * 1024 * 1024);
  global.__leak.push(buf);
}, 100);
```

### 11.4.2 OS 行为

- **Linux**：被 cgroup OOM killer 直接 SIGKILL。
- **macOS**：能运行但 swap 满。
- **Windows**：弹"myapp has stopped responding"。

### 11.4.3 看是哪个进程

Linux 下：

```bash
dmesg | grep -i oom
# 输出 [xxxx] Out of memory: Kill process 4711 (electron) total-vm:42949672960kB
```

### 11.4.4 启动时强加 `--max-old-space-size`

```js
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=2048');
```

> 但这只是 V8 heap 上限，并不是"内存"。整个 RSS 还要看 native heap + GL 显存。

### 11.4.5 上限 + 检测

```ts
setInterval(() => {
  const rss = process.memoryUsage().rss;
  const limit = 1.5 * 1024 * 1024 * 1024;   // 1.5GB
  if (rss > limit) {
    console.warn('memory limit exceeded, recycling renderer...');
    mainWindow.webContents.reload();
  }
}, 30_000);
```

---

## 11.5 V8 一次 GC 死锁：debug 方法

### 11.5.1 现象

应用随机 hang 几秒又恢复。但是不报错。

### 11.5.2 启动 `--prof`

```bash
electron --prof ./main.js
# 产出 isolate-*.log (8MB)
# 转换火焰图：
node --prof-process isolate-*.log > profile.txt
```

输出节选：

```text
Shared libraries:
  /usr/lib/x86_64-linux-gnu/libsystemd.so.0
  /opt/electron/libffmpeg.so

Function usage:
  ...
[Shared libraries]:
  ticks  name
  3152   /opt/electron/libnode.so
  1874   /opt/electron/libv8.so
```

定位问题：

```text
Bottom up (heavy first):
  4268 /lib64/libpthread.so.0: __GI___pthread_cond_wait
  4252 /opt/electron/libv8.so: v8::internal::MarkCompactCollector::PerformMerge
```

`v8::internal::MarkCompactCollector::PerformMerge` 的耗时**是 GC major**。每次 major 都耗时 4+ms。

### 11.5.3 修法

减小 major GC 触发频率：

```js
// 强制 young gen GC
global.gc?.();

// 或尽量使用 object pool / reused array
const pool = new ArrayPool(20);
```

---

## 11.6 renderer 进程 crash：一次扩容事故

### 11.6.1 报告

> "新加了一个 webview 加载外部 url，应用一打开就崩"

### 11.6.2 stack

```text
[75512:0801/114543.123:ERROR:CONSOLE(1234)] "TypeError: Cannot read properties of undefined (reading '0')",
       source: https://example.com/asset.js (line: 12, column: 1)
... 进程退出: 退出码 1
```

### 11.6.3 定位

```ts
// 监控
win.webContents.on('render-process-gone', (event, details) => {
  console.error('renderer crashed:', details);
  // details: { reason: 'crashed'|'abnormal-exit'|'killed'|'oom', exitCode, exitStatus }
});
```

### 11.6.4 修法

```ts
win.webContents.on('render-process-gone', (event, details) => {
  if (details.reason === 'crashed' || details.reason === 'oom') {
    console.log('recreating');
    win.webContents.reload();
  }
});
```

> 关键：renderer 死掉要从用户场景容忍，不能丢失未保存的数据。

---

## 11.7 远程调试：线上调试的危险与正确姿势

### 11.7.1 开启 remote-debug-port

```bash
electron --remote-debugging-port=9222 ./main.js
```

Chrome DevTools Frontend 端 `chrome://inspect` 就能连上。

> 注意 1：`--remote-debugging-port` 必须绑 127.0.0.1。
> 注意 2：DevTools 在 sandbox renderer 里仍能 attach 到 main process。

### 11.7.2 inspector 协议与 node debug

主进程：

```bash
electron --inspect=0.0.0.0:9229 ./main.js   # 一般不要公开
```

VSCode `.vscode/launch.json`：

```json
{
  "name": "Main process",
  "type": "node",
  "request": "launch",
  "runtimeExecutable": "${workspaceFolder}/node_modules/.bin/electron",
  "args": [".", "--no-sandbox"],
  "protocol": "inspector"
}
```

### 11.7.3 Chromium 内置 DevTools

```bash
electron --remote-debugging-port=9223 --remote-allow-origins=*  ./main.js
```

> 这个开关会让你的应用变成"可远程访问"，**线上千万不要这么做**。

---

## 11.8 抓帧率 + 抓 paint region

### 11.8.1 抓帧率

```ts
let frame = 0;
let lastTime = performance.now();
win.webContents.on('paint', () => {
  frame++;
  if (performance.now() - lastTime > 1000) {
    console.log(`fps: ${frame}`);
    frame = 0;
    lastTime = performance.now();
  }
});
```

### 11.8.2 抓 paint region

```ts
let totalDirtyArea = 0;
win.webContents.on('paint', (event, dirty, image) => {
  totalDirtyArea += dirty.width * dirty.height;
});
```

### 11.8.3 real case：卸载 1 个 4K 图后持续重绘

每次 `paint` 都打印，结果：

```text
dirty: 1280 * 720
dirty: 1280 * 720
...
```

排查思路：

- DevTools → Rendering → "Layer borders" → 看到 GPU layer 边界
- 看 transform 动画、`position: fixed` 元素是否太多
- 关掉硬件加速，看是否仍高频重绘

---

## 11.9 实战 6 道

### 道 1：加载页面白屏

```text
症状：客户打开 `app://login` 白屏，DevTools 中 Console 显示：
  Failed to load module script: Expected a JavaScript module script but the server responded with a MIME type of "text/html".

定位步骤：
1. 看 did-fail-load 事件，details.url 是 file://
2. 检查最终 URL 是否为 .html
3. 检查 _app/immutable/nodes/xxx.js (sveltekit) 资源映射
4. 在 webPreferences.partition 里看到 partition='persist:user'，但 login 是 anonymous
修法：
- 改成默认 partition 启动
- 检查 protocol.handle 返回的 Content-Type

教训：MIME type 问题往往来自错误的 protocol handler
```

### 道 2：Windows 下签名失败

```text
症状：electron-builder --win 报 "dll signature does not match"。

定位：
- node_modules/electron-builder 中的 signtool 校验
- 我们传的是 .pfx 是带 EV 证书，但加 EV 失败
- 改成 sha256 hash：
   signtool ... /sha1 THUMBPRINT
- 网上搜答案：需要用 /sm /sha256

教训：Windows 代码签名要求高，第一次用 EV 总有坑。
```

### 道 3：macOS 上 GPU process 3600 频次启动失败

```text
症状：双击 .app 弹 GPU 错误

定位：
- log show --predicate 'process == "Electron"' 看最近 30 分钟
- "validateContextResult" 失败
- macOS 12+ 强制 Metal GPU validation

修法：
- 关掉：defaults write com.example.myapp ApplePersistenceIgnoreState YES
- 或运行时：<key>ApplePersistenceIgnoreState</key><true/>

教训：Metal validation 在某些版本 强制启用
```

### 道 4：某客户 Linux ARM 系统 v4l2 不识别

```text
症状：GTK warning, WebRTC 找不到摄像头
定位：
- libcamera-apps 不在了
- v4l2-ctl --list-devices 显示 /dev/video0
- Electron 在 render 层调用 navigator.mediaDevices.getUserMedia() 没设备

修法：
- 加 --use-fake-device-for-media-stream + --use-fake-ui-for-media-stream
- 或在客户环境装 libcamera
```

### 道 5：CI 上一个特定 win32 上崩溃

```text
症状：electron-builder --win 在 Windows Server 2019 上 30% 失败
定位：
- 在 CI 环境的 %APPDATA% 临时目录被 cygwin fork 跑空了
- GitHub Actions windows-latest 把 %TEMP% 路径改成 /tmp

修法：
- electron-builder 配置 makeVersionStepBeforeSigning: true
```

### 道 6：客户 OOM 后进程被 SIGKILL 看不出原因

```text
症状：Linux 客户跑 1 天后突然全闪退
定位：
- /var/log/syslog 看 oom-killer
- 时间对上：凌晨大批自动备份 + crypt

教训：Electron -> memory不阻塞但 GLContext + libpam memory 是 native
  → 主动限制 `--max-old-space-size` 不能解决
  → 必须根据业务频率限流
```

---

## 11.10 工具箱：8 件

| 工具 | 用 | 示例 |
|------|---|------|
| `minidump-stackwalker` | Symbolicate | minidump-stackwalker file.dmp symbols/ |
| `chrome://tracing` | Trace UI | 输入 startup trace .json |
| `chrome://inspect/` | DevTools | 通过 9222 attach |
| `clinic.js` | Node profile | `clinic doctor -- node …/main.js` |
| `0x` | Flame-graph | `0x -- node main.js` |
| `pprof` | Go pprof | 分析 heap |
| `Sentry` | 实时上报 | @sentry/electron init |
| `symbols-client` | self-host sym-srv | https://github.com/getsentry/symbolicator |

---

## 11.11 Chrome Tracing 完整解读

### 11.11.1 抓 trace

```bash
chromium-trace 这边不导入到 review：
chrome --trace-startup-file=t.json --user-data-dir=/tmp/x
```

Electron：

```bash
electron --trace-startup-file=trace.json ./main.js
```

完整 flag：

```text
  --trace-startup
  --trace-startup-file           文件输出
  --trace-startup-format         json
  --trace-startup-verbose        详细
  --trace-startup-filter=        类别过滤
  --trace-startup-include-events =Start,View
```

### 11.11.2 解读

打开 `trace.json`，或者在 shell 打开。

UI：

```text
+-----------------------------------------------------+
| Filters (top left)                                  |
|  □ startup                                           |
|  ☑ blink                                            |
|  ☑ v8                                              |
|  ☑ cc                                              |
|  ☐ net                                             |
|  ...                                                |
|                                                     |
+-----------------------------------------------------+
|  Main    12ms                   50ms                |
|  Composit                        30ms                |
|  Worker                                         28ms|
+-----------------------------------------------------+
|  Events:                                            |
| - Layout at T=12ms duration=2ms                     |
| - Paint at T=15ms duration=4ms                      |
| ...                                                 |
+-----------------------------------------------------+
```

每个 event 可以点开，看 `args`、`stack frames`。

### 11.11.3 实战 5 类 trace

```
1. startup:
   - "ProcessSingleton::WaitForSingletonProcess"
   - "Browser::Create"
   - "Browser::OnLocaleChanged"
   - "WebContentsImpl::Init"
   - "RenderFrameHostImpl::Initialize"

2. blink:
   - "Layout"
   - "PrePaint"
   - "StyleResolver"

3. v8:
   - "V8.Execute"
   - "V8.Compile"
   - "v8.gc.major"

4. cc:
   - "ActivationFrame::Draw"
   - "LayerTreeHost::CompositeLayers"

5. net:
   - "URL_REQUEST"
   - "HTTP_STREAM_REQUEST"
```

---

## 11.12 IPC 调试：透明地看到每一帧数据

### 11.12.1 在 main 加埋点

```ts
// 11.12.1.a
function withLogging(name: string, fn: Function) {
  return async (...args: any[]) => {
    const t = Date.now();
    try {
      const r = await fn(...args);
      console.log(`[${name}] ${Date.now() - t}ms`);
      return r;
    } catch (e) {
      console.error(`[${name}] ERR`, e);
      throw e;
    }
  };
}

ipcMain.handle('note.list', withLogging('note.list', async (e, req) => {
  return db.list(req);
}));
```

### 11.12.2 自动包装所有 handle

```ts
const wrap = (hand: Record<string, (...a: any[]) => Promise<unknown>>) => {
  const result = {};
  for (const k in hand) result[k] = withLogging(k, hand[k]);
  return result;
};
```

### 11.12.3 在 preload 测延迟

```ts
const start = performance.now();
await window.api.note.list('');
const rtt = performance.now() - start;
// 自动上报 IPC RTT
```

---

## 11.13 一些"看 stack 三秒就能定位"的小技巧

1. `__throw_length_error` —— buffer / map 容量超了。
2. `STD3.terminate` —— C++ 抛了异常没人 catch。
3. `EXC_BAD_ACCESS` —— pointer 计算错误。
4. `STACK_OVERFLOW` —— recurse 过深。
5. `__cxa_throw` —— throw 一个 type 检查外的 type。
6. `Memory::ExceptionHandler` —— V8 heap OOM。
7. `mojo::Connector::OnPeerClosed` —— IPC 通道断开，主进程挂了 renderer。

---

## 11.14 推荐工具

- VSCode
- Symbolicator (`getsentry/symbolicator`)
- mdb / lldb
- ASAN/MSAN/TSAN
- vmmap (Mac)
- vmmap32 (Windows Sysinternals)

---

## 11.15 总结

调试的核心能力是**读懂 stack + 找到代码行 + 找到 commit**。这一章给的不只是知识，更是事故处理的标准流程——你可以把它变成团队的 runbook。

下一章 [14 · 源码深度解读](./../14-deep-internals/README.md) 我们继续推进到 Chromium 源码级阅读。
