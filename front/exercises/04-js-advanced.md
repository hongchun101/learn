# JavaScript 进阶练习

## ⭐⭐ 进阶:LRU 缓存

### 任务
实现 LRU(Least Recently Used)缓存。

### 要求
```javascript
class LRUCache {
  constructor(capacity) { /* ... */ }
  get(key) { /* 返回值 或 -1 */ }
  put(key, value) { /* ... */ }
}
```

### 测试
```javascript
const cache = new LRUCache(2);
cache.put(1, 1);
cache.put(2, 2);
cache.get(1);       // 1
cache.put(3, 3);    // 驱逐 key=2
cache.get(2);       // -1
```

### 进阶
- TTL 过期
- LFU 替代 LRU
- 性能: get/put < O(1)
- 用 Map 的插入顺序特性(JS Map 保留插入顺序)

---

## ⭐⭐⭐ 专家:观察者 + 防抖批处理

### 任务
实现一个发布订阅系统,支持异步 emit + 防抖批处理。

### 要求
```javascript
class EventBus {
  on(event, handler) { /* ... */ }
  off(event, handler) { /* ... */ }
  once(event, handler) { /* ... */ }
  emit(event, ...args) { /* ... */ }

  // 进阶:
  debounce(event, ms) { /* 防抖 emit */ }
  throttle(event, ms) { /* 节流 emit */ }
  batch(events, fn) { /* 批量触发 */ }
}
```

### 测试
```javascript
const bus = new EventBus();

bus.on('user.login', user => console.log(user));
bus.once('user.login', () => console.log('first time'));

bus.emit('user.login', { id: 1 });
bus.emit('user.login', { id: 2 });

bus.debounce('search', 300);
bus.emit('search', 'a');
bus.emit('search', 'ab');
bus.emit('search', 'abc');
// 300ms 后只触发一次,'abc'
```

### 提交
- 完整实现
- 完整单元测试
- 异步错误隔离(emit 内 handler 抛错不影响其他)

---

## ⭐⭐⭐ 专家:状态机库

### 任务
实现一个有限状态机库(类似 XState)。

### 要求
```javascript
const machine = createMachine({
  initial: 'idle',
  states: {
    idle: { on: { START: 'loading' } },
    loading: {
      on: {
        SUCCESS: 'success',
        FAILURE: 'error'
      },
      invoke: { src: 'fetchData' }  // 副作用
    },
    success: { on: { RESET: 'idle' } },
    error: { on: { RETRY: 'loading' } }
  },
  actions: {
    onSuccess: (ctx, event) => console.log('OK', event.data),
    onError: (ctx, event) => console.log('Fail', event.error),
  }
});

const service = interpret(machine);
service.start();
service.send({ type: 'START' });
```

### 提交
- 状态机.js
- 嵌套状态支持
- 进入/离开动作
- 守卫条件