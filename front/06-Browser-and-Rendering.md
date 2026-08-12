# 06 · 浏览器与渲染原理

> 理解浏览器工作原理是前端专家的**分水岭**。它解释了为什么"加 transform 性能好"、"为什么 setState 会异步"、"为什么长任务卡顿"。

## 📌 心智模型

```
浏览器 = 用户界面 (UI) + 渲染引擎 (Blink/WebKit/Gecko) + JavaScript 引擎 (V8) + 网络栈 + 存储 + ...

前端工程师的视角聚焦在:
  1. 渲染引擎 (HTML→DOM, CSS→CSSOM, 布局, 绘制, 合成)
  2. JavaScript 引擎 (字节码、JIT、优化)
  3. 事件循环 (Task、Microtask、Animation Frame)
```

## 6.1 Chrome 多进程架构

```
Browser 进程 (主进程)
├── UI 线程 (地址栏、按钮)
├── 网络线程 (HTTP 请求)
└── 存储线程

渲染进程 (每个 tab/site instance 一个)
├── 主线程 (HTML 解析、CSS 计算、布局、绘制)
├── Worker 线程
├── Compositor 线程 (合成)
└── Raster 线程 (栅格化)

GPU 进程 (图形加速)
插件进程 (Flash 等)
```

**Site Isolation:** 跨域 iframe 各自独立渲染进程(安全 + 稳定)。

## 6.2 导航流程:从 URL 到页面

```
1. URL 解析
   ↓
2. DNS 查询 (缓存 → 系统 → 网络)
   ↓
3. TCP 握手 (3 次) + TLS 协商 (HTTPS)
   ↓
4. HTTP 请求 / 接收响应
   ↓
5. 响应数据处理 (Content-Type 判断)
   ↓
6. 解析 HTML → DOM
   ↓
7. 解析 CSS → CSSOM
   ↓
8. Render Tree = DOM + CSSOM (排除 display:none)
   ↓
9. 布局 (Layout / Reflow)
   ↓
10. 分层 (Layer)
   ↓
11. 绘制 (Paint) → 绘制记录
   ↓
12. 栅格化 (Raster) → 位图
   ↓
13. 合成 (Composite) → 屏幕
```

### 6.2.1 关键术语
- **DOMContentLoaded**: HTML 解析完成,DOM 树构建完成
- **Load**: 所有资源(图片、样式、脚本)加载完成
- **First Paint (FP)**: 第一次像素绘制
- **First Contentful Paint (FCP)**: 首次绘制内容(文本、图片、SVG)
- **Largest Contentful Paint (LCP)**: 最大内容渲染时间
- **Time to Interactive (TTI)**: 可交互时间

## 6.3 渲染流水线深度

### 6.3.1 DOM 构建
```
HTML 字节流
   ↓ (字符编码)
Token 化 (词法分析)
   ↓
Node 树 (DOM)
   ↓
CSS 解析: 字节 → Token → CSSOM 树
   ↓
Render Tree (DOM + CSSOM,可视节点)
```

### 6.3.2 布局 (Layout)
- 从根节点开始,递归计算每个节点的位置和大小
- **Reflow**: 任何几何属性变化(width, height, top, left, font-size) → 整树或子树重新布局
- 触发条件: 窗口 resize、DOM 增删、读取 `offsetWidth` 等几何属性

### 6.3.3 绘制 (Paint)
- 生成绘制记录(绘制指令的列表)
- **Repaint**: 颜色、背景、阴影变化 → 重新绘制
- 绘制是分层进行的(每个层独立绘制)

### 6.3.4 合成 (Composite)
- 将多层位图按顺序合成最终图像
- 仅 GPU 合成(无 CPU 重计算)
- 只影响 transform/opacity → 仅需合成,不触发 reflow/repaint

### 6.3.5 渲染流水线图
```
       ┌─────────────────┐
       │     DOM/CSSOM   │
       └────────┬────────┘
                ↓
       ┌─────────────────┐
       │   Layout 计算   │  ← Reflow
       └────────┬────────┘
                ↓
       ┌─────────────────┐
       │  Paint 绘制记录 │  ← Repaint
       └────────┬────────┘
                ↓
       ┌─────────────────┐
       │ Layer 分层/栅格化│
       └────────┬────────┘
                ↓
       ┌─────────────────┐
       │ Composite 合成  │  ← GPU
       └─────────────────┘
```

## 6.4 关键 CSS 属性的渲染成本

| 属性 | 触发 | 性能 |
|------|------|------|
| `width`, `height`, `top`, `left` | Layout + Paint + Composite | ❌ 最差 |
| `color`, `background` | Paint | ⚠️ 中等 |
| `transform`, `opacity` | 仅 Composite | ✅ 最佳 |

