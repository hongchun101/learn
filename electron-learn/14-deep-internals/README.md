# 14 · 源码深度解读（专家级深度版）

> 上个版本只是"指向文件"。这一版我们**真正逐行 walk**，每行都给出它解决了什么问题。你读完这一章，应该能在 Chromium 仓库的代码海里知道自己在哪儿。

---

## 14.0 阅读建议

- 完整走一个 API（比如 `BrowserWindow`）需要 30 分钟。
- 推荐工作流：先读"代码"再看"注释"，每个 PR walk 一次一个月就能上手。

Electron 当前主分支对应 Chromium 130+。

---

## 14.1 BrowserWindow：从 JS 到屏幕的全流程 walk

### 14.1.1 调用链 8 步

```text
JS: new BrowserWindow({…})
 └─ lib/browser/api/browser-window.js
     └─ electron.BrowserWindow (C++ binding via gin)
        └─ electron_api_browser_window.cc::New (constructor)
           └─ electron_api_base_window.cc::BuildBrowserWindow
              └─ NativeWindow::Create
                 ├─ native_window.cc::CreateType(type, ...)
                 │  ├─ NativeBrowserWindowViews (Linux/Windows)
                 │  │  └─ views::Widget::Init
                 │  └─ NativeBrowserWindowMac (macOS)
                 │     └─ NSWindow init
                 └─ WebContents::Create
                    └─ content::WebContents::Create (in chromium)
```

### 14.1.2 第 1 段：JS 包装层（lib/browser/api/browser-window.js）

```js
// Excerpt from electron/lib/browser/api/browser-window.js

class BrowserWindow extends EventEmitter {
  constructor(options) {
    super();
    // 校验：在 renderer 创建会出错
    if (process.type === 'renderer') {
      throw new Error('BrowserWindow cannot be created in the renderer process.');
    }

    // 兜底设置
    options = {
      width: 800,
      height: 600,
      ...options,
      webPreferences: {
        nodeIntegration: false,    // historical default
        contextIsolation: true,    // default since 12
        nodeIntegrationInWorker: false,
        sandbox: false,            // historical default
        ...options.webPreferences,
      },
    };

    // 实际调用 C++ 构造
    Object.assign(this, electron.BrowserWindow(options));
  }

  loadURL(url, options) {
    return this.webContents.loadURL(url, options);
  }

  loadFile(filePath, options) {
    return this.webContents.loadFile(filePath, options);
  }

  // ...
}
```

> 关键：如果用户没设 `nodeIntegration`，我们兜底 `false`。
> 关键：用户传入的 `options` 与 Electron 安全默认走"merge"模式——这是安全开关设计哲学。

### 14.1.3 第 2 段：C++ Constructor (electron_api_browser_window.cc)

```cpp
// Excerpt from electron/shell/browser/api/electron_api_browser_window.cc

void BrowserWindow::New(gin::Arguments* args) {
  v8::Isolate* isolate = args->isolate();

  v8::Local<v8::Object> options;
  if (!args->GetNext(&options)) {                // (1)
    gin_helper::ErrorThrower(isolate).ThrowError(
        "BrowserWindow requires options.");
    return;
  }

  BrowserWindowOptions window_opts(args->isolate(), options);
  // 钩到 WindowList
  WindowList::AddWindow(this);
}
```

关键点：

1. `args->GetNext(&options)` 是 gin 的 `v8::Value::ToObject` 包装。
2. `BrowserWindowOptions` 在 electron_api_base_window.h 中定义：是"解析 options"的辅助结构体。
3. `WindowList::AddWindow(this)` 把新 window 注册到全局表，让 `getAllWindows()` 能找到。

`BrowserWindowOptions` 简化版：

```cpp
struct BrowserWindowOptions {
  BrowserWindowOptions(v8::Isolate*, v8::Local<v8::Object> opts) {
    // 解析每一个字段
    width = opts.Get("width", 800);
    height = opts.Get("height", 600);
    min_width = opts.Get("minWidth", 0);
    min_height = opts.Get("minHeight", 0);

    // webPreferences 是嵌套对象
    v8::Local<v8::Value> web_prefs;
    if (opts.Get("webPreferences", &web_prefs) && web_prefs->IsObject()) {
      web_preferences.Set(isolate, web_prefs.As<v8::Object>());
      // ConvertFromV8<WebPreferences>，internal binding 自动
    }

    // 还有 visible / paintWhenInitiallyHidden / show 等
    show = opts.Get("show", true);
    // ...
  }

  v8::Local<v8::Object> web_preferences;
  int width = 800, height = 600;
  bool show = true;
  bool paintWhenInitiallyHidden = false;
  bool transparent = false;
  // ...
};
```

