# 算法练习

## ⭐ 入门:二分查找

### 任务
实现二分查找(有序数组)。

### 要求
```javascript
function binarySearch(arr, target) {
  // 返回 target 索引,不存在返回 -1
}

// 时间 O(log n), 空间 O(1)
```

### 测试
```javascript
binarySearch([1, 3, 5, 7, 9, 11], 7);  // 3
binarySearch([1, 3, 5, 7, 9, 11], 6);  // -1
```

### 进阶
- 返回第一个等于 target 的位置
- 返回最后一个等于 target 的位置
- 返回第一个 ≥ target 的位置(lower bound)

---

## ⭐⭐ 进阶:快排

### 任务
实现快速排序。

### 要求
```javascript
function quickSort(arr) {
  // 返回新数组(不修改原数组)
}

// 时间 O(n log n) 平均, O(n²) 最差
```

### 进阶
- 就地排序(原地分区)
- 三路快排(重复元素多时性能好)
- 尾递归优化

### 测试
```javascript
quickSort([3, 6, 8, 10, 1, 2, 1]);
// [1, 1, 2, 3, 6, 8, 10]
```

---

## ⭐⭐⭐ 专家:LRU + LFU

### 任务
实现 LRU 和 LFU 缓存。

### 要求

#### LRU (Least Recently Used)
```javascript
class LRUCache {
  constructor(capacity) { /* ... */ }
  get(key) { /* O(1) */ }
  put(key, value) { /* O(1) */ }
}
```

#### LFU (Least Frequently Used)
```javascript
class LFUCache {
  constructor(capacity) { /* ... */ }
  get(key) { /* O(1) */ }
  put(key, value) { /* O(1) */ }
}
```

### 测试
```javascript
// LRU
const lru = new LRUCache(2);
lru.put(1, 1);
lru.put(2, 2);
lru.get(1);     // 1 (1 变最近)
lru.put(3, 3);  // 驱逐 2
lru.get(2);     // -1

// LFU
const lfu = new LFUCache(2);
lfu.put(1, 1);
lfu.put(2, 2);
lfu.get(1);     // 1 (freq=2)
lfu.get(2);     // 2 (freq=2)
lfu.put(3, 3);  // 驱逐 1 或 2(同 freq 时 LRU)
```

### 提交
- 完整实现
- 时间/空间复杂度分析
- 单元测试
- 性能测试(对比 Map)