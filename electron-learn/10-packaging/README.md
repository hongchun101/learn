# 10 · 打包与分发

> 从源码到安装包的距离，就是配置 `electron-builder` 的距离。本章带你看清楚两种主流打包器（electron-builder、electron-forge）的差异，掌握三个平台的兼容性与 CI/CD。

---

## 10.1 打包器概览

| 工具 | 优势 | 劣势 |
|------|------|------|
| **electron-builder** | 配置灵活、生态广、能直接产出各平台安装包 + 自动更新 | 维护频次下降，配置稍微繁琐 |
| **electron-forge**（新 6.0+） | 官方力推、插件化、集成 Vite / Webpack | 配置新版本有 break change |
| **electron-packager** | 最底层、轻量、灵活 | 不产安装包，仅产 App |

我的建议：

- 长期项目：electron-builder。
- 想要最 modern DX：electron-forge + Vite 插件。

---

## 10.2 electron-builder 实战

### 10.2.1 基础配置

```json
{
  "name": "my-app",
  "version": "0.1.0",
  "main": "dist/main.js",
  "scripts": {
    "dev": "electron .",
    "build": "electron-builder",
    "build:win": "electron-builder --win --x64",
    "build:mac": "electron-builder --mac --arm64",
    "build:linux": "electron-builder --linux --x64",
    "release": "electron-builder --publish always"
  },
  "build": {
    "appId": "com.example.app",
    "productName": "My App",
    "directories": {
      "output": "release/${version}",
      "buildResources": "build"
    },
    "asar": true,
    "asarUnpack": [
      "**/*.node",
      "**/*.dll",
      "**/native/**",
      "**/webviews/**"
    ],
    "files": [
      "dist/**",
      "package.json"
    ],
    "extraResources": [
      {
        "from": "build/assets",
        "to": "assets"
      }
    ],
    "compression": "normal",
    "removePackageScripts": true,
    "electronLanguages": ["en-US", "zh-CN"],
    "afterPack": "scripts/after-pack.cjs"
  }
}
```

### 10.2.2 平台配置

Windows：

```json
"win": {
  "target": [
    { "target": "nsis",        "arch": ["x64"] },
    { "target": "portable",    "arch": ["x64"] }
  ],
  "signtoolOptions": {
    "publisherName": "Example Inc."
  },
  "requestedExecutionLevel": "asInvoker"
}
```

macOS：

```json
"mac": {
  "category": "public.app-category.developer-tools",
  "target": [
    { "target": "dmg",        "arch": ["x64", "arm64"] },
    { "target": "zip",        "arch": ["x64", "arm64"] }
  ],
  "hardenedRuntime": true,
  "gatekeeperAssess": false,
  "identity": "Developer ID Application: Example Inc. (TEAMIDXX)",
  "notarize": {
    "teamId": "TEAMIDXX",
    "tool": "notarytool"
  }
}
```

Linux：

```json
"linux": {
  "target": ["AppImage", "deb", "rpm", "tar.xz"],
  "category": "Development",
  "executableName": "my-app",
  "icon": "build/icon.png",
  "vendor": "Example Inc.",
  "synopsis": "An awesome Electron app",
  "description": "Long description of my app"
}
```

### 10.2.3 NSIS 配置（Windows 进阶）

```json
"nsis": {
  "oneClick": false,
  "perMachine": false,
  "allowElevation": true,
  "allowToChangeInstallationDirectory": true,
  "deleteAppDataOnUninstall": true,
  "createDesktopShortcut": true,
  "createStartMenuShortcut": true,
  "shortcutName": "My App",
  "include": "build/installer.nsh"
}
```

### 10.2.4 afterPack / beforeBuild 钩子

```js
// scripts/after-pack.cjs
exports.default = async (ctx) => {
  if (ctx.electronPlatformName === 'darwin') {
    // 写 entitlements
    const fs = require('node:fs');
    const plist = fs.readFileSync('build/entitlements.mac.plist', 'utf8');
    fs.writeFileSync(`${ctx.appOutDir}/My App.app/Contents/Info.plist`, plist);
  }
};
```

### 10.2.5 产物路径

```text
release/0.1.0/
├── My App-0.1.0.dmg
├── My App-0.1.0-mac.zip
├── My App Setup 0.1.0.exe            ← Windows NSIS
├── My App-0.1.0.exe                  ← Windows 便携
├── My App-0.1.0.AppImage             ← Linux
├── my-app_0.1.0_amd64.deb
├── my-app-0.1.0.x86_64.rpm
├── latest.yml
├── latest-mac.yml
└── builder-debug.yml
```

`latest.yml` 与 `latest-mac.yml` 是自动更新源。

---

## 10.3 electron-forge 实战

### 10.3.1 初始化

```bash
npm init electron-app@latest my-app -- --template=vite-typescript
```

### 10.3.2 vite + ts 模板

```ts
// forge.config.ts
import type { ForgeConfig } from '@electron-forge/core';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { MakerAppImage } from '@electron-forge/maker-appimage';
import { PublisherGithub } from '@electron-forge/publisher-github';

export default {
  packagerConfig: {
    asar: true,
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({}),
    new MakerDMG({}),
    new MakerDeb({}),
    new MakerRpm({}),
    new MakerAppImage({}),
  ],
  publishers: [
    new PublisherGithub({
      repository: { owner: 'me', name: 'my-app' },
      prerelease: false,
      draft: true,
    }),
  ],
} satisfies ForgeConfig;
```

### 10.3.3 插件

- `@electron-forge/plugin-vite`：Vite 开发服务器。
- `@electron-forge/plugin-webpack`：Webpack（已不推荐，但旧项目仍在用）。
- `@electron-forge/plugin-auto-unpack-natives`。

