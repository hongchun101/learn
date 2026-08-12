# 04 · JavaScript 核心

> JavaScript 是前端的地基。这一章要掌握到**闭包、原型、异步、this** 能脱口而出的程度。

## 📌 心智模型

```
JavaScript 是一门:
  • 单线程 (但可通过异步非阻塞)
  • 解释型(现代引擎会 JIT)
  • 基于原型的面向对象语言
  • 动态弱类型(但有隐式转换)
  • 函数是一等公民

执行环境 = 内存(堆) + 执行栈
```

## 4.1 类型系统

### 4.1.1 7 种基本类型 + 1 种引用类型
```javascript
// 基本类型(栈)
typeof undefined === 'undefined';
typeof null === 'object';        // 历史遗留 bug!
typeof true === 'boolean';
typeof 42 === 'number';
typeof 42n === 'bigint';
typeof 'hi' === 'string';
typeof Symbol() === 'symbol';

// 引用类型(堆)
typeof {} === 'object';
typeof [] === 'object';
typeof function(){} === 'function';
```

### 4.1.2 类型判断
```javascript
// 最佳实践
function getType(v) {
  return Object.prototype.toString.call(v).slice(8, -1).toLowerCase();
}

getType(null)      // 'null'
getType([])        // 'array'
getType(new Date)  // 'date'
getType(/regex/)   // 'regexp'
getType(new Map)   // 'map'
getType(Promise.resolve()) // 'promise'
```

### 4.1.3 隐式转换 (Coercion)
```javascript
// 加号:任一边是字符串 → 拼接
'1' + 2        // '12'
1 + '2'        // '12'
true + true    // 2
[] + {}        // '[object Object]'
{} + []        // 0  (语句块 + 空数组)
[] + []        // ''

// 其他运算符:数字优先
'1' - 0        // 1
+'123'         // 123
'5' * '2'      // 10
'5' * []       // 0

// 比较
null == undefined  // true
null == 0          // false
0 == ''            // true
[] == false        // true
```

### 4.1.4 真值/假值
```javascript
// 假值 6 个
Boolean(0)        // false
Boolean(NaN)      // false
Boolean('')       // false
Boolean(null)     // false
Boolean(undefined)// false
Boolean(false)    // false

// 其他都是真值(包括 {})
Boolean({})       // true
Boolean([])       // true
Boolean('0')      // true
Boolean('false')  // true
```

## 4.2 变量与作用域

### 4.2.1 声明方式
```javascript
var x = 1;     // 函数作用域,可重复声明,会提升 ❌
let x = 1;     // 块作用域,不可重复声明,有 TDZ ✅
const x = 1;   // 块作用域,引用不可变(对象内容可变) ✅
```

### 4.2.2 提升 (Hoisting)
```javascript
console.log(a);  // undefined (var 提升)
var a = 1;

console.log(b);  // ReferenceError (let TDZ)
let b = 2;

foo();           // 可以调用 (函数声明提升)
function foo() {}

bar();           // ReferenceError (var bar = fn 是赋值)
var bar = function() {};
```

### 4.2.3 词法作用域
```javascript
const x = 'outer';

function fn() {
  console.log(x);  // 静态查找词法环境
}
function wrapper() {
  const x = 'inner';
  fn();              // 输出 'outer'(定义时决定)
}
```

### 4.2.4 块作用域实战
```javascript
// for 循环陷阱
for (var i = 0; i < 3; i++) {
  setTimeout(() => console.log(i), 0);  // 3, 3, 3
}
for (let i = 0; i < 3; i++) {
  setTimeout(() => console.log(i), 0);  // 0, 1, 2 (let 每次创建新块)
}
```

## 4.3 闭包 (Closures)

### 4.3.1 定义
**闭包 = 函数 + 其词法环境**(即使外层函数已返回,内部函数仍持有外层变量)。

### 4.3.2 经典示例
```javascript
function makeCounter() {
  let count = 0;
  return {
    inc: () => ++count,
    dec: () => --count,
    get: () => count
  };
}
const c = makeCounter();
c.inc(); c.inc(); c.get();  // 2
```

### 4.3.3 闭包与内存
```javascript
function heavyWork() {
  const bigData = new Array(1000000).fill('x');
  return function() {
    // 即使不用 bigData,只要闭包持有,就不会被 GC
    return 'done';
  };
}

// 解决:不再需要时手动释放
let fn = heavyWork();
fn();
fn = null;  // 大对象可被 GC
```

