# 前端面试备战指南

> 基于教程内容,精选面试高频题,提供参考答案与延伸方向。

## 📋 面试能力图谱

```
                  算法题 (LeetCode Hot 100)
                       ↓
               前端基础 (HTML/CSS/JS)
                       ↓
               框架原理 (React/Vue)
                       ↓
               工程化 (Webpack/Vite/TS)
                       ↓
               性能优化 + 浏览器原理
                       ↓
                系统设计 + 项目经验
```

## 一、HTML / CSS (基础)

### Q1: 浏览器渲染流程?
```
1. 解析 HTML → DOM 树
2. 解析 CSS → CSSOM 树
3. DOM + CSSOM → 渲染树
4. 布局(Layout/Reflow):计算位置大小
5. 分层(Layer):不同合成层
6. 绘制(Paint):绘制记录
7. 栅格化(Raster):位图
8. 合成(Composite):GPU 输出屏幕
```

### Q2: 重排 vs 重绘?
```
重排(Reflow): 几何属性变化 → 重新布局 → 后续所有阶段
重绘(Repaint): 颜色/背景变化 → 重新绘制 → 栅格化、合成
合成(Composite): 仅 transform/opacity → 仅 GPU 合成,最佳

优化: 动画用 transform/opacity,合并修改,用 absolute 脱离文档流
```

### Q3: 盒模型?
```
content-box (默认): width = 内容宽度,border/padding 额外加
border-box: width = 内容+border+padding

推荐: * { box-sizing: border-box; }
```

### Q4: BFC 是什么?
```
Block Formatting Context: 独立的渲染区域,内部不影响外部

触发:
  • overflow ≠ visible
  • float ≠ none
  • position = absolute/fixed
  • display = flex/grid/inline-block
  • display = flow-root(推荐)

作用:
  • 清除浮动
  • 阻止 margin 折叠
  • 自适应两栏布局
```

## 二、JavaScript 核心

### Q5: 闭包?
```
函数 + 其词法环境(创建时引用的变量)
即使外层函数执行完毕,内层函数仍能访问外层变量

应用: 模块模式、防抖节流、柯里化
陷阱: 内存泄漏(大对象闭包)
```

### Q6: this 绑定?
```
1. new 绑定 (new Foo())
2. 显式 (call/apply/bind)
3. 隐式 (obj.fn())
4. 默认 (全局/严格模式 undefined)

箭头函数: 没有 this,沿用外层词法 this
```

### Q7: 原型链?
```
obj → Object.prototype → null
arr → Array.prototype → Object.prototype → null

继承方式: 原型链、借用构造函数、组合、寄生组合、ES6 class
推荐: ES6 class (本质寄生组合继承)
```

### Q8: 事件循环?
```
执行栈(同步代码)
  ↓
微任务队列清空(Promise.then, queueMicrotask)
  ↓
渲染(浏览器,可选)
  ↓
宏任务队列取一个(setTimeout, I/O, UI 渲染)
  ↓
循环

Node 事件循环 6 阶段: timers → pending → idle → poll → check → close
process.nextTick 优先级最高,微任务清空在阶段之间
```

### Q9: 手写 Promise?
```javascript
class MyPromise {
  #state = 'pending';
  #value;
  #callbacks = [];
  constructor(executor) {
    const resolve = v => this._settle('fulfilled', v);
    const reject = v => this._settle('rejected', v);
    try { executor(resolve, reject); }
    catch (e) { reject(e); }
  }
  _settle(state, value) {
    if (this.#state !== 'pending') return;
    this.#state = state;
    this.#value = value;
    queueMicrotask(() => this.#callbacks.forEach(cb => cb()));
  }
  then(onFulfilled, onRejected) {
    return new MyPromise((resolve, reject) => {
      this.#callbacks.push(() => {
        const cb = this.#state === 'fulfilled' ? onFulfilled : onRejected;
        if (!cb) {
          this.#state === 'fulfilled' ? resolve(this.#value) : reject(this.#value);
          return;
        }
        try {
          const result = cb(this.#value);
          result instanceof MyPromise ? result.then(resolve, reject) : resolve(result);
        } catch (e) { reject(e); }
      });
    });
  }
}
```

### Q10: 深拷贝?
```javascript
function deepClone(obj, hash = new WeakMap()) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj);
  if (obj instanceof RegExp) return new RegExp(obj);
  if (hash.has(obj)) return hash.get(obj);

  const clone = Array.isArray(obj) ? [] : {};
  hash.set(obj, clone);
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      clone[key] = deepClone(obj[key], hash);
    }
  }
  return clone;
}

// 现代: structuredClone(obj) // 支持循环引用、Date、Map、Set
```

