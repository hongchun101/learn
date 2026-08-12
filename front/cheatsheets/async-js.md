# Async/Await 速查

## 基础
```javascript
// Promise 链式
fetch(url)
  .then(r => r.json())
  .then(data => data)
  .catch(err => null);

// async/await
async function get() {
  try {
    const r = await fetch(url);
    return await r.json();
  } catch (err) {
    return null;
  }
}
```

## 并发 vs 顺序

### 顺序
```javascript
for (const url of urls) {
  const data = await fetch(url);  // 串行,慢
}
```

### 并发(全部同时)
```javascript
const results = await Promise.all(urls.map(url => fetch(url)));
```

### 并发控制(N 个一组)
```javascript
async function pMap(items, fn, n = 5) {
  const results = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: n }, async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      results[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}
```

## Promise 方法
```javascript
Promise.all([...])         // 任一失败即 reject
Promise.allSettled([...])   // 全部完成(成功/失败都返回)
Promise.race([...])         // 第一个 settle(无论成功失败)
Promise.any([...])          // 第一个成功(全部失败才 reject)
Promise.resolve(value)      // 包装为 fulfilled
Promise.reject(error)       // 包装为 rejected
Promise.withResolvers()     // 外部 resolve/reject
```

## 取消
```javascript
// AbortController
const ctrl = new AbortController();
fetch(url, { signal: ctrl.signal });
ctrl.abort();  // 取消

// Promise.race 实现超时
async function withTimeout(p, ms) {
  const t = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), ms));
  return Promise.race([p, t]);
}
```

## 异步迭代
```javascript
async function* paginate(url) {
  let page = 1;
  while (true) {
    const r = await fetch(`${url}?page=${page}`);
    const data = await r.json();
    if (!data.length) return;
    yield data;
    page++;
  }
}

for await (const batch of paginate('/api')) {
  process(batch);
}
```

## 错误处理
```javascript
// 集中处理
window.addEventListener('unhandledrejection', e => {
  console.error(e.reason);
  e.preventDefault();
});

// try/catch 包裹
async function safe() {
  try {
    return await risky();
  } catch (e) {
    return defaultValue;
  }
}

// 部分并行错误隔离
const results = await Promise.allSettled([...]);
const ok = results.filter(r => r.status === 'fulfilled').map(r => r.value);
const failed = results.filter(r => r.status === 'rejected').map(r => r.reason);
```

## 实战模式

### 数据获取
```javascript
async function loadUser(id) {
  const [user, posts] = await Promise.all([
    fetch(`/api/users/${id}`).then(r => r.json()),
    fetch(`/api/users/${id}/posts`).then(r => r.json()),
  ]);
  return { user, posts };
}
```

### 限流 + 排队
```javascript
class TaskQueue {
  constructor(concurrency) {
    this.concurrency = concurrency;
    this.running = 0;
    this.queue = [];
  }
  add(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this.next();
    });
  }
  next() {
    if (this.running >= this.concurrency || !this.queue.length) return;
    const { fn, resolve, reject } = this.queue.shift();
    this.running++;
    fn()
      .then(resolve, reject)
      .finally(() => {
        this.running--;
        this.next();
      });
  }
}
```

### 重试 + 退避
```javascript
async function retry(fn, times = 3, delay = 1000) {
  for (let i = 0; i < times; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i === times - 1) throw e;
      await new Promise(r => setTimeout(r, delay * Math.pow(2, i)));
    }
  }
}
```

### 竞态保护(取最新)
```javascript
function latest(fn) {
  let cancelled = false;
  return (...args) => {
    cancelled = false;
    return fn(...args).finally(() => { cancelled = false; });
  };
}
```

## 陷阱

```javascript
// ❌ forEach 不会 await
urls.forEach(async url => {
  await fetch(url);  // 并发但阻塞整个 forEach 返回
});

// ✅ for-of 才能真正串行
for (const url of urls) {
  await fetch(url);
}

// ❌ 没用 await
async function fn() {
  setTimeout(() => console.log('hi'), 1000);  // 没 await
  console.log('done');
}

// ✅
async function fn() {
  await new Promise(r => setTimeout(r, 1000));
  console.log('done');
}

// ❌ 错误被吞
async function fn() {
  try {
    await risky();
  } catch (e) {
    /* 忘了 rethrow */
  }
}

// ❌ await 不必要
async function fn() {
  return await Promise.resolve(42);  // async 函数会 wrap, await 多余
}
```