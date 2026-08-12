# 动态规划进阶(DP Advanced)

> 背包、区间、树形、状压、数位 DP 等高级模式。

---

## 1. 背包问题全家桶

### 1.1 0/1 背包

每件物品最多用一次。

```python
# dp[i][j] = 前 i 件物品,容量 j 的最大价值
dp = [[0]*(W+1) for _ in range(n+1)]
for i in range(1, n+1):
    for j in range(W+1):
        if j >= w[i-1]:
            dp[i][j] = max(dp[i-1][j], dp[i-1][j-w[i-1]] + v[i-1])
        else:
            dp[i][j] = dp[i-1][j]
```

压缩到一维:

```python
dp = [0]*(W+1)
for i in range(n):
    for j in range(W, w[i]-1, -1):  # 倒序
        dp[j] = max(dp[j], dp[j-w[i]] + v[i])
```

### 1.2 分割等和子集(LC 416)

```python
def can_partition(nums):
    s = sum(nums)
    if s % 2: return False
    target = s // 2
    dp = [False]*(target+1)
    dp[0] = True
    for x in nums:
        for j in range(target, x-1, -1):
            dp[j] = dp[j] or dp[j-x]
    return dp[target]
```

### 1.3 完全背包

每件物品无限用。

```python
dp = [0]*(W+1)
for i in range(n):
    for j in range(w[i], W+1):  # 正序
        dp[j] = max(dp[j], dp[j-w[i]] + v[i])
```

#### LC 322 零钱兑换

```python
def coin_change(coins, amount):
    dp = [float('inf')]*(amount+1)
    dp[0] = 0
    for i in range(1, amount+1):
        for c in coins:
            if c <= i and dp[i-c] != float('inf'):
                dp[i] = min(dp[i], dp[i-c] + 1)
    return dp[amount] if dp[amount] != float('inf') else -1
```

#### LC 518 零钱兑换 II(计数)

```python
def change(amount, coins):
    dp = [0]*(amount+1)
    dp[0] = 1
    for c in coins:
        for j in range(c, amount+1):
            dp[j] += dp[j-c]
    return dp[amount]
```

### 1.4 多重背包

每件物品 c[i] 件。

二进制拆分,转化为 0/1 背包。

### 1.5 分组背包

每组物品选一个。

```python
for group in groups:
    for j in range(W, -1, -1):
        for item in group:
            if j >= item.w:
                dp[j] = max(dp[j], dp[j-item.w] + item.v)
```

---

## 2. 区间 DP

### 2.1 模板

```python
# dp[i][j] = 区间 [i, j] 的最优解
for length in range(2, n+1):
    for i in range(n-length+1):
        j = i + length - 1
        for k in range(i, j):
            dp[i][j] = min(dp[i][j], dp[i][k] + dp[k+1][j] + cost)
```

### 2.2 LC 312 戳气球

```python
def max_coins(nums):
    nums = [1] + nums + [1]
    n = len(nums)
    dp = [[0]*n for _ in range(n)]
    for length in range(2, n):
        for i in range(n-length):
            j = i + length
            for k in range(i+1, j):
                dp[i][j] = max(dp[i][j], dp[i][k] + dp[k][j] + nums[i]*nums[k]*nums[j])
    return dp[0][n-1]
```

### 2.3 LC 5/516(已讲)

### 2.4 LC 1139 最大 1+1 方形

### 2.5 LC 1547 切棍子的最小成本

### 2.6 LC 1000 合并石子的最低成本

### 2.7 LC 664 奇怪的打印机

### 2.8 LC 1039 多边形三角剖分

---

## 3. 树形 DP

### 3.1 树的直径(LC 543)

```python
def diameter(root):
    self.res = 0
    def dfs(node):
        if not node: return 0
        l = dfs(node.left); r = dfs(node.right)
        self.res = max(self.res, l + r)
        return 1 + max(l, r)
    dfs(root)
    return self.res
```

### 3.2 打家劫舍 III(LC 337)

```python
def rob(root):
    def dfs(node):
        if not node: return (0, 0)
        l = dfs(node.left); r = dfs(node.right)
        return (node.val + l[1] + r[1], max(l) + max(r))
    return max(dfs(root))
```

### 3.3 二叉树的监控(LC 968)

三态 DP:0=无监控,1=有监控,2=有摄像头。

### 3.4 树的最大独立集(LC 337 同)

### 3.5 树的路径和

```python
def path_sum(root, target):
    cnt = defaultdict(int, {0: 1})
    self.res = 0
    def dfs(node, cur):
        if not node: return
        cur += node.val
        self.res += cnt[cur - target]
        cnt[cur] += 1
        dfs(node.left, cur); dfs(node.right, cur)
        cnt[cur] -= 1
    dfs(root, 0)
    return self.res
```

