# 14 · 性能优化专家级

> 性能是**对用户最大的尊重**。专家级性能优化 = 关键指标 + 加载链路 + 运行时 + 网络 + 缓存 + 监控 全方位。

## 📌 心智模型

```
Core Web Vitals (Google 标准):
  LCP (Largest Contentful Paint)  < 2.5s   加载速度
  INP (Interaction to Next Paint) < 200ms  交互响应
  CLS (Cumulative Layout Shift)   < 0.1    视觉稳定

其他指标:
  TTFB  < 800ms  首字节
  FCP   < 1.8s   首次内容
  TBT   < 200ms  阻塞时间
  TTI   < 3.8s   可交互
```

## 14.1 加载性能

### 14.1.1 关键渲染路径
```
HTML → 关键 CSS → 关键 JS → 渲染 → 可交互

优化原则:
  • 阻塞资源 < 14KB(单 TCP 包)
  • 关键 CSS 内联
  • JS defer / async
  • 字体 preload + font-display: swap
  • 图片懒加载
```

### 14.1.2 资源优先级
```html
<!-- 高:首屏必需 -->
<link rel="stylesheet" href="/main.css">
<link rel="preload" href="/hero.jpg" as="image" fetchpriority="high">
<link rel="preload" href="/font.woff2" as="font" crossorigin>
<script src="/app.js" defer></script>

<!-- 中:按需 -->
<script src="/analytics.js" async></script>

<!-- 低:延后 -->
<link rel="prefetch" href="/next-page.html">
<iframe src="/ad.html" loading="lazy">
```

### 14.1.3 关键 CSS 内联 (Critical CSS)
```bash
npm install critical
```

```javascript
import critical from 'critical';

await critical.generate({
  base: 'dist/',
  src: 'index.html',
  target: 'index-critical.html',
  inline: true,
  dimensions: [
    { width: 375, height: 667 },  // mobile
    { width: 1920, height: 1080 }, // desktop
  ],
});
```

```html
<!-- 输出: 关键 CSS 内联,其他异步加载 -->
<style>/* critical */</style>
<link rel="preload" href="/main.css" as="style" onload="this.rel='stylesheet'">
<noscript><link rel="stylesheet" href="/main.css"></noscript>
```

### 14.1.4 字体优化
```css
@font-face {
  font-family: 'Inter';
  src: url('/Inter-Variable.woff2') format('woff2-variations');
  font-weight: 100 900;
  font-display: swap;
}

/* 字体子集 */
@font-face {
  font-family: 'Inter';
  src: url('/Inter-Latin.woff2') format('woff2');
  unicode-range: U+0000-00FF;  /* 仅拉丁 */
}
```

### 14.1.5 图片优化
```html
<!-- 1. 现代格式 + fallback -->
<picture>
  <source srcset="/hero.avif" type="image/avif">
  <source srcset="/hero.webp" type="image/webp">
  <img src="/hero.jpg" alt="..." loading="lazy" decoding="async" width="800" height="600">
</picture>

<!-- 2. 响应式 -->
<img
  srcset="/hero-400.jpg 400w, /hero-800.jpg 800w, /hero-1200.jpg 1200w"
  sizes="(max-width: 600px) 400px, (max-width: 1200px) 800px, 1200px"
  src="/hero-800.jpg"
  alt="..."
  loading="lazy"
  decoding="async"
>

<!-- 3. 关键图立即加载 + 优先 -->
<img src="/hero.jpg" alt="..." fetchpriority="high" loading="eager">
```

### 14.1.6 视频优化
```html
<!-- poster + preload=metadata -->
<video preload="metadata" poster="/poster.jpg" playsinline muted>
  <source src="/video.webm" type="video/webm">
</video>

<!-- 视频流(HLS/DASH) -->
<video>
  <source src="/playlist.m3u8" type="application/x-mpegURL">
</video>
```

## 14.2 运行时性能

### 14.2.1 长任务切片
```typescript
// ❌ 长任务卡 UI
function process(items: Item[]) {
  for (const item of items) heavyWork(item);
}

// ✅ 切片
async function processSmart(items: Item[]) {
  for (const item of items) {
    heavyWork(item);
    if (navigator.scheduling?.isInputPending?.()) {
      await new Promise(r => setTimeout(r, 0));  // 或 scheduler.yield()
    }
  }
}

// ✅ 调度器 API
await scheduler.yield();  // 让出主线程,但保留任务
```

