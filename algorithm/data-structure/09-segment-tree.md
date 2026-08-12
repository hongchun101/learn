# 线段树(Segment Tree)

> 区间查询/更新利器。O(log n) 单次操作。

---

## 1. 原理

把数组区间组织成二叉树:

```
        [0,4]
       /    \
    [0,2]   [3,4]
    / \      / \
 [0,1][2,2][3,3][4,4]
 / \
[0,0][1,1]
```

每个节点存一段区间的聚合信息(求和/最大/最小)。

---

## 2. 基础实现(求和)

```python
class SegTree:
    def __init__(self, nums):
        self.n = len(nums)
        self.size = 4 * self.n
        self.tree = [0] * self.size
        if self.n: self._build(1, 0, self.n - 1, nums)

    def _build(self, node, l, r, nums):
        if l == r:
            self.tree[node] = nums[l]
            return
        m = (l + r) // 2
        self._build(2*node, l, m, nums)
        self._build(2*node+1, m+1, r, nums)
        self.tree[node] = self.tree[2*node] + self.tree[2*node+1]

    def update(self, idx, val):
        self._update(1, 0, self.n - 1, idx, val)

    def _update(self, node, l, r, idx, val):
        if l == r:
            self.tree[node] = val
            return
        m = (l + r) // 2
        if idx <= m: self._update(2*node, l, m, idx, val)
        else:        self._update(2*node+1, m+1, r, idx, val)
        self.tree[node] = self.tree[2*node] + self.tree[2*node+1]

    def query(self, ql, qr):
        return self._query(1, 0, self.n - 1, ql, qr)

    def _query(self, node, l, r, ql, qr):
        if ql <= l and r <= qr: return self.tree[node]
        m = (l + r) // 2
        s = 0
        if ql <= m: s += self._query(2*node, l, m, ql, qr)
        if qr > m:  s += self._query(2*node+1, m+1, r, ql, qr)
        return s
```

---

## 3. 懒标记(区间更新)

支持**区间修改**:如区间加值、区间赋值。

```python
class SegTreeLazy:
    def __init__(self, nums):
        self.n = len(nums)
        self.size = 4 * self.n
        self.tree = [0] * self.size
        self.lazy = [0] * self.size
        if self.n: self._build(1, 0, self.n - 1, nums)

    def _build(self, node, l, r, nums):
        if l == r:
            self.tree[node] = nums[l]
            return
        m = (l + r) // 2
        self._build(2*node, l, m, nums)
        self._build(2*node+1, m+1, r, nums)
        self.tree[node] = self.tree[2*node] + self.tree[2*node+1]

    def _push_down(self, node, l, r):
        if self.lazy[node]:
            m = (l + r) // 2
            for child in (2*node, 2*node+1):
                self.tree[child] += self.lazy[node] * (m - l + 1 if child == 2*node else r - m)
                self.lazy[child] += self.lazy[node]
            self.lazy[node] = 0

    def range_add(self, ql, qr, val):
        self._range_add(1, 0, self.n - 1, ql, qr, val)

    def _range_add(self, node, l, r, ql, qr, val):
        if ql <= l and r <= qr:
            self.tree[node] += val * (r - l + 1)
            self.lazy[node] += val
            return
        self._push_down(node, l, r)
        m = (l + r) // 2
        if ql <= m: self._range_add(2*node, l, m, ql, qr, val)
        if qr > m:  self._range_add(2*node+1, m+1, r, ql, qr, val)
        self.tree[node] = self.tree[2*node] + self.tree[2*node+1]

    def query(self, ql, qr):
        return self._query(1, 0, self.n - 1, ql, qr)

    def _query(self, node, l, r, ql, qr):
        if ql <= l and r <= qr: return self.tree[node]
        self._push_down(node, l, r)
        m = (l + r) // 2
        s = 0
        if ql <= m: s += self._query(2*node, l, m, ql, qr)
        if qr > m:  s += self._query(2*node+1, m+1, r, ql, qr)
        return s
```

---

## 4. 区间赋值(更难)

把懒标记改为"覆盖"语义,需注意加法/赋值互斥。

