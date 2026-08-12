# 02 · CSS 核心与布局

> CSS 的核心是**盒模型**和**文档流**。一旦掌握,所有布局问题都有解。Flex/Grid 是工具,不是魔法。

## 📌 心智模型

```
页面 = 树形 DOM
每个元素 = 一个矩形盒子(box)
盒子由内到外: content → padding → border → margin
盒子之间通过文档流(正常流/浮动/定位)排布
CSS = 选择器 + 声明块 + 继承 + 级联 + 盒模型 + 视觉格式模型
```

## 2.1 选择器

### 2.1.1 优先级计算 (Specificity)
```
!important        → 最高
内联样式           → 1000
ID 选择器          → 100
类/属性/伪类选择器 → 10
元素/伪元素选择器  → 1
通配符 *           → 0
```

**示例:**
```css
#nav .item.active:hover   /* 120 (1 ID + 2 类 + 1 伪类) */
a.link[href]              /* 21  (1 元素 + 1 类 + 1 属性) */
```

**专家技巧:**
- 复杂组件用 BEM 或 CSS Modules 避免选择器战争
- 避免 `!important`,重构时变成噩梦
- 优先用更低优先级,需要时再覆盖

### 2.1.2 关系选择器
```css
.parent > .child        /* 直接子元素 */
.adjacent + .sibling    /* 相邻兄弟 */
.general ~ .siblings    /* 任意后面兄弟 */
:is(.h1, .h2, .h3)      /* 匹配任一(整体 0 优先级) */
:where(.h1, .h2, .h3)   /* 匹配任一(整体 0 优先级) */
:has(.child)            /* 父选择器(现代浏览器) */
:not(.disabled)         /* 否定 */
```

### 2.1.3 伪元素
```css
::before { content: ''; }   /* 必带 content */
::after { content: ''; }
::placeholder { color: #999; }
::selection { background: yellow; }
::marker { color: red; }    /* 列表项标记 */
```

## 2.2 盒模型

### 2.2.1 box-sizing
```css
* { box-sizing: border-box; }  /* 强烈推荐 */

/* content-box: width = 内容宽度 (默认,反直觉) */
/* border-box: width = 内容+padding+border (推荐) */
```

### 2.2.2 视觉格式模型
```
display: block | inline | inline-block | none
display: flex | inline-flex
display: grid | inline-grid
display: table | inline-table
display: list-item
display: contents   /* 子元素直接参与父布局,自己消失 */
display: flow-root   /* 创建新的 BFC */
```

### 2.2.3 边距折叠 (Margin Collapse)
```css
/* 相邻兄弟垂直 margin 折叠:取较大值 */
.box1 { margin-bottom: 30px; }
.box2 { margin-top: 20px; }  /* 实际间距 30px */

/* 父元素与第一个/最后一个子元素垂直 margin 折叠 */
/* 解决方案: */
.parent { display: flex; flex-direction: column; }  /* 或 */
.parent { overflow: hidden; }  /* 或 */
.parent { padding-top: 1px; }   /* 或 */
.first-child { margin-top: 0; }
```

## 2.3 Flexbox 精通

### 2.3.1 容器属性
```css
.container {
  display: flex;
  flex-direction: row | row-reverse | column | column-reverse;
  flex-wrap: nowrap | wrap | wrap-reverse;
  flex-flow: row wrap;  /* 简写 */
  justify-content: flex-start | flex-end | center | space-between | space-around | space-evenly;
  align-items: stretch | flex-start | flex-end | center | baseline;
  align-content: stretch | flex-start | flex-end | center | space-between | space-around;
  gap: 10px;  /* row-gap + column-gap */
}
```

### 2.3.2 项目属性
```css
.item {
  flex-grow: 0;       /* 放大比例 */
  flex-shrink: 1;     /* 缩小比例 */
  flex-basis: auto;   /* 初始大小 */
  flex: 1;            /* 1 1 0% 的简写 */
  align-self: auto | flex-start | flex-end | center | baseline | stretch;
  order: 0;
}
```

### 2.3.3 经典案例

**居中:**
```css
.parent { display: flex; justify-content: center; align-items: center; }
```

**圣杯布局:**
```css
body { display: flex; flex-direction: column; min-height: 100vh; }
.header { flex: 0 0 auto; }
.main { flex: 1 0 auto; display: flex; }
.aside { flex: 0 0 200px; }
.content { flex: 1; }
.footer { flex: 0 0 auto; }
```

**响应式卡片网格(自动填充):**
```css
.cards {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}
.card {
  flex: 1 1 280px;     /* 最小 280px,可伸缩 */
}
```

## 2.4 Grid 精通

### 2.4.1 网格基础
```css
.grid {
  display: grid;
  grid-template-columns: 1fr 2fr 1fr;
  grid-template-rows: auto 1fr auto;
  gap: 16px;
}
```

