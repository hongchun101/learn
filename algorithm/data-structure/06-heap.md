# 堆与优先队列

> O(log n) 插入,O(1) 取极值。LeetCode 高频数据结构之一。

---

## 1. 堆的本质

完全二叉树,父节点 ≥ (大顶堆) 或 ≤ (小顶堆) 子节点。

---

## 2. 数组实现

### 2.1 索引关系

```
父(i) = (i - 1) // 2
左子(i) = 2i + 1
右子(i) = 2i + 2
```

### 2.2 上浮(insert 后)

```python
def sift_up(arr, i):
    while i > 0:
        p = (i - 1) // 2
        if arr[p] > arr[i]: break  # 小顶堆
        arr[p], arr[i] = arr[i], arr[p]
        i = p
```

### 2.3 下沉(extract 后)

```python
def sift_down(arr, i, n):
    while 2*i + 1 < n:
        l, r = 2*i+1, 2*i+2
        j = l
        if r < n and arr[r] > arr[l]: j = r  # 小顶堆
        if arr[i] >= arr[j]: break
        arr[i], arr[j] = arr[j], arr[i]
        i = j
```

### 2.4 建堆 O(n)

```python
def heapify(arr):
    for i in range((len(arr) - 2) // 2, -1, -1):
        sift_down(arr, i, len(arr))
```

### 2.5 堆排序

```python
def heap_sort(arr):
    heapify(arr)
    for i in range(len(arr) - 1, 0, -1):
        arr[0], arr[i] = arr[i], arr[0]
        sift_down(arr, 0, i)
```

---

## 3. Python heapq

### 3.1 基础

```python
import heapq
heap = []
heapq.heappush(heap, 3)
heapq.heappush(heap, 1)
heapq.heappop(heap)  # 1
heap[0]              # 最小元素 O(1)
heapq.heapify([3,1,2])  # O(n) 建堆
```

### 3.2 大顶堆(取负)

```python
heap = []
heapq.heappush(heap, -x)
top = -heap[0]
```

### 3.3 高级 API

```python
heapq.heappushpop(heap, x)   # push 后 pop
heapq.heapreplace(heap, x)   # pop 后 push(不等价)
heapq.nlargest(k, iterable)
heapq.nsmallest(k, iterable)
```

### 3.4 tuple 堆(多关键字排序)

```python
heap = []
heapq.heappush(heap, (priority, value))  # 按 priority 排序
```

### 3.5 自定义比较

```python
# Python 不直接支持,需包装类
class MaxHeapObj:
    def __init__(self, v): self.v = v
    def __lt__(self, o): return self.v > o.v  # 反向
```

---

## 4. C++ priority_queue

```cpp
#include <queue>
priority_queue<int> maxHeap;                    // 默认大顶堆
priority_queue<int, vector<int>, greater<int>> minHeap;
auto cmp = [](int a, int b){ return a > b; };    // 小顶堆 lambda
priority_queue<int, vector<int>, decltype(cmp)> minHeap(cmp);
```

---

## 5. Java PriorityQueue

```java
PriorityQueue<Integer> minHeap = new PriorityQueue<>();
PriorityQueue<Integer> maxHeap = new PriorityQueue<>(Comparator.reverseOrder());
```

---

## 6. 经典应用

### 6.1 前 K 高频(LC 347)

```python
def top_k_frequent(nums, k):
    from collections import Counter
    cnt = Counter(nums)
    return heapq.nlargest(k, cnt.keys(), key=cnt.get)
```

### 6.2 第 K 大元素(LC 215)

```python
def find_kth_largest(nums, k):
    return heapq.nlargest(k, nums)[-1]
```

或手写 size-k 小顶堆:

```python
def find_kth_largest(nums, k):
    heap = nums[:k]
    heapq.heapify(heap)
    for x in nums[k:]:
        if x > heap[0]:
            heapq.heapreplace(heap, x)
    return heap[0]
```

复杂度 O(n log k)。

### 6.3 数据流中位数(LC 295)

见 `03-stack-queue.md`。

### 6.4 合并 K 个有序链表(LC 23)

见 `02-linked-list.md`。

### 6.5 丑数 II(LC 264)

```python
def nth_ugly(n):
    heap = [1]
    seen = {1}
    for _ in range(n):
        x = heapq.heappop(heap)
        for f in [2,3,5]:
            if x*f not in seen:
                seen.add(x*f)
                heapq.heappush(heap, x*f)
    return x
```

### 6.6 接雨水 II(LC 407)

用堆从外圈向内"涨水",每次取最矮的边界。

```python
def trap_rain_water(heightMap):
    if not heightMap: return 0
    m, n = len(heightMap), len(heightMap[0])
    visited = [[False]*n for _ in range(m)]
    heap = []
    for i in range(m):
        for j in [0, n-1]:
            heapq.heappush(heap, (heightMap[i][j], i, j))
            visited[i][j] = True
    for j in range(n):
        for i in [0, m-1]:
            heapq.heappush(heap, (heightMap[i][j], i, j))
            visited[i][j] = True
    res = 0
    while heap:
        h, i, j = heapq.heappop(heap)
        for di, dj in [(1,0),(-1,0),(0,1),(0,-1)]:
            ni, nj = i+di, j+dj
            if 0 <= ni < m and 0 <= nj < n and not visited[ni][nj]:
                visited[ni][nj] = True
                res += max(0, h - heightMap[ni][nj])
                heapq.heappush(heap, (max(h, heightMap[ni][nj]), ni, nj))
    return res
```

### 6.7 最小的 K 个数(LC 40)

### 6.8 滑动窗口中位数(LC 480)

延迟删除 + 双堆。

### 6.9 查找和最小的 K 对数字(LC 373)

---

## 7. 双堆技巧

**核心**:两个堆配合,一个管较小一半,一个管较大一半。

| 应用 | 两堆分工 |
|------|---------|
| 中位数 | 大顶堆(lo) + 小顶堆(hi) |
| 滑动窗口中位数 | lo + hi + 延迟删除 dict |
| 双堆维护上下中位数 | lo + hi 平衡 |

### 7.1 延迟删除

```python
def prune(heap, delayed):
    while heap and heap[0] in delayed:
        delayed[heap[0]] -= 1
        if delayed[heap[0]] == 0:
            del delayed[heap[0]]
        heapq.heappop(heap)
```

### 7.2 findMedian from data stream 完整版

见 `03-stack-queue.md`。

---

## 8. 堆的复杂度表

| 操作 | 复杂度 |
|------|--------|
| insert | O(log n) |
| pop_min/max | O(log n) |
| peek | O(1) |
| heapify | O(n) |
| 堆排 | O(n log n) |

---

## 9. 堆的选型决策

| 场景 | 推荐 |
|------|------|
| 单线程,简单 | heapq / priority_queue |
| 线程安全 | PriorityBlockingQueue (Java) |
| 支持 decrease-key | 自定义 |
| 可合并 | 左偏树、斜堆 |

---

## 10. 课后 5 题

1. **LC 215** 数组中的第 K 个最大元素
2. **LC 347** 前 K 个高频元素
3. **LC 23** 合并 K 个升序链表
4. **LC 295** 数据流的中位数
5. **LC 407** 接雨水 II

---

**下一步**:`07-trie.md`。
