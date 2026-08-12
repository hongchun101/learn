# 树状数组(Binary Indexed Tree, BIT / Fenwick Tree)

> 线段树的简化版:求前缀和 + 单点更新。代码极短,常数小。

---

## 1. 原理

`tree[i]` 存的是"原数组中管辖 [i - lowbit(i) + 1, i] 的和"。

```
lowbit(i) = i & -i
```

```
原数组: a[1..8] = [3, 1, 4, 1, 5, 9, 2, 6]

tree 索引:   1   2   3   4   5   6   7   8
tree 值:     3   4   4   9   5  14   2  25
             │   │   │   │   │   │   │   │
             └───┘   │   │   │   └─┬─┘   │
            a1+a2    │   │   │   a6+a7  sum
                    └───┘   └───┘
                    a3    a4+a5+a6+a7+a8
```

---

## 2. 实现

### 2.1 Python

```python
class BIT:
    def __init__(self, n):
        self.n = n
        self.tree = [0] * (n + 1)
    def update(self, i, delta):
        while i <= self.n:
            self.tree[i] += delta
            i += i & -i
    def query(self, i):
        s = 0
        while i > 0:
            s += self.tree[i]
            i -= i & -i
        return s
    def range_query(self, l, r):
        return self.query(r) - self.query(l - 1)
```

### 2.2 C++

```cpp
struct BIT {
    int n;
    vector<long long> t;
    BIT(int _n) : n(_n), t(_n+1, 0) {}
    void add(int i, long long v) {
        for (; i <= n; i += i & -i) t[i] += v;
    }
    long long sum(int i) {
        long long s = 0;
        for (; i > 0; i -= i & -i) s += t[i];
        return s;
    }
    long long range_sum(int l, int r) {
        return sum(r) - sum(l - 1);
    }
};
```

---

## 3. 复杂度

| 操作 | 复杂度 |
|------|--------|
| update | O(log n) |
| prefix_sum | O(log n) |
| range_sum | O(log n) |
| 构造 | O(n log n) 或 O(n) |

构造 O(n) 方法:`tree[i] = a[i - lowbit(i) + 1..i]`。

```python
def build(arr):
    n = len(arr)
    t = [0] * (n + 1)
    for i in range(1, n + 1):
        t[i] = arr[i - 1]
    for i in range(1, n + 1):
        j = i + (i & -i)
        if j <= n:
            t[j] += t[i]
    return t
```

---

## 4. 经典应用

### 4.1 求数组前缀和(支持单点修改)

LC 307 直接套用。

### 4.2 区间和 + 单点修改

同上。

### 4.3 区间修改 + 单点查询

差分 + BIT:`a[i] += x` 等价于 `diff[l] += x, diff[r+1] -= x`,查询时 BIT 求前缀和。

### 4.4 区间修改 + 区间查询

两个 BIT,详见下方。

### 4.5 逆序对(LC 315)

```python
def reverse_pairs(nums):
    # 离散化
    sorted_vals = sorted(set(nums))
    rank = {v: i+1 for i, v in enumerate(sorted_vals)}
    n = len(sorted_vals)
    bit = BIT(n)
    res = 0
    for i in range(len(nums) - 1, -1, -1):
        r = rank[nums[i]]
        res += bit.query(r - 1)
        bit.update(r, 1)
    return res
```

### 4.6 第 K 大/小的数(在线,见 P2089)

### 4.7 频率前缀和(LC 307 + LC 315)

---

## 5. 区间修改 + 区间查询(BIT)

令原数组为 a,差分数组为 d(i) = a(i) - a(i-1)。

```
前缀和:  a[1..p] = Σ i·d[i] - Σ i·d[...]... 
```

推导:`a[1..p] = p · Σ d[i] - Σ i·d[i]`

所以维护两个 BIT:`B1[i] = d[i]`,`B2[i] = d[i] · i`。

```python
class BITRange:
    def __init__(self, n):
        self.n = n
        self.b1 = BIT(n)
        self.b2 = BIT(n)
    def range_add(self, l, r, v):
        self.b1.update(l, v); self.b1.update(r + 1, -v)
        self.b2.update(l, v * l); self.b2.update(r + 1, -v * (r + 1))
    def prefix_sum(self, p):
        return p * self.b1.query(p) - self.b2.query(p)
    def range_sum(self, l, r):
        return self.prefix_sum(r) - self.prefix_sum(l - 1)
```

---

## 6. 多维 BIT

### 6.1 二维 BIT

```python
class BIT2D:
    def __init__(self, m, n):
        self.m, self.n = m, n
        self.tree = [[0]*(n+1) for _ in range(m+1)]
    def update(self, i, j, delta):
        x = i
        while x <= self.m:
            y = j
            while y <= self.n:
                self.tree[x][y] += delta
                y += y & -y
            x += x & -x
    def query(self, i, j):
        s, x = 0, i
        while x > 0:
            y = j
            while y > 0:
                s += self.tree[x][y]
                y -= y & -y
            x -= x & -x
        return s
```

### 6.2 应用

- 二维前缀和
- 子矩阵和
- LC 308(可变矩阵)

---

## 7. BIT 优化 DP

### 7.1 LIS O(n log n)

```python
def lis(nums):
    from sortedcontainers import SortedList
    # 或手写 BIT:用 BIT 维护"长度 ≤ x 的 LIS"
    # ...
```

### 7.2 LIS with BIT 模板(LC 2407)

`dp[i] = max(dp[j] + 1) for j < i and nums[j] < nums[i]`

用 BIT 维护"以值 x 结尾的 LIS 最长"。

```python
def length_of_lis(nums):
    # 离散化
    sorted_vals = sorted(set(nums))
    rank = {v: i+1 for i, v in enumerate(sorted_vals)}
    bit = BIT(len(sorted_vals))
    for x in nums:
        r = rank[x]
        best = bit.query(r - 1) + 1  # max of smaller ranks
        cur = bit.query_range(r, r)  # current at r
        if best > cur:
            bit.update(r, best - cur)
    return bit.query(len(sorted_vals))
```

注:此处用 max BIT,需把 BIT 改为 max 语义。

### 7.3 最大子段和 BIT

---

## 8. BIT 高级变体

### 8.1 二维 BIT(已讲)

### 8.2 区间 BIT(已讲)

### 8.3 持久化 BIT

每次修改返回新 BIT,见主席树。

### 8.4 CDQ 分治代替 BIT

见分治章节。

---

## 9. 课后 5 题

1. **LC 307** 区域和检索 - 数组可修改
2. **LC 315** 计算右侧小于当前元素的个数
3. **LC 493** 翻转对
4. **LC 308** 二维区域和检索 - 可变
5. **LC 2407** 最长递增子序列 II

---

**下一步**:`11-balanced-tree.md`。
