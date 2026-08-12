# 性能优化练习

## ⭐⭐⭐ 专家:大列表性能优化

### 任务
将一个 10万行表格从卡顿优化到 60fps。

### 起始代码
```jsx
function HeavyTable({ items }) {
  return (
    <table>
      {items.map((item, i) => (
        <Row key={i} data={item} />
      ))}
    </table>
  );
}

function Row({ data }) {
  const [expanded, setExpanded] = useState(false);
  const formatted = useMemo(() => formatData(data), [data]);

  return (
    <tr>
      <td>{data.id}</td>
      <td>{data.name}</td>
      {/* 20+ 列 */}
      <td><button onClick={() => setExpanded(!expanded)}>{expanded ? '-' : '+'}</button></td>
    </tr>
  );
}
```

### 优化清单
- [ ] 1. 稳定 key
- [ ] 2. React.memo Row
- [ ] 3. 拆分 Row 为 cell
- [ ] 4. IntersectionObserver 懒渲染(只渲染可视区)
- [ ] 5. 虚拟滚动(react-virtual)
- [ ] 6. 列表项内容 CSS contain
- [ ] 7. 大数据格式化用 Worker
- [ ] 8. 点击/hover 委托
- [ ] 9. 表格 transform 渲染层提升
- [ ] 10. 字体/图标懒加载

### 验收
- DevTools Performance:
  - 无长任务(> 50ms)
  - 滚动 fps ≥ 58
- 内存 < 50MB
- Lighthouse Performance 90+

### 提交
- 优化前后对比(视频/GIF)
- 性能报告(数据)

---

## ⭐⭐⭐ 专家:首屏性能优化

### 任务
把一个真实网站的 Lighthouse 分数从 60 提升到 95+。

### 诊断清单
- [ ] 1. Performance 录制(火焰图分析)
- [ ] 2. Network 面板(看加载时间线)
- [ ] 3. Coverage(找未用代码)
- [ ] 4. Bundle 分析
- [ ] 5. Core Web Vitals 现状

### 优化清单
- [ ] 图片优化(WebP/AVIF + lazy)
- [ ] 关键 CSS 内联
- [ ] JS 异步 / defer
- [ ] 字体 preload + font-display: swap
- [ ] 代码分割(路由/组件/库)
- [ ] Tree shaking
- [ ] 移除未用依赖
- [ ] 第三方脚本 lazy
- [ ] Gzip/Brotli
- [ ] CDN
- [ ] 缓存策略

### 提交
- 优化前后 Lighthouse 报告
- 改动清单
- 性能预算(以后不能退化)