# 05 · JavaScript 进阶

> 在掌握核心之后,本章进入**设计模式、函数式编程、并发、性能**——专家级 JS 的"上层建筑"。

## 📌 心智模型

```
JS 进阶 = 5 大支柱:
  1. 设计模式 (应对常见场景的可复用方案)
  2. 函数式编程 (组合、纯函数、不可变)
  3. 异步与并发 (Promise、Worker、Streams)
  4. 性能与内存 (算法、复杂度、内存分析)
  5. 元编程 (Proxy、Decorator、Generator)
```

## 5.1 设计模式

### 5.1.1 创建型

**工厂模式:**
```javascript
function createUser(type) {
  const users = {
    admin: () => ({ role: 'admin', can: ['all'] }),
    guest: () => ({ role: 'guest', can: ['read'] })
  };
  return users[type]();
}
```

**单例模式:**
```javascript
class Database {
  static instance;
  static getInstance() {
    if (!Database.instance) {
      Database.instance = new Database();
    }
    return Database.instance;
  }
}
```

**Builder 模式:**
```javascript
class QueryBuilder {
  filters = [];
  sortBy;
  limit;
  where(field, op, value) { this.filters.push({ field, op, value }); return this; }
  orderBy(field) { this.sortBy = field; return this; }
  take(n) { this.limit = n; return this; }
  build() { /* 生成 SQL */ }
}

new QueryBuilder()
  .where('age', '>', 18)
  .where('active', '=', true)
  .orderBy('createdAt')
  .take(10)
  .build();
```

### 5.1.2 结构型

**适配器 (Adapter):**
```javascript
// 老接口
class OldAPI {
  getUser(id) { return fetch(`/old/${id}`); }
}
// 新接口
class NewAPI {
  fetchUser(id) { return fetch(`/new/${id}`); }
}
// 适配器
class APIAdapter {
  constructor(api) { this.api = api; }
  getUser(id) { return this.api.fetchUser(id); }
}
```

**装饰器 (Decorator):**
```javascript
// 经典装饰器
function readonly(target, key, descriptor) {
  descriptor.writable = false;
  return descriptor;
}

function memoize(target, key, descriptor) {
  const original = descriptor.value;
  const cache = new Map();
  descriptor.value = function(...args) {
    const k = JSON.stringify(args);
    if (!cache.has(k)) cache.set(k, original.apply(this, args));
    return cache.get(k);
  };
  return descriptor;
}

class Calculator {
  @memoize
  fib(n) { return n < 2 ? n : this.fib(n-1) + this.fib(n-2); }
}
```

### 5.1.3 行为型

**观察者 vs 发布订阅:**
```javascript
// 观察者(双向依赖)
class Observable {
  observers = [];
  subscribe(o) { this.observers.push(o); }
  unsubscribe(o) { this.observers = this.observers.filter(x => x !== o); }
  notify(data) { this.observers.forEach(o => o.update(data)); }
}

// 发布订阅(解耦,经由 EventBus)
class EventBus {
  events = {};
  on(event, handler) { (this.events[event] ||= []).push(handler); }
  off(event, handler) {
    this.events[event] = (this.events[event] || []).filter(h => h !== handler);
  }
  emit(event, ...args) {
    (this.events[event] || []).forEach(h => h(...args));
  }
  once(event, handler) {
    const wrapper = (...args) => {
      handler(...args);
      this.off(event, wrapper);
    };
    this.on(event, wrapper);
  }
}
```

**策略模式:**
```javascript
const taxStrategies = {
  CN: price => price * 0.13,
  US: price => price * 0.08,
  EU: price => price * 0.20,
};
function calcTax(price, country) {
  return taxStrategies[country](price);
}
```

**状态机:**
```javascript
// 订单状态机
class Order {
  state = 'pending';
  transitions = {
    pending: ['paid', 'cancelled'],
    paid: ['shipped', 'refunded'],
    shipped: ['delivered'],
    delivered: [],
    cancelled: [],
    refunded: [],
  };
  transition(to) {
    if (!this.transitions[this.state].includes(to)) {
      throw new Error(`Invalid: ${this.state} → ${to}`);
    }
    this.state = to;
  }
}
```