### Q11: 防抖 vs 节流?
```javascript
// 防抖: 连续触发只执行最后一次
function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// 节流: 固定间隔最多执行一次
function throttle(fn, ms) {
  let last = 0;
  return (...args) => {
    const now = Date.now();
    if (now - last >= ms) {
      last = now;
      fn(...args);
    }
  };
}
```

## 三、网络

### Q12: HTTP/1.1 vs HTTP/2?
```
HTTP/1.1:
  • 文本协议
  • 单连接 6 并发(浏览器限制)
  • 队头阻塞(响应顺序)
  • 无头部压缩

HTTP/2:
  • 二进制分帧
  • 单连接多路复用(任意并发)
  • HPACK 头部压缩
  • 流优先级
  • 服务器推送(已废弃)

HTTP/3:
  • 基于 UDP (QUIC)
  • 解决 TCP 队头阻塞
  • 0-RTT 握手
```

### Q13: 浏览器缓存策略?
```
强缓存 (Cache-Control: max-age=N):
  • 命中: 直接用缓存,不请求

协商缓存 (ETag / Last-Modified):
  • 缓存过期: 带 If-None-Match / If-Modified-Since
  • 服务端返 304 + 缓存资源,或 200 + 新资源

stale-while-revalidate:
  • 缓存过期: 用过期缓存 + 后台异步更新
```

### Q14: CORS?
```
同源策略: 协议+域名+端口 一致

跨域请求:
  • 简单请求(GET/POST + 基本头): 直接发,服务端加 Access-Control-Allow-Origin
  • 预检请求(OPTIONS): 浏览器先询问,服务端允许后,再发真实请求

解决:
  1. 服务端 CORS 头(主流)
  2. 开发期: Vite proxy
  3. 生产期: 同源 / Nginx 反代
  4. JSONP(老,只 GET)
```

## 四、浏览器

### Q15: 从 URL 输入到页面显示?
```
1. URL 解析
2. DNS 查询(浏览器→系统→网络)
3. TCP 三次握手
4. TLS 协商(HTTPS)
5. HTTP 请求
6. 服务端响应
7. 解析 HTML → DOM
8. 解析 CSS → CSSOM
9. 构建 Render Tree
10. 布局
11. 绘制
12. 合成 → 显示
```

### Q16: XSS 防御?
```
类型: 反射型 / 存储型 / DOM 型

防御:
  • 不直接 innerHTML 拼接, 用 textContent 或 DOMPurify
  • CSP 头限制脚本源
  • 输入过滤、输出编码
  • Cookie 加 httpOnly
  • Trusted Types
```

### Q17: CSRF 防御?
```
攻击: 用户登录银行 A,访问恶意网站 B,B 利用 cookie 调 A 的接口

防御:
  • SameSite Cookie (Strict/Lax)
  • CSRF Token
  • Origin / Referer 校验
  • 双重 Cookie
```

## 五、React

### Q18: React 18 并发模式?
```
Concurrent React:
  • 可中断渲染: 高优先级任务打断低优先级
  • 自动批处理: 全部批处理
  • useTransition: 标记非紧急更新
  • useDeferredValue: 延迟值
  • Suspense: 异步加载占位
  • Streaming SSR: 流式 SSR
```

### Q19: Hooks 规则?
```
1. 顶层调用(不在 if/for 中)
2. 仅在 React 函数中调用
3. 依赖数组完整(eslint-plugin-react-hooks)
4. 自定义 Hook 必须 useXxx 命名
```

### Q20: useEffect vs useLayoutEffect?
```
useEffect: commit 后异步执行(浏览器绘制后)
useLayoutEffect: commit 后同步执行(浏览器绘制前)

使用场景:
  • useLayoutEffect: 测量 DOM、立即修改避免闪烁
  • useEffect: 大多数副作用、数据订阅

SSR: useLayoutEffect 会警告, 用 useIsomorphicLayoutEffect
```

### Q21: React 性能优化?
```
1. React.memo + useCallback + useMemo(避免不必要渲染)
2. Context 拆分(避免全树重渲染)
3. 列表稳定 key(避免重建)
4. 代码分割(lazy)
5. 虚拟列表(react-virtual)
6. useTransition(非紧急更新)
7. 状态切片(避免大对象 setState)
```

### Q22: 受控 vs 非受控?
```
受控: value + onChange,React 是唯一真相源
非受控: ref,DOM 是真相源

表单场景:
  • 大多数: 受控(可校验、动态禁用)
  • 简单 + 高性能: 非受控
```

## 六、Vue

