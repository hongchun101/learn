# 03 · CSS 进阶与工程化

> 写好 CSS 不难,**管理好 CSS** 才难。这一章讲怎么在团队/大型项目中让 CSS 可维护、可扩展。

## 📌 心智模型

```
CSS 工程的 3 大难题:
  1. 命名冲突 → BEM / CSS Modules / Scoped CSS
  2. 全局污染 → 隔离作用域
  3. 复用难 → 设计系统 / 设计令牌
```

## 3.1 命名方法论

### 3.1.1 BEM (Block Element Modifier)
```html
<!-- Block: 独立组件 -->
<div class="card">
  <!-- Element: Block 的一部分 -->
  <img class="card__image" src="...">
  <h3 class="card__title">标题</h3>
  <p class="card__body">内容</p>

  <!-- Modifier: 变体 -->
  <button class="card__btn card__btn--primary">主要</button>
  <button class="card__btn card__btn--disabled">禁用</button>
</div>
```

**BEM 黄金法则:**
- 只用类名,不用 ID
- 不嵌套(`.card__title .card__body` ❌)
- Modifier 与 Block/Element 用 `--` 分隔
- 状态类:`is-active`、`is-loading`、`is-disabled`(非 BEM 原生但常用)

### 3.1.2 SMACSS / OOCSS / ITCSS
```css
/* SMACSS 分类 */
.base {}      /* 重置 + 元素默认 */
.layout {}    /* 页面级布局 */
.module {}    /* 组件(对应 BEM Block) */
.state {}     /* 状态:.is-hidden */
.theme {}     /* 主题变体 */
```

### 3.1.3 实用类 (Utility-First)
```css
/* 原子化:Tailwind / UnoCSS 思路 */
.text-center { text-align: center; }
.flex { display: flex; }
.gap-4 { gap: 1rem; }
.p-4 { padding: 1rem; }
.bg-blue-500 { background: rgb(59 130 246); }
```

## 3.2 CSS 架构模式

### 3.2.1 7-1 Pattern (Sass)
```
styles/
  abstracts/     # 变量、mixin、函数(不输出 CSS)
    _variables.scss
    _mixins.scss
    _functions.scss
  base/          # 重置、元素默认
    _reset.scss
    _typography.scss
  components/    # 组件
    _button.scss
    _card.scss
  layout/        # 布局
    _header.scss
    _grid.scss
  pages/         # 页面特定
    _home.scss
  themes/        # 主题
    _dark.scss
  vendors/       # 第三方覆盖
    _normalize.scss
  main.scss      # 入口,只 @use 其他文件
```

### 3.2.2 ITCSS (Inverted Triangle)
```
Settings    # 变量、配置
Tools       # mixin、函数
Generic     # reset、normalize
Elements    # 元素默认样式(h1, p, a)
Objects     # 设计模式(media, container)
Components  # 组件
Utilities   # 工具类(.u-hidden, .u-text-center)
Trumps      # !important 覆盖
```

## 3.3 预处理器: Sass

### 3.3.1 现代 Sass (推荐 @use / @forward)
```scss
// _variables.scss
$primary: #4a90e2;
$breakpoints: (
  sm: 640px,
  md: 768px,
  lg: 1024px,
  xl: 1280px
);

// _mixins.scss
@use 'variables' as *;

@mixin respond($bp) {
  @media (min-width: map-get($breakpoints, $bp)) {
    @content;
  }
}

@mixin truncate($lines: 1) {
  @if $lines == 1 {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  } @else {
    display: -webkit-box;
    -webkit-line-clamp: $lines;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
}

// main.scss
@use 'variables' as *;
@use 'mixins' as *;

.card {
  padding: 1rem;
  @include respond(md) {
    padding: 2rem;
  }
  .title {
    @include truncate(2);
  }
}
```

