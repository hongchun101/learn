# CSS 核心速查

## 选择器优先级
```
!important       → 10000
内联样式         → 1000
ID               → 100
类/属性/伪类     → 10
元素/伪元素      → 1
通配符 *         → 0

#nav .item.active:hover   → 121
a.link[href]              → 21
```

## 盒模型
```css
* { box-sizing: border-box; }  /* 推荐 */

margin → border → padding → content

外边距折叠: 相邻垂直 margin 合并取大值
解决: display: flex / overflow: hidden / padding-top: 1px
```

## 布局速查
```
display: block | inline | inline-block | flex | grid | none

居中:
  .parent { display: grid; place-items: center; }
  .child { margin: 0 auto; }      /* 水平 */
  .child { transform: translate(-50%, -50%); top: 50%; left: 50%; position: absolute; }
```

## 单位
```
px / em (父字体) / rem (根字体) / % / vh / vw
ch (字符宽度) / ex (x 高度)
cqi / cqw (容器查询)
svh / lvh / dvh (移动端视口)
```

## 颜色
```css
color: #4a90e2;                    /* hex */
color: rgb(74 144 226);            /* rgb */
color: rgba(74 144 226 / 0.5);     /* rgb + alpha */
color: hsl(213 70% 59%);           /* hsl */
color: oklch(60% 0.18 250);        /* 感知均匀 */
color: color-mix(in oklab, blue, white 30%);  /* 混合 */

命名: transparent, currentColor
```

## 函数
```css
width: calc(100% - 20px);
width: min(90vw, 1200px);
width: max(300px, 50%);
font-size: clamp(1rem, 0.5vw + 0.9rem, 1.125rem);
```

## 动画
```css
transition: property duration easing delay;

easing:
  linear, ease, ease-in, ease-out, ease-in-out
  cubic-bezier(0.4, 0, 0.2, 1)        /* Material */
  cubic-bezier(0.68, -0.55, 0.265, 1.55)  /* 弹性 */
  steps(4, start|end)

@keyframes fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

## 渲染性能
```
cheap: transform, opacity
medium: color, background-color
expensive: width, height, top, left, margin, padding, font-size

结论: 动画只用 transform/opacity
```

## 现代特性
```css
/* 嵌套 */
.card { padding: 1rem; & h2 { color: red; } }

/* 级联层 */
@layer reset, base, components, utilities;

/* 自定义属性类型 */
@property --rotation {
  syntax: '<angle>';
  initial-value: 0deg;
  inherits: false;
}

/* 容器查询 */
.card-container { container-type: inline-size; container-name: card; }
@container card (min-width: 400px) { .card { display: grid; } }

/* 逻辑属性 */
margin-inline-start: 1rem;  /* LTR: left, RTL: right */
padding-block: 1rem;         /* top + bottom */
```

## 暗色主题
```css
:root {
  --bg: white;
  --fg: #222;
}
@media (prefers-color-scheme: dark) {
  :root { --bg: #111; --fg: #eee; }
}
body { background: var(--bg); color: var(--fg); }
```

## 焦点
```css
/* ❌ 永远不: :focus { outline: none; } */
/* ✅ */
:focus-visible {
  outline: 2px solid #4a90e2;
  outline-offset: 2px;
}
```

## a11y 必备
```css
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
```