### 14.1.4 第 3 段：WebContents::Create(electron_api_web_contents.cc)

```cpp
// Excerpt from electron/shell/browser/api/electron_api_web_contents.cc

std::unique_ptr<content::WebContents> WebContents::CreateFromWebPreferences(
    const WebPreferences& prefs,
    const GURL& src_url) {

  // 关键点：每个 WebContents 都需要 BrowserContext / SiteInstance
  content::BrowserContext* browser_context = ...;

  content::WebContents::CreateParams params(browser_context);

  // 是否离屏
  if (prefs.offscreen) {
    // 不进入真实窗口
    params.initially_hidden = true;
  }

  // 启动类型
  params.renderer_initiated_creation = false;
  params.guest_delegate = this;
  params.started_by = web_contents::CreatedBy::kBrowserInitiated;

  auto contents = content::WebContents::Create(params);
  // … 设置 post-create 配置
  return contents;
}
```

### 14.1.5 第 4 段：NativeWindow::Create(native_window.cc)

```cpp
// Excerpt from electron/shell/browser/native_window.cc

std::unique_ptr<NativeWindow> NativeWindow::Create(
    const electron::NativeWindow::Options& options,
    NativeWindowObserver* observer) {
  switch (options.type) {
    case NativeWindow::Type::kDesktop:
      return std::make_unique<NativeBrowserWindowViews>(
          options, observer,
          base::BindRepeating(&NativeWindow::NotifyWindowObservers));
    case NativeWindow::Type::kPanel:
      return std::make_unique<NativeBrowserWindowPanel>(...);
    case NativeWindow::Type::kToolbar:
      return std::make_unique<NativeBrowserWindowToolbar>(...);
    case NativeWindow::Type::kRemote:
      return std::make_unique<NativeWindowRemote>(...);
  }
}
```

我们看 `NativeBrowserWindowViews::NativeBrowserWindowViews`：

```cpp
// Excerpt from electron/shell/browser/native_browser_window_views.cc

NativeBrowserWindowViews::NativeBrowserWindowViews(
    const NativeWindow::Options& options,
    NativeWindowObserver* observer,
    base::RepeatingClosure& close_callback) :
    NativeWindow(options, observer),
    views::Widget::Observer(/* receiver */ this) {
  Init(&widget_, raw_view, root_view);
}

void NativeBrowserWindowViews::Init(views::Widget* widget, ...) {
  views::Widget::InitParams params(
      views::Widget::InitParams::TYPE_WINDOW);
  params.bounds = options.bounds;
  params.ownership = views::Widget::InitParams::WIDGET_OWNS_NATIVE_WIDGET;
  params.delegate = this;       // = WidgetDelegate
  params.remove_standard_frame = !options.frame;
  params.use_system_caption_bar = false;
  if (options.title_bar_style == "hiddenInset")
    params.type = views::Widget::InitParams::TYPE_WINDOW;
    // macOS 上 hiddenInset 用 NativeWindowMac

  widget->Init(std::move(params));    // ← 创建 OS 窗口
  widget->SetContentsView(raw_view); // ← 把 webview 装进来
  widget->Show();
}
```

`Widget::Init` 走的是 Chromium `views` 模块——核心在 `views/widget/widget.cc`，会在 Platform 创建对应 OS native window：

- macOS：NSWindow via Cocoa's NSWindow
- Linux：GTK3 via DBus (X11) / Wayland
- Windows：HWND (Win32 native window)

### 14.1.6 第 5 段：WebContents 与 Renderer Process

`content::WebContents::Create`：

```cpp
// Excerpt from content/browser/web_contents/web_contents_impl.cc

std::unique_ptr<WebContents> WebContents::Create(
    const WebContents::CreateParams& params) {
  return WebContentsImpl::Create(params);    // 跳到 impl
}

std::unique_ptr<WebContentsImpl> WebContentsImpl::Create(
    const CreateParams& params) {
  // 1. 拿 SiteInstance
  scoped_refptr<SiteInstance> site_instance = params.site_instance;
  if (!site_instance) site_instance = SiteInstance::Create(params.browser_context);

  // 2. 构造 impl
  auto contents = base::WrapUnique(new WebContentsImpl(/*..*/));

  // 3. 触发内部 Process，建立 RenderProcessHost (RPH)
  contents->Init(params);    // 在 Init 里创建 RPH / SiteInstance

  // 4. 如果没传 url，会等待 SetContent()
  if (params.url.is_valid()) {
    contents->GetMainFrame()->NavigateToURL(params.url);
  }

  return contents;
}
```

`content::WebContentsImpl::Init` 内部：

