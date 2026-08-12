# 03 · 安全工程

> 桌面应用的安全，绝大多数坑都出在"我让前端能调系统能力"这一处。本章从渲染进程的物理隔离到 CSP，从原生模块供应链到代码签名，帮你整理一份 Electron 项目的安全基线。

---

## 3.1 Electron 的威胁模型

要谈 Electron 安全，先要画清楚它的威胁模型。

```text
        ┌──────────────────────────────┐
        │         攻击者来源            │
        ├──────────────────────────────┤
        │ A. 远程攻击者                │
        │    - 通过加载的远程资源，注入│
        │      XSS、跨域脚本、WebSocket│
        │    - 利用 Electron 漏洞      │
        │      (CVE-2023-XXXX)         │
        │                              │
        │ B. 本地恶意程序 / 用户行为    │
        │    - 自定义协议投毒         │
        │    - 替换 ndjson/host 配置  │
        │    - 直接读写 appData      │
        │                              │
        │ C. 供应链                   │
        │    - 不受信任的 npm 依赖     │
        │    - 原生模块含恶意代码     │
        │    - 开发者机器失陷         │
        └────────────┬─────────────────┘
                     ▼
        ┌──────────────────────────────┐
        │         攻击面                │
        ├──────────────────────────────┤
        │ 1. 渲染进程 V8 context      │
        │ 2. Node 主进程特权          │
        │ 3. 原生模块 / .node 二进制  │
        │ 4. 安装包 / 升级通道         │
        │ 5. 文件协议 / 自定义协议     │
        │ 6. 进程间 IPC               │
        └──────────────────────────────┘
```

把这两张图画出来，你会发现 80% 的 Electron 真实事故：

- 渲染进程 XSS 被利用 → 拿到 nodeIntegration → 任意 FS 写或 RCE。
- 自定义协议被伪冒 → 跨进程打开恶意 URL → 攻击面拉到主进程。
- 原生模块供应链染毒 → 主进程或 utility 加载恶意 .node。
- 升级包未签名 / 自动更新缺校验 → 客户端被替换。

下面 9 节我们挨个拆解。

---

## 3.2 安全开关：四个核心 webPreferences

| 选项 | 默认 | 推荐 | 含义 |
|------|------|------|------|
| `contextIsolation` | true | true | 隔离 preload 与页面 JS 的 V8 context |
| `nodeIntegration` | false | false | 是否把 Node 注入渲染层 |
| `sandbox` | false | true | 渲染进程跑 OS 级别沙箱 |
| `webSecurity` | true | true | 关闭等同于关闭同源策略 |

**重要**：这些配置可以从两个地方设置：

```js
// 1. 进程入口 — 必须先设置再 ready
app.commandLine.appendSwitch('disable-site-isolation-trials');

// 2. 创建窗口
const win = new BrowserWindow({
  webPreferences: {
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
    experimentalFeatures: false,
    webviewTag: false,
  },
});
```

### 3.2.1 contextIsolation：默认开启，别关

- **关闭时**：preload 的 `window.foo` 在页面 JS 的 `window.foo` 是同一个 V8 context，DOM 注入脚本可以直接读 `window.electronAPI`。
- **开启时**：preload 跑在独立的 isolated world，Electron 在 preload 闭包内构造独立 context，**页面 JS 无法直接拿到 preload 的变量**。

大多数"preload 暴露 API"教程会写：

```ts
// preload.ts
const { contextBridge } = require('electron');
contextBridge.exposeInMainWorld('api', {
  send: (msg: string) => ipcRenderer.send('send', msg),
  on: (cb: (msg: string) => void) => {
    ipcRenderer.on('send', (_, payload) => cb(payload));
  },
});
```

这是 **唯一推荐姿势**。其它"挂到 window"的做法都应该被代码审查拒绝。

### 3.2.2 nodeIntegration：默认 false，保住就行