---

## 10.4 构建工程的"高阶"配置

### 10.4.1 减少安装包体积

```text
1. asar 打包源码，单文件读取
2. asarUnpack 拆出原生 .node / dll（必须保留原始格式以被 libuv dlopen）
3. 多语言（zh-CN, en-US）只打包必要语种
4. 用 swc / esbuild 编译主进程、preload，去除 sourcemap
5. 删除 debug 版本 Worker 类（vsync to release）
```

ASAR 性能对比：

| 类型 | 1k 文件 | 10k 文件 |
|------|---------|----------|
| 散落文件 | 200ms | 2500ms |
| ASAR unpack | 250ms | 280ms |
| ASAR + V8 snapshot | 80ms | 100ms |

### 10.4.2 多平台构建

Apple Silicon Mac 默认产出 x64 + arm64。Windows ARM64 需要 `electron-builder 23+`。Linux ARM64 同样需要。

跨平台构建依赖：

| 目标 | Host 平台 |
|------|----------|
| Windows nsis | Windows / Linux |
| macOS | 必须 macOS |
| Linux AppImage / deb | Linux |
| Linux RPM | Linux |

### 10.4.3 增量构建

- `electron-builder` 支持 `cache` 目录。
- `electron/electron` 的二进制本身复用 cache。
- `node_modules` 变化时 dist 增量构建。

### 10.4.4 缓存与 cache busting

`userData` 不影响安装包，但 **Settings 路径的迁移** 需要：

```ts
import { app } from 'electron';
app.setPath('userData', path.join(app.getPath('appData'), 'prod-app'));
```

---

## 10.5 CI/CD

### 10.5.1 GitHub Actions 多平台

```yaml
name: Build
on: { push: { branches: [main] } }

jobs:
  release:
    name: Build ${{ matrix.os }}
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [macos-latest, windows-latest, ubuntu-latest]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm run build
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      - run: npm run release
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        if: github.event_name == 'push'
      - uses: actions/upload-artifact@v4
        with:
          name: app-${{ matrix.os }}
          path: release/
```

### 10.5.2 macOS 公证签名

```yaml
- name: Install cert
  env:
    MAC_CERTS: ${{ secrets.MAC_CERTS }}
    MAC_CERTS_PASSWORD: ${{ secrets.MAC_CERTS_PASSWORD }}
  run: |
    KEYCHAIN_PATH=$RUNNER_TEMP/build.keychain
    security create-keychain -p $MAC_CERTS_PASSWORD $KEYCHAIN_PATH
    security import $MAC_CERTS -P $MAC_CERTS_PASSWORD -A -t cert -f pkcs12 -k $KEYCHAIN_PATH
```

### 10.5.3 Upload 到 CDN

```yaml
- uses: aws-actions/configure-aws-credentials@v4
  with:
    aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
    aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
    aws-region: us-east-1
- run: aws s3 sync release/ s3://my-updates-bucket/my-app/${{ github.sha }}
```

### 10.5.4 推送更新元信息

CI 完成后用自动脚本生成 `latest*.yml`（已由 electron-builder 在 `--publish always` 时自动生成）。

---

## 10.6 安装包结构

### 10.6.1 macOS `.app`

```text
MyApp.app/
├── Contents/
│   ├── Info.plist                 ← bundle id, version
│   ├── Resources/
│   │   ├── app.asar
│   │   └── icon.icns
│   ├── MacOS/
│   │   └── MyApp                  ← electron 可执行二进制
│   ├── Frameworks/
│   │   ├── MyApp Helper (GPU).app
│   │   ├── MyApp Helper (Renderer).app
│   │   ├── MyApp Helper (Plugin).app
│   │   └── Electron Framework.framework
│   ├── PkgInfo
│   └── _CodeSignature/             ← codesign signature
```

### 10.6.2 Windows NSIS

```text
MyApp Setup 0.1.0.exe   (Squirrel installer)
├── nssm.exe
├── Update.exe            ← Squirrel.Windows update agent
├── MyApp.exe             ← 主程序
├── *.dll
├── locales/
└── resources/app.asar
```

### 10.6.3 Linux AppImage

```text
my-app-0.1.0.AppImage (一个文件)
   squashfs 压缩的 rootfs
   ├── AppRun
   ├── my-app.desktop
   ├── my-app.png
   └── usr/bin/my-app + resources/app.asar
```

---

## 10.7 验证清单

```markdown
### 打包 / 分发

- [ ] 三平台安装包能成功产出
- [ ] macOS .dmg .zip 都通过 `xcrun notarytool verify`
- [ ] Windows nsis 包用 signtool verify 报错但合法
- [ ] Linux AppImage 在 FUSE 系统上能 chmod +x 运行
- [ ] 自动更新 latest.yml 含 sha512 / pub_key
- [ ] 文档 / EULA / License 录入到 build/
- [ ] 主进程 sourcemap 不在生产包中出现
- [ ] 原生模块 ABI 重建 (electron-rebuild)
- [ ] 全平台图标分辨率
```

---

## 10.8 推荐模板

- vit-electron / vite-electron-plugin
- electron-forge/vite-typescript
- electron-vite / electron-vibrancy
- electron-builder+Next.js + Next 调试插件

---

## 10.9 小结

- `electron-builder` 是 9 成项目的选择，配置写明 configs 就够。
- 三平台产物大小、性能、签名各不相同，跨平台构建流程要单独测试。
- CI/CD 是 Electron 项目工程化的灵魂，签名/公证是必要环节。

下一章 [11 · 调试与诊断](./../11-debugging/README.md)。