```cpp
// Excerpt from content/browser/web_contents/web_contents_impl.cc

void WebContentsImpl::Init(const WebContents::CreateParams& params) {
  // SetUp AppCache / ServiceWorker / etc.

  // 关键：创建 RenderProcessHost
  CreateRenderProcessHostIfNeeded();

  // 创建 RenderFrameHost
  CreateRenderFrameHost(...);
}
```

### 14.1.7 第 6 段：Renderer 进程

`content::RenderProcessHostImpl::Init`：

```cpp
// Excerpt from content/browser/renderer_host/render_process_host_impl.cc

void RenderProcessHostImpl::Init() {
  // 1. 找 channel
  mojo::InvitationHandle invitee;

  // 2. 启动子进程
  child_process_launcher_ = std::make_unique<ChildProcessLauncher>(
      /*..*/, std::move(invitee), GetProcessType(),
      /*..*/, &metrics_->RendererBufferIdToUMACrashReportID(), ...);

  // 等子进程：通过 Mojo 唤起 control channel
}
```

子进程是 `electron_utility` 或 `electron --type=renderer` 启动的真正进程。

Renderer 启动后：

```cpp
// Excerpt from content/renderer/render_main.cc

int RenderMain(const MainFunctionParams& params) {
  // 拿 IPC channel
  mojo::ScopedMessagePipeHandle ipc_channel = std::move(invitee->ExtractMessagePipe(0));
  // 创建 mojo 通道
  // 进入 blink / V8
  RenderThreadImpl::Create(std::move(params));
}
```

`RenderThreadImpl::Create`：

```cpp
// Excerpt from content/renderer/render_thread_impl.cc

void RenderThreadImpl::Create(blink::InterfaceProvider* remote_interfaces) {
  new RenderThreadImpl();
  // 启动主 message loop
  base::RunLoop::ScopedRun run_loop;
  // 等待 WebContents 来连接
}
```

`WebContents` ↔ `RenderFrameHost` ↔ `RenderProcessHost` ↔ 真正进程 这条链路，是 Chromium 的 **scaffold**。

### 14.1.8 第 7 段：V8 + Blink 启动

每个 renderer 都跑一个 V8 Instance。步骤：

```cpp
// Excerpt from content/renderer/renderer_blink_platform_impl.cc

void RendererBlinkPlatformImpl::InitializeV8() {
  v8::Isolate::CreateParams params;
  params.code_event_handler = ...;
  v8::Isolate* isolate = v8::Isolate::New(params);
  v8::Isolate::Scope isolate_scope(isolate);
  // 把 isolate bind 到 blink
  blink::BindV8ToBlink(isolate);
}
```

最终启动：

```cpp
// Excerpt from third_party/blink/renderer/core/frame/local_frame.cc

void LocalFrame::Init() {
  // 创建 FrameClient / FrameOwner / etc
  // 等收到 CreateChildFrame
}
```

至此一个 Window 就完整 appeared 在桌面上。

### 14.1.9 第 8 段：first paint

第一次 commit 在 vsync 时间点：

```cpp
// Excerpt from content/renderer/render_frame_impl.cc

void RenderFrameImpl::DidCommitAndDraw(...) {
  // 触发 'did-frame-finish-load' 对应
}
```

走 `cmd Buffer queue` 把 surfaces 推到 GPU Process；GPU Process 收到 raster command 把 layer 内容栅格化成 tile cache，最后合成上屏。

到这一步 BrowserWindow 这一帧才真实呈现。

---

## 14.2 一段 walk 的总结图

```text
JS                                              Screen
├── new BrowserWindow                          ────┐
↓                                                 │ ↑
lib/browser/api/browser-window.js                 │ │
↓                                                 │ │
electron.BrowserWindow (C++) (gin_helper)         │ │
↓                                                 │ │
BrowserWindow::New (electron_api_browser_window.cc) │ │
↓                                                 │ │
NativeWindow::Create (native_window.cc)           │ │
├── NativeBrowserWindowViews (Win/Linux)         │ │
↓                                                 │ │
views::Widget::Init (Chromium views)              │ │
↓                                                 │ │
OS window creation (Cocoa/GTK/HWND)               │ │ OS
↓                                                 │ │
WebContents::Create (electron_api_web_contents.cc)│ │
↓                                                 │ │
content::WebContents::Create (Chromium)           │ │
↓                                                 │ │
RenderProcessHost::Init                          │ │
↓                                                 │ │
→ child process fork → Renderer process          │ │
↓                                                 │ │
V8 + Blink Init                                   │ │
↓                                                 │ │
LoadURL (uri)                                     │ │
↓                                                 │ │
HTML / JS 解析 / 渲染                             │ │
↓                                                 │ │
GPU Process raster/合成 → 上屏                   ─┘ │
```