### 3.3.2 现代 CSS 已覆盖 Sass 80% 功能
```css
/* CSS 自定义属性 = Sass 变量 */
/* CSS @nest = Sass 嵌套 */
.parent {
  --gap: 1rem;
  & > .child {
    margin: var(--gap);
  }
}

/* CSS color-mix() = darken()/lighten() */
.btn {
  background: color-mix(in oklab, var(--primary), white 20%);
  &:hover {
    background: color-mix(in oklab, var(--primary), white 10%);
  }
}
```

**结论:** 新项目优先用 CSS 原生特性,Sass 用于团队熟悉或复杂场景。

## 3.4 CSS Modules / Scoped CSS

### 3.4.1 CSS Modules (构建工具)
```css
/* Button.module.css */
.button {
  background: var(--primary);
}
.primary {
  background: var(--primary);
  color: white;
}
```

```jsx
import styles from './Button.module.css';

<button className={styles.button}>默认</button>
<button className={`${styles.button} ${styles.primary}`}>主要</button>
// → 编译后: <button class="Button_button__x7y2z Button_primary__a1b2c">
```

### 3.4.2 Vue Scoped CSS
```vue
<style scoped>
.button {
  background: var(--primary);
}
/* :deep() 穿透子组件 */
:deep(.child-component-class) {
  color: red;
}
</style>
```

### 3.4.3 Shadow DOM (原生隔离)
```javascript
class MyCard extends HTMLElement {
  constructor() {
    super();
    const shadow = this.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        :host { display: block; }
        .card { padding: 1rem; }
      </style>
      <div class="card"><slot></slot></div>
    `;
  }
}
customElements.define('my-card', MyCard);
```

## 3.5 CSS-in-JS

### 3.5.1 Emotion (React 主流)
```jsx
import { css } from '@emotion/react';

const button = css`
  background: ${props => props.primary ? '#4a90e2' : 'white'};
  padding: 8px 16px;
  &:hover {
    background: #357abd;
  }
`;

<button css={button} primary>Click</button>
```

### 3.5.2 Styled Components
```jsx
import styled from 'styled-components';

const Button = styled.button`
  background: ${props => props.primary ? '#4a90e2' : 'white'};
  &:hover { background: #357abd; }
`;

// 继承样式
const BigButton = styled(Button)`
  font-size: 20px;
  padding: 12px 24px;
`;
```

### 3.5.3 Vanilla Extract (类型安全)
```typescript
// button.css.ts
import { style } from '@vanilla-extract/css';

export const button = style({
  background: 'white',
  ':hover': { background: '#f5f5f5' }
});

export const primary = style({
  background: '#4a90e2',
  color: 'white'
});
```

```typescript
// button.tsx
import * as styles from './button.css';

<button className={`${styles.button} ${styles.primary}`}>...</button>
```

## 3.6 原子化 CSS

### 3.6.1 Tailwind CSS 核心思路
```html
<button class="
  bg-blue-500 hover:bg-blue-700
  text-white font-bold
  py-2 px-4 rounded
  transition-colors duration-200
">
  Click me
</button>
```

**配置定制:**
```js
// tailwind.config.js
module.exports = {
  content: ['./src/**/*.{html,js,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#4a90e2',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
    },
  },
};
```

### 3.6.2 何时用 Tailwind
✅ 适合: 中小项目、快速原型、新项目
❌ 不适合: 复杂定制 UI(类名难记忆)、HTML 文件大量使用

## 3.7 设计系统 (Design Tokens)

### 3.7.1 Token 三层结构
```
Global Tokens (基础原子)
  ↓ 语义化
Alias Tokens (语义角色)
  ↓ 组件化