### 4.3.4 闭包实战模式
```javascript
// 1. 模块模式(IIFE)
const Module = (function() {
  let private = 0;
  return {
    get: () => private,
    set: v => { private = v; }
  };
})();

// 2. 防抖节流(参数持久化)
function throttle(fn, ms) {
  let last = 0;
  return function(...args) {
    const now = Date.now();
    if (now - last >= ms) {
      last = now;
      fn.apply(this, args);
    }
  };
}

// 3. 柯里化
function curry(fn) {
  return function curried(...args) {
    if (args.length >= fn.length) return fn.apply(this, args);
    return (...rest) => curried(...args, ...rest);
  };
}
const add = (a, b, c) => a + b + c;
curry(add)(1)(2)(3);  // 6
```

## 4.4 this 关键字

### 4.4.1 绑定规则(优先级从高到低)
```javascript
// 1. new 绑定
function Foo() { this.x = 1; }
new Foo();  // this = 新对象

// 2. 显式绑定(call/apply/bind)
function fn() { console.log(this.x); }
fn.call({x: 1});  // {x: 1}
const bound = fn.bind({x: 2});

// 3. 隐式绑定(方法调用)
const obj = { x: 3, fn };
obj.fn();  // obj

// 4. 默认绑定
fn();      // 非严格模式: window;严格模式: undefined
```

### 4.4.2 箭头函数
```javascript
// 箭头函数没有自己的 this,沿用词法环境的 this
const obj = {
  x: 1,
  fn: () => console.log(this.x),  // window (不是 obj!)
  normal: function() {
    const inner = () => console.log(this.x);  // obj
    inner();
  }
};
```

### 4.4.3 实战技巧
```javascript
// 类方法在事件回调丢失 this
class Counter {
  count = 0;
  constructor(el) {
    el.addEventListener('click', () => this.count++);  // ✅ 箭头
    // el.addEventListener('click', this.inc.bind(this));  // ✅ bind
  }
  inc() { this.count++; }
}
```

## 4.5 原型与继承

### 4.5.1 原型链
```
obj → Object.prototype → null
arr → Array.prototype → Object.prototype → null
fn → Function.prototype → Object.prototype → null
```

### 4.5.2 5 种继承方式
```javascript
// 1. 原型链继承
function Parent() { this.name = 'p'; }
function Child() {}
Child.prototype = new Parent();  // 共享引用问题 ❌

// 2. 借用构造函数
function Parent() { this.names = ['a', 'b']; }
function Child() { Parent.call(this); }  // 各自独立,但方法不能复用 ❌

// 3. 组合继承 (经典)
function Parent(name) { this.name = name; }
Parent.prototype.say = function() { return this.name; };
function Child(name) {
  Parent.call(this, name);  // 第二次调用 Parent
}
Child.prototype = Object.create(Parent.prototype);  // 第一次
Child.prototype.constructor = Child;

// 4. 寄生组合继承 (最佳)
function inherit(Child, Parent) {
  Child.prototype = Object.create(Parent.prototype);
  Child.prototype.constructor = Child;
  Object.setPrototypeOf(Child, Parent);  // 静态方法继承
}

// 5. ES6 class (语法糖,本质寄生组合继承)
class Parent {
  constructor(name) { this.name = name; }
  say() { return this.name; }
}
class Child extends Parent {
  constructor(name, age) {
    super(name);
    this.age = age;
  }
}
```

### 4.5.3 类 vs 原型
```javascript
class A {}
class B extends A {}

B.__proto__ === A;             // true (静态继承)
B.prototype.__proto__ === A.prototype;  // true (实例继承)
```

### 4.5.4 Symbol 与私有字段
```javascript
// 类的私有字段(真私有)
class Counter {
  #count = 0;
  inc() { return ++this.#count; }
}

// mixin(多继承)
const Serializable = {
  serialize() { return JSON.stringify(this); }
};
class User {
  constructor(name) { this.name = name; }
}
Object.assign(User.prototype, Serializable);
```

## 4.6 异步编程

### 4.6.1 事件循环模型
```
执行栈 (Call Stack) ← 同步代码
   ↓ 异步任务完成
任务队列 (Task Queue)  ← setTimeout, I/O, fetch
   ↓
微任务队列 (Microtask Queue) ← Promise.then, queueMicrotask
   ↓
每轮: 同步 → 微任务清空 → 渲染(浏览器) → 任务队列取一个 → ...
```