---

## 14.3 ipcRenderer.send：从 JS 到 Mojo

### 14.3.1 JS 层 (lib/renderer/api/ipc-renderer.ts)

```ts
// Excerpt from electron/lib/renderer/api/ipc-renderer.ts

class IpcRenderer extends EventEmitter {
  send(channel: string, ...args: any[]): void {
    if (typeof channel !== 'string') {
      throw new Error('channel must be a string');
    }
    return this.internalSend(channel, args);   // (1)
  }

  sendSync<T>(channel: string, ...args: any[]): T {
    return this.internalSendSync(channel, args);   // (2)
  }

  invoke<T>(channel: string, ...args: any[]): Promise<T> {
    const requestId = this.generateRequestId();    // (3)
    return new Promise((resolve, reject) => {
      this.handleResponsePromise(requestId, resolve, reject);
      this.internalSend(channel, args);
    });
  }
}
```

三个关键：

- `(1)` fire-and-forget
- `(2)` 同步路径（不建议使用，会卡住 renderer）
- `(3)` requestId 路由 promise

`internalSend` 实际是把请求转给 V8 → C++ binding。

### 14.3.2 C++ Renderer side (electron_api_ipc_renderer.cc)

```cpp
// Excerpt from electron/shell/renderer/api/electron_api_ipc_renderer.cc

void IpcRenderer::Send(Sender* sender,
                       const std::string& channel,
                       const std::vector<v8::Local<v8::Value>>& args) {
  // 序列化 message
  std::vector<v8::Local<v8::Value>> serialized;
  if (!SerializeArgs(env, args, serialized)) {
    return;
  }

  // 创建 IPC Message
  auto request = mojo::MakeRequest(IPC());
  // …
  service_->Send(channel, /* args */);
}
```

实际 Mojo message 通过 `IPCChannelProxy`：

```cpp
// Excerpt from content/renderer/child_frame_sink.cc

void ChildFrameSink::DispatchFrameEventToParent(
    const FrameEvent& event,
    FrameEventDispatchType type) {
  // 这里其实只是 reference；发送靠 RenderThreadImpl
}
```

实质：

```cpp
// Excerpt from content/renderer/render_thread_impl.cc

bool RenderThreadImpl::Send(IPC::Message* msg) {
  return channel_->Send(msg);
}
```

`channel_->Send` 把 message 推到 Mojo 缓冲队列，对端的 `ChildProcessHost` 接收。

### 14.3.3 Browser 端接 response

```cpp
// Excerpt from electron/shell/browser/api/electron_api_ipc_main_impl.cc

void ElectronBrowserMessageFilter::OnMessageReceived(
    const IPC::Message& message) {
  if (message.type() == ElectronIPC::ELECTRON_MOJO_API_INVOKE) {
    // 反序列化
    // 找到对应 handler 并 invoke
  }
}
```

### 14.3.4 handlePromise 回流

```cpp
// Excerpt from electron/shell/browser/electron_ipc_message_handler.cc

bool InvokeCallback(int32_t request_id, base::Value result) {
  // 通过 mojo 把结果发回 renderer
  mojo::MessagePipe::SendResponse(request_id, result);
}
```

renderer 端收到消息后 dispatch 回来：

```cpp
// Excerpt from electron/shell/renderer/api/electron_api_ipc_renderer.cc

void IpcRenderer::OnReply(int32_t request_id, base::Value result) {
  promise_map_.find(request_id)->Resolve(result);
}
```

这就是一个完整 invoke 周期：JS send → 序列化 → Mojo → main IPC handler → 用户逻辑 → Promise resolve → Mojo 回传 → JS await。

---

## 14.4 ContextBridge：Cross-world API 翻译

### 14.4.1 JS API

```ts
contextBridge.exposeInMainWorld('my', {
  sendHi: () => ipcRenderer.send('hi'),
});
```

主世界（即 renderer 的 `window`）看得到 `my`。

但页面 JS 想 `ipcRenderer.invoke` 直接拿不可能。

### 14.4.2 C++ (electron_api_context_bridge.cc)

```cpp
// Excerpt from electron/shell/renderer/api/electron_api_context_bridge.cc

void ContextBridge::ExposeAPI(v8::Isolate* isolate,
                              const std::string& key,
                              v8::Local<v8::Object> api) {
  // 1. 拿 isolated world context
  v8::Local<v8::Context> main_context = /* FromFrame */;

  // 2. 在 isolated world 上创建 API 镜像
  v8::Local<v8::Object> proxy = CreateProxyObject(isolate, api);

  // 3. 挂到 main_context 上的 global
  main_context->Global()->Set(...);   // Proxy 是深拷贝版本
}
```