### 2.4.2 命名与定位
```css
.grid {
  grid-template-columns: [start] 1fr [content] 2fr [end];
  grid-template-rows: [header-start] auto [header-end main-start] 1fr [main-end];
  grid-template-areas:
    "header header header"
    "side   main   main"
    "footer footer footer";
}

.header { grid-area: header; }
.side   { grid-area: side; }
.main   { grid-area: main; }
.footer { grid-area: footer; }
```

### 2.4.3 隐式网格
```css
.grid {
  grid-auto-rows: minmax(100px, auto);
  grid-auto-flow: row | column | dense;  /* dense 填空隙 */
}
```

### 2.4.4 项目定位
```css
.item {
  grid-column: 1 / 3;       /* 第 1 列线到第 3 列线 = 跨 2 列 */
  grid-row: 2 / 4;
  grid-column: span 2;      /* 跨 2 列(从当前位置) */
  justify-self: center;
  align-self: end;
}
```

### 2.4.5 高级 Grid 模式

**自适应网格(auto-fit + minmax):**
```css
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 16px;
}
```

**12 列网格系统:**
```css
.grid-12 {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: 16px;
}
.col-6 { grid-column: span 6; }
.col-4 { grid-column: span 4; }
@media (max-width: 768px) {
  .col-6, .col-4 { grid-column: span 12; }
}
```

**杂志/瀑布流布局:**
```css
.masonry {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  grid-auto-rows: 10px;
}
.item {
  grid-row-end: span var(--rows);  /* 计算每项占多少行 */
}
```

## 2.5 定位 (Positioning)

```css
.static    /* 默认 */
relative   /* 相对自身,仍占位 */
absolute   /* 相对最近定位祖先,脱流 */
fixed      /* 相对视口 */
sticky     /* 滚动到阈值前 relative,之后 fixed */
```

**sticky 模式:**
```css
.thead {
  position: sticky;
  top: 0;
  z-index: 10;
  background: white;
}
```

**居中绝对定位元素:**
```css
.modal {
  position: absolute;
  inset: 0;               /* top:0 right:0 bottom:0 left:0 */
  margin: auto;
  width: fit-content;
  height: fit-content;
}
```

## 2.6 响应式设计

### 2.6.1 移动优先 vs 桌面优先
```css
/* 移动优先 (推荐) */
.card { padding: 8px; }
@media (min-width: 768px) {
  .card { padding: 16px; }
}

/* 桌面优先 */
.card { padding: 16px; }
@media (max-width: 767px) {
  .card { padding: 8px; }
}
```

### 2.6.2 容器查询 (Container Queries) ⭐
```css
.card-container {
  container-type: inline-size;
  container-name: card;
}

@container card (min-width: 400px) {
  .card {
    display: grid;
    grid-template-columns: 200px 1fr;
  }
}
```

### 2.6.3 媒体查询速查
```css
/* 视口尺寸 */
@media (min-width: 768px) { /* tablet+ */ }
@media (min-width: 1024px) { /* desktop+ */ }
@media (orientation: landscape) { }
@media (prefers-color-scheme: dark) { }
@media (prefers-reduced-motion: reduce) { }

/* 输入设备 */
@media (hover: hover) { }        /* 有悬停(鼠标) */
@media (pointer: fine) { }       /* 精确指针 */
@media (any-hover: none) { }     /* 触屏为主 */
```

## 2.7 排版与文本

### 2.7.1 字体
```css
:root {
  --font-sans: system-ui, -apple-system, 'Segoe UI', sans-serif;
  --font-mono: ui-monospace, 'SF Mono', Menlo, monospace;
}

body {
  font-family: var(--font-sans);
  font-size: clamp(1rem, 0.5vw + 0.9rem, 1.125rem); /* 流体字号 */
  line-height: 1.6;
  font-feature-settings: 'kern', 'liga';  /* 启用字距/连字 */
}

/* 可变字体 */
@font-face {
  font-family: 'Inter';
  src: url('/Inter-Variable.woff2') format('woff2-variations');
  font-weight: 100 900;  /* 可变范围 */
}
```

### 2.7.2 文字截断
```css
/* 单行 */
.truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 多行 */
.line-clamp-3 {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
```

### 2.7.3 文字装饰与处理
```css
.break-word {
  overflow-wrap: break-word;
  word-break: break-word;  /* 中文友好 */
  hyphens: auto;           /* 自动连字符 */
}
```

## 2.8 背景与渐变

```css
.box {
  background:
    linear-gradient(45deg, #ff0000 0%, transparent 50%),
    radial-gradient(circle at top right, #00ff00, transparent 70%),
    url('/bg.jpg');
  background-blend-mode: multiply;
  background-size: cover;
  background-position: center;
}
```

**现代渐变:**
```css
.gradient {
  background: conic-gradient(from 45deg, red, yellow, lime, aqua, blue, magenta, red);
  mask: radial-gradient(circle, black 60%, transparent);
}
```

## 2.9 过渡与动画

### 2.9.1 Transition
```css
.btn {
  transition:
    background-color 0.2s ease,
    transform 0.2s cubic-bezier(0.4, 0, 0.2, 1),
    box-shadow 0.3s;
}
.btn:hover {
  background-color: #4a90e2;
  transform: translateY(-2px);
}
```

