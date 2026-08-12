# 动态规划优化(DP Optimization)

> 当朴素的 DP 不够快,需要进一步优化。本章覆盖主流优化技巧。

---

## 1. 滚动数组(空间优化)

```python
# 原始:dp[i][j] = dp[i-1][j] + dp[i-1][j-1]
dp = [[0]*n for _ in range(m)]
# 优化
dp = [[0]*n for _ in range(2)]
for i in range(1, m):
    dp[i%2][0] = 1
    for j in range(1, n):
        dp[i%2][j] = dp[(i-1)%2][j] + dp[(i-1)%2][j-1]
```

节省 O(n) → O(1) 行。

---

## 2. 单调队列优化

### 2.1 适用场景

`dp[i] = max(dp[j]) + cost(j, i)`,其中 j ∈ [i-k, i-1]。

### 2.2 模板

```python
from collections import deque
def dp_mono(nums, k):
    n = len(nums)
    dp = [0] * n
    q = deque()  # 存 dp[j], 单调递减
    for i in range(n):
        if q and q[0][1] < i - k: q.popleft()
        dp[i] = nums[i] + (q[0][0] if q else 0)
        while q and q[-1][0] <= dp[i]: q.pop()
        q.append((dp[i], i))
    return max(dp)
```

### 2.3 LC 1696 跳跃游戏 VI

```python
def max_result(nums, k):
    from collections import deque
    n = len(nums)
    dp = [0] * n
    q = deque()
    for i in range(n):
        dp[i] = nums[i] + (q[0][0] if q else 0)
        while q and q[-1][0] < dp[i]: q.pop()
        q.append((dp[i], i))
        if q[0][1] == i - k: q.popleft()
    return dp[-1]
```

### 2.4 LC 1425 带限制的子序列和

### 2.5 LC 1438 绝对差不超过限制的最长连续子数组

### 2.6 LC 862 最短子数组和至少 K

---

## 3. 单调栈优化

### 3.1 适用场景

状态从"前面某些位置"转移,这些位置满足单调性。

### 3.2 LC 2617 网格图中最少访问的格子数

---

## 4. 斜率优化(凸包)

### 4.1 适用场景

`dp[i] = min(dp[j] + (S[i] - S[j])²)`,展开后:
`dp[i] = min(dp[j] + S[j]² - 2 S[i] S[j]) + S[i]²`

设 `Y = dp[j] + S[j]²`,`X = S[j]`,斜率 `k = 2 S[i]`。

直线 `Y = k X + b` 过 `(S[j], dp[j]+S[j]²)`,b 即 dp[j] - 2 S[i] S[j],要最小化。

维护下凸包,三分或单调队列。

### 4.2 模板

```python
from collections import deque
def slope_dp(S):
    n = len(S)
    dp = [0] * n
    q = deque()
    # 初始点 (X[0], Y[0]) 加入
    for i in range(n):
        # 弹出队首不优
        while len(q) >= 2:
            x1, y1 = q[0]
            x2, y2 = q[1]
            # 比较 y1 - k*x1 和 y2 - k*x2
            if (y2 - y1) <= 2 * S[i] * (x2 - x1):  # S[i] 是 k 的一半
                q.popleft()
            else:
                break
        # 用队首更新
        x, y = q[0]
        dp[i] = y - 2 * S[i] * x + S[i] * S[i]
        # 把 (S[i], dp[i]+S[i]^2) 加入
        while len(q) >= 2:
            x1, y1 = q[-2]
            x2, y2 = q[-1]
            x3, y3 = S[i], dp[i] + S[i]*S[i]
            # (y3-y1)(x2-x1) <= (y2-y1)(x3-x1) 不优
            if (y3 - y1) * (x2 - x1) <= (y2 - y1) * (x3 - x1):
                q.pop()
            else:
                break
        q.append((S[i], dp[i] + S[i]*S[i]))
    return dp
```

### 4.3 经典题

- LC 125 单行键盘的最快速度
- LC 1262 可被 3 整除的最大和
- 任务调度问题
- 公交线路优化

---

## 5. 四边形不等式(决策单调)

### 5.1 条件

cost(a, c) + cost(b, d) ≤ cost(a, d) + cost(b, c),其中 a ≤ b ≤ c ≤ d。

且 cost 满足单调性。

### 5.2 结论

最优决策点 K[i] 单调不降: K[1] ≤ K[2] ≤ ... ≤ K[n]。

### 5.3 分治优化

```python
def dp_opt(n):
    dp = [inf] * (n + 1)
    dp[0] = 0
    def solve(l, r, kl, kr):
        if l > r: return
        m = (l + r) // 2
        best_k = kl
        for k in range(kl, min(kr, m) + 1):
            v = dp[k] + cost(k, m)
            if v < dp[m]:
                dp[m] = v
                best_k = k
        solve(l, m-1, kl, best_k)
        solve(m+1, r, best_k, kr)
    solve(1, n, 0, n-1)
```

O(n log n) 或 O(n sqrt(n))。

### 5.4 经典题

- LC 1000 合并石头的最低成本
- LC 1246 删除回文子数组

---

## 6. 矩阵快速幂加速递推

### 6.1 适用场景

`dp[i] = a1 dp[i-1] + a2 dp[i-2] + ... + ak dp[i-k]`

### 6.2 模板

```python
def mat_mul(A, B, mod):
    n = len(A)
    m = len(B[0])
    k = len(B)
    return [[sum(A[i][x]*B[x][j] for x in range(k)) % mod for j in range(m)] for i in range(n)]

def mat_pow(M, p, mod):
    n = len(M)
    result = [[int(i==j) for j in range(n)] for i in range(n)]
    while p:
        if p & 1: result = mat_mul(result, M, mod)
        M = mat_mul(M, M, mod)
        p >>= 1
    return result
```

详见 `algorithm/21-matrix-random.md`。

---

## 7. 倍增优化

### 7.1 适用场景

每次跳 2^k 步,预处理 `nxt[i][k]`。

### 7.2 LC 5629 重新格式化字符串(无关)

### 7.3 经典:LCA 倍增

见图论章节。

---

## 8. 离线 + 排序优化

### 8.1 CDQ 分治

按某一维排序,分治处理另一维贡献。

### 8.2 整体二分

把多个询问一起二分。

---

## 9. 优化选择决策表

| 原始复杂度 | 优化目标 | 方法 |
|-----------|---------|------|
| O(n²) → | O(n log n) | 单调队列/数据结构 |
| O(n²) → | O(n) | 滑动窗口 |
| O(n³) → | O(n²) | 单调队列 / 决策单调 |
| O(n³) → | O(n log n) | 斜率优化 |
| O(n^k) → | O(k log n) | 矩阵幂 |
| O(n²) → | O(n) | 贪心/预处理 |

---

## 10. 实战题

| 题号 | 应用 |
|------|------|
| LC 1696 | 单调队列 |
| LC 1425 | 单调队列 |
| LC 1335 | 单调栈 |
| LC 1000 | 决策单调 |
| LC 552 | 矩阵幂(模) |
| LC 70 | 矩阵幂 |
| LC 1137 | 矩阵幂 |
| LC 1777 | 子树 hash |

---

## 11. 课后 5 题

1. **LC 1696** 跳跃游戏 VI
2. **LC 1425** 带限制的子序列和
3. **LC 1000** 合并石头的最低成本
4. **LC 70** 爬楼梯(矩阵幂版)
5. **LC 1137** 第 N 个泰波那契数

---

**下一步**:`13-graph.md`(图论)。
