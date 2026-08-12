# 跳表(Skip List)

> 一种概率平衡的链表,O(log n) 平均复杂度,实现比 RBT 简单。

---

## 1. 原理

普通链表查找 O(n)。跳表加多级索引:

```
L4:   -∞ ────────────────────→ +∞
L3:   -∞ ──────→ 20 ──────────→ +∞
L2:   -∞ ──→ 10 ────→ 30 ──→ 40 ──→ +∞
L1:   -∞ → 5 → 10 → 20 → 30 → 40 → +∞
```

每层都是有序链表,每上升一层,节点数减半(理想)。

---

## 2. 实现

```python
import random
class SkipListNode:
    def __init__(self, val=-1, level=0):
        self.val = val
        self.next = [None] * (level + 1)

class SkipList:
    def __init__(self, max_level=16):
        self.max_level = max_level
        self.head = SkipListNode(level=max_level)
        self.level = 0

    def random_level(self):
        lv = 0
        while random.random() < 0.5 and lv < self.max_level:
            lv += 1
        return lv

    def search(self, target):
        cur = self.head
        for i in range(self.level, -1, -1):
            while cur.next[i] and cur.next[i].val < target:
                cur = cur.next[i]
        cur = cur.next[0]
        return cur and cur.val == target

    def add(self, num):
        update = [None] * (self.max_level + 1)
        cur = self.head
        for i in range(self.level, -1, -1):
            while cur.next[i] and cur.next[i].val < num:
                cur = cur.next[i]
            update[i] = cur
        cur = cur.next[0]
        lv = self.random_level()
        if lv > self.level:
            for i in range(self.level + 1, lv + 1):
                update[i] = self.head
            self.level = lv
        new_node = SkipListNode(num, lv)
        for i in range(lv + 1):
            new_node.next[i] = update[i].next[i]
            update[i].next[i] = new_node

    def erase(self, num):
        update = [None] * (self.max_level + 1)
        cur = self.head
        for i in range(self.level, -1, -1):
            while cur.next[i] and cur.next[i].val < num:
                cur = cur.next[i]
            update[i] = cur
        cur = cur.next[0]
        if cur and cur.val == num:
            for i in range(self.level + 1):
                if update[i].next[i] is not cur: break
                update[i].next[i] = cur.next[i]
            while self.level > 0 and not self.head.next[self.level]:
                self.level -= 1
```

---

## 3. 复杂度分析

| 操作 | 平均 | 最坏 |
|------|------|------|
| search | O(log n) | O(n) |
| add | O(log n) | O(n) |
| erase | O(log n) | O(n) |

期望层数 log n,期望每层推进 2 步。

---

## 4. 与平衡树的对比

| 维度 | 跳表 | RBT |
|------|------|-----|
| 平均复杂度 | O(log n) | O(log n) |
| 实现难度 | 低 | 高 |
| 范围查询 | 天然支持 | 需改造 |
| 并发友好 | 是 | 否 |
| 空间 | 多倍 | 低 |

---

## 5. 工程应用

- Redis zset(有序集合)
- LevelDB / RocksDB(部分)
- `sortedcontainers` (Python 第三方)

---

## 6. LeetCode 设计题中的"有序集合"

实际不需手写跳表,用语言自带:

```python
from sortedcontainers import SortedList
sl = SortedList()
sl.add(3); sl.add(1); sl.add(2)
print(sl[0])  # 1
sl.bisect_left(2)
```

```cpp
#include <set>
set<int> s;
s.insert(3); s.insert(1);
auto it = s.lower_bound(2);
```

```java
TreeMap<Integer, Integer> tm = new TreeMap<>();
```

---

## 7. LeetCode 上的跳表应用

### 7.1 设计跳表(LC 1206)

直接按上述模板实现。

### 7.2 黑名单随机数(LC 710)

用 SortedList 替换。

### 7.3 滑动窗口中位数(LC 480)

两个 SortedList + 延迟删除。

### 7.4 数据流中的中位数(LC 295)

SortedList 更简单。

---

## 8. 概率分析与参数选择

### 8.1 升级概率 p

p = 0.5 是经典选择:
- p 越小,层数越多,空间大,跳得快
- p 越大,层数少,接近普通链表

### 8.2 最大层数

`L_max = log_{1/p}(n)`,p=0.5 时 L_max = log_2(n)。

### 8.3 期望空间

O(n),每节点期望层数 = 1/(1-p) = 2(p=0.5 时)。

---

## 9. 跳表的并发版本

- ConcurrentSkipListMap (Java)
- 可分段的跳表
- 无锁跳表(lock-free)

---

## 10. 课后 5 题

1. **LC 1206** 设计跳表
2. **LC 710** 黑名单中的随机数
3. **LC 480** 滑动窗口中位数
4. **LC 1825** 求出 MK 平均值
5. **LC 2034** 股票价格波动

---

**下一步**:进入 `algorithm/` 目录,开始算法篇。