## 5.2 函数式编程 (FP)

### 5.2.1 纯函数 & 不可变
```javascript
// 纯函数:相同输入 → 相同输出,无副作用
const add = (a, b) => a + b;

// 不可变
const user = { name: 'A', age: 30 };
const updated = { ...user, age: 31 };  // 新对象
const arr = [1,2,3];
const newArr = [...arr, 4];
```

### 5.2.2 柯里化与组合
```javascript
// 柯里化
const curry = (fn) => {
  const curried = (...args) =>
    args.length >= fn.length
      ? fn(...args)
      : (...rest) => curried(...args, ...rest);
  return curried;
};

// 组合(从右到左)
const compose = (...fns) => (x) => fns.reduceRight((v, f) => f(v), x);
// 管道(从左到右)
const pipe = (...fns) => (x) => fns.reduce((v, f) => f(v), x);

// 实战
const process = pipe(
  trim,
  toLowerCase,
  split(' '),
  filter(Boolean),
);
```

### 5.2.3 高阶函数
```javascript
// once
const once = (fn) => {
  let done = false, result;
  return (...args) => {
    if (done) return result;
    done = true;
    result = fn(...args);
    return result;
  };
};

// memoize
const memoize = (fn, getKey = (...args) => JSON.stringify(args)) => {
  const cache = new Map();
  return (...args) => {
    const key = getKey(...args);
    if (!cache.has(key)) cache.set(key, fn(...args));
    return cache.get(key);
  };
};
```

### 5.2.4 Functor / Monad 概念
```javascript
// Functor:有 map 方法的容器
class Box {
  constructor(value) { this.value = value; }
  map(fn) { return new Box(fn(this.value)); }
  static of(v) { return new Box(v); }
}
Box.of(2).map(x => x * 2).map(x => x + 1);  // Box { value: 5 }

// Maybe Monad:处理 null/undefined
class Maybe {
  constructor(value) { this.value = value; }
  static of(v) { return new Maybe(v); }
  static empty() { return new Maybe(null); }
  isEmpty() { return this.value == null; }
  map(fn) { return this.isEmpty() ? this : Maybe.of(fn(this.value)); }
  getOrElse(defaultValue) { return this.isEmpty() ? defaultValue : this.value; }
}

// Promise 是 Monad(then 相当于 map,Promise.resolve 相当于 of)
```

### 5.2.5 FP 库:Lodash / fp
```javascript
import { pipe, map, filter, reduce } from 'lodash/fp';

const result = pipe(
  filter(x => x > 0),
  map(x => x * 2),
  reduce((a, b) => a + b, 0)
)([-1, 2, 3, -4, 5]);  // 20
```

## 5.3 异步与并发

### 5.3.1 Async/Await 模式
```javascript
// 顺序
for (const url of urls) {
  const data = await fetch(url);
}

// 并发(独立任务)
const results = await Promise.all(urls.map(url => fetch(url)));

// 并发控制(p-limit)
async function pMap(input, mapper, concurrency = 5) {
  const results = new Array(input.length);
  let i = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (true) {
      const idx = i++;
      if (idx >= input.length) break;
      results[idx] = await mapper(input[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}
```

### 5.3.2 Worker Threads (CPU 密集)
```javascript
// 主线程
const worker = new Worker('./worker.js', { type: 'module' });
worker.postMessage({ data: bigArray });
worker.onmessage = e => console.log(e.data);

// worker.js
self.onmessage = e => {
  const result = heavyComputation(e.data);
  self.postMessage(result);
};
```

### 5.3.3 SharedArrayBuffer + Atomics
```javascript
// 主线程
const buffer = new SharedArrayBuffer(4);
const view = new Int32Array(buffer);
const worker = new Worker('./worker.js');
worker.postMessage(buffer);

// worker.js
self.onmessage = e => {
  const view = new Int32Array(e.data);
  Atomics.store(view, 0, 42);
  Atomics.notify(view, 0);
};
```