`CreateProxyObject` 是关键：它把 `api` 上的每个 function 用 `v8::FunctionTemplate::New` 重新生成，但内部走 `ObjectProxy` 拦截 `get`/`set` 调用。

### 14.4.3 数据流（防 XSS）

```text
页面 JS: my.sendHi()
    ↓ (via proxy)
Bridge Send:
    ↓ (in isolated world, target = ipcRenderer)
ipcRenderer.send('hi')
    ↓ (Mojo)
Main process receives, etc.
```

页面 JS 没法给 `my` 添加属性，因为它是 proxy。但是页面可以**读** API 上挂的所有 enumerable 属性。

### 14.4.4 真实陷阱

```ts
contextBridge.exposeInMainWorld('my', ipcRenderer);
// ❌ prototype 方法无法拷贝
//   比如 ipcRenderer.send、ipcRenderer.invoke 是 ipcRenderer 实例的方法
//   但桥接的不是函数本身，而是「Proxy 关联的某个创建时复制」
```

正确：

```ts
contextBridge.exposeInMainWorld('my', {
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
});
```

---

## 14.5 app.commandLine：进程级开关

### 14.5.1 JS 层

```js
app.commandLine.appendSwitch('disable-features', 'OutOfBlinkCors');
app.commandLine.appendArgument('app-arg');
```

### 14.5.2 C++

```cpp
// Excerpt from electron/shell/browser/api/electron_api_app.cc

void App::AppendSwitch(gin::Arguments* args) {
  std::string switch_str, value;
  if (args->GetNextAsString(&switch_str)) {
    if (args->GetNextAsString(&value)) {
      base::CommandLine::ForCurrentProcess()->AppendSwitchASCII(
          switch_str, value);
    } else {
      base::CommandLine::ForCurrentProcess()->AppendSwitch(
          switch_str);
    }
  }
}
```

`base::CommandLine` 是 Chromium 的全局实例。再说一次：必须在 `app.ready` 之前完成。

### 14.5.3 哪些开关最关键

| 开关 | 作用 |
|------|------|
| `--enable-logging` | 显示 Chromium 内部日志 |
| `--disable-gpu` | 禁用硬件加速 |
| `--use-gl=angle` | ANGLE GLES 后端 |
| `--js-flags=…` | 传 V8 |
| `--disable-features=…` | 关 Chromium feature |
| `--user-agent=…` | 改 UA |
| `--inspect=…` | 主进程调试 |

### 14.5.4 `--disable-features` 内部机制

Chromium 的 feature system 在 `base/feature_list.h`：

```cpp
// Excerpt from services/network/network_service.cc
const base::Feature kNetworkService {
  "NetworkService", base::FEATURE_ENABLED_BY_DEFAULT
};

// 关掉：
--disable-features=NetworkService,OutOfBlinkCors
```

多个用逗号。

---

## 14.6 patches/ 究竟在改些什么

### 14.6.1 Node.js patches

- `npm_config_node_gyp` —— 阻止 Node 用旧 gyp
- `fingerprint_for_node.patch` —— Node 标准的 OpenSSL fingerprint
- Electron's `process.nextTick` 加速

### 14.6.2 Chromium patches

- `disable_gl_swap_tearing` —— Windows 上模糊处理
- `enable_app_container` —— Windows 应用沙盒
- `storage_partition_avoiding_data_corruption`

### 14.6.3 V8 patches

- `support_top_level_await.patch`
- `node-v8-serializer.patch`

读 patches 的方法：

```bash
# 看 patches 下某个 patch
cat patches/chromium/some.patch
# diff -u 前的 commented out part 是原文
# diff -u 后是修改内容
```

每个 patch 都有作者 + 提交信息，是 Electron 历史的"年鉴"。

---

## 14.7 阅读 gn 编译配置

### 14.7.1 BUILD.gn 入口

```python
# Excerpt from electron/BUILD.gn
import("//electron/build/config/win/maybe_electron_google_api_keys.gni")

electron_node_gyp_args = ...
electron_configs = [...]
```

### 14.7.2 一个具体 target

```python
# Excerpt from electron/shell/browser/BUILD.gn
source_set("electron_browser") {
  sources = [
    "api/electron_api_app.cc",
    "api/electron_api_browser_window.cc",
    "api/electron_api_session.cc",
    # ...
  ]
  deps = [
    "//content/public/browser",
    "//electron/build:electron_lib",
  ]
}
```

GN 在 `out/Electron/Release/obj/shell/browser/electron_browser.o` 生成目标文件。

### 14.7.3 编译参数影响