打开它意味着 `require('child_process').exec()` 在渲染层直接可用，这是教科书的 XSS → RCE 路径。除非你在写 IDE 类的产品（VS Code 内部确实把 nodeIntegration 开了，配合极强的 CSP 和 iframe 沙箱），否则永远不要打开。

### 3.2.3 sandbox：默认 false，尽量开

沙箱开启条件：

1. 渲染进程必须 `sandbox: true`。
2. preload 不能 require 任何 Electron-only 模块（除非走 `contextBridge`）。
3. 所有"需要 Node 能力"的代码挪到主进程或 utility process。

注意 sandbox 开启后下列 API **不可用**：

- 直接 `require('fs')` / `child_process`。
- 直接 `Buffer`、`process.env`（部分子集）。
- 直接 `__dirname`、`__filename`。

工具判定：

```bash
npx electron-windows-sandbox-check
# 验证当前 Electron 二进制在 Windows / Linux 的沙箱是否可用
```

### 3.2.4 webSecurity：默认 true，不要动

`webSecurity: false` 会关闭同源策略 + CSP 强制 + CORS，几乎所有 Web 安全机制都失效。等价于把渲染层打成 SWF 5 年代。

---

## 3.3 内容安全策略（CSP）

### 3.3.1 最精简 CSP

```http
Content-Security-Policy: default-src 'self';
                         img-src 'self' data: https:;
                         script-src 'self';
                         style-src 'self' 'unsafe-inline';
                         connect-src 'self' https://api.example.com;
                         object-src 'none';
                         base-uri 'self';
                         frame-ancestors 'none';
                         form-action 'none';
```

这是 "Web App 教学" CSP 的桌面版。`'self'` 限制所有加载来源为应用自身（file://、custom scheme 或注册过的协议）。

### 3.3.2 在 Electron 里设 CSP

```js
// 在 onHeadersReceived 拦截 response 头
const { session } = require('electron');
session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
  cb({
    responseHeaders: {
      ...details.responseHeaders,
      'Content-Security-Policy': ["default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none';"],
    },
  });
});
```

更现代的方式是 `app.whenReady().then(() => session.setSpellCheckerEnabled(...))` 一样，Electron 在 `webRequest` 之外提供更精细的拦截能力，看 `Session.prototype.setSpellCheckerEnabled`、`setProxy`、`webRequest` 等。

### 3.3.3 严格 CSP 模板

| 内容类型 | 允许 |
|---------|------|
| `default-src` | `'self'` |
| `script-src` | `'self'` + `'wasm-unsafe-eval'`（如果需要 WASM） |
| `style-src` | `'self' 'unsafe-inline'`（styled-components / vue scoped 需要） |
| `img-src` | `'self' data:` |
| `font-src` | `'self'` 或 `data:`（打包字体） |
| `connect-src` | 业务 API 域名 |
| `worker-src` | `'self' blob:` |

**反模式**：

- `'unsafe-eval'` —— 内联 `eval`，那是 90 年代留下的尾巴，强烈不推荐。
- `'unsafe-inline' script` —— 内联 `<script>`，强制 React / Vue 走打包，否则无法满足。

### 3.3.4 Navigation

`will-navigate`、`new-window` 也要拦：

```ts
wc.setWindowOpenHandler(({ url }) => {
  if (!url.startsWith('my-app://')) {
    shell.openExternal(url);     // 浏览器打开
  }
  return { action: 'deny' };
});

wc.on('will-navigate', (e, url) => {
  if (!url.startsWith('app://')) e.preventDefault();
});

wc.on('will-redirect', (e, url) => {
  if (!url.startsWith('app://')) e.preventDefault();
});
```

新 Chromium 引入了 `virtual-authentication-request`、`virtual-keyboard-request` 等虚拟请求；Electron 默认转发到 OS 认证代理。

---

## 3.4 自定义协议 Scheme

### 3.4.1 注册协议

