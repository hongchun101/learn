# 前缀和与差分

> 区间求和 O(1),区间修改 O(1)。

---

## 1. 一维前缀和

### 1.1 原理

```
prefix[i] = a[0] + a[1] + ... + a[i-1]
sum(l, r) = prefix[r+1] - prefix[l]
```

### 1.2 实现

```python
def build_prefix(nums):
    p = [0] * (len(nums) + 1)
    for i, x in enumerate(nums):
        p[i+1] = p[i] + x
    return p

def range_sum(p, l, r):
    return p[r+1] - p[l]
```

### 1.3 复杂度

预处理 O(n),查询 O(1)。

---

## 2. 前缀和的经典应用

### 2.1 区域和检索 - 数组不可变(LC 303)

直接预处理前缀和。

### 2.2 和为 K 的子数组(LC 560)

```python
def subarray_sum(nums, k):
    from collections import defaultdict
    cnt = defaultdict(int, {0: 1})
    cur = res = 0
    for x in nums:
        cur += x
        res += cnt[cur - k]
        cnt[cur] += 1
    return res
```

### 2.3 连续的子数组和(LC 523)

```python
def check_subarray_sum(nums, k):
    seen = {0: -1}
    cur = 0
    for i, x in enumerate(nums):
        cur = (cur + x) % k
        if cur in seen:
            if i - seen[cur] >= 2: return True
        else:
            seen[cur] = i
    return False
```

### 2.4 矩阵区域和(LC 304)

见下二维部分。

### 2.5 路径总和 III(LC 437)

见 `data-structure/05-tree.md`。

### 2.6 前缀和 + 哈希 + 同余

- LC 525 连续数组
- LC 560 和为 K 的子数组
- LC 930 和相同的二元子数组

---

## 3. 差分数组

### 3.1 原理

```
diff[0] = a[0]
diff[i] = a[i] - a[i-1]
```

区间 `[l, r]` 都加 `v` 等价于:

```
diff[l] += v
diff[r+1] -= v
```

通过前缀和恢复。

### 3.2 实现

```python
def diff_increment(diff, l, r, v):
    diff[l] += v
    if r + 1 < len(diff):
        diff[r+1] -= v

def recover(diff):
    a = [0] * len(diff)
    a[0] = diff[0]
    for i in range(1, len(diff)):
        a[i] = a[i-1] + diff[i]
    return a
```

---

## 4. 差分的经典应用

### 4.1 拼车(LC 1094)

```python
def car_pooling(trips, capacity):
    diff = [0] * 1001
    for n, f, t in trips:
        diff[f] += n
        diff[t] -= n
    cur = 0
    for x in diff:
        cur += x
        if cur > capacity: return False
    return True
```

### 4.2 航班预订统计(LC 1109)

### 4.3 拼字游戏(LC 1160)

### 4.4 等差数列划分 II(LC 446)

需要 prefix + 哈希 + DP。

### 4.5 区间和的个数(LC 327,O(n log n)归并)

---

## 5. 二维前缀和

### 5.1 原理

```
S[i][j] = sum of matrix[0..i-1][0..j-1]
```

```
查询 (r1,r2) x (c1,c2):
= S[r2+1][c2+1] - S[r1][c2+1] - S[r2+1][c1] + S[r1][c1]
```

### 5.2 实现

```python
class MatrixSum:
    def __init__(self, mat):
        m, n = len(mat), len(mat[0])
        self.S = [[0]*(n+1) for _ in range(m+1)]
        for i in range(m):
            for j in range(n):
                self.S[i+1][j+1] = mat[i][j] + self.S[i][j+1] + self.S[i+1][j] - self.S[i][j]

    def query(self, r1, c1, r2, c2):
        return (self.S[r2+1][c2+1] - self.S[r1][c2+1]
                - self.S[r2+1][c1] + self.S[r1][c1])
```

### 5.3 应用

- LC 304 二维区域和检索 - 不可变
- LC 1314 矩阵区域和
- LC 1074 元素和为目标值的子矩阵数量

---

## 6. 二维差分

### 6.1 原理

```python
def update(diff, r1, c1, r2, c2, v):
    diff[r1][c1] += v
    diff[r1][c2+1] -= v
    diff[r2+1][c1] -= v
    diff[r2+1][c2+1] += v
```

恢复:二维前缀和。

---

## 7. 前缀和 + 哈希 = 子数组/子矩阵计数

### 7.1 模板

```python
from collections import defaultdict
cnt = defaultdict(int)
cnt[0] = 1
cur = 0
res = 0
for x in arr:
    cur += f(x)  # 前缀聚合
    res += cnt[cur - target]
    cnt[cur] += 1
```

### 7.2 LC 1074 元素和为目标值的子矩阵数量

枚举上下边界,中间行做前缀和 + 哈希:

```python
def num_submatrix_sum_target(mat, target):
    m, n = len(mat), len(mat[0])
    res = 0
    for top in range(m):
        col_sum = [0] * n
        for bot in range(top, m):
            for j in range(n):
                col_sum[j] += mat[bot][j]
            # 1D 子数组和为 target
            from collections import defaultdict
            cnt = defaultdict(int, {0: 1})
            cur = 0
            for s in col_sum:
                cur += s
                res += cnt[cur - target]
                cnt[cur] += 1
    return res
```

---

## 8. 前缀 XOR

### 8.1 异或前缀和

```python
pre = [0]
for x in arr:
    pre.append(pre[-1] ^ x)
# 区间异或和: pre[r+1] ^ pre[l]
```

### 8.2 应用

- LC 1310 子数组异或查询
- LC 1707 与数组中元素的最大异或值
- LC 1442 形成两个异或相等数组的三元组数目

---

## 9. 课后 5 题

1. **LC 560** 和为 K 的子数组
2. **LC 304** 二维区域和检索 - 不可变
3. **LC 1094** 拼车
4. **LC 1109** 航班预订统计
5. **LC 1074** 元素和为目标值的子矩阵数量

---

**下一步**:`06-divide-conquer.md`。
