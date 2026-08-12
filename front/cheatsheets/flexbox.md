# Flexbox 速查

## 容器
```css
display: flex | inline-flex;

flex-direction: row | row-reverse | column | column-reverse;
flex-wrap: nowrap | wrap | wrap-reverse;
flex-flow: row wrap;  /* 简写 */

justify-content: flex-start | flex-end | center | space-between | space-around | space-evenly;
align-items: stretch | flex-start | flex-end | center | baseline;
align-content: stretch | flex-start | flex-end | center | space-between | space-around;

gap: 10px;             /* row + column */
row-gap: 10px;
column-gap: 20px;
```

## 项目
```css
flex-grow: 0;        /* 放大比例 */
flex-shrink: 1;      /* 缩小比例 */
flex-basis: auto;    /* 初始大小, 主轴空间分配 */
flex: 1;             /* flex: 1 1 0% 的简写 */
flex: none;          /* flex: 0 0 auto */

align-self: auto | flex-start | flex-end | center | baseline | stretch;
order: 0;            /* 默认 0, 越大越后 */
```

## 常用场景

### 居中
```css
.parent {
  display: flex;
  justify-content: center;
  align-items: center;
}
```

### 自适应卡片网格
```css
.cards {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}
.card {
  flex: 1 1 280px;   /* 最小 280px, 可伸缩 */
}
```

### 圣杯布局
```css
body {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}
.header, .footer { flex: 0 0 auto; }
.main { flex: 1 0 auto; display: flex; }
.aside { flex: 0 0 200px; }
.content { flex: 1; }
```

### 等高列
```css
.row { display: flex; }
.col { display: flex; flex-direction: column; }
```

### 子元素右侧对齐
```css
.parent { display: flex; justify-content: flex-end; }
```

### Sticky footer
```css
body {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}
.main { flex: 1; }
```

### 移动端导航条
```css
.nav { display: flex; }
.nav-item { flex: 1; text-align: center; }
```

## 调试
```css
/* 临时给所有 flex item 加边框 */
.parent > * { outline: 1px solid red; }
```

## 浏览器陷阱
```
• flex-wrap 子元素 min-width 默认 auto,长文本撑开容器
  → 解决: min-width: 0
• 表格 cell 中 flex 行为不同
  → 改用 div + display: table-cell
• flex item 不能用 float / clear
• flex item 默认 min-height/min-width: auto,会撑大
```