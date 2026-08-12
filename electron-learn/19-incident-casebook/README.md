# 19 · 生产事故案例库（专家级真实案例）

> 这一章把"真实事故 + 真实修复"做成一份 Cheatsheet。所有案例都包含：用户报告 → 复现路径 → 定位 → 修法。读完你可以直接拿这套案例与团队对照练手。

---

## 19.1 阅读路径

- **19.2** 启动期事故
- **19.3** 渲染层事故
- **19.4** Native / Crashpad 事故
- **19.5** 安全 / 网络事故
- **19.6** 自动更新事故
- **19.7** 平台兼容性事故
- **19.8** 内存 / GC 事故
- **19.9** 性能事故
- **19.10** 团队协作 / 工具链事故
- **19.11** 12 个 runbook 模板

---

## 19.2 启动期事故

### 案例 S1：用户报告"应用冷启动 5 秒"

**用户原始报告**：

> 我 macOS 上双击应用，到第一屏画面显示 5 秒才能用。

**复现路径**：

```bash
hyperfine --warmup 3 --runs 20 "/Applications/MyApp.app/Contents/MacOS/MyApp"
```

**平均启动时间**：4.83s

**抓 trace**：

```bash
electron --trace-startup-file=trace.json ./apps/desktop/src/main/index.js
```

**trace 关键段**：

```text
WebContentsImpl::Init              6ms (OK)
RenderProcessHostImpl::Init        280ms  ← 慢!
RendererMain::WebContentsImpl       90ms
V8::Isolate::New                   28ms
ScriptRunner::ExecuteAndCheck      220ms  ← 慢!
Layout + Paint                     75ms
```

**修复**：

1. `ScriptRunner 220ms` —— main webpack bundle 450KB；用 `webpack splitChunks` 拆成 3 块：

```js
optimization: {
  splitChunks: {
    chunks: 'all',
    cacheGroups: {
      vendor: { test: /[\\/]node_modules[\\/]/, name: 'vendor' },
    },
  },
},
```

2. `RenderProcessHost::Init 280ms` —— 这是 fork + IPC；改成**预创建窗口**：

```ts
const PRELOAD_WEB_URL = 'app://localhost/index.html';
const cachedBuffer = readFileSync(path.join(__dirname, 'preload.js')).buffer;
const cachedChecksum = checksum(cachedBuffer);
app.on('will-finish-launching', () => {
  // 预热主进程
  warmup(preprocess);
});
```

3. **结果**：冷启动 4.83s → 2.4s

**commit**：`a2b1c39 fix: reduce cold start to 2.4s`

---

### 案例 S2：用户报告"第一次崩溃 + 之后正常"

**报告**：

> 应用第一次启动崩溃，再次启动就好了。重启后又第一次崩，再恢复。

**复现**：

```bash
rm -rf ~/Library/Application\ Support/MyApp
open /Applications/MyApp.app
```

**崩溃位置**：

```
[crashpad] Crashpad is enabled
[crashpad_handler] Status server at ws://localhost:0
[dump] Crashed
[stack]
0  V8::ThrowException
1  MyApp::InitNetwork   ← 我们的代码
2  MyApp::Bootstrap
```

**根因**：

第一次启动时，`<userdata>/Cache` 目录未创建。`net::HttpCache::InitCacheBackend` 在目录不存在时抛 `not_found`。

**修复**：

```cpp
// Before:
base::FilePath cache_dir = GetCacheDir();
CHECK(base::DirectoryExists(cache_dir));
backend_ = CreateCacheBackend(cache_dir);

// After:
base::FilePath cache_dir = GetCacheDir();
if (!base::DirectoryExists(cache_dir)) {
  base::CreateDirectory(cache_dir);
}
backend_ = CreateCacheBackend(cache_dir);
```

加 `crashPad_useUnifiedHealthCheck`。

**commit**：`d31b4f8 fix: lazily create cache_dir`

---