**缓动函数:**
```
linear, ease, ease-in, ease-out, ease-in-out
cubic-bezier(0.4, 0, 0.2, 1)  /* Material standard */
cubic-bezier(0.68, -0.55, 0.265, 1.55)  /* 弹性 */
steps(4)  /* 阶梯 */
```

### 2.9.2 Animation
```css
@keyframes pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.05); opacity: 0.8; }
}

.loader {
  animation: pulse 1.5s ease-in-out infinite;
}
```

**高级动画技巧:**
```css
/* 内容震动 */
.shake { animation: shake 0.5s; }
@keyframes shake {
  10%, 90% { transform: translateX(-2px); }
  20%, 80% { transform: translateX(4px); }
  30%, 50%, 70% { transform: translateX(-8px); }
  40%, 60% { transform: translateX(8px); }
}

/* 监听 prefers-reduced-motion */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

## 2.10 CSS 变量与函数

### 2.10.1 自定义属性
```css
:root {
  --primary: #4a90e2;
  --primary-rgb: 74, 144, 226;
  --shadow: 0 2px 4px rgb(var(--primary-rgb) / 0.2);
}

.button {
  background: var(--primary);
  box-shadow: var(--shadow);
}
```

### 2.10.2 现代函数
```css
.card {
  /* 颜色操作 */
  background: color-mix(in oklab, var(--primary), white 20%);

  /* 相对颜色 */
  border-color: hsl(from var(--primary) h s calc(l - 10%));

  /* 数学 */
  width: calc(100% - 20px - 2em);
  width: min(90vw, 1200px);
  width: max(300px, 50%);

  /* 容器单位 */
  font-size: 5cqi;  /* 容器宽度的 5% */
  padding: 2cqw;
}
```

### 2.10.3 暗色主题
```css
:root {
  --bg: white;
  --fg: #222;
  --card: #f5f5f5;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0f0f0f;
    --fg: #e5e5e5;
    --card: #1a1a1a;
  }
}

/* 或切换主题 */
[data-theme="dark"] {
  --bg: #0f0f0f;
  --fg: #e5e5e5;
}

body {
  background: var(--bg);
  color: var(--fg);
  transition: background 0.3s, color 0.3s;
}
```

## 2.11 单位体系

| 单位 | 含义 | 用途 |
|------|------|------|
| `px` | 像素 | 边框、阴影 |
| `em` | 相对父字体 | 内部间距 |
| `rem` | 相对根字体 | 全局尺寸 |
| `%` | 相对父 | 宽度 |
| `vh/vw` | 视口宽高 | 全屏 |
| `cqi/cqw` | 容器查询 | 容器内尺寸 |
| `svh/lvh/dvh` | 小/大/动态视口 | 移动端高度 |
| `ch` | 0 的宽度 | 文本宽度 |
| `ex` | x 高度 | 罕见 |

## 2.12 专家陷阱清单

| 陷阱 | 后果 | 解决 |
|------|------|------|
| 用 `vh` 在移动端做全屏 | 地址栏遮挡内容 | 用 `dvh`(动态视口) |
| `transition: all` | 性能差,动画错乱 | 明确指定属性 |
| z-index 战争 | 层叠混乱 | 用 CSS isolation + 局部层叠上下文 |
| 浮动布局遗留 | 清浮动麻烦 | 用 Flex/Grid |
| `width: 100%` 在 padding 容器 | 溢出 | `box-sizing: border-box` |
| `position: absolute` 找不到祖先 | 跑到屏幕外 | 确保祖先 `position: relative` |
| 字体加载 FOIT | 文字闪烁 | `font-display: swap` |
| 动画改 `width/height/top/left` | 性能差 | 改 `transform/opacity` |
| `outline: none` | a11y 灾难 | 改用 `:focus-visible` |
| 颜色只用一个色相 | 无层次 | 用 oklab 调色板 |

## 2.13 实战项目

### 🎯 项目 1: 个人作品集首页 (纯 CSS)
要求:
- Hero 区 + 自我介绍 + 项目卡片网格 + 页脚
- 完整响应式(手机/平板/桌面)
- 暗色主题切换
- 流体排版
- 仅用 Flex/Grid,不用任何 JS

### 🎯 项目 2: 电商商品列表页
要求:
- 顶栏 + 侧边筛选 + 商品网格 + 分页
- 容器查询(组件级响应式)
- Sticky 表头
- 加载骨架屏

## ✅ 本章检查清单

- [ ] 能解释盒模型,清楚 `box-sizing: border-box` 优势
- [ ] Flex 的 6 个容器属性、6 个项目属性背得出
- [ ] Grid 能写出命名区域和自适应网格
- [ ] 容器查询能用起来
- [ ] 流体排版、clamp、color-mix 会用
- [ ] 动画性能(`transform/opacity`)懂
- [ ] 暗色主题、可访问性媒体查询会用
- [ ] 完成 2 个实战项目

**下一章:** → [03-CSS-Advanced-and-Engineering.md](./03-CSS-Advanced-and-Engineering.md)