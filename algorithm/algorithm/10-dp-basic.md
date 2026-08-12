# 动态规划基础(DP Basic)

> LeetCode 2000 题中约 30% 与 DP 有关。这是核心算法。

---

## 1. DP 五步法

```
1. 定义状态 dp[i] 是什么
2. 写出状态转移方程
3. 初始化边界
4. 确定遍历顺序
5. 验证(举例 + 边界)
```

---

## 2. 入门题

### 2.1 斐波那契(LC 509)

```python
def fib(n):
    if n < 2: return n
    a, b = 0, 1
    for _ in range(n - 1):
        a, b = b, a + b
    return b
```

### 2.2 爬楼梯(LC 70)

```python
def climb_stairs(n):
    a, b = 1, 1
    for _ in range(n):
        a, b = b, a + b
    return a
```

### 2.3 最小花费爬楼梯(LC 746)

```python
def min_cost_climbing_stairs(cost):
    a, b = 0, 0
    for c in cost:
        a, b = b, min(a, b) + c
    return min(a, b)
```

---

## 3. 线性 DP

### 3.1 最大子段和(LC 53)

```python
def max_subarray(nums):
    cur = res = nums[0]
    for x in nums[1:]:
        cur = max(x, cur + x)
        res = max(res, cur)
    return res
```

### 3.2 最长递增子序列 LIS(LC 300)

```python
def length_of_lis(nums):
    tails = []  # tails[i] = 长度为 i+1 的 LIS 最小尾值
    for x in nums:
        lo, hi = 0, len(tails)
        while lo < hi:
            mid = (lo + hi) // 2
            if tails[mid] < x: lo = mid + 1
            else: hi = mid
        if lo == len(tails): tails.append(x)
        else: tails[lo] = x
    return len(tails)
```

### 3.3 最长递增子序列的个数(LC 673)

### 3.4 最长回文子序列(LC 516)

```python
def longest_palindrome_subseq(s):
    n = len(s)
    dp = [[0]*n for _ in range(n)]
    for i in range(n): dp[i][i] = 1
    for i in range(n-1, -1, -1):
        for j in range(i+1, n):
            if s[i] == s[j]:
                dp[i][j] = dp[i+1][j-1] + 2 if i+1 <= j-1 else 2
            else:
                dp[i][j] = max(dp[i+1][j], dp[i][j-1])
    return dp[0][n-1]
```

### 3.5 最长回文子串(LC 5)

```python
def longest_palindrome(s):
    n = len(s)
    if n < 2: return s
    dp = [[False]*n for _ in range(n)]
    for i in range(n): dp[i][i] = True
    start, maxlen = 0, 1
    for j in range(1, n):
        for i in range(j):
            if s[i] == s[j]:
                dp[i][j] = (j - i < 2) or dp[i+1][j-1]
                if dp[i][j] and j - i + 1 > maxlen:
                    maxlen = j - i + 1
                    start = i
    return s[start:start+maxlen]
```

中心扩展版更常用:

```python
def longest_palindrome(s):
    n = len(s)
    def expand(l, r):
        while l >= 0 and r < n and s[l] == s[r]:
            l -= 1; r += 1
        return s[l+1:r]
    res = ''
    for i in range(n):
        s1 = expand(i, i)
        s2 = expand(i, i+1)
        if len(s1) > len(res): res = s1
        if len(s2) > len(res): res = s2
    return res
```

### 3.6 编辑距离(LC 72)

```python
def min_distance(w1, w2):
    m, n = len(w1), len(w2)
    dp = [[0]*(n+1) for _ in range(m+1)]
    for i in range(m+1): dp[i][0] = i
    for j in range(n+1): dp[0][j] = j
    for i in range(1, m+1):
        for j in range(1, n+1):
            if w1[i-1] == w2[j-1]:
                dp[i][j] = dp[i-1][j-1]
            else:
                dp[i][j] = 1 + min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1])
    return dp[m][n]
```

### 3.7 不同子序列(LC 115)

---

## 4. 路径类 DP

### 4.1 不同路径(LC 62)

```python
def unique_paths(m, n):
    dp = [[1]*n for _ in range(m)]
    for i in range(1, m):
        for j in range(1, n):
            dp[i][j] = dp[i-1][j] + dp[i][j-1]
    return dp[m-1][n-1]
```

### 4.2 不同路径 II(LC 63,带障碍)

### 4.3 最小路径和(LC 64)

### 4.4 三角形最小路径和(LC 120)

```python
def minimum_total(triangle):
    n = len(triangle)
    dp = triangle[-1][:]
    for i in range(n-2, -1, -1):
        for j in range(i+1):
            dp[j] = triangle[i][j] + min(dp[j], dp[j+1])
    return dp[0]
```

### 4.5 下降路径最小和(LC 931)

---

## 5. 股票问题全家桶(LC 121-188)

