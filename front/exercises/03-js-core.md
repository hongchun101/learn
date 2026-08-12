# JavaScript 核心练习

## ⭐ 入门:手写防抖节流

### 任务
手写 debounce / throttle 函数。

### 要求
```javascript
// 1. debounce
function debounce(fn, ms) {
  // 你的实现
}

// 测试:
const log = () => console.log('call');
const debounced = debounce(log, 100);
debounced();
debounced();
debounced();
// 期望: 100ms 后只输出一次 'call'

// 2. throttle
function throttle(fn, ms) {
  // 你的实现
}

// 测试:
const debounced = throttle(log, 100);
for (let i = 0; i < 100; i++) {
  setTimeout(() => debounced(), i * 10);
}
// 期望: 大约每 100ms 输出一次
```

### 进阶
- 支持 `immediate` 选项(节流)
- 支持 `cancel` 方法(防抖)
- 支持返回值(`get: () => result`)

### 提交
- debounce.js + throttle.js
- 单元测试(Vitest)

---

## ⭐⭐ 进阶:手写 Promise

### 任务
手写一个完整 Promise 类,支持 then/catch/finally + Promise.all/race/allSettled。

### 要求
```javascript
class MyPromise {
  // constructor + then + catch + finally
  // static resolve / reject
  // static all / race / allSettled
  // 支持 microtask
  // 支持链式
}
```

### 测试
```javascript
const p = new MyPromise((resolve) => setTimeout(() => resolve(42), 100));

p.then(x => x * 2)
 .then(x => console.log(x))  // 84
 .catch(e => console.error(e))
 .finally(() => console.log('done'));

MyPromise.all([
  MyPromise.resolve(1),
  MyPromise.resolve(2),
]).then(arr => console.log(arr));  // [1, 2]
```

### 验收
- 所有原生 Promise 测试用例通过
- 正确处理 microtask 队列
- 错误传递正确

---

## ⭐⭐⭐ 专家:深拷贝(支持循环引用)

### 任务
手写一个深拷贝函数,处理循环引用、各种数据类型。

### 要求
```javascript
function deepClone(obj, hash = new WeakMap()) {
  // 必须支持:
  // 1. 循环引用 (obj.self = obj)
  // 2. Date, RegExp
  // 3. Map, Set
  // 4. ArrayBuffer, TypedArray
  // 5. Symbol 属性
  // 6. 函数(浅引用)
}
```

### 测试
```javascript
const obj = { a: 1, b: new Date(), c: /x/, d: new Map([['k', 'v']]) };
obj.self = obj;
const clone = deepClone(obj);

clone.self === clone;     // true
clone.self !== obj;       // true
clone.a === 1;
clone.b instanceof Date;
```

### 提交
- deepClone.js
- 完整测试用例
- 与 `structuredClone` 对比