---

## 5. 线段树常见题型

### 5.1 求区间和(LC 307)

### 5.2 求区间最大/最小

### 5.3 区间反转(LC 732)

### 5.4 区间等差数列(LC 1500)

需要维护"首项 + 公差 + 长度"。

### 5.5 区间最频繁元素

### 5.6 最大子段和(线段树版 LC 53)

每个节点存:`sum / max_prefix / max_suffix / max_subarray`,合并时:

```
sum = L.sum + R.sum
pre = max(L.pre, L.sum + R.pre)
suf = max(R.suf, R.sum + L.suf)
best = max(L.best, R.best, L.suf + R.pre)
```

### 5.7 矩阵区域和(LC 308)

二维线段树,4x4 节点。

### 5.8 区间异或(LC 1707 类似)

### 5.9 逆序对(用线段树替代 BIT)

---

## 6. 动态开点线段树

当 n 很大但只操作 O(q) 个点时:

```python
class DynSegTree:
    def __init__(self, lo, hi):
        self.lo, self.hi = lo, hi
        self.tree = {}
        self.lazy = {}

    def update(self, l, r, val):
        self._up(1, self.lo, self.hi, l, r, val)

    def _up(self, node, lo, hi, l, r, val):
        if l <= lo and hi <= r:
            self.tree[node] = self.tree.get(node, 0) + val
            return
        m = (lo + hi) // 2
        if l <= m: self._up(2*node, lo, m, l, r, val)
        if r > m:  self._up(2*node+1, m+1, hi, l, r, val)
```

只创建访问到的节点,空间 O(q log N)。

---

## 7. 可持久化线段树(主席树)

每个版本是上一版本 + 单点修改。详见"主席树"章节。

---

## 8. 线段树 vs 树状数组

| 维度 | 线段树 | BIT |
|------|--------|-----|
| 区间查询 | O(log n) | O(log n) |
| 单点更新 | O(log n) | O(log n) |
| 区间更新 | O(log n) 懒标记 | O(log n) 差分 |
| 实现复杂度 | 高 | 低 |
| 适用 | 复杂聚合 | 求和、前缀 |

---

## 9. C++ 简洁实现(以 lazy 为例)

```cpp
struct SegTree {
    int n;
    vector<long long> tree, lazy;
    SegTree(int _n) : n(_n) {
        tree.assign(4*n, 0); lazy.assign(4*n, 0);
    }
    void push(int node, int l, int r) {
        if (!lazy[node]) return;
        int m = (l + r) >> 1;
        tree[node<<1] += lazy[node] * (m - l + 1);
        tree[node<<1|1] += lazy[node] * (r - m);
        lazy[node<<1] += lazy[node];
        lazy[node<<1|1] += lazy[node];
        lazy[node] = 0;
    }
    void update(int node, int l, int r, int ql, int qr, long long val) {
        if (ql <= l && r <= qr) {
            tree[node] += val * (r - l + 1);
            lazy[node] += val;
            return;
        }
        push(node, l, r);
        int m = (l + r) >> 1;
        if (ql <= m) update(node<<1, l, m, ql, qr, val);
        if (qr > m)  update(node<<1|1, m+1, r, ql, qr, val);
        tree[node] = tree[node<<1] + tree[node<<1|1];
    }
    long long query(int node, int l, int r, int ql, int qr) {
        if (ql <= l && r <= qr) return tree[node];
        push(node, l, r);
        int m = (l + r) >> 1;
        long long res = 0;
        if (ql <= m) res += query(node<<1, l, m, ql, qr);
        if (qr > m)  res += query(node<<1|1, m+1, r, ql, qr);
        return res;
    }
};
```

---

## 10. 课后 5 题

1. **LC 307** 区域和检索 - 数组可修改
2. **LC 732** 我的日程安排表 III
3. **LC 1500** 设计文件分享系统
4. **LC 53** 最大子数组和(用线段树优化)
5. **LC 2407** 最长递增子序列 II(线段树 + DP)

---

**下一步**:`10-binary-indexed-tree.md`。