### Q23: Vue3 响应式原理?
```
Proxy + Reflect + track/trigger

get → track(收集依赖)
set → trigger(触发更新)

ref: 用 .value 包装
reactive: Proxy 包装对象
shallowRef / shallowReactive: 仅顶层响应
computed: lazy 计算
watch: 显式源 + 选项
watchEffect: 自动收集依赖
```

### Q24: Vue3 vs Vue2?
```
Vue2: Object.defineProperty,无法监听数组索引、新增属性
Vue3: Proxy,深度监听、数组、动态属性
Vue3: Composition API,更好的逻辑复用
Vue3: 更小的运行时、更快的渲染
Vue3: 支持 SSR、Tree-shaking
```

## 七、TypeScript

### Q25: any vs unknown?
```
any: 任意类型,不安全
unknown: 任意类型,使用前必须 narrow(type guard)

推荐: 永远用 unknown 而非 any
```

### Q26: interface vs type?
```
interface:
  • 对象类型
  • 可声明合并
  • 可 extends

type:
  • 任意类型(联合、交叉、元组)
  • 可映射

实践: 对象用 interface,其他用 type
```

### Q27: 泛型约束?
```typescript
// extends
function getProp<T extends object, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}

// 默认类型
type Api<T = unknown> = { data: T };

// 条件类型
type IsString<T> = T extends string ? true : false;

// infer
type Unwrap<T> = T extends Promise<infer U> ? U : T;
```

## 八、性能

### Q28: 性能指标?
```
Core Web Vitals (Google 核心):
  • LCP (Largest Contentful Paint) < 2.5s
  • INP (Interaction to Next Paint) < 200ms
  • CLS (Cumulative Layout Shift) < 0.1

其他:
  • FCP < 1.8s
  • TTFB < 800ms
  • TBT < 200ms
```

### Q29: 性能优化策略?
```
加载: 资源压缩、CDN、preload、HTTP 缓存、SSR、code splitting
渲染: 关键 CSS 内联、字体 swap、图片 lazy、WebP/AVIF
运行时: 减少长任务、Web Worker、防抖节流、虚拟列表
框架: memo、useMemo、避免大 Context、状态切片
网络: HTTP/2/3、预连接、压缩、Service Worker
```

## 九、系统设计题

### Q30: 设计一个 Todo 应用?
```
需求: 增删改查、本地存储、多设备同步、协作
架构:
  • 组件: TodoList, TodoItem, AddTodo, Filter
  • 状态: Zustand(组件共享) + 远程(IndexedDB)
  • 持久化: IndexedDB + 后端同步
  • 离线: Service Worker
  • 同步: WebSocket 或轮询
  • 冲突解决: 最后写入获胜 / CRDT
```

### Q31: 设计一个即时通讯?
```
需求: 实时消息、历史记录、在线状态、消息可靠
架构:
  • WebSocket 长连接
  • 心跳 + 重连
  • 消息持久化(IndexedDB + 服务端)
  • 离线消息队列
  • 消息顺序: 服务端时间戳 + 客户端 ID
  • 已读未读
  • 文件传输: 分片上传 + 断点续传
```

### Q32: 设计一个大型电商首页?
```
需求: 个性化推荐、高性能、高可用
架构:
  • SSR + CDN + Edge Cache
  • 关键 CSS 内联
  • 图片懒加载 + responsive
  • 数据预取 + Suspense
  • 个性化: A/B 测试
  • 监控: Web Vitals + 业务指标
  • 容错: 降级、限流
```

## 十、行为面试

### Q33: 最有挑战的项目?
```
STAR 法则:
  • Situation: 情境
  • Task: 任务
  • Action: 行动(技术方案、决策)
  • Result: 结果(量化指标)

示例:
  • 微前端迁移(老架构痛点 → 选型 → 拆分 4 个团队 → 上线 → 性能提升 30%)
```

### Q34: 团队冲突?
```
• 听对方观点
• 找共同目标
• 用数据和原型说服
• 妥协与让步
• 升级到 Leader
```

## 📚 面试资源

```
LeetCode: Hot 100 + 前端专项
面经: 牛客网、掘金、GitHub
源码: React/Vue 必读
项目: 至少 2 个能讲 30 分钟的项目
```

## 🎯 面试流程节奏

```
1. 简历准备 (2-3 周前)
   • 突出技术深度和成果
   • 项目有量化指标

2. 八股文 (1-2 周前)
   • 本面试指南覆盖

3. 算法 (持续)
   • LeetCode 200 题

4. 系统设计 (1 周前)
   • 常见题: Todo / IM / Feed / 电商 / 短链

5. 行为面试 (持续)
   • STAR 法则准备 3-5 个故事

6. 模拟面试 (2-3 天前)
   • 朋友或付费 mock 面试
```

---

**祝你面试顺利! 🎉**