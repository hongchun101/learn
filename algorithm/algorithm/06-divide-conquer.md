# 分治法(Divide and Conquer)

> 把问题分成子问题,递归解决,合并结果。

---

## 1. 三步范式

```
divide:  把问题分成子问题
conquer: 递归解决子问题
combine: 合并子问题的解
```

---

## 2. 经典例子:归并排序

见 `algorithm/01-sort.md`。

---

## 3. 经典例子:快速排序

见 `algorithm/01-sort.md`。

---

## 4. 最大子段和(分治版 O(n log n))

```python
def max_subarray(nums, lo=0, hi=None):
    if hi is None: hi = len(nums) - 1
    if lo == hi: return nums[lo]
    mid = (lo + hi) // 2
    left = max_subarray(nums, lo, mid)
    right = max_subarray(nums, mid+1, hi)
    cross = max_crossing(nums, lo, mid, hi)
    return max(left, right, cross)

def max_crossing(nums, lo, mid, hi):
    left_max = float('-inf')
    s = 0
    for i in range(mid, lo-1, -1):
        s += nums[i]
        left_max = max(left_max, s)
    right_max = float('-inf')
    s = 0
    for i in range(mid+1, hi+1):
        s += nums[i]
        right_max = max(right_max, s)
    return left_max + right_max
```

DP 版 O(n) 更快,但分治版有教学意义。

---

## 5. 多数元素(LC 169)

分治:中点元素一定是某一半的众数。

```python
def majority(nums):
    def helper(lo, hi):
        if lo == hi: return nums[lo]
        mid = (lo + hi) // 2
        left = helper(lo, mid)
        right = helper(mid+1, hi)
        if left == right: return left
        return left if nums[lo:hi+1].count(left) > nums[lo:hi+1].count(right) else right
    return helper(0, len(nums)-1)
```

---

## 6. 逆序对(LC 493 翻转对,LC 315 计算右侧小于当前元素的个数)

```python
def reverse_pairs(nums):
    def merge_sort(lo, hi):
        if lo >= hi: return 0
        mid = (lo + hi) // 2
        cnt = merge_sort(lo, mid) + merge_sort(mid+1, hi)
        # 统计
        j = mid + 1
        for i in range(lo, mid+1):
            while j <= hi and nums[i] > 2 * nums[j]: j += 1
            cnt += j - mid - 1
        # 合并
        nums[lo:hi+1] = sorted(nums[lo:hi+1])
        return cnt
    return merge_sort(0, len(nums)-1)
```

或用 BIT(见 `data-structure/10-binary-indexed-tree.md`)。

---

## 7. CDQ 分治

CDQ 用于"三维偏序"等问题。

### 7.1 三维偏序

每个点 `(x, y, z)`,求满足 `x1 ≤ x2 and y1 ≤ y2 and z1 ≤ z2` 的对数。

```python
def cdq(points):
    n = len(points)
    points.sort()  # 按 x
    tmp = [None] * n
    bit = BIT(max_coord)

    def solve(lo, hi):
        if lo == hi: return
        mid = (lo + hi) // 2
        solve(lo, mid)
        # 处理左半对右半的贡献
        left = points[lo:mid+1]
        right = points[mid+1:hi+1]
        merged = sorted(left + right, key=lambda p: p[1])
        for p in merged:
            if p in left:
                bit.update(p[2], 1)
            else:
                p.result += bit.query(p[2])
        for p in left:
            bit.update(p[2], -1)
        solve(mid+1, hi)

    solve(0, n-1)
```

---

## 8. 树分治

### 8.1 点分治(树上路径)

每次找树的重心作为根,递归处理子树。

```python
def tree_centroid_path_count(tree, k):
    n = len(tree)
    sz = [0] * n
    del_all = [False] * n
    ans = 0

    def dfs(u, fa):
        sz[u] = 1
        for v in tree[u]:
            if v != fa and not del_all[v]:
                dfs(v, u); sz[u] += sz[v]
        return

    def find_centroid(u, fa, total):
        for v in tree[u]:
            if v != fa and not del_all[v] and sz[v] > total // 2:
                return find_centroid(v, u, total)
        return u

    def calc(u, fa, depth, depths):
        depths.append(depth)
        for v in tree[u]:
            if v != fa and not del_all[v]:
                calc(v, u, depth + 1, depths)

    def solve(u):
        nonlocal ans
        dfs(u, -1)
        c = find_centroid(u, -1, sz[u])
        del_all[c] = True

        for v in tree[c]:
            if not del_all[v]:
                depths = []
                calc(v, c, 1, depths)
                # 用 depths 计数
                # ... 计数路径和为 k 的对数
                # 例如用哈希/排序
                for d in depths:
                    # 处理跨 v 和 c 的路径
                    pass
                solve(v)

    solve(0)
    return ans
```

### 8.2 边分治 / 链分治

类似思想,略。

---

## 9. 线段树分治

对每条"加入/删除"操作,在线段树上挂载对应区间。详见线段树章节。

---

## 10. 分治 vs DP

| 维度 | 分治 | DP |
|------|------|-----|
| 子问题独立 | 是 | 否 |
| 重叠子问题 | 通常无 | 通常有 |
| 例 | 归并排 | 斐波那契 |

---

## 11. 课后 5 题

1. **LC 169** 多数元素
2. **LC 493** 翻转对
3. **LC 315** 计算右侧小于当前元素的个数
4. **LC 53** 最大子数组和(分治版)
5. **LC 23** 合并 K 个升序链表

---

**下一步**:`07-dfs-bfs.md`。
