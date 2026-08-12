# 矩阵快速幂与随机化算法

> LeetCode 直接考得少,但思想用于 DP 优化、概率题。

---

## 1. 矩阵乘法

### 1.1 普通实现 O(n³)

```python
def mat_mul(A, B, mod):
    n = len(A); m = len(B[0]); k = len(B)
    return [[sum(A[i][x]*B[x][j] for x in range(k)) % mod for j in range(m)] for i in range(n)]
```

### 1.2 优化:Strassen(少见)

### 1.3 稀疏矩阵乘法

```python
def sparse_mul(A, B, mod):
    n = len(A)
    res = [[0]*n for _ in range(n)]
    for i in range(n):
        for k in range(n):
            if A[i][k]:
                for j in range(n):
                    res[i][j] = (res[i][j] + A[i][k] * B[k][j]) % mod
    return res
```

---

## 2. 矩阵快速幂 O(n³ log k)

```python
def mat_pow(M, p, mod):
    n = len(M)
    result = [[int(i==j) for j in range(n)] for i in range(n)]
    while p:
        if p & 1: result = mat_mul(result, M, mod)
        M = mat_mul(M, M, mod)
        p >>= 1
    return result
```

---

## 3. 矩阵幂加速线性递推

### 3.1 斐波那契

`F(n) = F(n-1) + F(n-2)`

```
[ F(n) ]   [1 1] [F(n-1)]
[ F(n-1)] = [1 0] [F(n-2)]
```

```python
def fib(n, mod):
    if n < 2: return n
    M = [[1, 1], [1, 0]]
    R = mat_pow(M, n - 1, mod)
    return R[0][0]
```

### 3.2 LC 70 爬楼梯(矩阵幂)

### 3.3 LC 1137 第 N 个泰波那契数

`T(n) = T(n-1) + T(n-2) + T(n-3)`

### 3.4 LC 552 学生出勤记录 II

### 3.5 LC 1220 统计元音字母序列的数目

### 3.6 LC 1567 乘积为正数的最长子数组长度

---

## 4. 矩阵加速 DP

### 4.1 DP[i] = Σ a_j * DP[i - j]

构造矩阵,转移矩阵大小 = 阶数。

### 4.2 例:爬楼梯(可走 1~k 步)

```
dp[i] = dp[i-1] + dp[i-2] + ... + dp[i-k]
```

转移矩阵 k×k,对角线 + 上次对角线。

### 4.3 例:状态机 DP

状态少时,矩阵幂加速。

---

## 5. 高斯消元

```python
def gauss(matrix):
    n = len(matrix)
    for i in range(n):
        # 找主元
        pivot = -1
        for r in range(i, n):
            if abs(matrix[r][i]) > 1e-9:
                pivot = r; break
        if pivot == -1: return None
        matrix[i], matrix[pivot] = matrix[pivot], matrix[i]
        # 消元
        for r in range(n):
            if r == i: continue
            factor = matrix[r][i] / matrix[i][i]
            for c in range(i, n+1):
                matrix[r][c] -= factor * matrix[i][c]
    return [matrix[i][n] / matrix[i][i] for i in range(n)]
```

### 5.1 应用

- 解线性方程组
- 矩阵求逆

### 5.2 LC 特殊等价字符串群

---

## 6. 矩阵快速幂的工程实现

### 6.1 C++ 模板

```cpp
struct Matrix {
    int n; vector<vector<long long>> a;
    Matrix(int _n, bool ident=false) : n(_n) {
        a.assign(n, vector<long long>(n, 0));
        if (ident) for (int i = 0; i < n; i++) a[i][i] = 1;
    }
    Matrix operator*(const Matrix& o) const {
        Matrix res(n);
        for (int i = 0; i < n; i++)
            for (int k = 0; k < n; k++)
                if (a[i][k])
                    for (int j = 0; j < n; j++)
                        res.a[i][j] = (res.a[i][j] + a[i][k] * o.a[k][j]) % MOD;
        return res;
    }
};
```

### 6.2 Python numpy 加速

```python
import numpy as np
def mat_pow_np(M, p):
    n = len(M)
    result = np.eye(n, dtype=np.int64)
    M = np.array(M, dtype=np.int64)
    MOD = 10**9 + 7
    while p:
        if p & 1: result = result @ M % MOD
        M = M @ M % MOD
        p >>= 1
    return result
```

---

## 7. 随机化算法

### 7.1 随机洗牌(已讲)

### 7.2 蓄水池抽样(已讲)

### 7.3 随机化快排

`pivot = random.choice(arr)` 期望 O(n log n),最坏 O(n²) 但概率极低。

### 7.4 Miller-Rabin 素数判定

```python
import random
def is_prime(n, k=10):
    if n < 2: return False
    for p in [2,3,5,7,11,13,17,19,23,29]:
        if n == p: return True
        if n % p == 0: return False
    d = n - 1; s = 0
    while d % 2 == 0: d //= 2; s += 1
    for _ in range(k):
        a = random.randint(2, n-1)
        x = pow(a, d, n)
        if x == 1 or x == n-1: continue
        for _ in range(s-1):
            x = pow(x, 2, n)
            if x == n-1: break
        else:
            return False
    return True
```

### 7.5 Pollard-Rho 因数分解(大数)

```python
def pollard_rho(n):
    if n % 2 == 0: return 2
    while True:
        x = random.randint(2, n-1); y = x; c = random.randint(1, n-1)
        d = 1
        while d == 1:
            x = (x*x + c) % n
            y = (y*y + c) % n
            y = (y*y + c) % n
            d = math.gcd(abs(x-y), n)
        if d != n: return d
```

### 7.6 蒙特卡洛

随机采样估测值。

### 7.7 哈希 + 随机化防冲突

见 `data-structure/04-hash.md`。

---

## 8. 最小随机算法:跳跃表/跳表(已讲)

---

## 9. 模拟退火(启发式)

```python
import random, math
def simulated_annealing(init, energy, neighbor, T=1.0, alpha=0.99, max_iter=10000):
    cur = init
    best = init
    while T > 1e-6 and max_iter > 0:
        nb = neighbor(cur)
        dE = energy(nb) - energy(cur)
        if dE < 0 or random.random() < math.exp(-dE / T):
            cur = nb
            if energy(cur) < energy(best): best = cur
        T *= alpha
        max_iter -= 1
    return best
```

LeetCode 偶尔用作"过题技巧"。

---

## 10. 局部搜索

爬山法:每次向最优邻居移动,可能卡局部最优。

模拟退火:以一定概率接受更差解,跳出局部最优。

---

## 11. 复杂度分析

| 算法 | 时间 | 空间 |
|------|------|------|
| 矩阵乘 n×n | O(n³) | O(n²) |
| 矩阵幂 | O(n³ log k) | O(n²) |
| Miller-Rabin | O(k log³ n) | O(1) |
| Pollard-Rho | O(n^(1/4)) 期望 | O(log n) |

---

## 12. 课后 5 题

1. **LC 70** 爬楼梯(矩阵幂)
2. **LC 1137** 第 N 个泰波那契数
3. **LC 552** 学生出勤记录 II
4. **LC 1220** 统计元音字母序列的数目
5. 实现 Pollard-Rho 大数分解

---

**下一步**:进入 `practice/` 目录,实战篇。