### 4.6.2 Promise 精通
```javascript
// 创建
const p = new Promise((resolve, reject) => {
  setTimeout(() => resolve(42), 1000);
});

// 链式
p
  .then(v => v * 2)
  .then(v => console.log(v))   // 84
  .catch(err => console.error(err))
  .finally(() => console.log('done'));

// 静态方法
Promise.resolve(42);
Promise.reject(new Error('x'));
Promise.all([p1, p2, p3])     // 全部成功;任一失败立即 reject
Promise.allSettled([...])     // 全部完成(成功或失败都返回)
Promise.race([...])           // 第一个完成
Promise.any([...])            // 第一个成功
Promise.withResolver()        // 外部 resolve/reject
```

### 4.6.3 async/await
```javascript
async function fetchUser(id) {
  try {
    const res = await fetch(`/api/users/${id}`);
    if (!res.ok) throw new Error('Network');
    const user = await res.json();
    return user;
  } catch (err) {
    console.error(err);
    throw err;  // 重新抛出
  }
}

// 并发
const [a, b, c] = await Promise.all([fn1(), fn2(), fn3()]);

// 串行
const results = [];
for (const item of items) {
  results.push(await process(item));
}

// 流水线(每项独立并发,但限制并发数)
async function pLimit(pool, items, fn, n = 5) {
  const iter = items[Symbol.iterator]();
  const workers = Array.from({ length: n }, async () => {
    while (true) {
      const { value, done } = iter.next();
      if (done) return;
      await fn(value);
    }
  });
  return Promise.all(workers);
}
```

### 4.6.4 手写 Promise
```javascript
class MyPromise {
  #state = 'pending';
  #value;
  #callbacks = [];

  constructor(executor) {
    const resolve = v => this.#settle('fulfilled', v);
    const reject = v => this.#settle('rejected', v);
    try { executor(resolve, reject); }
    catch (e) { reject(e); }
  }

  #settle(state, value) {
    if (this.#state !== 'pending') return;
    this.#state = state;
    this.#value = value;
    queueMicrotask(() => this.#callbacks.forEach(cb => cb()));
  }

  then(onFulfilled, onRejected) {
    return new MyPromise((resolve, reject) => {
      const handle = () => {
        const cb = this.#state === 'fulfilled' ? onFulfilled : onRejected;
        if (!cb) {
          this.#state === 'fulfilled' ? resolve(this.#value) : reject(this.#value);
          return;
        }
        try {
          const result = cb(this.#value);
          if (result instanceof MyPromise) result.then(resolve, reject);
          else resolve(result);
        } catch (e) { reject(e); }
      };
      this.#callbacks.push(handle);
    });
  }

  static resolve(v) { return v instanceof MyPromise ? v : new MyPromise(r => r(v)); }
  static reject(v) { return new MyPromise((_, r) => r(v)); }
  static all(promises) {
    return new MyPromise((resolve, reject) => {
      const results = [];
      let done = 0;
      promises.forEach((p, i) => {
        MyPromise.resolve(p).then(v => {
          results[i] = v;
          if (++done === promises.length) resolve(results);
        }, reject);
      });
    });
  }
}
```

## 4.7 常用 API 实战

### 4.7.1 防抖 (Debounce) & 节流 (Throttle)
```javascript
// 防抖:连续触发只执行最后一次
function debounce(fn, ms) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}

// 节流:固定间隔内最多执行一次
function throttle(fn, ms) {
  let last = 0;
  let timer;
  return function(...args) {
    const now = Date.now();
    const remaining = ms - (now - last);
    if (remaining <= 0) {
      clearTimeout(timer);
      last = now;
      fn.apply(this, args);
    } else if (!timer) {
      timer = setTimeout(() => {
        last = Date.now();
        timer = null;
        fn.apply(this, args);
      }, remaining);
    }
  };
}

// requestAnimationFrame 节流
function rafThrottle(fn) {
  let ticking = false;
  return function(...args) {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(() => {
        fn.apply(this, args);
        ticking = false;
      });
    }
  };
}
```

### 4.7.2 深拷贝
```javascript
// 1. JSON 方式(快,但丢函数、Symbol、undefined、循环引用报错)
JSON.parse(JSON.stringify(obj));

// 2. structuredClone(现代浏览器)
structuredClone(obj);  // 支持 Date、Map、Set、循环引用

// 3. 手写递归
function deepClone(obj, hash = new WeakMap()) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj);
  if (obj instanceof RegExp) return new RegExp(obj);
  if (hash.has(obj)) return hash.get(obj);

  const cloneObj = Array.isArray(obj) ? [] : {};
  hash.set(obj, cloneObj);

  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      cloneObj[key] = deepClone(obj[key], hash);
    }
  }
  return cloneObj;
}
```