### 5.3.4 Streams (Streams API)
```javascript
// 浏览器:ReadableStream
const stream = new ReadableStream({
  start(controller) {
    controller.enqueue('chunk 1');
    controller.enqueue('chunk 2');
    controller.close();
  }
});

const reader = stream.getReader();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  console.log(value);
}
```

### 5.3.5 Reactive Programming (RxJS)
```javascript
import { fromEvent, interval, merge } from 'rxjs';
import { map, debounceTime, switchMap, takeUntil } from 'rxjs/operators';

const input$ = fromEvent(searchInput, 'input').pipe(
  map(e => e.target.value),
  debounceTime(300),
  switchMap(q => fetch(`/search?q=${q}`).then(r => r.json()))
);

const stop$ = fromEvent(stopBtn, 'click');
input$.pipe(takeUntil(stop$)).subscribe(results => render(results));
```

## 5.4 生成器与迭代器

### 5.4.1 Generator
```javascript
function* fib() {
  let a = 0, b = 1;
  while (true) {
    yield a;
    [a, b] = [b, a + b];
  }
}
const it = fib();
it.next();  // { value: 0, done: false }

// 异步 Generator
async function* paginate(url) {
  let page = 1;
  while (true) {
    const res = await fetch(`${url}?page=${page}`);
    const data = await res.json();
    if (!data.length) return;
    yield data;
    page++;
  }
}
for await (const batch of paginate('/api/items')) {
  process(batch);
}
```

### 5.4.2 迭代协议
```javascript
const range = {
  from: 1, to: 5,
  [Symbol.iterator]() {
    let i = this.from;
    return {
      next: () => ({ value: i, done: i++ > this.to })
    };
  }
};
[...range];  // [1, 2, 3, 4, 5]
```

### 5.4.3 协程模式
```javascript
// 用 Generator 实现协作式调度
function* task(id) {
  for (let i = 0; i < 3; i++) {
    console.log(`task ${id}: step ${i}`);
    yield;
  }
}
function run(...tasks) {
  const iterators = tasks.map(t => t());
  while (iterators.length) {
    iterators.forEach(it => {
      const { done } = it.next();
      if (done) iterators.splice(iterators.indexOf(it), 1);
    });
  }
}
run(task('A'), task('B'));
```

## 5.5 性能优化

### 5.5.1 时间复杂度
```
O(1)     常量:哈希查找
O(log n) 对数:二分查找
O(n)     线性:数组遍历
O(n log n)  线性对数:快排
O(n²)    平方:嵌套循环
O(2ⁿ)    指数:递归斐波那契
O(n!)    阶乘:全排列
```

### 5.5.2 数据结构选择
| 数据结构 | 操作 | 时间 |
|----------|------|------|
| 数组 | 按索引访问 | O(1) |
| 数组 | 查找/插入/删除 | O(n) |
| 链表 | 插入/删除头 | O(1) |
| 哈希表 | 增删查 | 平均 O(1) |
| 二叉搜索树 | 增删查 | 平均 O(log n) |
| 堆 | 取最值 | O(1) |

### 5.5.3 算法实战
```javascript
// 防抖:连续触发合并
// 节流:固定频率执行

// LRU 缓存
class LRUCache {
  constructor(capacity) {
    this.capacity = capacity;
    this.map = new Map();
  }
  get(key) {
    if (!this.map.has(key)) return -1;
    const v = this.map.get(key);
    this.map.delete(key);
    this.map.set(key, v);  // 移到末尾
    return v;
  }
  put(key, value) {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.capacity) {
      this.map.delete(this.map.keys().next().value);  // 删除最旧
    }
  }
}

// 大数据虚拟列表:只渲染可视区
function virtualList(items, itemHeight, viewportHeight, scrollTop) {
  const start = Math.floor(scrollTop / itemHeight);
  const end = Math.ceil((scrollTop + viewportHeight) / itemHeight);
  return items.slice(start, end);
}
```