### 5.1 状态定义

`dp[i][k][s]` = 第 i 天,最多 k 次交易,状态 s(0 不持/1 持) 的最大利润。

### 5.2 通用转移

```python
dp[i][k][0] = max(dp[i-1][k][0], dp[i-1][k][1] + prices[i])
dp[i][k][1] = max(dp[i-1][k][1], dp[i-1][k-1][0] - prices[i])
```

### 5.3 LC 121(1 次交易)

```python
def max_profit(prices):
    min_price, max_profit = float('inf'), 0
    for p in prices:
        min_price = min(min_price, p)
        max_profit = max(max_profit, p - min_price)
    return max_profit
```

### 5.4 LC 122(无限次)

```python
def max_profit(prices):
    return sum(max(0, prices[i] - prices[i-1]) for i in range(1, len(prices)))
```

### 5.5 LC 123(2 次)

```python
def max_profit(prices):
    n = len(prices)
    buy1 = sell1 = -prices[0]
    buy2 = sell2 = -prices[0]
    for i in range(1, n):
        buy1 = max(buy1, -prices[i])
        sell1 = max(sell1, buy1 + prices[i])
        buy2 = max(buy2, sell1 - prices[i])
        sell2 = max(sell2, buy2 + prices[i])
    return sell2
```

### 5.6 LC 188(k 次)

```python
def max_profit(k, prices):
    n = len(prices)
    if k >= n // 2: return sum(max(0, prices[i] - prices[i-1]) for i in range(1, n))
    dp = [[0]*n for _ in range(k+1)]
    for j in range(1, k+1):
        prev_diff = -prices[0]
        for i in range(1, n):
            dp[j][i] = max(dp[j][i-1], prices[i] + prev_diff)
            prev_diff = max(prev_diff, dp[j-1][i-1] - prices[i])
    return dp[k][n-1]
```

### 5.7 LC 309(含冷冻期)

`dp[i][s]`,s = 0 不持且不冷冻/1 持/2 不持冷冻。

### 5.8 LC 714(含手续费)

---

## 6. 打家劫舍系列

### 6.1 LC 198 打家劫舍

```python
def rob(nums):
    pre, cur = 0, 0
    for x in nums:
        pre, cur = cur, max(cur, pre + x)
    return cur
```

### 6.2 LC 213 环形

```python
def rob(nums):
    if len(nums) == 1: return nums[0]
    return max(rob_range(nums[:-1]), rob_range(nums[1:]))

def rob_range(nums):
    pre, cur = 0, 0
    for x in nums:
        pre, cur = cur, max(cur, pre + x)
    return cur
```

### 6.3 LC 337 树形

见树形 DP。

---

## 7. 计数类 DP

### 7.1 整数拆分(LC 343)

```python
def integer_break(n):
    dp = [0]*(n+1)
    dp[1] = 1
    for i in range(2, n+1):
        for j in range(1, i):
            dp[i] = max(dp[i], j * (i - j), j * dp[i - j])
    return dp[n]
```

### 7.2 不同的二叉搜索树(LC 96)

```python
def num_trees(n):
    dp = [0]*(n+1)
    dp[0] = dp[1] = 1
    for i in range(2, n+1):
        for j in range(i):
            dp[i] += dp[j] * dp[i-j-1]
    return dp[n]
```

### 7.3 解码方法(LC 91)

```python
def num_decodings(s):
    if not s or s[0] == '0': return 0
    n = len(s)
    dp = [0]*(n+1)
    dp[0] = 1
    dp[1] = 1
    for i in range(2, n+1):
        if s[i-1] != '0': dp[i] += dp[i-1]
        if '10' <= s[i-2:i] <= '26': dp[i] += dp[i-2]
    return dp[n]
```

### 7.4 数字 1 的个数(LC 233)

数位 DP,见进阶章节。

---

## 8. 博弈类 DP

### 8.1 预测赢家(LC 486)

```python
def predict_the_winner(nums):
    n = len(nums)
    dp = [[0]*n for _ in range(n)]
    for i in range(n): dp[i][i] = nums[i]
    for i in range(n-2, -1, -1):
        for j in range(i+1, n):
            dp[i][j] = max(nums[i] - dp[i+1][j], nums[j] - dp[i][j-1])
    return dp[0][n-1] >= 0
```

### 8.2 石子游戏(LC 877/1140)

### 8.3 除数博弈(LC 1025)

`dp[i] = not dp[i-1]` 之类。

---

## 9. 课后 5 题

1. **LC 300** 最长递增子序列
2. **LC 72** 编辑距离
3. **LC 5** 最长回文子串
4. **LC 198** 打家劫舍
5. **LC 188** 买卖股票的最佳时机 IV

---

**下一步**:`11-dp-advanced.md`(DP 进阶:背包/区间/树形/状压/数位/博弈)。