**结论:动画只用 transform/opacity。**

## 6.5 分层与合成层

### 6.5.1 提升合成层 (Promoted Layer)
```css
/* 显式提升 */
.element {
  transform: translateZ(0);  /* 旧 hack */
  will-change: transform;   /* 现代方法 */
}

/* 自动提升 */
.element {
  position: fixed;          /* ⚠️ 会提升 */
  transform: ...;           /* ⚠️ 会提升 */
  opacity < 1;              /* ⚠️ 会提升 */
  filter: ...;              /* ⚠️ 会提升 */
}
```

**专家陷阱:** 大量合成层会占大量显存!只在必要时用。

### 6.5.2 查看层(Layers 面板)
DevTools → Layers 面板或 3D View 看分层。

## 6.6 JavaScript 引擎:V8 深度

### 6.6.1 V8 流水线
```
JS 源码
  ↓ Parser (解析)
AST (抽象语法树)
  ↓ Ignition (字节码解释器)
Bytecode
  ↓ TurboFan (优化编译器)
优化机器码
  ↓ (运行时)
机器执行
```

### 6.6.2 JIT 编译
- **解释执行**: 启动快,运行慢
- **JIT 编译**: 收集类型反馈,热点代码编译为机器码
- **去优化 (Deopt)**: 假设类型变化,回退到解释

### 6.6.3 隐藏类 (Hidden Class)
```javascript
class Point {
  constructor(x, y) {
    this.x = x;   // hidden class transition
    this.y = y;   // another transition
  }
}
const p1 = new Point(1, 2);  // 快速: 同样形状
const p2 = { x: 1, y: 2 };   // OK
const p3 = { y: 2, x: 1 };   // 不同 hidden class,慢
```

### 6.6.4 内联缓存 (Inline Cache)
```javascript
function add(a, b) { return a + b; }
add(1, 2);        // monomorphic (快)
add('1', '2');    // polymorphic (中等)
add([], {});      // megamorphic (慢)
```

### 6.6.5 优化技巧(总结)
1. 保持函数参数类型一致
2. 初始化对象时按相同顺序设属性
3. 避免 `delete obj.x`
4. 优先使用 `const`/`let`
5. 数组/对象用字面量
6. 不混用稀疏数组与密集数组

## 6.7 事件循环深度

### 6.7.1 调用栈
```
主线程单线程,任何同步代码都在调用栈上执行。
栈溢出: 递归太深
```

### 6.7.2 任务分类

**宏任务 (Macrotask):**
- `setTimeout`, `setInterval`
- I/O
- UI 渲染
- script(整体)

**微任务 (Microtask):**
- `Promise.then/catch/finally`
- `queueMicrotask`
- `MutationObserver`
- `process.nextTick` (Node)

**优先级:**
```
执行栈同步代码
   ↓
微任务队列清空
   ↓
渲染(若需)
   ↓
宏任务队列取一个
   ↓
... 循环
```

### 6.7.3 实战分析
```javascript
console.log('1');                // 同步
setTimeout(() => console.log('2'), 0);  // 宏任务
Promise.resolve().then(() => console.log('3'));  // 微任务
queueMicrotask(() => console.log('4'));
console.log('5');

// 输出: 1, 5, 3, 4, 2
```

### 6.7.4 Node.js 事件循环
```
┌───────────────────────────┐
│        timers             │  setTimeout, setInterval
└──────────┬────────────────┘
           ↓
┌───────────────────────────┐
│   pending callbacks       │  系统回调
└──────────┬────────────────┘
           ↓
┌───────────────────────────┐
│      idle, prepare        │  内部
└──────────┬────────────────┘
           ↓
┌───────────────────────────┐
│         poll              │  I/O
└──────────┬────────────────┘
           ↓
┌───────────────────────────┐
│         check             │  setImmediate
└──────────┬────────────────┘
           ↓
┌───────────────────────────┐
│    close callbacks        │
└───────────────────────────┘

每个阶段之间清空微任务(process.nextTick 优先级最高)
```

## 6.8 浏览器任务调度

### 6.8.1 requestAnimationFrame
```javascript
// 与屏幕刷新率同步(通常 60Hz)
function tick() {
  render();
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
```

### 6.8.2 requestIdleCallback
```javascript
// 浏览器空闲时执行(非紧急任务)
requestIdleCallback(deadline => {
  while (deadline.timeRemaining() > 0) {
    doWork();
  }
}, { timeout: 1000 });
```

### 6.8.3 scheduler.postTask(实验)
```javascript
await scheduler.postTask(() => render(), { priority: 'user-blocking' });
await scheduler.postTask(() => fetchAnalytics(), { priority: 'background' });
```