```js
// macOS: info.plist + Electron API 自动注册
app.setAsDefaultProtocolClient('myapp');

// Windows / Linux
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('myapp', process.execPath, [
      path.resolve(process.argv[1]),
    ]);
  }
} else {
  app.setAsDefaultProtocolClient('myapp');
}

// macOS 唤起入口
app.on('open-url', (event, url) => {
  event.preventDefault();
  handleDeepLink(url);
});

// Windows 唤起入口
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
else app.on('second-instance', (_, argv) => {
  const url = argv.find(a => a.startsWith('myapp://'));
  if (url) handleDeepLink(url);
});
```

### 3.4.2 安全风险与对策

- **URL 解析一致性**：macOS / Windows / Linux 的协议唤起解析是 *不一样* 的。`myapp://evil.com` 在 macOS host 部分可能是 `evil.com`，到了 Chromium 路由部分又可能不同。
- **白名单**：所有 deep link 解析完都要走白名单校验。
- **不存凭据**：deep link 的 token 用一次性的，不要把 JWT 拼在 URL 里。

### 3.4.3 注册 `app://` 自定义协议

```js
const { protocol, net } = require('electron');
protocol.handle('app', async (request) => {
  // 这里可以做 CSP、HTML 净化、canonical URL 校正
  const url = new URL(request.url);
  if (url.hostname !== 'localhost') return new Response('not found', { status: 404 });
  return net.fetch('file://' + path.join(__dirname, '../renderer'));
});
```

注意：自定义协议注册必须发生在 `app.whenReady()` 之前；`protocol.handle` 替代了旧的 `registerFileProtocol`。

---

## 3.5 Navigation 与 New Window

```js
// 拦截所有 http(s) 跳转
wc.on('will-navigate', (e, targetUrl) => {
  const url = new URL(targetUrl);
  if (url.origin !== 'https://your.app.host') {
    e.preventDefault();
    shell.openExternal(targetUrl);
  }
});
```

`webContents.setWindowOpenHandler` 决定 `window.open` 与 `target="_blank"` 的处理：

```ts
wc.setWindowOpenHandler(({ url }) => {
  if (url.startsWith('https://your.app.host/')) {
    // 把 `<a target="_blank">` 限制在主窗口里
    return {
      action: 'allow',
      overrideBrowserWindowOptions: { show: false, width: 800, height: 600 },
    };
  }
  shell.openExternal(url);              // 系统浏览器
  return { action: 'deny' };
});
```

不要 `action: 'allow'` 同时把 URL 转嫁给另一个 BrowserWindow 还保持 nodeIntegration，那等于把 XSS 复制到另一窗口。

---

## 3.6 webview 与 iframe

`webview` 标签是早期 Electron 的"嵌入式浏览器"。**默认 `webview` 比 BrowserWindow 更危险**，因为它继承主 BrowserWindow 的一些权限：

- `webview` 可以加载任意 URL。
- `nodeintegration` 默认关闭，但 `webview` 上的 `<iframe>` 又多一层。

直接禁掉：

```ts
new BrowserWindow({ webPreferences: { webviewTag: false } });
```

如果确实需要使用，遵循：

- `webview.partition` 用一个独立 `Session`。
- `webpreferences` 重新走一遍 sandbox / contextIsolation / nodeIntegration。
- `will-attach-webview` 拦截注入做最终兜底：

```ts
app.on('web-contents-created', (_, contents, _isBrowserWindowWebContents) => {
  contents.on('will-attach-webview', (event, webPreferences, params) => {
    delete webPreferences.preload;
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    if (!params.src.startsWith('https://your.app.host/')) {
      event.preventDefault();
    }
  });
});
```

---

## 3.7 原生模块供应链

即使主进程/utility 被沙箱化，原生模块依然拥有完整 OS 权限。恶意原生模块可以做任何事：

- 扫描 SSH 密钥。
- 注入浏览器进程。
- 替换 electron-builder 的安装包，远程下毒。

治理：

