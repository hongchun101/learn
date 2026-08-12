# Electron 专家级教程 · 完整索引

> 教程包含：**13 章主教程 + 4 进阶附录 + 5 深度专题 + 大型 monorepo 实战工程**。覆盖从架构原理到生产部署的完整路径。学完你就是 团队里最懂 Electron 性能 / 调试 / 源码 / 打包 / 部署的人。

---

## 总览

### 主教程：13 章

| 章节 | 主题 | 时长 |
|------|------|------|
| [01 - 架构与源码导读](./01-architecture/) | Electron 运行时分层、版本演进、源码目录结构 | 1 天 |
| [02 - 进程模型与生命周期](./02-process-model/) | Browser/Renderer/GPU/Utility/Network、生命周期 | 2 天 |
| [03 - 安全工程](./03-security/) | CSP / Sandbox / webPreferences / IPC schema | 2 天 |
| [04 - IPC 通信](./04-ipc/) | send/invoke/MessageChannel, 模式与契约 | 2 天 |
| [05 - Native 集成](./05-native/) | N-API / Menu / Tray / Notification / 协议 | 2 天 |
| [06 - 窗口与渲染管线](./06-window-render/) | BrowserWindow / WebContents 加载流水线 | 2 天 |
| [07 - 性能与内存（专家级深度）](./07-performance/) | trace JSON、heap snapshot、19 类真实案例 | 3 天 |
| [08 - 持久化与存储](./08-storage/) | userData / SQLite / IndexedDB / Keychain | 2 天 |
| [09 - 自动更新](./09-auto-update/) | electron-updater / 签名 / 公证 / 灰度 | 2 天 |
| [10 - 打包与分发](./10-packaging/) | electron-builder 三平台 + 自动签名 + CI/CD | 2 天 |
| [11 - 调试与诊断（专家级深度）](./11-debugging/) | minidump / stackwalker / Crashpad 实战 | 3 天 |
| [12 - 进阶与生态](./12-advanced/) | Offscreen / View / Extensions / OS 集成 | 2 天 |
| [13 - 实战项目：Notes for Researchers](./13-project/) | 从空白到生产的真实工程 | 5 天 |

### 进阶附录：4 章

| 附录 | 主题 |
|------|------|
| [14 - 源码深度解读（专家级深度）](./14-deep-internals/) | BrowserWindow / ipcRenderer / Utility Process 逐行 walk |
| [15 - TypeScript 与工具链](./15-typescript-tooling/) | monorepo + tsconfig + 三层类型分离 |
| [16 - 测试深入](./16-testing/) | unit + integration + e2e + perf bench |
| [17 - Chromium 架构深入](./17-chromium-architecture/) | Chromium 进程模型 / V8 / 合成器 |

### 深度专题（新增）：5 章

| 章节 | 主题 |
|------|------|
| **[18 - Trace 完整解读手册](./18-trace-handbook/)** | trace.json 字段完整解释 + 启动期 / Renderer / GPU trace 真实 walk |
| **[19 - 生产事故案例库](./19-incident-casebook/)** | 12 类别真实事故：启动 / 渲染 / Native / 安全 / 更新 / 平台 / 内存 / 性能 / 团队，包含 12 个 runbook |
| **[20 - 签名与公证完整流程](./20-signing-notarization/)** | macOS / Windows / Linux 三平台签名 + 公证 + 自动更新签名 + 完整 GitHub Actions |
| **[21 - 大型生产级 monorepo 实战](./21-monorepo/)** | pnpm + turbo + electron-vite + electron-builder，21 个真实文件，可 fork |
| **[22 - IPC 类型生成器与端到端类型安全](./22-ipc-type-codegen/)** | Zod → 自动类型 → preload → renderer codegen |
| **[23 - monorepo 5 分钟启动指南](./23-monorepo-launch-guide/)** | clone → dev → test → package → publish 全流程 |

### 完整生产级 monorepo

`21-monorepo/` 下是**完整可跑**的工程：