### 6.8.4 任务切片(避免长任务)
```javascript
async function processInChunks(items, fn) {
  for (let i = 0; i < items.length; i++) {
    fn(items[i]);
    // 每 5ms 让出主线程
    if (i % 100 === 0) await new Promise(r => setTimeout(r, 0));
  }
}

// 更好:scheduler.yield()
async function processSmart(items, fn) {
  for (const item of items) {
    fn(item);
    if (navigator.scheduling?.isInputPending?.()) {
      await scheduler.yield();  // 让出,但保留当前任务
    }
  }
}
```

## 6.9 内存管理与 GC

### 6.9.1 内存区域
- **栈**: 基本类型、引用、函数调用
- **堆**: 对象、数组、闭包

### 6.9.2 GC 算法
- **引用计数**(旧): 循环引用泄漏
- **标记-清除**(现代 V8 主用): 从根可达,不可达回收
- **分代 GC**: 新生代(Scavenger)+ 老生代(Major GC)

### 6.9.3 内存分析
```
DevTools → Memory
  • Heap Snapshot: 拍快照,找泄漏
  • Allocation Instrumentation: 实时分配
  • Allocation Timeline: 分配随时间
```

### 6.9.4 内存指标
```
JS Heap: 当前 JS 堆大小
Documents: DOM 节点数
Nodes: 总节点数
Listeners: 事件监听数
GPU Memory: GPU 内存
```

## 6.10 渲染性能优化

### 6.10.1 减少回流 (Reflow)
```javascript
// ❌ 多次触发
el.style.width = '100px';
el.style.height = '100px';
el.style.margin = '10px';

// ✅ 合并到 className
el.className = 'box-large';

// ✅ 或使用 cssText
el.style.cssText = 'width:100px;height:100px;margin:10px';

// ✅ 离线修改
const frag = document.createDocumentFragment();
// ... 操作 frag
parent.appendChild(frag);

// ✅ 隐藏后修改
el.style.display = 'none';
// ... 修改
el.style.display = 'block';
```

### 6.10.2 避免强制同步布局 (Forced Sync Layout)
```javascript
// ❌ 写后读,导致 reflow
el.style.width = '100px';
console.log(el.offsetWidth);  // 强制 reflow

// ✅ 批量读
const width = el.offsetWidth;
el.style.width = (width + 10) + 'px';

// ❌ 循环中读写
for (let i = 0; i < items.length; i++) {
  el.style.top = items[i].top;     // 写
  total += el.offsetTop;            // 读 → reflow
}

// ✅ 读一次
const tops = items.map(i => i.top);
for (let i = 0; i < items.length; i++) {
  el.style.top = tops[i] + 'px';
}
```

### 6.10.3 防抖/节流滚动事件
```javascript
// ❌ scroll 事件每秒触发上百次
window.addEventListener('scroll', () => heavyWork());

// ✅ 节流
const throttledScroll = throttle(() => heavyWork(), 16);  // 60fps
window.addEventListener('scroll', throttledScroll);

// ✅ 或 rAF
window.addEventListener('scroll', () => {
  if (!ticking) {
    requestAnimationFrame(() => {
      heavyWork();
      ticking = false;
    });
    ticking = true;
  }
}, { passive: true });
```

## 6.11 浏览器存储

| API | 大小 | 用途 | 特点 |
|-----|------|------|------|
| Cookie | 4KB | 会话 | 每次请求带 |
| localStorage | 5-10MB | 持久数据 | 同步 |
| sessionStorage | 5-10MB | 会话数据 | 关 tab 消失 |
| IndexedDB | 大量 | 结构化数据 | 异步 |
| Cache API | 大量 | 缓存资源 | Service Worker |
| OPFS | 大量 | 文件 | Origin Private |

### IndexedDB 实战
```javascript
import { openDB } from 'idb';
const db = await openDB('myapp', 1, {
  upgrade(db) {
    db.createObjectStore('users', { keyPath: 'id' });
    db.createIndex('by-email', 'email');
  }
});

await db.put('users', { id: 1, name: 'A', email: 'a@x.com' });
const user = await db.get('users', 1);
const all = await db.getAll('users');
```

### Storage Buckets (现代)
```javascript
// 持久化存储申请
const persisted = await navigator.storage.persisted();
if (!persisted) {
  await navigator.storage.persist();
}

// 估算
const { quota, usage } = await navigator.storage.estimate();
```

## 6.12 浏览器协议层

### 6.12.1 Same-Origin Policy
```
协议 + 域名 + 端口
http://example.com:80
https://example.com:443
```

### 6.12.2 CORS
```http
Access-Control-Allow-Origin: https://app.com
Access-Control-Allow-Methods: GET, POST, PUT
Access-Control-Allow-Headers: Content-Type, Authorization
Access-Control-Allow-Credentials: true
Access-Control-Max-Age: 86400
```