| 行动 | 做法 |
|------|------|
| 限制入口 | 仅在主进程或可信 utility require 原生模块 |
| 锁版本 | `npm ci`、`package-lock.json`，禁用 `npm publish` 提到下游混淆 |
| 检查包 | `npm audit`、`socket.dev`、sobelow、`@audit-llm/llamAudit` |
| 签名 | 对外发布前，所有 .node 用自维护的 EV 证书签名 |
| ABIs | 严格 `--rebuild` 对应 Electron ABI（`electron-rebuild`） |

```json
{
  "//": "package.json",
  "scripts": {
    "postinstall": "electron-rebuild -f -w better-sqlite3,node-ndk,ssh2",
    "pretest": "node ./scripts/check-native-abi.js"
  }
}
```

`check-native-abi.js`：

```js
const child = require('child_process');
const { app } = require('electron');
app.whenReady().then(() => {
  // 输出 napi version
  console.log('napi version:', process.versions.napi);
  console.log('modules version:', process.versions.modules);
  // run smoke
  const sqlite = require('better-sqlite3');
  console.log('sqlite OK:', sqlite(':memory:').prepare('select sqlite_version() as v').get());
});
```

---

## 3.8 自动更新通道的安全

`electron-updater` 默认从 S3/OSS/GitHub/Generic provider 拉安装包。流程：

```text
应用启动 → checkForUpdates() → S3/GitHub release → zip / blockmap
   → 比对 build.version 与本地 update.appDir/version
   → 下载 → 校验 SHA512（如果配置签名）→ 退出应用 → 执行安装包
   ↓
macOS: 自动进 /Applications 提示替代原 App
Windows: runas + UAC 弹出
Linux: AppImage 自替换，deb/rpm 调用系统包管理器
```

至少要做到：

1. **`--sign` 必须有**：安装包用 EV / 通用代码签名证书签名。
2. **blockmap 必须生成**：自动更新走差分包。
3. **强制 SHA512**：在 update config 里指定 `channelFileSha512`、`updaterCacheDirName` 等。
4. **下载 URL HTTPS**：禁 HTTP。
5. **签名校验**：GitHub 自动发布带 `latest.yml` 是带签名的，需要 `rsa-pub-key` 模式。

```js
const { autoUpdater } = require('electron-updater');
autoUpdater.setFeedURL({
  provider: 'generic',
  url: 'https://updates.example.com',
  channel: 'stable',
});
autoUpdater.verifyUpdateCodeSignature = true;   // 关键：开启签名校验
```

**反模式**：

- 把更新包放在 GitHub raw URL（没有签名校验）。
- 自动强制更新（用户无法回滚）。
- 更新源自带 CDN，不带校验：被劫持就 RCE。

---

## 3.9 安全检查清单（落地版）

```markdown
## 安全基线 - 桌面应用基线检查

### BrowserWindow 配置
- [ ] webPreferences.contextIsolation = true
- [ ] webPreferences.nodeIntegration = false
- [ ] webPreferences.sandbox = true（Linux 已通过 chrome-sandbox setuid 启用）
- [ ] webPreferences.webSecurity = true
- [ ] webPreferences.allowRunningInsecureContent = false

### IPC
- [ ] 所有 Renderer → Main 通道通过 contextBridge 提供
- [ ] Renderer 不直接 require electron
- [ ] 主进程对所有 IPC 入参做 schema 校验（zod / ajv）
- [ ] ipcMain.handle 不在主进程同步执行高代价任务

### CSP / 协议
- [ ] 默认 CSP 已设置，且不允许 'unsafe-eval'
- [ ] will-navigate 被拦截
- [ ] setWindowOpenHandler 只白名单
- [ ] setAsDefaultProtocolClient 接入白名单

### 原生模块
- [ ] require 原生模块的代码已文件级注释说明 ABI 与降级版本
- [ ] .npmrc 里 registry 受限，lockfile 提交流水线
- [ ] 关键原生模块有备份 / 替代实现

### 更新与分发
- [ ] 生成 blockmap 与签名
- [ ] 在更新中嵌入 rsa-pub-key
- [ ] 强制 verifyUpdateCodeSignature
- [ ] 自动更新弹窗明示「版本号 / 大小 / 强制 vs 可选」

### 数据落地
- [ ] userData 文件夹权限（macOS ~/Library, %APPDATA%, ~/.config）默认 0700
- [ ] 写入的本地文件：cookie、localStorage、IndexedDB、cache 应受目录约束
- [ ] 不可把 JWT、Refresh Token 明文写到磁盘；用 Keychain/DPAPI/Secret Service
```