```bash
$GCLIENT/bin/fetch_deps.py   # Chromium deps
gn gen out/Release --args="is_official=true is_component=true"
ninja -C out/Release electron
```

`args` 用的变量非常多：

```text
is_debug = false
is_official = true
is_component = true            # so/distributable 模式
target_cpu = "x64"
target_os = "mac"
```

### 14.7.4 跟着 gn deps 看代码范围

```bash
gn desc out/Release //electron:electron_format_getter deps
# 输出全部引用
```

这是查"代码范围"的最强方法。

---

## 14.8 gn 工具链

### 14.8.1 生成 compile_commands.json

```bash
ninja -C out/Release -t compdb > compile_commands.json
```

### 14.8.2 VSCode + clangd

```json
{
  "C_Cpp.default.compileCommands": "cd $workspaceFolder && ninja -C out/Release -t compdb"
}
```

clangd 能正确跳转 cc/h。

### 14.8.3 GN Navigation

```bash
gn ref //electron/shell/browser/api:electron_api_app.cc::New
# 输出 New 函数被哪些 target 引用
```

这是核心技巧。

---

## 14.9 gin_helper：使用规模最大的 Chromium wrapper

### 14.9.1 gin_helper::Dictionary

```cpp
// Excerpt from electron/shell/common/gin_helper/dictionary.h
class Dictionary {
 public:
  v8::Local<v8::Value> GetHidden(const std::string& key, v8::Local<v8::Value> def) const;
  bool Get(const std::string& key, int* out);
  bool Get(const std::string& key, std::string* out);
  bool Get(const std::string& key, bool* out);

  // ...
 private:
  v8::Isolate* isolate_;
  v8::Local<v8::Object> obj_;
};
```

例子：

```cpp
v8::Local<v8::Object> opts = ...;

gin_helper::Dictionary dict(isolate, opts);
int width;
if (!dict.Get("width", &width)) width = 800;
// 默认 800
```

### 14.9.2 gin_helper::Arguments

```cpp
void Foo(gin::Arguments* args) {
  std::string name;
  if (!args->GetNextAsString(&name)) {
    gin_helper::ErrorThrower(args->isolate()).ThrowError("need name");
    return;
  }
  // ...
}
```

### 14.9.3 gin_helper::Promised

```cpp
void Bar(gin::Arguments* args) {
  // 拿到回调（v8::Promise）
  gin_helper::Promise<void> promise(args->isolate());
  // 异步执行
  base::ThreadPool::PostTask(base::BindOnce(&BarDone, promise));
}

void BarDone(gin_helper::Promise<void> promise) {
  promise.Resolve();
}
```

这是 Electron 中"异步返回"的标配。

---

## 14.10 IPC Schema

### 14.10.1 生成的 IPC binding

`shell/common/api/electron_api_ipc_handler.h` 会有：

```cpp
namespace electron {
class IpcHandler {
 public:
  static void OnElectronMessage(content::BrowserContext* ctx,
                                const std::string& channel,
                                base::Value payload);
};
}
```

### 14.10.2 actually 代码

`shell/browser/electron_ipc_message_handler.cc`：

```cpp
void ElectronIPCMessageHandler::OnElectronMessage(...) {
  // 1. 反序列化
  base::Value payload;
  // 2. 查 channel handlers
  auto h = handlers_.find(channel);
  if (h == handlers_.end()) return;
  // 3. v8::HandleScope
  v8::HandleScope hs(v8::Isolate::GetCurrent());
  // 4. v8::TryCatch
  v8::TryCatch tc(isolate);
  v8::Local<v8::Value> result = h->Run(callback, payload);
  if (tc.HasCaught()) {
    // log to renderer
    tc.ReThrow();
  } else {
    // send result back via mojo
  }
}
```

### 14.10.3 v8::Promise 序列化

Electron 的 `invoke` 协议把 v8::Promise 通过 Mojo 序列化时，给结果用 `base::Value` 而非 v8::Value。

底层序列化的工具是 `base::Value` ↔ JS 的对应（在 `shell/renderer/serializing/）。

---

## 14.11 Utility Process：真实创建流程

### 14.11.1 调用入口

`utility_process.fork(path)`：

```js
utilityProcess.fork('./util.cjs', [], { serviceName: 'util' })
```

### 11.11.2 主进程 C++

```cpp
// Excerpt from electron/shell/browser/api/electron_api_utility_process.cc

