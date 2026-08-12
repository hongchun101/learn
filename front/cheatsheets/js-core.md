# JavaScript 核心速查

## 类型
```javascript
typeof undefined === 'undefined'
typeof null === 'object'              // 陷阱!
typeof true === 'boolean'
typeof 42 === 'number'
typeof 42n === 'bigint'
typeof 'hi' === 'string'
typeof Symbol() === 'symbol'
typeof {} === 'object'
typeof [] === 'object'
typeof function(){} === 'function'

// 类型判断
function typeOf(v) {
  return Object.prototype.toString.call(v).slice(8, -1).toLowerCase();
}
```

## 真值/假值
```javascript
// 6 个假值
false, 0, -0, 0n, '', null, undefined, NaN
// 其他都是真值(包括 {}, [], '0', 'false')

Boolean({})    // true
Boolean([])    // true
Boolean(' ')   // true
```

## 隐式转换
```javascript
'1' + 2        // '12'
1 + '2'        // '12'
true + true    // 2
[] + {}        // '[object Object]'
{} + []        // 0 (语句块)
[] + []        // ''

'1' - 0        // 1
+'123'         // 123
'5' * '2'      // 10
'5' * []       // 0

null == undefined  // true
null == 0          // false
0 == ''            // true
[] == false        // true
```

## 闭包
```javascript
// 函数 + 词法环境
function make() {
  const v = 1;
  return () => v;
}

// 应用: 模块、防抖、柯里化
// 陷阱: 大对象闭包泄漏内存
```

## this 绑定
```javascript
1. new Foo()           → this = 新对象
2. fn.call(obj, ...)   → this = obj
3. obj.fn()            → this = obj (隐式)
4. fn()                → 全局 / undefined (严格模式)

// 箭头函数: 没有 this,沿用词法
const obj = {
  fn: () => console.log(this),  // window
  normal() {
    const inner = () => console.log(this);  // obj
  }
};
```

## 原型链
```
obj → Object.prototype → null
arr → Array.prototype → Object.prototype → null
fn  → Function.prototype → Object.prototype → null
```

## 继承
```javascript
// ES6 class (推荐)
class Parent {
  constructor(x) { this.x = x; }
  method() { return this.x; }
}
class Child extends Parent {
  constructor(x, y) {
    super(x);
    this.y = y;
  }
  method() { return super.method() + this.y; }
}
```

## 数组方法
```javascript
// 返回新数组
arr.map(fn)
arr.filter(fn)
arr.slice(start, end)
arr.concat(...)
arr.flatMap(fn)

// 返回单值
arr.reduce((acc, v) => acc + v, 0)
arr.find(fn)
arr.findIndex(fn)
arr.some(fn)
arr.every(fn)
arr.includes(value)
arr.indexOf(value)

// 改变原数组
arr.push(...items)
arr.pop()
arr.shift()
arr.unshift(...items)
arr.splice(start, deleteCount, ...items)
arr.sort(cmp)
arr.reverse()
arr.fill(value)

// ES2023 返回新数组(不改变原数组)
arr.toSorted()
arr.toReversed()
arr.toSpliced(start, count)
arr.with(index, value)
```

## 对象
```javascript
Object.keys(obj)
Object.values(obj)
Object.entries(obj)
Object.fromEntries([['a', 1]])
Object.assign(target, ...sources)
Object.freeze(obj)
Object.seal(obj)
Object.create(proto)
Object.defineProperty(obj, key, desc)
Object.hasOwn(obj, key)
```

## 异步
```javascript
// Promise
Promise.all([p1, p2])        // 任一失败即 reject
Promise.allSettled([...])    // 全部完成
Promise.race([...])          // 第一个完成(成功/失败)
Promise.any([...])           // 第一个成功

// async/await
async function fn() {
  try {
    const data = await fetch('/api');
    return data;
  } catch (e) {
    return null;
  }
}

// 并发限制
async function pMap(items, fn, n = 5) {
  const results = [];
  let i = 0;
  const workers = Array.from({ length: n }, async () => {
    while ((idx = i++) < items.length) {
      results[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}
```

## 模块
```javascript
// 命名导出
export const x = 1;
export function foo() {}
export class Bar {}

// 默认导出
export default class Baz {}

// 导入
import B, { x, foo as f } from './mod.js';
import * as M from './mod.js';
const M = await import('./mod.js');  // 动态
```

## Proxy / Reflect
```javascript
const handler = {
  get(t, k, r) { /* ... */ return Reflect.get(t, k, r); },
  set(t, k, v, r) { /* ... */ return Reflect.set(t, k, v, r); },
};
const proxy = new Proxy(obj, handler);
```

## 错误
```javascript
try { /* */ } catch (e) { /* */ } finally { /* */ }

window.addEventListener('error', e => { /* JS 错误 */ });
window.addEventListener('unhandledrejection', e => { /* Promise */ });
```

## 实用技巧
```javascript
// 解构
const { a, b = 1 } = obj;
const [first, ...rest] = arr;

// 展开
const merged = { ...a, ...b };
const combined = [...arr1, ...arr2];

// 短路
user && user.name
const name = user?.profile?.name ?? 'default'
```

## 性能
```javascript
// 避免:
//   - 重复添加删除对象属性(影响 hidden class)
//   - delete obj.x
//   - 多态函数(> 4 种类型)
//   - 大循环同步阻塞

// 推荐:
//   - 数组/对象用字面量
//   - 函数参数类型稳定
//   - 用 Map/Set 代替 Object 大型键值
//   - 用 typed array 处理数值
```