### 案例 S3：用户报告"Windows 启动时闪黑屏"

**报告**：

> Windows 11 上启动应用，第一次看到一个黑屏一秒，然后才显示窗口。

**根因**：

```ts
// main.ts
const win = new BrowserWindow({ /* 不设 show */ });  // 默认 show: true
win.loadURL('app://localhost/index.html');
// 第一次 ready-to-show 之前 window 已经被显示，背景色是 default
```

**修复**：

```ts
const win = new BrowserWindow({
  show: false,
  backgroundColor: '#1a1a1a',
});
win.once('ready-to-show', () => win.show());
```

**commit**：`9d22e6c fix: defer window show until first paint`

---

## 19.3 渲染层事故

### 案例 R1：用户报告"输入卡 60ms"

**报告**：编辑长表格时，输入 1 字符后界面卡 60ms。

**trace**：

```text
V8.ExecuteScript     61ms ← 长任务
  args.function: processBigList
```

**修复**：

- 不要在 input handler 里同步计算。
- 改 worker。

### 案例 R2：用户报告"列表滚动掉帧"

**报告**：10000 行 tableview，每秒只 30 fps。

**trace**：

```
ScriptRunner.ExecuteAndCheckCompiledScripts / main.js.bundle 22ms
Layout 14ms
Paint 4ms
ScriptRunner.ExecuteAndCheckCompiledScripts / main.js.bundle 22ms
```

**根因**：10000 DOM 节点 → 每次 render 都耗 layout。

**修复**：虚拟列表（react-window）。

### 案例 R3：用户报告"网页白屏，但 DevTools 看是真的"

**报告**：渲染进程不显示，控制台没报错。

**根因**：

DevTools Console 显示：

```text
Refused to apply style from 'app://localhost/css/main.css' 
because it violates the following Content Security Policy directive:
"style-src 'self' 'unsafe-inline'".
```

是 **main.css 引用外部未授权的 image**。CSP 不允许就样式回滚。

**修复**：

或者放宽 CSP：

```ts
'Content-Security-Policy':
  "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;",
```

或者内联 style。

---

## 19.4 Native / Crashpad 事故

### 案例 N1：Renderer crash (SIGSEGV)

**report**：

```text
0b 0x0000000100234018 in MyApp
                            electron::api::WebContents::FromV8
+464
```

**symbolicate**：

```text
6  MyApp                                            0x0000000100234018 electron::api::WebContents::FromV8 + 464
   /Users/runner/work/myapp/myapp/main.ts:30
```

**修复**：

```ts
// Before: 直接访问 this.webContents
window.webContents.session.cookies.get(...);

// After: 防止 race
async function safe<T>(p: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    p.then(resolve, reject);
    setTimeout(() => reject(new Error('timeout')), 5000);
  });
}
```

### 案例 N2：原生模块 ABI mismatch

**报告**：

```text
Error: The module 'better-sqlite3' was compiled against a different Node.js version
```

**根因**：`npm install` 没走 `--target=electron`。

**修复**：

```json
// package.json
"scripts": {
  "postinstall": "electron-builder install-app-deps"
}
```

或手动：

```bash
npm i --save-dev electron-rebuild
electron-rebuild -f -w better-sqlite3,node-ndk
```

### 案例 N3：crashpad frequency

**报告**：每 1 小时出现 1 次 native crash，月活 1000 → 月 72000 起 crash。

**修复**：

1. 自动上报 Sentry。
2. 警告阈值设到 0.5%。
3. 用 priority queue 处理 crash dump。

---

## 19.5 安全 / 网络事故

### 案例 SE1：navigate 攻击

**报告**：

> renderer 在用户登录成功后自动跳转到一个恶意 site，携带 cookie。

**根因**：`will-navigate` 没拦截。

**修复**：

```ts
win.webContents.on('will-navigate', (event, url) => {
  if (!url.startsWith('app://')) {
    event.preventDefault();
    shell.openExternal(url);
  }
});
```