---

## 3.10 实战：搭一个最小受信 Renderer

我们一步步示范如何"安全地暴露 API 给 Renderer"。

### 3.10.1 preload.ts

```ts
import { contextBridge, ipcRenderer } from 'electron';

const invoke = <T = any>(channel: string, payload?: any): Promise<T> => {
  return ipcRenderer.invoke(channel, payload);
};

contextBridge.exposeInMainWorld('api', {
  fs: {
    readUserConfig: (key: string) => invoke('fs.readUserConfig', { key }),
    writeUserConfig: (key: string, value: unknown) =>
      invoke('fs.writeUserConfig', { key, value }),
  },
  auth: {
    login: (user: string, password: string) =>
      invoke('auth.login', { user, password }),
    logout: () => invoke('auth.logout'),
  },
  on: (event: 'deep-link', cb: (url: string) => void) => {
    const listener = (_: Electron.IpcRendererEvent, url: string) => cb(url);
    ipcRenderer.on('deep-link', listener);
    return () => ipcRenderer.off('deep-link', listener);
  },
});
```

### 3.10.2 主进程

```ts
ipcMain.handle('fs.readUserConfig', async (_e, { key }) => {
  if (!/^[\w.\-:]{1,256}$/.test(key)) throw new Error('bad key');
  return userStore.get(key);
});

ipcMain.handle('fs.writeUserConfig', async (_e, { key, value }) => {
  if (!/^[\w.\-:]{1,256}$/.test(key)) throw new Error('bad key');
  return userStore.set(key, value);
});

ipcMain.handle('auth.login', async (_e, { user, password }) => {
  // 交给后端 + Keychain
  return authService.login(user, password);
});
```

**记住**：contextBridge 暴露的对象在 isolated world 中是"deep cloned by structure"，但 `Function`/`Error` 特殊。**不要**把整个 `ipcRenderer` 暴露出去。

---

## 3.11 反模式速查

```text
反模式：
  1. nodeIntegration: true
  2. contextIsolation: false
  3. 在 preload 里直接挂 window.foo = '...'
  4. 不写 CSP / 写 unsafe-eval
  5. 直接 setWindowOpenHandler({action: 'allow', overrideBrowserWindowOptions: {nodeIntegration: true}})
  6. contextBridge.exposeInMainWorld('ipc', { invoke: ipcRenderer.invoke })
  7. 不校验 IPC 入参，靠渲染层做权限
  8. 自动更新不带签名 / 强制 verifyUpdateCodeSignature
  9. 注册自定义协议不做白名单
  10. 把 cookie / JWT / RefreshToken 写到普通文件
```

---

## 3.12 推荐工具

- **depcheck / madge**：发现未使用包与依赖环路。
- **socket.dev**：依赖风险审计（替代 npm audit，识别 typosquatting 与维护停摆）。
- **oss-safer**：Electron 安全基线检查。
- **electron-audit / electron-builder audit** —— 安装包签名与漏洞。

---

## 3.13 本章小结

- Electron 安全的核心是 contextIsolation + sandbox + CSP + 签名更新。
- 每开一个渲染层 entry 都要审视：节点能力、协议、白名单、加载来源。
- IPC 是攻击面 —— 一个 schema 验证少不了。
- 自定义协议、deep link 是 OS 级别的攻击面，必须白名单。

下一章 [04 · IPC 通信](./../04-ipc/README.md)。