### 4.7.3 函数柯里化与组合
```javascript
// 柯里化
const curry = fn => {
  const helper = (...args) =>
    args.length >= fn.length
      ? fn(...args)
      : (...rest) => helper(...args, ...rest);
  return helper;
};

// 函数组合
const compose = (...fns) => x => fns.reduceRight((acc, fn) => fn(acc), x);
const pipe = (...fns) => x => fns.reduce((acc, fn) => fn(acc), x);

const process = pipe(
  str => str.trim(),
  str => str.toLowerCase(),
  str => str.split(' '),
);
process('  Hello World  ');  // ['hello', 'world']
```

## 4.8 数组与对象高级

### 4.8.1 数组方法
```javascript
// 不改变原数组(返回新)
[1,2,3].map(x => x*2);       // [2,4,6]
[1,2,3].filter(x => x>1);    // [2,3]
[1,2,3].reduce((a,b) => a+b);// 6
[1,2,3].slice(0, 2);         // [1,2]
[1,2,3].concat([4,5]);       // [1,2,3,4,5]
[1,2,3].flatMap(x => [x,x]); // [1,1,2,2,3,3]
[1,2,3].find(x => x>1);      // 2
[1,2,3].findIndex(x => x>1); // 1
[1,2,3].some(x => x>2);      // true
[1,2,3].every(x => x>0);     // true
[1,2,3].includes(2);         // true

// 改变原数组
[1,2,3].push(4);             // 长度
[1,2,3].pop();               // 移除最后
[1,2,3].shift();             // 移除第一个
[1,2,3].unshift(0);          // 前添加
[1,2,3].splice(1, 1, 'a');   // 删除/插入
[1,2,3].sort();              // 排序
[1,2,3].reverse();           // 反转
[1,2,3].fill(0);             // 填充

// 创建新数组(ES2023)
Array.from({length: 3}, (_, i) => i);  // [0,1,2]
[1,2,3].toSorted();          // 不改变原数组的 sort
[1,2,3].toReversed();        // 不改变原数组的 reverse
[1,2,3].toSpliced(1, 1);     // 不改变原数组的 splice
[1,2,3].with(1, 'a');        // 替换指定位置
```

### 4.8.2 对象方法
```javascript
Object.keys(obj);       // 键
Object.values(obj);     // 值
Object.entries(obj);    // 键值对
Object.fromEntries([['a',1],['b',2]]); // 反向
Object.assign(target, ...sources);
Object.freeze(obj);     // 浅冻结
Object.seal(obj);       // 浅密封
Object.create(proto);   // 创建对象
Object.defineProperty(obj, key, desc);
Object.hasOwn(obj, key);// 比 hasOwnProperty 安全
```

### 4.8.3 解构与展开
```javascript
// 数组
const [a, , c] = [1, 2, 3];
const [first, ...rest] = arr;

// 对象
const { name, age = 18 } = user;
const { name: userName } = user;
const { address: { city } } = user;

// 展开
const merged = { ...defaults, ...user };
const combined = [...arr1, ...arr2];
```

## 4.9 元编程

### 4.9.1 Proxy
```javascript
const reactive = (target) => new Proxy(target, {
  get(t, k, r) {
    track(k);  // 依赖收集
    return Reflect.get(t, k, r);
  },
  set(t, k, v, r) {
    const old = t[k];
    const result = Reflect.set(t, k, v, r);
    if (old !== v) trigger(k);  // 触发更新
    return result;
  }
});
```

### 4.9.2 Reflect
```javascript
// 与 Proxy handlers 一一对应
Reflect.has(obj, key);
Reflect.ownKeys(obj);
Reflect.getPrototypeOf(obj);
```

### 4.9.3 Symbol
```javascript
const id = Symbol('id');     // 唯一值
Symbol.for('shared');        // 注册全局 Symbol
Symbol.iterator;             // 内置 Symbol(可迭代协议)

const obj = {
  [Symbol.iterator]() {
    let i = 0;
    return {
      next: () => ({ value: i++, done: i > 3 })
    };
  }
};
[...obj];  // [0, 1, 2]
```

## 4.10 模块系统