```
21-monorepo/
├── package.json                  ← root
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
├── tsconfig.node.json
├── tsconfig.web.json
├── eslint.config.js
├── prettier.config.js
├── commitlint.config.cjs
├── vitest.config.ts
├── apps/desktop/
│   ├── electron.vite.config.ts
│   ├── electron-builder.yml
│   ├── src/main/
│   │   ├── index.ts
│   │   ├── window-manager.ts
│   │   ├── ipc.ts
│   │   ├── auto-updater.ts
│   │   └── telemetry.ts
│   └── src/preload/index.ts
├── packages/
│   ├── core/
│   │   ├── src/domain/types.ts
│   │   ├── src/domain/note.ts
│   │   ├── src/db/repositories.ts
│   │   ├── src/db/migrations.ts
│   │   ├── src/ipc-contract.ts
│   │   └── src/services.ts
│   └── utils/src/log.ts
└── infra/
    └── ci/...
```

这个 monorepo 包含：21 个完整的真实文件 + 全部 配置文件 + 完整 CI / CD YAML。它是**真正可以 fork 后成为团队核心仓库**的工程。

---

## 学习路径

### 路线 A：3 周精通（按主章节顺序）

- 第 1 周：01-04
- 第 2 周：05-08
- 第 3 周：09-13 + 18-19

### 路线 B：30 天 P0 强化（专家级）

| 周 | 内容 |
|----|------|
| 第 1 周 | 主教程 01-06 |
| 第 2 周 | 主教程 07-12（重点 07 / 11） |
| 第 3 周 | 14 / 17 / 18 / 19 深度专题 |
| 第 4 周 | 21 monorepo + 上手实践 |

### 路线 C：Electron 工程师在岗提升

- 把 21-monorepo fork 当作"团队模板"。
- 把 19 章事故案例库做成内部事故 wiki。
- 把 18 章 trace 解读当作 oncall 培训材料。

---

## 验收标准

学完后你应该：

- [ ] 能从生产事故报告 → trace → 源代码行号完整 walk 一次。
- [ ] 能说清楚 Chromium / Node / V8 / Electron 四层架构。
- [ ] 能用 Zod schema + codegen 维护 50+ IPC channel 的工程。
- [ ] 能配置三平台签名 + 公证 + 自动更新 + GitHub Actions。
- [ ] 能把项目改造成 monorepo 形态，并以 turbo / pnpm 维护。
- [ ] 能在 50 行代码内写出 N-API 模块并发布。
- [ ] 能在看到 minidump 后 10 分钟内 symbolicate 并定位代码行。
- [ ] 能在看到 trace 后 5 分钟内找到 Chromium 源码位置。

---

## FAQ

### Q：和上一版的差别？

A：上一版是"概念罗列"。这一版：

- 07 性能章加 5 道真实事故、7 个工具、19 类案例。
- 11 调试章加真实 minidump 解析 + symbolicate 输出 + 6 道实战案例 + 8 件工具箱。
- 14 源码深度章把 BrowserWindow / ipcRenderer / Utility Process / ContextBridge / app.commandLine 都做了"逐行 walk"，带真实代码片段 + commit 行号。
- 18-23 是 5 个新深度专题（之前没有）。
- 21-monorepo 是完整 21 个文件 + 全部配置 + 全部 配置文件。

### Q：怎么用？

A：18 章做 trace 阅读；19 章做事故处理；20 章做签名 / 公证；21 章做工程化模板；22 章做 IPC 类型安全。建议按顺序看。

### Q：和老教程（01-17）的连续性？

A：18-23 是新增深度专题。01-17 是基础。

---

## 推荐工具

- `chrome://tracing`
- `chrome://inspect`
- `Sentry`
- `electron-log`
- `electron-updater`
- `electron-builder`
- `electron-vite`
- `playwright`
- `vitest`
- `better-sqlite3`

---

## 联系与贡献

> 这是一份"持续演进"教程。每个 Electron 主版本出来都会更新一次，欢迎 PR。
