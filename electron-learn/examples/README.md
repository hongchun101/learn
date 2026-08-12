# 示例代码目录

本目录收录了教程正文里所有"可粘贴 + 可运行"的最小示例。每个示例都是一个独立的、可直接 `pnpm i` 启动的工程片段。

| 编号 | 名称 | 关联章节 | 主要演示点 |
|------|------|----------|----------|
| 01 | secure-window | 03 / 04 | webPreferences 全安全配置 + preload + zod 校验 |
| 02 | ipc-messagechannel | 04 / 05 | MessageChannelMain + Utility Process |
| 03 | native-module | 05 | N-API + binding.gyp |
| 04 | electron-builder | 10 | 多平台 builder 配置 |
| 05 | auto-updater | 09 | electron-updater 完整流程 |
| 06 | sqlite-better-sample | 08 | better-sqlite3 + WAL + safeStorage 派生 key |
| 07 | deep-menu | 05 / 06 | 系统菜单跨平台差异 |
| 08 | tray | 05 | 系统托盘 + 全局快捷键 |
| 09 | notification | 05 | 通知 + 行为回调 |
| 10 | deep-link | 05 | 自定义协议 + 白名单 |
| 11 | utility-process-videoutil | 02 / 05 | 视频缩略图 utility |
| 12 | offscreen-rendering | 06 / 12 | OSR 截图 |
| 13 | perf-bench | 07 | 启动期打点 |

---

## 通用运行方式

每个示例下都是一个最小工程骨架。每个工程需要：

1. `pnpm i`
2. `pnpm dev`
3. 视需要设置对应的 env / 配置。

具体运行步骤见每个文件下的注释。

---

## 学习路径

- 先看 `01-secure-window`，理解"安全基线"。
- 再看 `02-ipc-messagechannel` 与 `10-deep-link`，弄懂 IPC。
- 然后是 `03-native-module` 与 `05-auto-updater`，理解底层 + 分发。
- 最后看 `13-perf-bench`，学会做性能打点。

每个示例都对应了本教程里的某一章。你可以"读一章、做一例"，交叉对照学习。

---

## 工具约定

- 主进程使用 TypeScript（除明确为 `.js` 的 process worker 文件）。
- preload 总是 `.ts`，编译产 `.cjs`，给 sandboxed renderer 使用。
- 所有 IPC 入参在主进程做 schema 校验。
- 所有 webPreferences 默认配置遵循本教程的安全基线。
