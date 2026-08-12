# 23 · 大型 monorepo 5 分钟启动指南

> 这一章是上一章的实操落地。把整套 monorepo 一行命令跑起来。**复制就能用**。

---

## 23.1 准备

### 23.1.1 必要工具

```bash
# Node 20+
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
nvm install 20
nvm use 20

# pnpm 9
corepack enable
corepack prepare pnpm@9.0.0 --activate

# 测试工具
pnpm i -g @playwright/test
pnpm exec playwright install --with-deps
```

### 23.1.2 必备环境

- macOS / Linux / Windows 任一系统
- 8GB+ RAM
- 20GB+ 磁盘

---

## 23.2 clone 启动

```bash
git clone <your-repo>
cd my-platform

# 一次性安装
pnpm install --frozen-lockfile

# 启动 vite + Electron dev
pnpm dev
```

第一个时间要 60-120 秒（需要拉 Electron binary）。

之后热重载：

- 渲染层：实时 reload (Vite HMR)。
- preload：自动重启 Electron。
- main：自动重启 Electron。

---

## 23.3 调试模式

### 23.3.1 VSCode

`launch.json`：

```json
{
  "configurations": [
    {
      "name": "Main",
      "type": "node",
      "request": "launch",
      "runtimeExecutable": "${workspaceFolder}/apps/desktop/node_modules/.bin/electron",
      "args": [".", "--inspect=9229"],
      "protocol": "inspector",
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen",
      "outputCapture": "std"
    },
    {
      "name": "Renderer",
      "type": "chrome",
      "request": "attach",
      "port": 9229,
      "webRoot": "${workspaceFolder}/apps/desktop/src/renderer"
    }
  ]
}
```

### 23.3.2 Chromium DevTools

```bash
pnpm dev --inspect-renderer
```

打开 `chrome://inspect`。

---

## 23.4 测试

### 23.4.1 单测

```bash
pnpm test
# 走 turbo run test
```

### 23.4.2 集成测试

```bash
pnpm -F @app/desktop test:integration
```

### 23.4.3 e2e

```bash
pnpm -F @app/desktop e2e
```

第一次需要装 playwright 浏览器：

```bash
pnpm exec playwright install
```

---

## 23.5 打包

### 23.5.1 本地打包

```bash
pnpm -F @app/desktop package
```

产物在 `apps/desktop/release/<version>/`。

### 23.5.2 三平台打包

如果你要一次性打三个平台，需要 macOS / Linux / Windows 三台机器（或用 GitHub Actions）。

```bash
# macOS
pnpm -F @app/desktop package -- --mac

# Linux
pnpm -F @app/desktop package -- --linux

# Windows (PS)
pnpm -F @app/desktop package -- --win
```

---

## 23.6 发布

### 23.6.1 自动更新

1. Tag 触发 release workflow (`.github/workflows/release.yml`)。
2. CI 打三平台包 + 签名 + 公证。
3. push 到 S3。
4. 客户端 autoUpdater 检测，下载、签名验证、应用。

### 23.6.2 手动发布

```bash
# 上传 latest.yml + 安装包到 S3
aws s3 cp release/latest.yml s3://my-updates/myplatform/latest/
aws s3 cp release/myplatform-1.0.0.dmg s3://my-updates/myplatform/latest/

# 创建 GitHub release
gh release create v1.0.0 release/*.{dmg,exe,zip,AppImage,deb,rpm,yml,yaml}
```

---

## 23.7 常见错误

### 错误 1：依赖装不上

```text
Error: electron@xxx install: …
```

解决：

```bash
# macOS
export ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/

# Linux
export PUPPETEER_DOWNLOAD_BASE_URL=https://npmmirror.com/mirrors/chromium-browser-snapshots/
```

### 错误 2：better-sqlite3 ABI 不匹配

```bash
pnpm rebuild better-sqlite3
# 或
pnpm -F @app/desktop run electron-rebuild
```

### 错误 3：签名失败

```bash
ls -la apps/desktop/build/cert.pfx
# 确保存在并 chmod 600
chmod 600 apps/desktop/build/cert.pfx
```

### 错误 4：公证失败

```bash
xcrun notarytool history
# 查看历史
xcrun notarytool log <UUID>
```

### 错误 5：auto-update 后无法启动

看 `~/Library/Application Support/MyPlatform/Crashpad/`：
- 是否 generated dump?

---

## 23.8 团队工作流

### 23.8.1 新功能流程

```text
1. 从 main 拉新分支：git checkout -b feature/abc
2. 写代码：开发、lint、test
3. commit：git commit -m 'feat(note): add search filter'
4. push + PR
5. CI 自动跑 build + test + lint
6. PR review
7. 合并
8. 自动部署到 staging
9. release：发 tag → 正式版
```

### 23.8.2 修改 IPC 流程

```text
1. 改 packages/core/src/ipc-schema.ts
2. pnpm codegen 自动更新 types
3. 改 main handlers
4. renderer 类型自动同步
5. TS 编译时报错的地方
```

### 23.8.3 hot-fix 流程

```text
git checkout main
git checkout -b hotfix/abc
git revert ... 或手动修复
写 fixes
git tag v0.9.1
git push origin v0.9.1
CI 发布 hotfix
```

---

## 23.9 推荐 IDE 工具

- VSCode (官方推荐)
- 必装插件：
  - `ESLint`
  - `Prettier`
  - `TypeScript`
  - `JavaScript Debugger`
  - `Vitest`
  - `Playwright`
  - `Error Lens`

---

## 23.10 5 个细节让 monorepo 跑稳

1. **`pnpm-workspace.yaml` 锁死 package 定义**。
2. **`turbo.json` 任务依赖必须正确**，否则会重复 build。
3. **`tsconfig.base.json` 是唯一 TS 真理**。
4. **`commitlint` + `husky` + `lint-staged`** 三件套保证每条 commit 干净。
5. **CI 跑同一份 turbo task + 同一份 test**，保证"在我机器跑通"。

---

## 23.11 总结

读完这套 22 章 + 21 个示例工程 + 完整 monorepo，你已经掌握 Electron 工程师日常所需的 95% 知识。

剩下 5% 是：
- 业务深度
- 跨域架构经验
- OS 底层

这三项只能靠"做真实项目"。但本教程已经把脚手架都搭好，剩下的就是去填内容。

---

祝学有所成、做出真正改变行业的产品。