**预检 (Preflight):**
```javascript
// 浏览器自动发送 OPTIONS
fetch('https://api.example.com/data', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data)
});
```

### 6.12.3 现代替代方案
- **反向代理** (开发期)
- **Service Worker** 拦截
- **postMessage** + iframe (跨域)
- **WebSocket** (实时双向)

## 6.13 安全模型

### 6.13.1 XSS 分类
```
反射型: URL 参数 → 立即执行
存储型: 存到 DB → 所有访问者触发
DOM 型: 前端代码不当使用 DOM API
```

### 6.13.2 CSP
```http
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'nonce-{random}';
  style-src 'self' 'unsafe-inline';
  img-src 'self' https:;
  connect-src 'self' https://api.example.com;
```

### 6.13.3 Trusted Types
```javascript
// 强制净化
const policy = trustedTypes.createPolicy('myapp', {
  createHTML: s => DOMPurify.sanitize(s),
});
el.innerHTML = policy.createHTML(userInput);
```

## 6.14 浏览器通信

### 6.14.1 postMessage
```javascript
// iframe → parent
iframe.contentWindow.postMessage({ type: 'ready' }, 'https://parent.com');
// parent
window.addEventListener('message', e => {
  if (e.origin !== 'https://trusted.com') return;
  console.log(e.data);
});
```

### 6.14.2 BroadcastChannel
```javascript
const bc = new BroadcastChannel('app-bus');
bc.postMessage({ type: 'logout' });
bc.onmessage = e => console.log(e.data);

// 同源多 tab 通信
```

### 6.14.3 SharedWorker
```javascript
// 多个 tab 共享一个 worker
const worker = new SharedWorker('/shared-worker.js');
worker.port.start();
worker.port.postMessage('hello');
```

## 6.15 调试技巧

### 6.15.1 DevTools 面板速查
```
Elements: DOM + CSS
Console: JS 执行
Sources: 断点、源码
Network: 请求
Performance: 录制、火焰图
Memory: 内存快照
Lighthouse: 综合评分
Layers: 合成层
```

### 6.15.2 Performance 录制分析
```
1. 打开 Performance 面板
2. 点录制(ctrl+E)
3. 操作页面
4. 停止录制
5. 看 Main 线程火焰图:
   - 黄 = 脚本
   - 紫 = 布局
   - 绿 = 绘制
   - 灰 = 系统
   长任务 (>50ms) 会标红
```

### 6.15.3 关键渲染路径检查清单
```
[ ] 首字节时间 (TTFB)
[ ] FCP / LCP
[ ] 阻塞资源 (render-blocking CSS/JS)
[ ] 关键 CSS 内联
[ ] 字体加载策略
[ ] 图片懒加载
[ ] 长任务 (< 50ms)
```

## 6.16 专家陷阱清单

| 陷阱 | 后果 | 解决 |
|------|------|------|
| 同步阻塞大循环 | UI 卡顿 | 分片/Worker |
| 改 width/height 做动画 | 触发 reflow | 用 transform |
| scroll 事件不节流 | 卡顿 | rAF / throttle |
| 内存无限增长 | OOM | 监控 + 定期清理 |
| Cookie 跨域没设 SameSite | CSRF | 设 Strict/Lax |
| localStorage 存敏感数据 | XSS 暴露 | 用 httpOnly Cookie |
| IndexedDB 异步但忘了 await | 数据丢失 | Promise 链 |
| 频繁读取 offsetWidth | 强制 reflow | 缓存值 |
| 大量 will-change | 显存爆炸 | 用完移除 |
| 不清理事件监听 | 内存泄漏 | AbortController |

## 6.17 实战项目

### 🎯 项目 1: 浏览器性能分析器
要求:
- 录制交互性能
- 输出火焰图
- 标记长任务
- 给出优化建议

### 🎯 项目 2: 虚拟列表组件 (10万行流畅滚动)
要求:
- 只渲染可视区 + buffer
- 动态高度
- 滚动节流
- 滚动性能 60fps

### 🎯 项目 3: IndexedDB 包装库
要求:
- Promise API
- 索引/事务/迁移
- 自动重连
- 类型定义

## ✅ 本章检查清单

- [ ] 能说出浏览器从 URL 到渲染的完整流程
- [ ] 渲染流水线 5 个阶段能画图
- [ ] CSS 属性与渲染成本对应表背得出
- [ ] 事件循环机制能用代码验证
- [ ] V8 优化 4 招能讲清
- [ ] 能用 Performance 录制并找出长任务
- [ ] 知道 localStorage/IndexedDB/Cookie 的区别
- [ ] 完成 3 个实战项目

**下一章:** → [07-Network-and-Protocols.md](./07-Network-and-Protocols.md)