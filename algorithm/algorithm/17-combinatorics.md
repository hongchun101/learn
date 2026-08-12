# 组合数学(Combinatorics)

> LeetCode 中组合数学题约 50 道,常见于计数问题。

---

## 1. 计数原理

### 1.1 加法原理

若任务分 m 类,各类有 n_i 种方式,共 Σ n_i 种。

### 1.2 乘法原理

若任务分 m 步,各步有 n_i 种方式,共 Π n_i 种。

---

## 2. 排列

### 2.1 排列 A(n, k) = n!/(n-k)!

```python
def permute_count(n, k):
    res = 1
    for i in range(n, n-k, -1):
        res *= i
    return res
```

### 2.2 全排列 n!

### 2.3 圆排列 (n-1)!

---

## 3. 组合

### 3.1 C(n, k) = n!/(k!(n-k)!)

```python
from math import comb
C = comb(n, k)
```

### 3.2 手算(无溢出)

```python
def c(n, k):
    if k > n - k: k = n - k
    res = 1
    for i in range(k):
        res = res * (n - i) // (i + 1)
    return res
```

### 3.3 模意义下的 C(n, k)

```python
def c_mod(n, k, MOD):
    if k < 0 or k > n: return 0
    k = min(k, n-k)
    num = den = 1
    for i in range(k):
        num = num * ((n-i) % MOD) % MOD
        den = den * ((i+1) % MOD) % MOD
    return num * pow(den, MOD-2, MOD) % MOD
```

### 3.4 帕斯卡恒等式

`C(n, k) = C(n-1, k-1) + C(n-1, k)`

DP 预处理:

```python
C = [[0]*(n+1) for _ in range(n+1)]
for i in range(n+1):
    C[i][0] = C[i][i] = 1
    for j in range(1, i):
        C[i][j] = (C[i-1][j-1] + C[i-1][j]) % MOD
```

---

## 4. 卢卡斯定理(大 n,k mod p)

```python
def lucas(n, k, p):
    if k == 0: return 1
    return c_mod(n % p, k % p, p) * lucas(n // p, k // p, p) % p
```

LC 缺,竞赛常用。

---

## 5. 错位排列(Derangement)

`!n = (n-1)(!(n-1) + !(n-2))`

```python
def derange(n):
    if n == 0: return 1
    if n == 1: return 0
    a, b = 0, 1
    for _ in range(2, n+1):
        a, b = b, (a + b) * (_ - 1)
    return b
```

LC 634 错位排列。

---

## 6. 卡特兰数

`C_n = (1/(n+1)) C(2n, n) = Σ_{i=0}^{n-1} C_i · C_{n-1-i}`

### 6.1 应用

- 合法括号序列
- 二叉搜索树数
- 出栈序列
- 凸多边形三角剖分

### 6.2 实现

```python
def catalan(n, MOD=10**9+7):
    res = 1
    for i in range(n):
        res = res * 2 * (2*i + 1) % MOD
        res = res * pow(i + 2, MOD - 2, MOD) % MOD
    return res
```

LC 96 不同二叉搜索树(就是 C_n)。

---

## 7. 鸽巢原理

n 个物品放入 m 个盒子,至少一个盒子有 ≥ ⌈n/m⌉ 个物品。

### 7.1 应用

- LC 554 砖墙

```python
def least_bricks(wall):
    from collections import defaultdict
    cnt = defaultdict(int)
    for row in wall:
        s = 0
        for x in row[:-1]:
            s += x
            cnt[s] += 1
    return len(wall) - max(cnt.values(), default=0)
```

---

## 8. 抽屉原理

n 个物品,m 个抽屉,若 n > m,则存在抽屉 ≥ 2 个物品。

---

## 9. 容斥原理

```
|A ∪ B ∪ C| = |A| + |B| + |C| - |A∩B| - |B∩C| - |A∩C| + |A∩B∩C|
```

### 9.1 应用

- LC 898 子数组按位或
- LC 2171 拿出最少数目的魔法豆

### 9.2 与莫比乌斯反演结合

```python
def f(n, primes):
    # 1..n 中与 m 互质的数
    ...
```

---

## 10. 计数 DP

### 10.1 LC 62 不同路径(已讲)

### 10.2 LC 63 不同路径 II(已讲)

### 10.3 LC 96 不同的二叉搜索树(卡特兰数)

### 10.4 LC 1259 不相交的握手

### 10.5 LC 1467 概率最大的路径

---

## 11. 母函数(生成函数)

把组合问题转化为多项式乘法。

### 11.1 例:硬币组合

硬币 1,2,5,求组成 x 的方案数:

```
(1 + x + x^2 + ...) (1 + x^2 + x^4 + ...) (1 + x^5 + ...)
```

卷积即方案数。

### 11.2 实现

```python
def gen_func(coins, target):
    dp = [0]*(target+1)
    dp[0] = 1
    for c in coins:
        for j in range(c, target+1):
            dp[j] += dp[j-c]
    return dp[target]
```

这就是背包计数。

---

## 12. 计数技巧

### 12.1 双射

把难计数的问题映射到易计数的问题。

### 12.2 不变量

找不变的量。

### 12.3 选与不选(0/1 计数)

子集/和/异或。

### 12.4 字典序计数

LC 440 字典序的第K小数字。

---

## 13. 经典组合题

- LC 62/63 不同路径
- LC 96 不同的二叉搜索树
- LC 357 计算各个位数不同的数字个数
- LC 386 字典序排数
- LC 440 字典序的第K小数字
- LC 634 错位排列
- LC 996 平方数之和

---

## 14. 课后 5 题

1. **LC 96** 不同的二叉搜索树
2. **LC 357** 计算各个位数不同的数字个数
3. **LC 440** 字典序的第K小数字
4. **LC 634** 错位排列
5. **LC 1259** 不相交的握手

---

**下一步**:`18-probability.md`(概率期望)。
