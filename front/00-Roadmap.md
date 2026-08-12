# 前端专家成长路线图 (Front-End Expert Roadmap)

> 从零基础到能独立设计/架构复杂前端系统、做出生产级应用、参与开源贡献的完整路径。

## 🎯 学习目标（学完之后你能做什么）

学完本教程,你将具备:

1. **专家级工程能力** — 能独立负责中大型前端项目从 0 到 1 的架构设计、编码、测试、上线与维护
2. **深度原理理解** — 浏览器渲染、JavaScript 引擎、网络协议、性能优化的底层原理
3. **现代框架精通** — React / Vue / Node / 构建工具 / 测试 / 部署 全链路
4. **可观测与质量保障** — 性能监控、错误追踪、A/B 测试、可访问性、安全
5. **团队协作与影响力** — 代码评审、技术方案、跨团队协作、技术布道

## 📚 章节地图

| # | 章节 | 关键技能 | 预估时间 |
|---|------|----------|----------|
| 01 | [HTML 基础与语义化](./01-HTML-Foundations.md) | 语义化标签、表单、可访问性、SEO | 3 天 |
| 02 | [CSS 核心与布局](./02-CSS-Core-and-Layout.md) | 盒模型、Flex、Grid、响应式、动画 | 5 天 |
| 03 | [CSS 进阶与工程化](./03-CSS-Advanced-and-Engineering.md) | 预处理器、CSS Modules、原子化、设计系统 | 4 天 |
| 04 | [JavaScript 核心](./04-JavaScript-Core.md) | 类型、闭包、作用域、this、原型链、异步 | 7 天 |
| 05 | [JavaScript 进阶](./05-JavaScript-Advanced.md) | 元编程、设计模式、函数式编程、并发模型 | 6 天 |
| 06 | [浏览器与渲染原理](./06-Browser-and-Rendering.md) | 进程模型、渲染流水线、合成、事件循环 | 5 天 |
| 07 | [网络与协议](./07-Network-and-Protocols.md) | HTTP/1.1/2/3、TLS、CORS、缓存、CDN | 4 天 |
| 08 | [TypeScript 精通](./08-TypeScript-Mastery.md) | 类型系统、泛型、类型体操、声明合并 | 5 天 |
| 09 | [Node.js 全栈](./09-Node-Fullstack.md) | 事件循环、流、模块、npm、生态 | 5 天 |
| 10 | [现代构建工具链](./10-Build-Toolchain.md) | Vite、Webpack、Rollup、esbuild、Turbopack | 4 天 |
| 11 | [React 精通](./11-React-Mastery.md) | Hooks、并发模式、状态管理、性能 | 7 天 |
| 12 | [Vue3 精通](./12-Vue3-Mastery.md) | 组合式 API、响应式原理、SSR | 6 天 |
| 13 | [测试与质量保障](./13-Testing-and-Quality.md) | 单元/集成/E2E、覆盖率、CI | 4 天 |
| 14 | [性能优化专家级](./14-Performance-Optimization.md) | Core Web Vitals、加载/运行时、Profiling | 5 天 |
| 15 | [可访问性、安全、国际化](./15-A11y-Security-i18n.md) | WCAG、XSS、CSRF、i18n 架构 | 4 天 |
| 16 | [专家级项目实战](./16-Expert-Mastery.md) | 微前端、低代码、可视化、架构决策 | 7 天 |

**总预估: ~80 天专注学习**(每天 4-6 小时)

## 🧠 学习方法论

### 1. "3 层递进" 学习法
```
看 (Read)        → 读文档/源码,理解原理
做 (Build)       → 动手实现,边做边踩坑
教 (Teach/Review)→ 写笔记/做分享/做 Code Review
```

### 2. 实战驱动
每个章节都有 **可运行项目** 和 **挑战题**。**禁止只看不写**。

### 3. 源码阅读
- React: 至少读 3 次(初识/进阶/源码)
- Vue3 reactivity: 必读
- Vite 插件机制: 必读
- 一个 npm 包的源码: 选一个深入

### 4. 输出倒逼输入
- 每周写一篇技术博客
- 每月做一次内部分享
- 参与开源(从提 issue/改文档开始)

## 🛠️ 环境准备

### 必备工具
```bash
# Node.js (LTS)
node --version  # >= 20.x

# 包管理器(任选,推荐 pnpm)
npm install -g pnpm

# Git
git --version

# 编辑器: VS Code + 推荐插件
# - ESLint, Prettier, TypeScript, Volar
# - GitLens, Error Lens, Auto Rename Tag
# - CSS Peek, Path Intellisense
```

### 浏览器
- Chrome/Edge 主开发
- Firefox 测兼容性
- Safari (macOS) 测 WebKit

### 学习路径建议
- **完全零基础**: 从 01 开始顺序学
- **有 HTML/CSS 基础**: 跳过 01-02,从 03 开始
- **有 JS 基础想进阶**: 直接看 04-08
- **求职/面试冲刺**: 看 04、05、11/12、14,加 [Interview-Prep.md](./Interview-Prep.md)

## ✅ 自检表(Expert Checklist)

完成所有章节后,自检是否达标:

- [ ] 能不查文档手写 Promise.all / 防抖节流
- [ ] 能用 TypeScript 实现复杂泛型工具类型(DeepPartial、Promise.allSettled)
- [ ] 能解释浏览器从输入 URL 到页面渲染的完整过程
- [ ] 能说出 React 18 并发模式的原理与陷阱
- [ ] 能独立设计一个组件库的架构
- [ ] 能分析一个页面的性能瓶颈并给出优化方案
- [ ] 能配置 Webpack/Vite 处理复杂场景(SSR、多入口、Monorepo)
- [ ] 能识别并修复 XSS/CSRF/点击劫持漏洞
- [ ] 能写一个完整的可访问性(WCAG AA)组件
- [ ] 能主导一次前端技术选型并说服团队

## 🎓 完成后

你不仅能"成为前端专家",还能:
- 进入一线大厂(阿里/P/字节/M/外企)拿 SP/SSP offer
- 成为团队前端架构师
- 开源项目获得千星
- 在技术社区建立影响力

**开始吧:** → [01-HTML-Foundations.md](./01-HTML-Foundations.md)