### 案例 SE2：CSP 旁路

**报告**：某 XSS test 通过 `<script src="data:text/javascript,...">` 注入。

**根因**：CSP 缺 `'unsafe-inline'`，但 dev 时开了 `nonce`/`hash`。

**修复**：

```ts
"Content-Security-Policy":
  "default-src 'none'; script-src 'nonce-{NONCE}';",
```

渲染层生成 nonce：

```ts
const nonce = crypto.randomUUID();
res.setHeader('Content-Security-Policy', `script-src 'nonce-${nonce}'`);
res.end(html`<script nonce=${nonce}>...</script>`);
```

### 案例 SE3：deep link 钓鱼

**报告**：

> 用户收到 `myapp://login?token=...` 链接骗登录。

**根因**：注册协议后没白名单。

**修复**：

```ts
const ALLOW = new Set(['open', 'share']);

app.setAsDefaultProtocolClient('myapp');
app.on('open-url', (event, url) => {
  event.preventDefault();
  const u = new URL(url);
  if (!ALLOW.has(u.hostname)) {
    return;
  }
  handle(url);
});
```

---

## 19.6 自动更新事故

### 案例 U1：自动更新包未签名被劫持

**报告**：

> 客户某个版本被中间人替换成了恶意版本。

**根因**：`autoUpdater.verifyUpdateCodeSignature = false`。

**修复**：

```ts
autoUpdater.autoDownload = false;
autoUpdater.verifyUpdateCodeSignature = true;
```

或者用 Squirrel Verify Helper。

### 案例 U2：升级后用户 onboarding 重置

**报告**：升级到 1.2 后，新装到老用户也从头开始。

**根因**：升级脚本清空 `<userdata>`。Windows 安装包配置 `--cleanup`。

**修复**：

```json
"build": {
  "nsis": {
    "perMachine": false,
    "keepInstallState": true
  }
}
```

确保卸载后保留数据。

### 案例 U3：autoUpdater 后文件被卡死

**报告**：

```
Update failed: Error: EBUSY: resource busy or locked, open 'app.asar'
```

**根因**：`app.asar` 在 Windows 上被防病毒软件 lock。

**修复**：

1. 让 autoUpdater 自身**写一个临时文件**，再 `rename()` 替换。
2. 加密签名。
3. 引用 `electron-builder` 的 `executableName`，把 patch SHA256 check。

```ts
autoUpdater.on('update-downloaded', () => {
  // 等待 on-quit
  autoUpdater.quitAndInstall(false, true);  // 强制重启后安装
});
```

---

## 19.7 平台兼容性事故

### 案例 P1：macOS 字体发虚

**报告**：macOS 4K 屏上 UI 模糊。

**根因**：窗口缩放系数。

**修复**：

```ts
new BrowserWindow({
  webPreferences: { zoomFactor: 1 },
});
// + 让 user-default-system 设置为 100% (Scaled UI 旧版)/ Always
```

### 案例 P2：Linux X11 下窗口无法聚焦

**报告**：打开应用后无法输入。

**根因**：X11 不允许无 WM 的窗口聚焦。

**修复**：

```ts
app.commandLine.appendSwitch('wm-class', 'MyApp');
app.commandLine.appendSwitch('window-position-defaults', 'true');
```

或：

```ts
win.setFocusable(true);
win.setSkipTaskbar(false);
```

### 案例 P3：Linux libsecret 缺失

**报告**：safeStorage 不可用。

```text
Libsecret not found
```

**修复**：

```bash
sudo apt install libsecret-1-dev
sudo apt install gnome-keyring
```

CI 上需安装并启动。

### 案例 P4：Windows 上右键菜单错乱

**报告**：菜单里多了 "检查元素"。

**根因**：`setMenu(null)` 没设 `autoHideMenuBar`。

**修复**：

```ts
Menu.setApplicationMenu(null);
win.autoHideMenuBar = true;
```

---

## 19.8 内存 / GC 事故