Component Tokens (组件特定)
```

### 3.7.2 实现示例
```css
:root {
  /* 1. Global: 原子值 */
  --color-blue-500: #4a90e2;
  --color-gray-100: #f5f5f5;
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-4: 1rem;
  --radius-md: 0.375rem;

  /* 2. Alias: 语义角色 */
  --color-primary: var(--color-blue-500);
  --color-bg: var(--color-gray-100);
  --space-button-y: var(--space-2);
  --space-button-x: var(--space-4);
  --radius-button: var(--radius-md);

  /* 3. Component: 组件特定 */
  --button-bg: var(--color-primary);
  --button-color: white;
  --button-radius: var(--radius-button);
}

.button {
  background: var(--button-bg);
  color: var(--button-color);
  border-radius: var(--button-radius);
}

/* 暗色主题:只覆盖 Alias Token */
[data-theme="dark"] {
  --color-bg: #1a1a1a;
  --color-primary: #60a5fa;
}
```

### 3.7.3 Token 多平台输出
```
设计工具 (Figma Variables / Tokens Studio)
   ↓ JSON
构建脚本 (Style Dictionary)
   ↓ 编译
  • CSS 自定义属性 (Web)
  • iOS Swift 常量
  • Android XML
  • React/Vue 组件 props
```

## 3.8 响应式策略

### 3.8.1 断点策略
```css
/* 推荐断点(基于内容,不是设备) */
$breakpoints: (
  sm: 640px,   /* 手机横屏 */
  md: 768px,   /* 平板 */
  lg: 1024px,  /* 桌面 */
  xl: 1280px,  /* 大屏 */
  2xl: 1536px
);
```

### 3.8.2 流体排版
```css
:root {
  --fs-sm: clamp(0.875rem, 0.8rem + 0.3vw, 1rem);
  --fs-base: clamp(1rem, 0.9rem + 0.5vw, 1.125rem);
  --fs-lg: clamp(1.25rem, 1rem + 1vw, 1.5rem);
  --fs-xl: clamp(1.5rem, 1.2rem + 1.5vw, 2rem);
  --fs-2xl: clamp(2rem, 1.5rem + 2.5vw, 3rem);
}
```

### 3.8.3 容器查询实战
```css
.card-list {
  container-type: inline-size;
  container-name: cardlist;
}

@container cardlist (min-width: 600px) {
  .card { display: grid; grid-template-columns: 200px 1fr; }
}

@container cardlist (min-width: 900px) {
  .card { grid-template-columns: 250px 1fr 150px; }
}
```

## 3.9 CSS 重置与基线

### 3.9.1 现代 reset (推荐)
```css
/* Andy Bell's Modern CSS Reset */
*, *::before, *::after { box-sizing: border-box; }
* { margin: 0; }
html { -webkit-text-size-adjust: 100%; }
body { line-height: 1.5; -webkit-font-smoothing: antialiased; }
img, picture, video, canvas, svg { display: block; max-width: 100%; }
input, button, textarea, select { font: inherit; }
p, h1-h6 { overflow-wrap: break-word; }
button { cursor: pointer; background: none; border: none; padding: 0; }
a { color: inherit; text-decoration: none; }
```

### 3.9.2 Normalize.css (备选)
更柔和的"标准化",保留浏览器默认。

## 3.10 高级特性

### 3.10.1 @layer (级联层)
```css
@layer reset, base, components, utilities;

@layer reset {
  * { box-sizing: border-box; margin: 0; }
}

@layer components {
  .btn { padding: 8px 16px; }
}

@layer utilities {
  .mt-4 { margin-top: 1rem !important; }  /* 永远最高 */
}
```

### 3.10.2 @property (注册自定义属性)
```css
@property --rotation {
  syntax: '<angle>';
  initial-value: 0deg;
  inherits: false;
}

