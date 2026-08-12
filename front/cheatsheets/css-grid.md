# CSS Grid 速查

## 基础
```css
.grid {
  display: grid;
  grid-template-columns: 1fr 2fr 1fr;
  grid-template-rows: auto 1fr auto;
  gap: 16px;
  row-gap: 10px;
  column-gap: 20px;
}
```

## 单位
```
fr    比例单位
%     百分比
px/em/rem
minmax(min, max)  范围
auto  内容大小
fit-content()     适合内容
```

## 命名线
```css
.grid {
  grid-template-columns: [start] 1fr [mid] 2fr [end];
  grid-template-rows: [header-start] auto [header-end main-start] 1fr [main-end];
}
```

## 命名区域
```css
.grid {
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

## 隐式网格
```css
.grid {
  grid-auto-rows: minmax(100px, auto);
  grid-auto-columns: 1fr;
  grid-auto-flow: row;       /* row | column | dense */
}
```

## 项目定位
```css
.item {
  grid-column: 1 / 3;        /* 线 1 到线 3 = 跨 2 列 */
  grid-row: 2 / 4;
  grid-column: span 2;       /* 跨 2 列(当前位置) */
  grid-column-start: 1;
  grid-column-end: 3;

  justify-self: start | end | center | stretch;
  align-self: start | end | center | stretch;
  place-self: center;        /* 简写 */
}
```

## 重复
```css
grid-template-columns: repeat(12, 1fr);
grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));  /* 自适应 */
grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
```

## auto-fit vs auto-fill
```
auto-fit: 容器拉宽填满,剩余空间均分给 item
auto-fill: 即使没有 item,也保留轨道
```

## 实战模式

### 12 列网格
```css
.grid-12 {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: 16px;
}
.col-6 { grid-column: span 6; }
.col-4 { grid-column: span 4; }
.col-3 { grid-column: span 3; }
```

### 自适应卡片
```css
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px;
}
```

### 经典布局(头/侧边栏/主体/尾)
```css
.app {
  display: grid;
  grid-template-columns: 250px 1fr;
  grid-template-rows: 60px 1fr 50px;
  grid-template-areas:
    "header header"
    "sidebar main"
    "footer footer";
}
```

### 等高行
```css
.row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
}
```

### 瀑布流(伪)
```css
.masonry {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  grid-auto-rows: 10px;
}
.item {
  grid-row-end: span 30;  /* 每项占多少行 */
}
```

### Sticky 子项
```css
.aside {
  position: sticky;
  top: 20px;
  align-self: start;  /* grid 中 sticky 必须 */
}
```

## 调试
```css
.grid {
  outline: 1px solid red;
  background-image:
    linear-gradient(rgba(255 0 0 / 0.1) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255 0 0 / 0.1) 1px, transparent 1px);
  background-size: 1fr 1fr;
}
```