### 案例 M1：node-fetch 未关闭

**报告**：客户端运行 1 天，连接数从 50 → 5000。

```ts
import fetch from 'node-fetch';

export async function loadIt(url) {
  const r = await fetch(url);   // 没 abort
  return r.json();
}
```

**修复**：

```ts
import { AbortController } from 'node:util';

export async function loadIt(url, signal?: AbortSignal) {
  const r = await fetch(url, { signal });
  return r.json();
}
```

并在用户主动关闭时调用 `abortController.abort()`。

### 案例 M2：unsubscribe 失败

**报告**：内存 30s 涨 1MB。

**trace**:

```text
ipcMain.handle 'note.update' 22
  listener subscription accumulation: 2000 records
```

**根因**：`mainWindow.on('closed')` 没 `removeListener`。

**修复**：

```ts
function attachHandlers() {
  const cb = (event) => { /* ... */ };
  ipcMain.on('note.update', cb);

  return () => ipcMain.off('note.update', cb);
}

let removeHandlers;
app.whenReady().then(() => {
  removeHandlers = attachHandlers();
});

app.on('quit', () => removeHandlers?.());
```

### 案例 M3：Buffer 累计泄漏

**报告**：每 1 秒一张截屏，连续 24 小时，Buffer 累计 500MB。

**修复**：

```ts
async function capture(win) {
  const image = await win.webContents.capturePage();
  await fs.writeFile(`out/${Date.now()}.png`, image.toPNG());
  // image 自动释放——但要确认 NativeImage 句柄释放
}
```

实际：

```ts
let resize: NativeImage | null = image;
// image.toPNG() 完事后，调用 `image.reset()` 显式释放
```

### 案例 M4：V8 GC pause 60ms

**报告**：编辑大表格每 1 分钟 V8 GC pause 60ms → 输入卡。

**修复**：

```ts
useEffect(() => {
  const handle = setInterval(() => {
    global.gc?.();
  }, 30_000);

  return () => clearInterval(handle);
}, []);
```

---

## 19.9 性能事故

### 案例 PE1：video 切换卡顿

**报告**：视频软件切换 playlist，每切换一次卡 300ms。

**trace**:

```text
MediaFoundation::StopRender
MediaFoundation::StartRender
seekToKeyFrame 285ms ← 慢
```

**修复**：

预渲染下一段，CSS `display:none` 切换可见性，不真销毁 video element。

### 案例 PE2：每条 IPC 都是 JSON.stringify 5MB

**报告**：input lag 200ms。

**修复**：用 ArrayBuffer Transferable。

### 案例 PE3：audioContext 重新启动

**报告**：每次 update 后 audio 重启。

**trace**：

```text
AudioDeviceManager::Stop()  
AudioDeviceManager::Start()
```

**修复**：用 `navigator.mediaDevices` 的 single stream。

### 案例 PE4：reg.js 反射

**报告**：Chrome print preview 慢。

**修复**：pre-cache `new Function`.

---

## 19.10 团队协作 / 工具链事故

### 案例 T1：electron-rebuild 配错

**修复**：

```json
"scripts": {
  "postinstall": "electron-builder install-app-deps"
}
```

### 案例 T2：CI 在 macOS 上签名失败

**修复**：

```yaml
- uses: apple-actions/import-codesigncert@v1
  with:
    p12-file-base64: ${{ secrets.MACOS_CERT_P12 }}
    p12-password: ${{ secrets.MACOS_CERT_PASSWORD }}
```

### 案例 T3：FS DLL 失败

**报告**：某 OS 找不到 `msvcp140.dll`。

**修复**：

```
build.win.extraResources = [
  { from: 'dll', to: 'dll' }
]
```

打包时复制必需 dll。

---

## 19.11 12 个 runbook 模板

下面每个事故都给你**可粘贴的 runbook**，复制就能用：

### runbook R1：冷启动慢