### 5.5.4 V8 优化技巧
```javascript
// 1. 避免 hidden classes 变化
class Point { constructor(x, y) { this.x = x; this.y = y; } }  // ✅
// ❌ 添加属性顺序不一致
const a = {}; a.x = 1; a.y = 2;
const b = {}; b.y = 2; b.x = 1;

// 2. 避免 delete
const obj = { x: 1, y: 2 };
delete obj.x;  // ❌ 慢,会失效优化
obj.x = undefined;  // ✅ 或解构重赋值

// 3. 保持函数单态(monomorphic)
function add(arr) { return arr.push(1); }
// 调用 add([]), add([1,2,3]) → 都是数组,单态快
// add({}), add([]) → 多态,慢

// 4. typed array 处理数值
const arr = new Float64Array(1000000);  // 比 Array 快

// 5. 避免 try/catch 在热路径
// V8 之前 try/catch 内的代码不会被优化(已修复,但仍要小心)
```

## 5.6 内存分析

### 5.6.1 DevTools Memory 面板
```
Heap Snapshot        内存快照,找泄漏对象
Allocation Timeline  实时分配,找增长
```

### 5.6.2 常见泄漏排查
```javascript
// 1. 全局意外
function f() { x = 1; }  // global.x
// 修复:严格模式 + 'use strict'

// 2. 定时器未清理
const id = setInterval(fn, 1000);
// 卸载时: clearInterval(id);

// 3. DOM 引用保留
const map = new WeakMap();  // 用弱引用

// 4. 闭包
let fn; function f() { const big = []; fn = () => big.length; }
// 卸载: fn = null;

// 5. 事件监听未移除
emitter.on('x', handler);
// 卸载: emitter.off('x', handler);
```

## 5.7 错误处理与日志

### 5.7.1 错误类型层级
```
Error
├── EvalError
├── RangeError (数组越界、数字超界)
├── ReferenceError (引用不存在)
├── SyntaxError (语法解析)
├── TypeError (类型错误)
├── URIError
└── AggregateError (Promise.any)
```

### 5.7.2 Result 类型 (Rust 风格)
```javascript
class Result {
  constructor(ok, value, error) {
    this.ok = ok;
    this.value = value;
    this.error = error;
  }
  static ok(value) { return new Result(true, value, null); }
  static err(error) { return new Result(false, null, error); }
  map(fn) { return this.ok ? Result.ok(fn(this.value)) : this; }
  unwrap() { return this.ok ? this.value : (() => { throw this.error; })(); }
}

const result = Result.ok(42)
  .map(x => x * 2)
  .map(x => x + 1)
  .map(x => `value: ${x}`);
result.value;  // 'value: 85'
```

## 5.8 DSL 与状态机库

```javascript
// 简单的状态机 DSL
const machine = createMachine({
  initial: 'idle',
  states: {
    idle: { on: { START: 'loading' } },
    loading: {
      on: {
        SUCCESS: 'success',
        FAILURE: 'error'
      }
    },
    success: { on: { RESET: 'idle' } },
    error: { on: { RETRY: 'loading' } }
  }
});

const state = machine.initial;
machine.transition(state, 'START');  // 'loading'
```

## 5.9 装饰器与元数据 (TC39 Stage 3)

```typescript
// decorator 提案
function logged(_target, key, descriptor) {
  const fn = descriptor.value;
  descriptor.value = function (...args) {
    console.log(`Call: ${key}(${args})`);
    const result = fn.apply(this, args);
    console.log(`Result:`, result);
    return result;
  };
}

class Calculator {
  @logged
  add(a, b) { return a + b; }
}
```

## 5.10 浏览器 API 高级

### 5.10.1 IntersectionObserver
```javascript
const obs = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      loadImage(entry.target);
      obs.unobserve(entry.target);
    }
  });
}, { rootMargin: '100px', threshold: 0.1 });

images.forEach(img => obs.observe(img));
```

