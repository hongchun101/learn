# ES6+ 速查

## 变量
```javascript
const x = 1;          // 块作用域,引用不变
let y = 2;            // 块作用域,可变
var z = 3;            // 函数作用域(不推荐)
```

## 解构
```javascript
// 数组
const [a, b, c = 0] = arr;
const [first, ...rest] = arr;

// 对象
const { name, age = 18 } = obj;
const { name: userName } = obj;  // 重命名
const { address: { city } } = obj;  // 嵌套
```

## 展开/剩余
```javascript
const merged = { ...a, ...b, ...c };
const combined = [...arr1, ...arr2];
function fn(a, ...rest) {}
```

## 模板字符串
```javascript
const name = 'A';
const msg = `Hello ${name}!`;
const html = `
  <div>
    <span>${name}</span>
  </div>
`;
```

## 箭头函数
```javascript
const add = (a, b) => a + b;
const noArg = () => 1;
const multi = (a, b) => ({ sum: a + b });  // 返回对象加括号
```

## 简写
```javascript
// 对象简写
const name = 'A', age = 30;
const obj = { name, age };

// 方法简写
const obj = {
  fn() { return 1; },
  *gen() { yield 1; },
  async async() { await x; },
};

// 计算属性
const key = 'x';
const obj = { [key]: 1, [`${key}_y`]: 2 };

// 简写属性定义
Object.defineProperty(obj, 'x', {
  get() { return this._x; },
  set(v) { this._x = v; },
});
```

## 类
```javascript
class Foo {
  x = 0;            // 字段
  static y = 0;     // 静态字段
  #private = 1;     // 私有字段

  constructor(name) {
    this.name = name;
  }

  method() { return this.x; }
  static staticMethod() { return this.y; }

  get prop() { return this._prop; }
  set prop(v) { this._prop = v; }
}

class Bar extends Foo {
  constructor(...args) {
    super(...args);
  }

  method() {
    return super.method() + 1;
  }
}
```

## 模块
```javascript
// 命名导出
export const x = 1;
export function fn() {}
export default class Foo {}

// 导入
import Foo, { x, fn as f } from './mod.js';
import * as M from './mod.js';
const M = await import('./mod.js');  // 动态
```

## 迭代
```javascript
const range = {
  [Symbol.iterator]() {
    let i = 0;
    return {
      next: () => ({ value: i, done: i++ > 3 })
    };
  }
};
for (const x of range) {}

// Generator
function* gen() {
  yield 1;
  yield 2;
}
function* loop() {
  while (true) yield Math.random();
}

// Async Generator
async function* asyncGen() {
  yield await fetch(url);
}

// for-await-of
for await (const x of asyncGen) {}
```

## Promise
```javascript
const p = new Promise((resolve, reject) => {
  setTimeout(() => resolve(42), 1000);
});

p.then(v => v).catch(e => null).finally(() => {});

Promise.all([p1, p2]);
Promise.allSettled([p1, p2]);
Promise.race([p1, p2]);
Promise.any([p1, p2]);
Promise.withResolvers();
```

## async/await
```javascript
async function fn() {
  try {
    const data = await fetch(url);
    return data;
  } catch (e) {
    throw e;
  }
}

// 并发
const [a, b] = await Promise.all([fn1(), fn2()]);
```

## Map / Set
```javascript
const map = new Map();
map.set('k', 1);
map.get('k');
map.has('k');
map.delete('k');
map.size;
[...map.entries()];

const set = new Set([1, 2, 3, 3]);  // {1,2,3}
set.add(4);
set.has(4);
```

## WeakMap / WeakSet
```javascript
// 键必须是对象,弱引用(可 GC)
const wm = new WeakMap();
wm.set(domElement, data);
```

## 可选链 / 空值合并
```javascript
user?.profile?.name     // undefined if not exist
const v = x ?? 'default'  // 仅 null/undefined 用默认值
const v = x || 'default'  // 假值都触发
```

## 数值
```javascript
// 数字分隔符
const num = 1_000_000;

// BigInt
const big = 9007199254740993n;
big + 1n;

// Math
Math.trunc(1.5)    // 1
Math.sign(-5)      // -1
```

## 字符串
```javascript
str.startsWith('hi')
str.endsWith('!')
str.includes('ell')
str.repeat(3)
str.padStart(5, '0')
str.padEnd(5, '*')
str.replaceAll('a', 'b')
str.at(-1)         // 最后一个字符
str.matchAll(/x/g)
```

## 数组
```javascript
// Array.from
Array.from({ length: 5 }, (_, i) => i);  // [0,1,2,3,4]
Array.from('hello');                     // ['h','e','l','l','o']

// includes
arr.includes(2);

// flat / flatMap
[1,[2,[3]]].flat(2);     // [1,2,3]
arr.flatMap(x => [x, x]); // [1,1,2,2]

// at
arr.at(-1);  // 最后一个

// ES2023
arr.toSorted();
arr.toReversed();
arr.toSpliced(start, count);
arr.with(index, value);
arr.findLast(fn);
arr.findLastIndex(fn);
```

## 对象
```javascript
Object.fromEntries([['a', 1]]);
Object.hasOwn(obj, key);

const { a, b, ...rest } = obj;

const merged = Object.assign({}, a, b);

const cloned = structuredClone(obj);  // 深拷贝
```

## 逻辑赋值
```javascript
x ??= 1;    // x ?? (x = 1)
x ||= 1;    // x || (x = 1)
x &&= 1;    // x && (x = 1)
```

## 顶层 await (ESM)
```javascript
const data = await fetch('/api');
export { data };
```