### 4.10.1 ES Modules
```javascript
// 命名导出
export const foo = 1;
export function bar() {}
export class Baz {}

// 默认导出(每模块一个)
export default class MyClass {}

// 导入
import MyClass, { foo, bar as b } from './module.js';
import * as Mod from './module.js';
import('./module.js').then(m => m.foo);  // 动态导入
```

### 4.10.2 CJS vs ESM
| | CommonJS | ES Modules |
|---|----------|------------|
| 加载 | 同步 | 异步(顶层 await) |
| 导出 | `module.exports` | `export` |
| 导入 | `require()` | `import` |
| 缓存 | 是 | 是 |
| 循环引用 | 部分支持 | 支持 |

## 4.11 内存管理与性能

### 4.11.1 常见内存泄漏
```javascript
// 1. 意外的全局变量
function leak() { x = 1; }  // 没声明,变全局 ❌

// 2. 遗忘的定时器/事件监听
const id = setInterval(fn, 1000);
clearInterval(id);

// 3. 闭包持有大对象
function fn() {
  const big = new Array(1e6);
  return () => big;  // 即使不用,big 也在内存
}

// 4. DOM 引用未释放
const map = new WeakMap();
map.set(domEl, data);  // 弱引用,DOM 删除时自动 GC
```

### 4.11.2 WeakRef / FinalizationRegistry
```javascript
const cache = new Map();
const wcache = new WeakMap();

let obj = { data: 'big' };
const wref = new WeakRef(obj);

obj = null;  // 弱引用
console.log(wref.deref());  // 可能已被 GC

// GC 回调
const reg = new FinalizationRegistry(name => {
  console.log(`Cleaned: ${name}`);
});
reg.register(obj, 'myObject');
```

## 4.12 错误处理

```javascript
// 1. try/catch
try {
  riskyOperation();
} catch (err) {
  if (err instanceof TypeError) { /* ... */ }
  throw err;  // 重新抛出
} finally {
  cleanup();
}

// 2. 全局错误
window.addEventListener('error', e => {
  console.error('Uncaught:', e.error);
});
window.addEventListener('unhandledrejection', e => {
  console.error('Unhandled:', e.reason);
  e.preventDefault();
});

// 3. 自定义错误
class ValidationError extends Error {
  constructor(field, msg) {
    super(msg);
    this.name = 'ValidationError';
    this.field = field;
  }
}

// 4. 错误边界(React)
class ErrorBoundary extends React.Component {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error, info) { reportError(error, info); }
  render() {
    return this.state.hasError ? <FallbackUI /> : this.props.children;
  }
}
```

## 4.13 专家陷阱清单

| 陷阱 | 后果 | 解决 |
|------|------|------|
| `==` 比较 | 隐式转换坑多 | 永远用 `===` |
| `var` 声明 | 作用域混乱 | 用 `let`/`const` |
| 回调地狱 | 维护灾难 | Promise → async/await |
| 修改函数参数 | 调试困难 | 默认参数 + 不改参 |
| 嵌套过深 | 难读 | 早返回(guard clauses) |
| 不处理 Promise rejection | UnhandledRejection | 全局监听 + catch |
| 滥用全局变量 | 命名冲突 | 模块化 |
| 不释放资源 | 内存泄漏 | 清理监听器/定时器 |
| 闭包滥用 | 内存膨胀 | 用完手动置 null |
| `JSON.parse(JSON.stringify())` 拷贝 | 丢数据 | `structuredClone` |

## 4.14 实战项目

### 🎯 项目 1: 手写 Promise 完整实现
要求:
- 实现 then/catch/finally
- 实现 all/race/allSettled
- 支持链式
- 处理 microtask
- 完整测试用例

### 🎯 项目 2: 手写 EventEmitter (发布订阅)
要求:
- on/once/off/emit
- 异步 emit
- 命名空间
- 错误隔离

### 🎯 项目 3: 工具函数库
要求:
- debounce/throttle/deepClone/curry/compose/memoize
- 完整单元测试
- TypeScript 类型
- 发布到 npm

## ✅ 本章检查清单

- [ ] 7 种基本类型 + 引用类型背得出
- [ ] 闭包、this、原型链能清晰解释
- [ ] 手写 Promise.all 没问题
- [ ] 防抖节流闭着眼写
- [ ] 事件循环机制能画图讲清
- [ ] async/await 错误处理熟练
- [ ] 深拷贝的 3 种方式都懂
- [ ] Proxy/Reflect/Symbol 知道用法
- [ ] 完成 3 个实战项目

**下一章:** → [05-JavaScript-Advanced.md](./05-JavaScript-Advanced.md)