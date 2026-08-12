# 前端专家完整教程

> **学完,你就是前端专家。**

[![HTML](https://img.shields.io/badge/HTML-5-orange)]()
[![CSS](https://img.shields.io/badge/CSS-3-blue)]()
[![JavaScript](https://img.shields.io/badge/JavaScript-ES2024-yellow)]()
[![React](https://img.shields.io/badge/React-18-61dafb)]()
[![Vue](https://img.shields.io/badge/Vue-3-4FC08D)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6)]()
[![License](https://img.shields.io/badge/License-MIT-green)]()

---

## 📖 教程简介

这是一份**完整、系统、深入**的前端教程。从 HTML/CSS/JS 基础到 React/Vue/TypeScript 全栈,涵盖性能优化、可访问性、安全、国际化、微前端、低代码、可视化、CRDT 等所有现代前端领域。

完成本教程,你将具备**前端专家**的所有能力。

## 🎯 学习目标

学完本教程,你将能够:

- ✅ 独立负责中大型前端项目从 0 到 1
- ✅ 深度理解浏览器渲染、JS 引擎、网络协议、性能优化原理
- ✅ 精通 React 18 并发模式 / Vue3 响应式原理
- ✅ 主导前端技术选型、架构设计、性能优化
- ✅ 写出生产级、可维护、可测试、可访问的代码
- ✅ 进入一线大厂(阿里/字节/美团/外企)拿 SP/SSP offer
- ✅ 成为团队前端架构师
- ✅ 在开源社区建立影响力

## 📚 目录结构

```
前端教程/
├── 00-Roadmap.md                # 学习路线图
├── 01-HTML-Foundations.md       # HTML 基础
├── 02-CSS-Core-and-Layout.md    # CSS 核心
├── 03-CSS-Advanced.md           # CSS 进阶
├── 04-JavaScript-Core.md        # JS 核心
├── 05-JavaScript-Advanced.md    # JS 进阶
├── 06-Browser-and-Rendering.md  # 浏览器原理
├── 07-Network-and-Protocols.md  # 网络协议
├── 08-TypeScript-Mastery.md     # TypeScript
├── 09-Node-Fullstack.md         # Node 全栈
├── 10-Build-Toolchain.md        # 构建工具
├── 11-React-Mastery.md          # React 精通
├── 12-Vue3-Mastery.md           # Vue3 精通
├── 13-Testing-and-Quality.md    # 测试与质量
├── 14-Performance-Optimization.md # 性能优化
├── 15-A11y-Security-i18n.md     # a11y/安全/i18n
├── 16-Expert-Mastery.md         # 专家实战
├── Interview-Prep.md            # 面试备战
│
├── cheatsheets/                 # 速查表(20+ 张)
│   ├── css-core.md
│   ├── flexbox.md
│   ├── css-grid.md
│   ├── js-core.md
│   ├── es6-cheatsheet.md
│   ├── async-js.md
│   ├── typescript.md
│   ├── react-hooks.md
│   ├── react-18.md
│   ├── vue3.md
│   ├── http-status.md
│   ├── http-cache.md
│   ├── git.md
│   ├── npm.md
│   └── ...
│
├── exercises/                   # 练习题(30+ 道)
│   ├── 01-html.md
│   ├── 02-css.md
│   ├── 03-js-core.md
│   ├── 04-js-advanced.md
│   ├── 05-react.md
│   ├── 06-vue.md
│   ├── 07-typescript.md
│   ├── 08-performance.md
│   └── 09-algorithms.md
│
├── projects/                    # 可运行项目
│   ├── capstone-1-portfolio/    # HTML/CSS 作品集
│   └── capstone-2-react-app/    # React 全套脚手架
│
└── resources/                   # 精选资源
    └── README.md
```

## 🚀 快速开始

### 完全零基础

按章节顺序学习,**不要跳章**。每章配练习题,先做再看下一章。

```bash
# 1. 克隆或下载
# 2. 从 01-HTML-Foundations.md 开始
# 3. 完成每章练习题
# 4. 完成至少 2 个 capstone 项目
```

### 有基础,想进阶

直接看薄弱章节,例如:
- 想深入 JS → 04, 05, 06
- 想精通 React → 11, 14
- 想换 Vue → 12
- 想换工作 → Interview-Prep.md

### 求职面试

重点看:
- 04, 05 (JS 核心 + 进阶)
- 08 (TypeScript)
- 11 或 12 (框架)
- 14 (性能)
- Interview-Prep.md

## 📊 学习时间预估

| 阶段 | 时间 | 说明 |
|------|------|------|
| 完全零基础 → 入门 | 3 个月 | 看完 1-8 章 |
| 入门 → 进阶 | 3 个月 | 看完 9-14 章 + 项目 |
| 进阶 → 专家 | 3 个月 | 看完 15-16 章 + 完整项目 |

**总预估: 6-9 个月每天 3-4 小时**

## 🛠️ 环境准备

```bash
# 1. Node.js 20+ LTS
node --version

# 2. 包管理器(推荐 pnpm)
npm install -g pnpm

# 3. 编辑器(推荐 VS Code)
# 必备插件:
#   - ESLint
#   - Prettier
#   - TypeScript
#   - Volar (Vue)
#   - GitLens
#   - Error Lens
#   - Path Intellisense
#   - CSS Peek

# 4. 浏览器
# Chrome/Edge 主开发,Firefox/Safari 测兼容性
```

## 💡 学习方法

1. **3 层递进**:看(读文档) → 做(写代码) → 教(写博客、做分享)
2. **实战驱动**:每个章节都有项目,**禁止只看不写**
3. **源码阅读**:React 至少读 3 次,Vue3 响应式必读
4. **输出倒逼输入**:每周写一篇博客,每月一次内部分享

## 🎓 完成后

- 简历价值 ↑↑↑
- 一线大厂 offer 触手可及
- 技术选型有底气
- 开源贡献能力
- 团队影响力

## 📜 许可

MIT License - 自由使用、修改、分发。

## 🙏 致谢

感谢开源社区(MDN、React、Vue、Vite、TypeScript 等)的无私贡献。

---

**开始你的专家之路 → [00-Roadmap.md](./00-Roadmap.md)**