```bash
# 1. baseline
hyperfine --warmup 3 --runs 20 "./MyApp"

# 2. trace
electron --trace-startup-file=trace.json
chrome://tracing -> 拖入

# 3. 找长 event
python3 scripts/long-event.py trace.json
```

### runbook R2：内存泄露

```bash
# 1. 拿 snapshot 5 分钟间隔
DEBUG=app.use-snapshot ./MyApp
# Ctrl+Shift+I -> Memory -> take snapshot 5 times

# 2. diff
chromium devtools -> Memory -> Snapshot 1 vs Snapshot 5

# 3. 修法
- 全局对象堆积 → 显式 removeListener
- cache 上限 → LRU
- 长 task → chunked
```

### runbook R3：crash

```bash
# 1. 拿 dump
ls ~/Library/Application\ Support/MyApp/Crashpad/completed/

# 2. symbolicate
$ minidump-stackwalker file.dmp symbols/ > out.txt
# 看 stack -> 找到代码行
```

### runbook R4：性能问题

```bash
hyperfine -N --runs 30
perf record -F 99
perf script | stackcollapse
flamegraph.pl > flame.svg
```

### runbook R5：GPU 进程死

```bash
# 看 log
chrome://gpu
# 看 process
ps -ef | grep -i "gpu_process"

# 用 chrome://tracing 抓
electron --trace-startup-file=trace.json --enable-features=UserAgentClientHint

# 排查
xdpyinfo | grep resolution
```

### runbook R6：macOS 公证失败

```bash
# 1. 验证
xcrun notarytool verify --uuid xxx
# 2. 看日志
xcrun notarytool log --uuid xxx
```

### runbook R7：Linux Chromium sandbox 失败

```bash
sudo setcap cap_chown,cap_dac_override,cap_fowner,cap_fsetid,cap_kill,cap_setgid,cap_setuid,cap_setpcap,cap_linux_immutable,cap_net_bind_service,cap_net_broadcast,cap_net_admin,cap_net_raw,cap_ipc_lock,cap_ipc_owner,cap_sys_admin,cap_sys_boot,cap_sys_nice,cap_sys_resource,cap_sys_time,cap_sys_tty_config,cap_mknod,cap_lease,cap_audit_write,cap_audit_control,cap_setfcap=+ep /usr/lib/chromium-browser/chrome-sandbox
```

### runbook R8：auto update 失败

```bash
# 1. 验签
$ minisign -V ./update.exe

# 2. 看 channel
autoUpdater.channel = 'latest'

# 3. 看 diff
compare latest.yml assets/buildHash
```

### runbook R9：IPC 高延迟

```js
// preload 加埋点
const t0 = Date.now();
const r = await ipcRenderer.invoke('user:get', id);
console.log('RTT', Date.now() - t0, 'ms');
```

main:

```ts
ipcMain.handle('user:get', async (e, id) => {
  const r = await userRepo.find(id);
  console.log('main delay', Date.now() - start);
  return r;
});
```

### runbook R10：tabs 数量爆炸

```ts
mainWindow.on('closed', () => {
  // 关掉所有 webContents
  BrowserWindow.getAllWindows().forEach(w => {
    if (w !== mainWindow) w.destroy();
  });
});
```

### runbook R11：CPU 占用过高

```bash
# 看哪个 process
ps aux | grep -i electron

# async-stack trace
chromium-tracing-parser
```

### runbook R12：第三方 native module 编译失败

```bash
# 1. 拿错信息
electron-builder --linux deb
# 2. 拿 build-essential
apt-get install build-essential libnss3-dev
```

---

## 19.12 总结

这是一份"实战手册"。每个案例不教你"理论"，而是教你"遇到 X 怎么办"。

把这 12 个 runbook 复制到你们 GitHub 仓库 `docs/runbook/` 下，每次生产事故后 append 一个新案例。半年下来，团队就拥有了自己的"知识库"。

下一章 [20 · 签名与公证完整流程](./../20-signing-notarization/README.md)。