### 3.6 树形 DP 一般步骤

1. 后序遍历
2. 收集子节点信息
3. 用子信息组合当前节点

---

## 4. 状压 DP

### 4.1 模板

用 N 位二进制表示状态,N ≤ 20。

```python
dp = [inf] * (1<<n)
dp[0] = 0
for s in range(1<<n):
    for i in range(n):
        if s >> i & 1 == 0:
            dp[s | (1<<i)] = min(dp[s | (1<<i)], dp[s] + cost[i])
```

### 4.2 LC 464 我能赢吗

### 4.3 LC 526 优美的排列

### 4.4 LC 1349 参加考试的最大学生数

座位状压,行内/相邻行约束。

### 4.5 LC 1434 每个人戴不同帽子的方案数

### 4.6 LC 1799 最大化 N 次操作后的得分

### 4.7 LC 2172 数组的最大与和

---

## 5. 数位 DP

### 5.1 模板

```python
def digit_dp(n):
    digits = list(map(int, str(n)))
    n = len(digits)
    @lru_cache(None)
    def dfs(pos, tight, leading, state):
        if pos == n:
            return 1 if not leading else 0
        limit = digits[pos] if tight else 9
        ans = 0
        for d in range(0 if not leading else 1, limit+1):
            new_tight = tight and (d == limit)
            new_leading = leading and (d == 0)
            ans += dfs(pos+1, new_tight, new_leading, state)
        return ans
    return dfs(0, True, True, 0)
```

### 5.2 LC 233 数字 1 的个数

```python
def count_digit_one(n):
    digits = list(map(int, str(n)))
    @lru_cache(None)
    def dfs(pos, cnt, tight):
        if pos == len(digits):
            return cnt
        limit = digits[pos] if tight else 9
        ans = 0
        for d in range(limit+1):
            ans += dfs(pos+1, cnt + (d == 1), tight and d == limit)
        return ans
    return dfs(0, 0, True)
```

### 5.3 LC 902 最大为 N 的数字组合

### 5.4 LC 1012 至少有 1 位重复的数字

### 5.5 LC 1088 易混淆数 II

### 5.6 LC 1745 回文串分割 IV(判断)

---

## 6. 概率/期望 DP

### 6.1 期望的线性性

`E[X+Y] = E[X] + E[Y]`,即使 X、Y 不独立。

### 6.2 LC 688 骑士拨号器

### 6.3 LC 808 分汤

### 6.4 LC 837 新 21 点

```python
def new21_game(n, k, max_pts):
    if k == 0: return 1.0
    dp = [0] * (n + 1)
    dp[0] = 1
    s = 1
    for i in range(1, n+1):
        dp[i] = s / max_pts
        if i < k: s += dp[i]
        if i - max_pts >= 0: s -= dp[i - max_pts]
    return sum(dp[k:])
```

### 6.5 LC 1227 飞机座位分配概率

### 6.6 LC 1230 抛掷硬币

### 6.7 LC 1377 蛤蟆吃苍蝇

---

## 7. 博弈 DP

### 7.1 SG 函数

```python
def sg(state, memo):
    if state in memo: return memo[state]
    s = set()
    for nxt in next_states(state):
        s.add(sg(nxt, memo))
    mex = 0
    while mex in s: mex += 1
    memo[state] = mex
    return mex
```

### 7.2 LC 292 Nim 游戏

`n % 4 == 0` 输,否则赢。

### 7.3 LC 294 翻转游戏 II

记忆化 DFS,SG 函数。

### 7.4 LC 810 黑板异或游戏

### 7.5 LC 913 猫和老鼠

最小最大博弈,状态 BFS。

---

## 8. DP 的 8 种套路总结

| 类型 | 状态 | 转移 |
|------|------|------|
| 线性 | dp[i] | dp[i-1]... |
| 区间 | dp[i][j] | dp[i][k] + dp[k+1][j] |
| 背包 | dp[i][j] | 选/不选 |
| 树形 | dfs 返回 | 子节点组合 |
| 状压 | dp[mask] | mask ^ (1<<i) |
| 数位 | dfs(pos, ...) | 枚举当前位 |
| 期望 | E[X] | 转移概率 |
| 博弈 | min/max | 对手最优 |

---

## 9. 课后 5 题

1. **LC 322** 零钱兑换
2. **LC 312** 戳气球
3. **LC 337** 打家劫舍 III
4. **LC 233** 数字 1 的个数
5. **LC 837** 新 21 点

---

**下一步**:`12-dp-optimization.md`(DP 优化技巧)。