.loader {
  --rotation: 0deg;
  animation: spin 1s linear infinite;
}
@keyframes spin {
  to { --rotation: 360deg; }  /* 可动画 */
}
```

### 3.10.3 @scope (实验性)
```css
@scope (.card) {
  .title { font-size: 1.25rem; }
}
```

### 3.10.4 嵌套原生 CSS
```css
.card {
  padding: 1rem;
  & h2 { color: var(--primary); }
  & > .footer {
    border-top: 1px solid;
  }
  @media (min-width: 768px) {
    padding: 2rem;
  }
}
```

## 3.11 性能优化

### 3.11.1 will-change 与合成层
```css
/* 提升合成层(慎用,会占内存) */
.animating {
  will-change: transform, opacity;
}
/* 动画结束移除 */
.animating.done {
  will-change: auto;
}
```

### 3.11.2 content-visibility (跳过渲染)
```css
.below-fold {
  content-visibility: auto;
  contain-intrinsic-size: 0 500px;  /* 占位大小 */
}
```

### 3.11.3 contain (渲染隔离)
```css
.card {
  contain: layout style paint;  /* 各方向隔离 */
  /* 或 */
  contain: strict;  /* 最强 */
}
```

### 3.11.4 关键 CSS 提取
```html
<!-- 内联关键 CSS,异步加载其他 -->
<style>/* critical.css */</style>
<link rel="preload" href="/main.css" as="style" onload="this.rel='stylesheet'">
<noscript><link rel="stylesheet" href="/main.css"></noscript>
```

## 3.12 CSS 工具链

```
编写        编译/打包            检查             输出
Sass    →   Vite/Webpack     →   Stylelint    →   压缩 CSS
PostCSS     esbuild              prettier          关键 CSS
CSS Modules PostCSS插件                              源码映射
```

### Stylelint 配置示例
```json
{
  "extends": ["stylelint-config-standard"],
  "rules": {
    "selector-class-pattern": "^[a-z][a-zA-Z0-9]+(__[a-z][a-zA-Z0-9]+)?(--[a-z][a-zA-Z0-9]+)?$",
    "no-duplicate-selectors": true,
    "color-no-invalid-hex": true
  }
}
```

## 3.13 专家陷阱清单

| 陷阱 | 后果 | 解决 |
|------|------|------|
| 全局 CSS 无限增长 | 难维护 | 用 CSS Modules / Scoped |
| 命名随意 `.a1 .b2` | 团队看不懂 | 用 BEM 或命名约定 |
| !important 滥用 | 覆盖链破坏 | 提高优先级或重构 |
| 重复样式到处拷贝 | 改一处忘一处 | 用 CSS 变量 + 设计系统 |
| 动画改盒模型属性 | 抖动 + 性能差 | 用 transform/opacity |
| 加载未压缩 CSS | 首屏慢 | 构建时压缩 |
| 没用 will-change 但疯狂动画 | 性能差 | 适度使用 |
| z-index 数值大战 | 层叠混乱 | 用 CSS @layer + 局部层叠上下文 |
| 颜色硬编码到处写 | 改主题要改 100 处 | 用 Design Tokens |
| 不考虑 RTL | 阿拉伯文错位 | 用 logical properties |

## 3.14 实战项目

### 🎯 项目 1: 设计令牌系统
要求:
- 三层 Tokens(Global/Alias/Component)
- 暗色主题切换
- 用 Style Dictionary 输出多平台
- 与 Figma Variables 同步(用 Tokens Studio)

### 🎯 项目 2: 组件库样式架构
要求:
- 至少 5 个组件(Button/Input/Card/Modal/Dropdown)
- BEM + CSS Modules
- Storybook 文档
- 暗色主题
- 100% a11y 通过

## ✅ 本章检查清单

- [ ] 能说出 3 种命名方法论的优劣
- [ ] 能用 Sass @use / @forward 组织大型项目
- [ ] 能配置 Vite 支持 CSS Modules
- [ ] 能区分 vanilla CSS vs CSS Modules vs CSS-in-JS vs Tailwind 的适用场景
- [ ] 能设计三层 Design Tokens
- [ ] 知道 @layer、@property、@scope 这些现代特性
- [ ] 完成 2 个实战项目

**下一章:** → [04-JavaScript-Core.md](./04-JavaScript-Core.md)