### 14.2.2 防抖节流
```typescript
// 节流(rAF 同步)
function rafThrottle<T extends (...args: any[]) => any>(fn: T): T {
  let ticking = false;
  return ((...args) => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(() => {
        fn(...args);
        ticking = false;
      });
    }
  }) as T;
}

// 防抖
function debounce<T extends (...args: any[]) => any>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout>;
  return ((...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as T;
}

// 在事件中使用 passive
window.addEventListener('scroll', handler, { passive: true });
window.addEventListener('touchmove', handler, { passive: true });
```

### 14.2.3 Web Worker
```typescript
// worker.ts
self.onmessage = (e: MessageEvent<Data>) => {
  const result = heavyCompute(e.data);
  self.postMessage(result);
};

// main.ts
const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
worker.postMessage(largeData);
worker.onmessage = (e) => console.log(e.data);
```

### 14.2.4 虚拟列表
```typescript
import { useVirtualizer } from '@tanstack/react-virtual';

// 仅渲染可视区
const virtualizer = useVirtualizer({
  count: items.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 50,
  overscan: 5,  // 预渲染 5 个
});
```

### 14.2.5 大数据渲染
```typescript
// ❌ 10000 个 DOM 节点
items.forEach(item => appendToDOM(item));

// ✅ 文档片段
const frag = document.createDocumentFragment();
items.forEach(item => frag.appendChild(createNode(item)));
parent.appendChild(frag);

// ✅ requestAnimationFrame 分批
function renderInBatches(items, batchSize = 100) {
  let i = 0;
  function renderBatch() {
    const batch = items.slice(i, i + batchSize);
    batch.forEach(/* render */);
    i += batchSize;
    if (i < items.length) {
      requestAnimationFrame(renderBatch);
    }
  }
  renderBatch();
}
```

## 14.3 React 性能

### 14.3.1 避免不必要渲染
```tsx
// ❌ 父组件每次创建新对象
function Parent() {
  const [value, setValue] = useState(0);
  return <Child config={{ a: 1, b: 2 }} />;
}

// ✅ memo + useMemo
const Child = memo(({ config }: Props) => <div>{config.a}</div>);

function Parent() {
  const config = useMemo(() => ({ a: 1, b: 2 }), []);
  return <Child config={config} />;
}
```

### 14.3.2 状态切片
```tsx
// ❌ 一个 useState
const [state, setState] = useState({ user, posts, comments });

// ✅ 切片
const [user, setUser] = useState();
const [posts, setPosts] = useState();
```

### 14.3.3 useTransition
```tsx
const [isPending, startTransition] = useTransition();

const handleSearch = (e) => {
  setQuery(e.target.value);  // 紧急
  startTransition(() => {
    setResults(heavySearch(e.target.value));  // 非紧急
  });
};
```

### 14.3.4 列表稳定 key
```tsx
// ❌ index key
{items.map((item, i) => <Item key={i} {...item} />)}

// ✅ 稳定 ID
{items.map(item => <Item key={item.id} {...item} />)}
```

### 14.3.5 代码分割
```tsx
// 路由
const Home = lazy(() => import('./pages/Home'));

// 组件
const HeavyChart = lazy(() => import('./components/HeavyChart'));

// 库分割 (vite.config.ts)
manualChunks: {
  'react-vendor': ['react', 'react-dom'],
  'editor': ['monaco-editor'],
}
```

## 14.4 内存优化

### 14.4.1 检测泄漏
```
DevTools → Memory → Heap Snapshot
1. 拍快照
2. 操作(切换路由、打开弹窗、关闭)
3. 再拍快照
4. 比较 → 多出来的对象就是泄漏
```

### 14.4.2 常见泄漏
```typescript
// 1. 事件监听
useEffect(() => {
  const handler = () => {};
  window.addEventListener('resize', handler);
  return () => window.removeEventListener('resize', handler);
}, []);

// 2. 定时器
useEffect(() => {
  const id = setInterval(fn, 1000);
  return () => clearInterval(id);
}, []);

// 3. 订阅
useEffect(() => {
  const sub = observable.subscribe(handler);
  return () => sub.unsubscribe();
}, []);

// 4. 闭包
function Component() {
  useEffect(() => {
    const big = new Array(1e6);  // 大对象
    return () => { /* 不用大对象时,大对象仍在闭包 */ };
  }, []);
}
```

### 14.4.3 弱引用
```typescript
const cache = new WeakMap();
cache.set(domElement, data);  // DOM 删除时自动 GC

const ref = new WeakRef(largeObject);
// 大对象可被 GC, ref.deref() 拿到或 undefined
```

## 14.5 网络优化

