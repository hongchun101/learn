# 概率与期望(Probability & Expectation)

> LeetCode 中概率题约 30 道,期望题约 20 道,常考 DP。

---

## 1. 概率基础

### 1.1 古典概型

P(A) = 满足条件数 / 总数

### 1.2 条件概率

P(A|B) = P(A∩B) / P(B)

### 1.3 全概率公式

P(A) = Σ P(A|Bi) P(Bi)

### 1.4 贝叶斯

P(Bi|A) = P(A|Bi) P(Bi) / P(A)

---

## 2. 期望基础

### 2.1 期望的线性性

`E[X+Y] = E[X] + E[Y]`

即使 X、Y 不独立也成立。

### 2.2 期望公式

`E[X] = Σ x · P(X = x)`

`E[X] = Σ P(X ≥ i)`(对非负整数随机变量)

### 2.3 常用技巧:指示变量

把"出现次数"转化为 0/1 随机变量求和。

---

## 3. 期望 DP

### 3.1 经典题:骑士拨号器(LC 688)

```python
def knight_probability(n, k, r, c):
    dirs = [(2,1),(2,-1),(-2,1),(-2,-1),(1,2),(1,-2),(-1,2),(-1,-2)]
    dp = [[0]*n for _ in range(n)]
    dp[r][c] = 1
    for _ in range(k):
        ndp = [[0]*n for _ in range(n)]
        for i in range(n):
            for j in range(n):
                for di, dj in dirs:
                    ni, nj = i+di, j+dj
                    if 0 <= ni < n and 0 <= nj < n:
                        ndp[ni][nj] += dp[i][j] / 8
        dp = ndp
    return sum(map(sum, dp))
```

### 3.2 LC 808 分汤

### 3.3 LC 837 新 21 点

```python
def new21_game(n, k, max_pts):
    if k == 0: return 1.0
    dp = [0] * (n + 1)
    dp[0] = 1.0
    s = 1.0
    for i in range(1, n+1):
        dp[i] = s / max_pts
        if i < k:
            s += dp[i]
        if i - max_pts >= 0:
            s -= dp[i - max_pts]
    return sum(dp[k:])
```

### 3.4 LC 1377 蛤蟆吃苍蝇

```python
def frog_position(n, edges, t, target):
    from collections import defaultdict
    g = defaultdict(list)
    for u, v in edges:
        g[u].append(v); g[v].append(u)
    visited = [False]*(n+1)
    visited[1] = True
    def dfs(u, prob, depth):
        if depth == t:
            return prob if u == target else 0
        nxt = [v for v in g[u] if not visited[v]]
        if not nxt:
            return prob if u == target else 0
        p = prob / len(nxt)
        res = 0
        for v in nxt:
            visited[v] = True
            res += dfs(v, p, depth+1)
            visited[v] = False
        return res
    return dfs(1, 1, 0)
```

### 3.5 LC 1230 抛掷硬币

### 3.6 LC 1227 飞机座位分配概率

---

## 4. 蓄水池抽样

### 4.1 概念

未知大小的数据流中,等概率抽 k 个。

### 4.2 算法(抽 1 个)

```python
import random
def reservoir(stream):
    sample = None
    for i, x in enumerate(stream):
        if i == 0:
            sample = x
        else:
            if random.randint(0, i) == 0:
                sample = x
    return sample
```

抽中的概率都是 1/n。

### 4.3 抽 k 个

```python
def reservoir_k(stream, k):
    sample = []
    for i, x in enumerate(stream):
        if i < k:
            sample.append(x)
        else:
            j = random.randint(0, i)
            if j < k:
                sample[j] = x
    return sample
```

### 4.4 应用

- LC 382 链表随机节点
- LC 398 随机数索引
- LC 528 按权重随机选择
- LC 497 非重叠矩形中的随机点

---

## 5. 概率期望在贪心/DP 中的应用

### 5.1 期望最大化的贪心

期望收益 = Σ 概率 × 收益。贪心策略:每步选期望最大。

### 5.2 概率排序

按概率/期望排序常常是错的(辛普森悖论),需具体分析。

---

## 6. 几何概率

### 6.1 LC 478 在圆内随机生成点

```python
import random, math
class Solution:
    def __init__(self, radius, x_center, y_center):
        self.r = radius; self.xc = x_center; self.yc = y_center
    def rand_point(self):
        while True:
            x, y = random.uniform(-1, 1), random.uniform(-1, 1)
            if x*x + y*y <= 1:
                return [self.xc + x*self.r, self.yc + y*self.r]
```

### 6.2 LC 497 非重叠矩形中的随机点

### 6.3 LC 519 随机翻转矩阵

---

## 7. 随机洗牌

### 7.1 Fisher-Yates

```python
import random
def shuffle(nums):
    for i in range(len(nums)-1, 0, -1):
        j = random.randint(0, i)
        nums[i], nums[j] = nums[j], nums[i]
```

O(n)。

### 7.2 LC 384 打乱数组

---

## 8. 蒙特卡洛方法

用大量随机样本估计概率/期望。

### 8.1 LC 478/497 等可用此思路估算

### 8.2 LC 1005 K 次取反后最大化的数组和(贪心即可)

---

## 9. 马尔可夫链(进阶)

### 9.1 状态转移

概率矩阵 P,稳态分布 π 满足 πP = π。

### 9.2 应用

- LC 1577 掷骰子

---

## 10. 常见概率期望技巧

| 技巧 | 适用 |
|------|------|
| 期望线性性 | 求和 |
| 指示变量 | 出现次数 |
| 全概率公式 | 多分支 |
| 蓄水池抽样 | 数据流 |
| 拒绝采样 | 几何分布 |
| 反演(状态) | 状态转移 |

---

## 11. 课后 5 题

1. **LC 382** 链表随机节点(蓄水池)
2. **LC 398** 随机数索引(蓄水池)
3. **LC 528** 按权重随机选择(前缀和 + 二分)
4. **LC 688** 骑士拨号器(期望 DP)
5. **LC 837** 新 21 点(期望 DP)

---

**下一步**:`19-game-theory.md`(博弈论)。