### 5.10.2 ResizeObserver
```javascript
const ro = new ResizeObserver(entries => {
  for (const e of entries) {
    e.target.style.height = `${e.contentRect.width * 0.5}px`;
  }
});
ro.observe(box);
```

### 5.10.3 MutationObserver
```javascript
const mo = new MutationObserver(mutations => {
  mutations.forEach(m => console.log(m.type, m.target));
});
mo.observe(parent, { childList: true, subtree: true, attributes: true });
```

### 5.10.4 PerformanceObserver
```javascript
const po = new PerformanceObserver(list => {
  list.getEntries().forEach(entry => {
    console.log(entry.name, entry.duration);
  });
});
po.observe({ entryTypes: ['measure', 'navigation', 'largest-contentful-paint'] });
```

### 5.10.5 Page Lifecycle
```javascript
window.addEventListener('beforeunload', e => {
  e.preventDefault();
  e.returnValue = '';
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseAll();
  else resumeAll();
});

window.addEventListener('freeze', () => saveState());  // 移动端冻结
window.addEventListener('resume', () => restoreState());
window.addEventListener('pageshow', e => {
  if (e.persisted) restoreFromCache();
});
```

## 5.11 安全编程

```javascript
// 1. XSS 防御
const safe = DOMPurify.sanitize(userInput);
element.textContent = userInput;  // 安全(不解析 HTML)

// 2. CSRF 防御
// - SameSite cookie
// - CSRF token
// - Origin/Referer 校验

// 3. 输入验证
const zodSchema = z.object({
  email: z.string().email(),
  age: z.number().int().min(0).max(150)
});

// 4. 避免 eval
// ❌ eval('alert(userInput)');
// ❌ new Function(userInput)();
// ✅ JSON.parse(userInput)  // 安全

// 5. 子资源完整性
// <script src="..." integrity="sha384-..." crossorigin="anonymous"></script>
```

## 5.12 专家陷阱清单

| 陷阱 | 后果 | 解决 |
|------|------|------|
| 直接修改 React state | 不更新 | 用不可变更新 |
| `for await` 顺序执行 | 慢 | 用 Promise.all 并发 |
| 闭包内捕获大对象 | 内存泄漏 | 用 WeakMap/WeakRef |
| 同步循环大量异步 | 卡 UI | 用 microtask 调度 |
| 深拷贝性能差 | 卡顿 | 用结构共享(Immer) |
| 全局事件监听 | 难清理 | 用 AbortController |
| 滥用观察者模式 | 内存泄漏 | 组件卸载时 dispose |
| 在 render 中订阅 | 内存爆炸 | useEffect |
| 数字计算用普通 number | 精度丢失 | 用 BigInt 或 bignumber.js |
| 异步竞态条件 | 状态错乱 | AbortController + 信号取消 |

## 5.13 实战项目

### 🎯 项目 1: 完整 EventEmitter + 命名空间
要求:
- on/off/once/emit
- 异步 emit
- 命名空间 'user.created'
- 最大监听数警告
- 错误隔离

### 🎯 项目 2: RxJS-like Reactive 库
要求:
- Observable / Observer / Subject
- map/filter/reduce/switchMap/debounceTime
- 订阅与取消订阅
- Backpressure 处理

### 🎯 项目 3: 状态机库
要求:
- 类似 XState 的 API
- 支持嵌套状态
- 副作用管理
- 可视化

## ✅ 本章检查清单

- [ ] 5 个常见设计模式能说出适用场景
- [ ] 函数组合/柯里化/纯函数理解
- [ ] pMap、并发控制能写
- [ ] Generator 协程能用
- [ ] 算法复杂度分析快排、二分查找、哈希
- [ ] V8 优化 4 个要点知道
- [ ] 内存泄漏能排查
- [ ] 完成 3 个实战项目

**下一章:** → [06-Browser-and-Rendering.md](./06-Browser-and-Rendering.md)