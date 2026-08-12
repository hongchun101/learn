# Electron 专家级教程（专家级深度版）

> 读完这份教程，你应该**比 99% 的 Electron 工程师能更高效地排查问题**。这不是 API 教学，而是**实战手册**——文档里的每个细节、每个 trace、每个 commit、每行代码都是真实工程沉淀。

---

## 为什么这份教程"有深度"

很多 Electron 教程停留在：

```text
- 教 new BrowserWindow
- 教 webPreferences
- 列出 API 名称
```

本教程则教：

```text
- 用 chromium 的 trace JSON 找出 cold start 卡顿在哪一行 commit
- 用 minidump + symbolicate 定位 crash 的具体源头
- 用 Zod schema 做 IPC 类型安全 + codegen
- 落地一个生产级 monorepo
- 配置 macOS notarize + Windows EV 签名 + Linux GPG
- 解决 12 类生产事故
```

**学会这些，你才是 Electron 专家。**

---

## 教程结构

> **共 23 章 + 13 个实战示例 + 完整生产级 monorepo**。

### 主教程（13 章）

| # | 主题 | 重点 |
|---|------|------|
| 01 | 架构与源码导读 | 进程模型、Chromium 划分、源码目录 |
| 02 | 进程模型与生命周期 | Browser/Renderer/GPU/Utility/Network 五层 |
| 03 | 安全工程 | CSP / Sandbox / webPreferences / IPC schema |
| 04 | IPC 通信 | send/invoke/MessageChannel + 类型契约 |
| 05 | Native 集成 | N-API + 系统级 menu/tray/protocol |
| 06 | 窗口与渲染管线 | BrowserWindow + 加载流水线 |
| **07** | **性能与内存（专家级深度）** | **trace JSON / heap snapshot / 19 类真实案例** |
| 08 | 持久化与存储 | userData + SQLite + IndexedDB + Keychain |
| 09 | 自动更新 | electron-updater + 签名 + 灰度 |
| 10 | 打包与分发 | electron-builder + Forge + CI/CD |
| **11** | **调试与诊断（专家级深度）** | **minidump + symbolicate + 6 道实战案例** |
| 12 | 进阶与生态 | Offscreen / View / OS 集成 |
| 13 | 实战项目 | 完整端到端 |

### 进阶附录（4 章）

- 14 **源码深度解读（专家级深度）**：每个 API 逐行 walk
- 15 TypeScript 与工具链
- 16 测试深入
- 17 Chromium 架构深入

### 深度专题（5 章，新增）

| # | 主题 | 学到 |
|---|------|------|
| **18** | **Trace 完整解读手册** | trace.json 字段含义 + 启动期 / Renderer / GPU trace 真实 walk |
| **19** | **生产事故案例库** | 12 类别真实事故：启动 / 渲染 / Native / 安全 / 更新 / 平台 / 内存 / 性能 / 团队 |
| **20** | **签名与公证完整流程** | macOS / Windows / Linux 三平台 + 自动更新签名 + 完整 GitHub Actions |
| **21** | **大型生产级 monorepo 实战** | 完整 21 个文件，可 fork 后成为公司核心仓库 |
| **22** | **IPC 类型生成器与端到端类型安全** | Zod → 自动类型 → preload → renderer |
| **23** | **monorepo 5 分钟启动指南** | clone → dev → test → package → publish |

### 实战示例

`examples/` 目录：

```
01 secure-window            webPreferences + preload + zod 校验
02 ipc-messagechannel       MessageChannelMain + Utility Process
03 native-module            N-API + binding.gyp
04 electron-builder         多平台 builder
05 auto-updater             完整更新流程
06 sqlite-better-sample     better-sqlite3 + safeStorage
07 deep-menu                系统菜单跨平台
08 tray                     托盘 + 全局快捷键
09 notification             通知 + 行为回调
10 deep-link                自定义协议
11 utility-process-videoutil     Utility + ffmpeg
12 offscreen-rendering      OSR 截图
13 perf-bench               启动打点
```

---

## 学习路径

### 一周速通

```text
第 1 天：01、02
第 2 天：03、04
第 3 天：05、06、07（深度）
第 4 天：08、09
第 5 天：10、11（深度）
第 6 天：12、13
第 7 天：18、19、21（专题）
```

### 30 天刻意练习

把每个 runbook 跑一遍，对应章节。

---

## 验收

完成所有内容后，你应该能：

1. **看到 trace JSON 直接能 walk 出 commit 行号**。
2. **看到 minidump 直接 symbolicate 到源代码**。
3. **改 IPC schema，类型自动同步给所有 layer**。
4. **配 macOS 公证 + Windows EV 签名 + Linux GPG**。
5. **搭建 monorepo、CI / CD、自动更新一站式**。

这些是真实生产里"团队里只有 5% 的人能写"的能力。

---

## 章节入口

- [01 - 架构与源码导读](./01-architecture/README.md)
- [02 - 进程模型与生命周期](./02-process-model/README.md)
- [03 - 安全工程](./03-security/README.md)
- [04 - IPC 通信](./04-ipc/README.md)
- [05 - Native 集成](./05-native/README.md)
- [06 - 窗口与渲染管线](./06-window-render/README.md)
- [07 - 性能与内存（专家级深度）](./07-performance/README.md)
- [08 - 持久化与存储](./08-storage/README.md)
- [09 - 自动更新](./09-auto-update/README.md)
- [10 - 打包与分发](./10-packaging/README.md)
- [11 - 调试与诊断（专家级深度）](./11-debugging/README.md)
- [12 - 进阶与生态](./12-advanced/README.md)
- [13 - 实战项目](./13-project/README.md)
- [14 - 源码深度解读（专家级深度）](./14-deep-internals/README.md)
- [15 - TypeScript 与工具链](./15-typescript-tooling/README.md)
- [16 - 测试深入](./16-testing/README.md)
- [17 - Chromium 架构深入](./17-chromium-architecture/README.md)
- [18 - Trace 完整解读手册](./18-trace-handbook/README.md)
- [19 - 生产事故案例库](./19-incident-casebook/README.md)
- [20 - 签名与公证完整流程](./20-signing-notarization/README.md)
- [21 - 大型生产级 monorepo](./21-monorepo/README.md)
- [22 - IPC 类型生成器](./22-ipc-type-codegen/README.md)
- [23 - monorepo 5 分钟启动指南](./23-monorepo-launch-guide/README.md)

> 准备好了吗？从 18 章 Trace 解读手册开始。