std::unique_ptr<UtilityProcessWrapper> UtilityProcessWrapper::Create(
    v8::Isolate* isolate, gin::Dictionary options) {
  // 1. 解析 options
  std::string script = options.GetString("script");

  // 2. 创建子进程
  auto process = std::make_unique<content::ChildProcessHost>();
  // 启 cmd：electron --type=utility --app-scripts=...

  // 3. 拿到 process id
  int pid = process->GetProcessId();

  return std::make_unique<UtilityProcessWrapper>(isolate, std::move(process));
}
```

### 14.11.3 child process 类型

Electron 的 child process 实现是 `electron --type=utility`：

```cpp
// Excerpt from electron/utility/utility_main.cc

int UtilityMain(const content::MainFunctionParams& params) {
  // 跟一般 main 类似：
  //   - 创建 main message loop
  //   - 监听消息
  //   - 处理 util 请求
  return base::LaunchApplication(UtilityProcessMainDelegate);
}
```

### 14.11.4 通信：parentPort

```js
process.parentPort.on('message', (e) => {
  const { data, ports } = e;
});
```

C++ 实现：

```cpp
// Excerpt from electron/utility/parent_process_port.cc

bool ParentProcessPort::OnMessageReceived(const IPC::Message& msg) {
  return routing_ids_.Dispatch(msg);
}
```

---

## 14.12 GPU Process 调用详解

### 14.12.1 GPU 主入口

```cpp
// Excerpt from content/gpu/gpu_main.cc

int GpuMain(const content::MainFunctionParams& params) {
  // 启动 GPU process
  GpuProcess* process = GpuProcess::GetInstance();
  // ...
  return 0;
}
```

### 14.12.2 GL Context 创建

```cpp
// Excerpt from gpu/command_buffer/service/in_process_command_buffer.cc

bool InProcessCommandBuffer::Initialize(
    const ContextCreationAttribs& attribs) {
  // 1. 创建 surface
  // 2. 创建 context
  // 3. 创建 GLES2 implementation
  return true;
}
```

### 14.12.3 vsync 信号

GPU process 接收 vsync 通过 `GPUVSyncBridge`。

### 14.12.4 display compositor

Display compositor 在 GPU 进程内部，把多个 layer tree 合并到 screen buffer：

```cpp
// Excerpt from components/viz/service/display/display_compositor.cc

void DisplayCompositor::DrawAndSwap() {
  // 1. 收集 frame
  // 2. 合成
  // 3. swap
}
```

---

## 14.13 一份完整 walk 看 `did-finish-load`

这是 Renderer 加载完成的事件。代码 walk：

```text
WebFrame → ContentRenderFrame → RenderFrameImpl::DidFinishLoad
   ↳ Send(new FrameHostMsg_DidFinishLoad)
   ↳ IPC::Message routed to Browser process
   ↳ RenderFrameHostImpl::DidFinishLoad
   ↳ WebContentsImpl::OnFrameFinishedLoad
   ↳ WebContentsObserver::DidFinishLoad (观察者)
   ↳ electron::WebContents::Emit("did-finish-load")
```

每个 Observer 在 Electron 自己是订阅者。

`WebContentsObserver` 是 Chromium 的"事件订阅模式"：

```cpp
// Excerpt from content/public/browser/web_contents_observer.h
class WebContentsObserver {
 public:
  virtual void DidStartLoading() {}
  virtual void DidFinishLoad(content::RenderFrameHost*, const GURL&) {}
  // ...
};
```

`electron::WebContents` 继承 `WebContentsObserver`，把事件转 v8 emit 给 JS：

```cpp
// Excerpt from electron/shell/browser/api/electron_api_web_contents.cc

void WebContents::DidStartLoading() {
  v8::Isolate* isolate = v8::Isolate::GetCurrent();
  v8::HandleScope scope(isolate);
  emit("did-start-loading");
}
```

---

## 14.14 IPC Stack：Mojo 简明手册

### 14.14.1 什么是 Mojo

Mojo = **Chrome 内部 IPC 系统**。代替了 Chromium 旧的 IPC 协议（带 pipe 的 message）。

```text
process_a                bus (Mojo)               process_b
.mojom service          ┌─> message ─>             .mojom service
.invite_interface ──────┤                          .accept_invitation
                        └─> reply ─>
```

### 14.14.2 IDL 定义

```text
// electron/shell/common/api/electron_api_ipc_main.mojom
module electron.mojom;

