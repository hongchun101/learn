# 09 · 自动更新

> 自动更新是 Electron 桌面应用的"运维心脏"。写好后用户体验丝滑，写错就是全员回滚的事故。这一章我们从流程、协议、签名、UI 弹窗四个角度建立完整的自动更新能力。

---

## 9.1 自动更新的两种主流路径

```text
路径 A: electron-updater (Squirrel 家族)
   ├── Windows: Squirrel.Windows (NSIS 安装包 + Update.exe)
   ├── macOS:   Squirrel.Mac  (Sparkle 后裔, ZIP 差分)
   └── Linux:   AppImage (自替换)

路径 B: 自研 + Squirrel 类 (适合企业内部)
   └── 控制二进制更新；定制更新流程
```

Electron **官方**在 2023 年起明确推荐使用 [`@electron/update-electron-app`](https://github.com/electron/update-electron-app)，它封装了 `electron-updater`，加上一套默认策略与日志。

---

## 9.2 总体流程

```text
┌─────────────────────────┐                 ┌──────────────────────────┐
│ 应用主进程               │                 │ 更新源 (HTTP API / OSS)   │
│                         │  GET /updates   │                          │
│  app.checkForUpdates()  ├────────────────►│                          │
│                         │  latest.yml     │                          │
│                         │◄────────────────┤   返回：                  │
│  compare version        │                 │     - version            │
│                         │                 │     - update            │
│  download .zip/.blockmap│ GET /X.X.X.zip  │     - sha512             │
│                         ├────────────────►│                          │
│  verify signature       │                 │     (文件 + 签名)         │
│                         │                 │                          │
│  quit() -> launch update│                 │                          │
│                         │                 │                          │
└─────────────────────────┘                 └──────────────────────────┘
                 │
                 ▼
   installUpdater.Squirrel/Squirrel.Windows/Squirrel.Mac
                 │
                 ▼
        替换 AppImage / 引导 Squirrel install
```

各平台实现差异：

| 平台 | 渠道 |
|------|------|
| Windows | Squirrel.Windows + NSIS / Inno Setup |
| macOS | Squirrel.Mac / Sparkle |
| Linux | AppImage / deb / rpm 自更新 |

---

## 9.3 electron-updater 实战

### 9.3.1 安装与配置

```bash
npm i electron-updater
```

`package.json`：

```json
{
  "name": "my-app",
  "version": "1.0.0",
  "main": "main.js",
  "build": {
    "appId": "com.example.app",
    "productName": "My App",
    "publish": [
      {
        "provider": "generic",
        "url": "https://updates.example.com/my-app",
        "channel": "latest",
        "useMultipleRangeRequest": false
      }
    ],
    "win": {
      "target": ["nsis"],
      "signAndEditExecutable": true,
      "publisherName": "CN=Example Inc."
    },
    "mac": {
      "target": ["dmg", "zip"],
      "category": "public.app-category.productivity"
    },
    "linux": {
      "target": ["AppImage", "deb"],
      "executableName": "my-app"
    }
  }
}
```

### 9.3.2 主进程

```ts
import { app, BrowserWindow, dialog, autoUpdater, ipcMain } from 'electron';

let mainWindow: BrowserWindow;

app.whenReady().then(async () => {
  mainWindow = createMain();
  if (process.env.NODE_ENV !== 'development') {
    const { default: log } = await import('electron-log');
    autoUpdater.logger = log;
    (log as any).transports.file.level = 'info';

    autoUpdater.setFeedURL({
      provider: 'generic',
      url: 'https://updates.example.com/my-app',
      channel: 'latest',
    });

    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    await autoUpdater.checkForUpdates();
  }
});

autoUpdater.on('update-available', async (info) => {
  // 通知渲染层
  mainWindow.webContents.send('update:available', { version: info.version, size: prettyBytes(info.files?.[0].size ?? 0) });

  // 弹窗询问
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Update Available',
    message: `A new version ${info.version} is available.`,
    detail: `Changelog:\n${info.releaseNotes}`,
    buttons: ['Download', 'Later'],
  });
  if (response === 0) autoUpdater.downloadUpdate();
});

autoUpdater.on('update-downloaded', async (info) => {
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Update Ready',
    message: 'A new version has been downloaded. Restart now?',
    buttons: ['Restart', 'On next launch'],
    defaultId: 1,
  });
  if (response === 0) autoUpdater.quitAndInstall();
});

ipcMain.handle('update:download', () => autoUpdater.downloadUpdate());
ipcMain.handle('update:install',  () => autoUpdater.quitAndInstall());
```

### 9.3.3 preload

```ts
contextBridge.exposeInMainWorld('updater', {
  download: () => ipcRenderer.invoke('update:download'),
  install: () => ipcRenderer.invoke('update:install'),
  onAvailable: (cb: (info: any) => void) => {
    const fn = (_e: any, info: any) => cb(info);
    ipcRenderer.on('update:available', fn);
    return () => ipcRenderer.off('update:available', fn);
  },
});
```

### 9.3.4 update-electron-app 方案

Electron 27+ 提供更省事的方式：

```ts
import { updateElectronApp } from '@electron/update-electron-app';

updateElectronApp({
  updateSource: { host: 'https://updates.example.com/my-app', repo: undefined as any },
  notifyUser: true,
});
```

它会在更新时自动弹原生的弹窗。本教程以更细粒度的 `electron-updater` 为主，目的是让你理解每一行配置的意思。

---

## 9.4 签名与安全

### 9.4.1 Windows 签名

`electron-builder` 自动调用 `signtool`，需要 EV 证书：

```
build.win.signtoolOptions = {
  certificateFile: 'cert.pfx',
  certificatePassword: 'xxxxx',
  publisherName: 'CN=Your Company',
  signAndEditExecutable: true,
  signtoolPath: 'C:/Program Files (x86)/Windows Kits/10/bin/x64/signtool.exe',
}
```

也支持云签名（如 DigiCert KeyLocker、Azure Code Signing）。

### 9.4.2 macOS 签名与公证

```bash
# macOS 需要:
# 1. Developer ID 证书 (Developer ID Application)
# 2. 公证 (notarytool + altool)
```

`electron-builder` 自动调：

```json
"build": {
  "mac": {
    "identity": "Developer ID Application: Your Company (TEAMIDXX)",
    "notarize": { "teamId": "TEAMIDXX", "tool": "notarytool" },
    "darkModeSupport": true,
    "hardenedRuntime": true
  }
}
```

公证前要在 App 中：

- 不使用 `sudo` 或管理员能力。
- 启用 `Hardened Runtime` (entitlements)。
- 不允许 `disable-library-validation`。

### 9.4.3 Linux 签名

AppImage 通常不强制签名，但建议使用 GPG 签名 + 仓库源（apt / yum）。

```bash
gpg --detach-sign --armor MyApp-1.0.0.AppImage
```

### 9.4.4 Update 包校验

`electron-updater` 默认按 `pub_key` 校验：

```ts
import { app } from 'electron';
import path from 'node:path';

app.setPath('userData', path.join(app.getPath('userData'), 'prod'));
// RSA 公钥在 update 配置文件中：
// latest.yml:
//   pub_key: <public key>
```

CI 上传：

```yaml
# GitHub Actions
- run: npx electron-builder --publish always --x64 --ia32
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### 9.4.5 备份与回滚

```ts
const rollBackMode = process.env.MYAPP_ROLLBACK === '1';
if (rollBackMode) {
  // 启动老版本进程，跳过 autoUpdater
}
```

---

## 9.5 灰度与渠道

### 9.5.1 多渠道

```ts
autoUpdater.channel = 'beta';
autoUpdater.setFeedURL({
  provider: 'generic',
  url: 'https://updates.example.com/my-app/beta',
});
```

server 端维护不同目录的 yml。每个发布有 `latest-beta.yml`、`latest.yml`、`latest-canary.yml`。

### 9.5.2 灰度

```ts
const cfg = await remoteConfig.getConfig();
const allowed = cfg.updateGroups; // e.g. ['3%','20%','100%']

const seed = hash(userId) % 100;
if (seed < 3) autoUpdater.channel = 'canary';
else if (seed < 20) autoUpdater.channel = 'beta';
```

### 9.5.3 强制 / 可选

```ts
info.minimumAutoerelay ??= ...

const isCritical = info.releaseName?.includes('security-');
if (isCritical) {
  // 强制升级
  await dialog.showMessageBox({
    type: 'warning',
    title: 'Security update required',
    message: 'This version fixes a critical vulnerability. Restart now to apply.',
  });
  autoUpdater.quitAndInstall();
}
```

---

## 9.6 升级过程中的 UX

### 9.6.1 状态机

```text
未升级 → 检测到更新 → 用户确认 → 下载 → 下载完成 → 准备安装 → 安装中 → 重启
                │                                                  │
              跳过                                          可立即/下次启动
```

UI 中至少要展示：

- 版本号 / changelog。
- 文件大小 / 类型 / 严重程度。
- 操作按钮：稍后 / 立即更新。
- 下载进度条（用 `download-progress` 事件）。

### 9.6.2 静默更新 (企业内)

```ts
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.on('download-progress', (p) => sendProgressToTray(p));
```

### 9.6.3 关闭时升级

```ts
let isQuitting = false;
app.on('before-quit', () => {
  isQuitting = true;
});

window.on('close', (e) => {
  if (isQuitting) return;
  if (autoUpdater.updateAvailable && !autoUpdater.updateDownloaded) {
    e.preventDefault();
    dialog.showMessageBox({ message: 'update in progress' });
  }
});
```

---

## 9.7 macOS 公证失败排查

公证失败的常见原因：

1. **签名后未 hard-enable runtime**。需要 entitlements：

```xml
<!-- entitlements.mac.plist -->
<dict>
  <key>com.apple.security.cs.allow-jit</key><true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key><true/>
  <key>com.apple.security.cs.disable-library-validation</key><true/>
</dict>
```

2. **未将 Helper 签名**（macOS 自动添加 `MyApp Helper` 子程序）。

   ```json
   "build.mac.helperBundleId": "com.example.app.helper",
   ```

3. **过期 cert / 公证 teamId 不匹配**。

   重置 keychain login。

4. **DMG 太大（> 1GB）**，公证工具超时 → 分拆上传。

   Xcode 13+ 使用 notarytool：

   ```bash
   xcrun notarytool submit MyApp.dmg --keychain-profile "AC_PASSWORD" --wait
   xcrun stapler staple MyApp.dmg
   ```

### 9.8 多实例更新

启动时不允许多实例：

```ts
if (!app.requestSingleInstanceLock()) {
  app.quit();
}
```

更新中也避免冲突：

```ts
const updateLockFile = path.join(app.getPath('userData'), 'update.lock');
if (fs.existsSync(updateLockFile)) {
  // 已经在更新中
} else {
  fs.writeFileSync(updateLockFile, `${process.pid}`);
  try {
    autoUpdater.downloadUpdate();
    autoUpdater.on('update-downloaded', () => {
      autoUpdater.quitAndInstall();
      fs.unlinkSync(updateLockFile);
    });
  } catch (e) {
    fs.unlinkSync(updateLockFile);
    throw e;
  }
}
```

---

## 9.9 Linux AppImage 自更新机制

AppImage 提供 `--appimage-extract-and-update` 等参数，我们也可以自己造：

```bash
AppRun -u  # Squirrel 模式
```

或：

```ts
import { spawn } from 'node:child_process';
spawn(process.argv0, ['--appimage-extract-and-update'], { detached: true, stdio: 'ignore' }).unref();
```

deb / rpm 用 apt / yum 路径，需要 OS 权限，更多走 OOBE。

---

## 9.10 测试更新流程

### 9.10.1 本地模拟

```bash
# 一次 build + 一次旧版本
1.1.0 安装
启动
. . 模拟 "升级可用"
1.2.0 build & yml
复制到 mock 路径
测试自动更新
```

```bash
# electron-builder --publish onTagOrDraft
```

### 9.10.2 端到端

用 Playwright + Spectron 替代品（已弃用）。或自写 `tap` 工具：

```ts
import { spawn } from 'node:child_process';
const child = spawn('npm', ['run', 'package']);
child.on('exit', (c) => c === 0 && spawn('npm', ['run', 'package:dev-update']));
```

### 9.10.3 应急回滚

CI 生成 `versions` 列表，每个版本带 ID。回滚时下载 `releases/1.0.0.yml` 包。

---

## 9.11 反模式

```text
1. 不签名就分发（sniffer/MITM 拿到就能注入）
2. 不分渠道直接发生产（破坏灰度）
3. 强制升级在用户工作流中（设强制 + 关不掉）
4. 把 release notes 写死，竞品升级后看不到
5. 不在 macOS 中公证（Gatekeeper 当场杀掉）
6. 仅依赖 Squirrel，缺少回滚
7. 不监听 autoUpdater 事件，UI 不更新
8. 大文件包不带 blockmap（差分丢失）
9. 在 worker 全部在 idle 时才升级（用户机器不用你操心）
10. 自动安装要重启但不友好提示
```

---

## 9.12 验证清单

```markdown
### 自动更新验证

- [ ] 安装包用 EV / Developer ID 证书签名
- [ ] macOS 上传 + 公证 + staple
- [ ] latest.yml / macos 更新文件包含 sha512/pub_key
- [ ] Windows 安装包带 Update.exe / .blockmap
- [ ] Linux AppImage 自替换 / deb 走仓库
- [ ] 灰度渠道可用（beta、canary）
- [ ] 强制升级 / 可选升级分流
- [ ] 自动升级 UI 友好提示重启
- [ ] 离线 / 恢复网络策略
- [ ] 升级失败可回滚到上一版本
```

---

## 9.13 小结

- 自动更新不是一行 `checkForUpdates()`，签名、公证、灰度、回滚每个都要到位。
- `electron-updater` 99% 项目首选，但大企业建议自研。
- UI 不是 Electron 升级的关键问题，**签名 + 渠道** 才是。

下一章 [10 · 打包与分发](./../10-packaging/README.md)。