### 14.5.1 HTTP 缓存策略
```
HTML:               no-cache
带 hash 静态资源:   max-age=31536000, immutable
API GET (静态):     max-age=300, stale-while-revalidate=86400
API GET (动态):     no-cache
用户数据:           no-store
```

### 14.5.2 CDN 加速
```
静态资源: 全部走 CDN
图片:     单独 CDN(支持图片处理)
API:      边缘函数(Cloudflare Workers/Vercel Edge)
动态 SSR: 边缘节点 + 增量缓存
```

### 14.5.3 预连接
```html
<link rel="preconnect" href="https://api.example.com" crossorigin>
<link rel="preconnect" href="https://cdn.example.com">
<link rel="dns-prefetch" href="//tracker.com">
```

### 14.5.4 协议层优化
```
启用 HTTP/2 (server 端)
考虑 HTTP/3 (Cloudflare/Cloudflare-Automatic)
TLS 1.3
OCSP Stapling
```

## 14.6 资源优化

### 14.6.1 JS 压缩
```javascript
// vite.config.ts
build: {
  minify: 'esbuild',  // 或 'terser'
  terserOptions: {
    compress: {
      drop_console: true,        // 生产去掉 console
      drop_debugger: true,
      pure_funcs: ['console.log'],
    },
  },
}
```

### 14.6.2 CSS 压缩
```javascript
// 自动
build: {
  cssMinify: 'lightningcss',  // 比默认更快
}
```

### 14.6.3 图片压缩工具
```bash
# CLI
npx sharp-cli -i input.jpg -o output.jpg -- --quality 80
npx svgo --multipass input.svg output.svg

# Vite 插件
npm i -D vite-plugin-imagemin
```

### 14.6.4 SVG 优化
```bash
npx svgo --multipass ./src/assets/icons/
```

### 14.6.5 Tree Shaking
```json
// package.json
{
  "sideEffects": false  // 或 ["*.css", "*.scss"]
}
```

```typescript
// ❌ 全部导入
import _ from 'lodash';  // 70KB

// ✅ 按需导入
import debounce from 'lodash/debounce';  // 1KB

// 或
import { debounce } from 'lodash-es';  // ESM,可 tree-shake
```

## 14.7 性能分析工具

### 14.7.1 Chrome DevTools

**Performance 面板:**
```
1. Ctrl+Shift+E 录制
2. 操作页面
3. 停止
4. 分析 Main 火焰图:
   - 黄色 = JS
   - 紫色 = 布局
   - 绿色 = 绘制
   - 长任务 > 50ms 标红
5. 查看 Summary:
   - FCP, LCP, TBT
   - 主线程被阻塞时间
```

**Memory 面板:**
```
Heap Snapshot: 拍快照找泄漏
Allocation Instrumentation: 实时分配
```

**Network 面板:**
```
Waterfall: 看资源加载顺序
Right-click → Block request URL: 模拟资源不可用
Throttling: Slow 3G 模拟
Disable cache
```

**Coverage 面板:**
```
找出未使用的 JS/CSS
```

### 14.7.2 Lighthouse
```
DevTools → Lighthouse 标签
或 npx lighthouse https://example.com --view

评分维度:
  • Performance
  • Accessibility
  • Best Practices
  • SEO
```

### 14.7.3 WebPageTest
```
https://webpagetest.org
多地点测试、瀑布图、video 录像
```

### 14.7.4 Bundle 分析
```bash
# Vite
npx rollup-plugin-visualizer (生成 stats.html)

# Webpack
npx webpack-bundle-analyzer stats.json

# source-map-explorer
npx source-map-explorer dist/*.js
```

### 14.7.5 监控生产
```typescript
import { onLCP, onINP, onCLP, onFCP, onTTFB } from 'web-vitals';

function report(metric) {
  navigator.sendBeacon('/api/perf', JSON.stringify({
    name: metric.name,
    value: metric.value,
    rating: metric.rating,
    id: metric.id,
    navigationType: metric.navigationType,
  }));
}

onLCP(report);
onINP(report);
onCLS(report);
onFCP(report);
onTTFB(report);
```

## 14.8 高级模式

### 14.8.1 边缘 SSR / ISR
```typescript
// Vercel 边缘
export const runtime = 'edge';
export const revalidate = 60;  // ISR

export default async function Page() {
  const data = await fetch('https://api.example.com', {
    next: { revalidate: 60 },
  });
  return <div>{data.title}</div>;
}
```