interface IpcService {
  Send(string channel, array<mojo_base.mojom.Value> args) => ();
  Invoke(string channel, array<mojo_base.mojom.Value> args) => (array<mojo_base.mojom.Value> result);
};
```

### 14.14.3 generate

```bash
gn gen out/Debug
mojo public/tools/bindings/generate_type_bindings.sh
```

### 14.14.4 在 Electron 中的具体应用

1. `WindowBuilder` 通过 mojo 拿到 ScreenOrientation 数据。
2. `IpcMessageProxy` 把 JS invoke 直接转成 `mojo::StrongBinding` callback。
3. `UtilityProcessProxy` 把 utility process 暴露成 mojo service。

---

## 14.15 阅读 Electron 源码的工作流

### 14.15.1 不必从 0 构建

```bash
git clone https://github.com/electron/electron --depth=1
# 看 README 看 ./script/build-vscode.sh
# 大多数情况下不需要从头编译，需要时再 ./script/build.py
```

### 14.15.2 用 vscode 阅读

```bash
mkdir -p out/Release
echo 'import("//electron/build/args/release.gn_args")' > out/Release/args.gn
gn gen out/Release
# 拿 compile_commands
```

### 14.15.3 用 vim + ctags

```bash
ctags -R --c++-kinds=+p --fields=+l .
# 在 vim 里 :tag BrowserWindow
```

### 14.15.4 实战 5 步读函数

```text
1. 看 declaration
2. 看 call sites
3. 看 Create 函数
4. 看构造函数
5. 看 ptr source
```

这是一份标准的"如何从头读一项 API" 步骤。

---

## 14.16 我自己读源码时常见的小判断

### 14.16.1 "我看到 `Browser::OnLocaleChanged` 但只有 1us"

> 排除 hlwpanster 路径。chromium 几乎所有 `Browser::OnXxxChanged` 是 `base::AutoReset` 单次设置；大部分值在 OnLocaleChanged 已是 cached。

### 14.16.2 "我看 PrePaint 1ms，但还是卡"

> PrePaint 后面紧跟 Paint + commit 到 compositor。所以**Perf 测**要把 "Layout + PrePaint + Paint + commit" 一段整体看。

### 14.16.3 "GPU Process 真的需要那么久吗"

> 看 `swapbuffers` trace。`swapBuffers` 是真硬件 API，要么走 Metal / Vulkan / D3D，要么 SwiftShader 走 CPU。**

### 14.16.4 "为什么 ipcRenderer.invoke 比 postMessage + 'message' 还快"

> 因为 Mojo service 抓 await 走专用 channel，unique id 路由到 promise，而不是 broadcast + listener；一个单独 promise 一次匹配。

### 14.16.5 "我看到了 chromium commit，看不到 Electron patch 怎么改"

> 在 PR Comment 里搜 `chrome-sandbox`，按 `chromium/+/<commit>` 的 link 看。但找到 PR 上游 commit 后，将 `git rev-parse HEAD` 与 `patches/CHROMIUM_VERSION` 对照，patches/下取。

---

## 14.17 Electron 与 Chromium 的关系：版本 sync table

| Electron | Chromium | Node | V8 | Reproduced Date |
|----|----|----|----|----|
| 28 | 118 | 18.18 | 11.8 | 2024 Q4 |
| 29 | 122 | 20.10 | 12.4 | 2024 Q4 |
| 30 | 124 | 20.12 | 12.5 | 2025 Q1 |
| 31 | 126 | 20.14 | 12.6 | 2025 Q2 |
| 32 | 128 | 20.16 | 12.7 | 2025 Q3 |
| 33 | 130 | 20.18 | 12.8 | 2025 Q4 |

每次主版本升级，检查：

1. Chromium 新 Chrome **deprecation**。
2. Node Node-API 主版本。
3. V8 废弃的 feature（heapstats）。

---

## 14.18 渐进阅读路线

时间不足时，按下面的优先级读：

1. `lib/browser/api/*.js`（5%）。
2. `shell/browser/api/*.cc`（15%）。
3. `shell/browser/window_list.cc` 和 `native_window.cc`（5%）。
4. `shell/renderer/api/*.cc`（10%）。
5. `shell/common/api/*.cc`（5%）。
6. `shell/utility/utility_main.cc`（2%）。
7. `patches/` （10%）。
8. Chromium 内部（30%）。

8 个小时看完电子电子 8 步。

---

## 14.19 推荐工具

| 工具 | 用途 |
|------|------|
| gdb / lldb | Native debugger |
| gn / ninja | 构建 |
| clangd / cquery | code jump |
| chromium-trace | trace viewer |
| ApiReference | electronjs.org/docs/latest/api/api-structure |
| electron-docs | team-maintained search |

---

## 14.20 总结

读完这一章，**你应当具备**：

- 看到任何 API，能在 Chromium 的源码里 5 分钟找到对应 C++ 实现。
- 看到 PR，知道它影响的层级（main/renderer/utility/native）。
- 看到 trace JSON，能将一行 trace 转成代码位置。

这是工程师与 Chromium 内核工程师的“门槛”差距。

下一章 [15 · TypeScript 与工具链](./../15-typescript-tooling/README.md)。