### 14.8.2 Service Worker 缓存
```typescript
// service-worker.ts
const CACHE = 'app-v1';
const STATIC_ASSETS = ['/', '/app.js', '/main.css'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC_ASSETS)));
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then(cached => {
      const network = fetch(e.request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
```

### 14.8.3 HTTP 缓存 + SW 协同
```
1. 浏览器先问 SW
2. SW 命中: 返回缓存
3. SW 未命中: 浏览器 HTTP 请求
4. 服务端 Cache-Control: max-age=31536000
5. 浏览器缓存命中: 直接返回
6. 浏览器缓存过期: 走 ETag/Last-Modified 协商
```

### 14.8.4 部分水合 (Partial Hydration / Islands)
```typescript
// Astro: 默认 islands
---
import Counter from '../components/Counter.vue';
---
<html>
  <body>
    <h1>Hello</h1>
    <Counter client:visible />
  </body>
</html>
```

### 14.8.5 渐进式增强
```
HTML 完成 → CSS 渲染 → JS 增强
↓
渐进式: 先可用,后增强
优先级: 内容 > 样式 > 交互 > 个性化
```

## 14.9 案例分析

### 14.9.1 案例 1: 电商首页 LCP 优化

**问题:** LCP 4.2s,主要元素是首屏 hero 图。

**诊断:**
```
1. Hero 图: 1.8MB JPEG,未优化
2. 字体加载阻塞
3. CSS 在 <head> 同步加载,延迟首屏
4. JS 同步脚本阻塞
```

**优化:**
```
1. Hero 图: AVIF 80KB + srcset + fetchpriority="high"
2. 字体 preload + font-display: swap
3. 关键 CSS 内联(8KB),其他异步
4. JS defer / async
5. CDN
```

**结果:** LCP 4.2s → 1.4s ✅

### 14.9.2 案例 2: 长列表卡顿

**问题:** 1万行表格滚动卡顿。

**诊断:**
```
1. 所有 DOM 节点渲染(1万)
2. 表格无虚拟化
3. 每行有计算
```

**优化:**
```
1. 虚拟列表(react-virtual)
2. 行 memo + 减少 props
3. 计算放 Web Worker
4. CSS contain: layout
```

**结果:** 滚动 60fps,内存从 80MB → 20MB ✅

### 14.9.3 案例 3: SPA 首屏白屏

**问题:** 单页应用首屏 5s 白屏。

**诊断:**
```
1. 入口 JS 2MB,同步加载
2. SSR 未启用
3. 数据获取在客户端
```

**优化:**
```
1. SSR (Next.js) — 首屏 HTML 直出
2. Streaming SSR — TTFB 减少
3. 代码分割: vendor/路由/组件
4. 关键数据提前注入
5. Loading skeleton
```

**结果:** 首屏 5s → 1.2s ✅

## 14.10 专家陷阱清单

| 陷阱 | 后果 | 解决 |
|------|------|------|
| LCP 用 lazy | LCP 延迟 | 关键图 eager |
| transform 改 width | reflow | 用 transform: scale |
| scroll 事件不节流 | 卡顿 | rAF / throttle |
| 同步大循环 | UI 卡 | 切片 / Worker |
| 没开缓存 | 反复请求 | Cache-Control |
| 字体 FOIT | 闪烁 | font-display: swap |
| 图片无宽高 | CLS | 显式 width/height |
| CDN 缓存带 cookie | 命中率低 | 配忽略规则 |
| 第三方脚本未延迟 | 阻塞 | defer / async |
| 动画无限循环 | 性能持续消耗 | 退出时停止 |

## 14.11 实战项目

### 🎯 项目 1: 性能审计 + 优化报告
要求:
- 抓取 Web Vitals
- Bundle 分析
- 资源审计
- 性能预算
- 生成报告(图表 + 建议)

### 🎯 项目 2: 大数据虚拟列表 (10万行)
要求:
- 流畅滚动 60fps
- 动态高度
- 多列布局
- 滚动预取
- 性能监控

### 🎯 项目 3: SSR + ISR 博客系统
要求:
- SSR 完整实现
- 边缘缓存
- Web Vitals 监控
- Lighthouse 95+
- 部署 Vercel

## ✅ 本章检查清单

- [ ] Core Web Vitals 监控能做
- [ ] 关键渲染路径分析
- [ ] 长任务切片 / Web Worker
- [ ] 虚拟列表 / 大数据渲染
- [ ] Bundle 分析 + 优化
- [ ] HTTP 缓存 + CDN + SW 配置
- [ ] 完成 3 个实战项目

**下一章:** → [15-A11y-Security-i18n.md](./15-A11y-Security-i18n.md)