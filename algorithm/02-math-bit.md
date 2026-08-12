# 02 · 数学与位运算基础

> LeetCode 上 30% 的题需要数学工具,位运算是常数优化的杀手锏。

---

## 1. 位运算速算表

| 运算 | 含义 | 常用场景 |
|------|------|---------|
| `n & 1` | 末位 | 判奇偶 |
| `n >> 1` | 除以 2 | 快二分 |
| `n << 1` | 乘以 2 | 二叉堆索引 |
| `n & (n-1)` | 去掉最低位 1 | 计数、汉明距离 |
| `n & -n` | 最低位 1 | BIT |
| `n ^ n = 0` | 异或消消乐 | 找唯一 |
| `n ^ (~n+1) = 2^n - 1` | 低位全 1 | 掩码 |
| `x ^ y ^ x = y` | 异或结合 | 交换两数 |
| `(n >> k) & 1` | 第 k 位 | 状态压缩 |
| `__builtin_popcount(n)` | 1 的个数 | 汉明重量 |
| `__builtin_ctz(n)` | 末尾 0 个数 | BIT |

---

## 2. 常用技巧

### 交换两数(不用临时变量)

```cpp
a = a ^ b;
b = a ^ b;  // b = a^b^b = a
a = a ^ b;  // a = a^b^a = b
```

### 判断是否为 2 的幂

```cpp
return (n > 0) && ((n & (n - 1)) == 0);
```

### 找唯一出现奇数次的数

```cpp
int res = 0;
for (int x : nums) res ^= x;  // 成对抵消
```

### 找两个出现奇数次的数(其余偶数次)

```cpp
int diff = a ^ b;           // 不同位
int lowbit = diff & -diff;  // 最低不同位
int x = 0, y = 0;
for (int n : nums)
    if (n & lowbit) x ^= n;
    else            y ^= n;
return {x, y};
```

### 位运算实现加法

```cpp
while (b != 0) {
    int carry = (a & b) << 1;
    a = a ^ b;
    b = carry;
}
```

---

## 3. 二进制状态压缩

用 N 位表示 2^N 状态。N ≤ 20 时常用。

```cpp
// 枚举子集
for (int s = mask; s; s = (s - 1) & mask) { ... }

// 枚举子集的子集
for (int s = mask; s; s = (s - 1) & mask)
    for (int t = s; t; t = (t - 1) & s) { ... }
```

---

## 4. GCD 与 LCM

```python
def gcd(a, b):
    while b: a, b = b, a % b
    return a

def lcm(a, b):
    return a // gcd(a, b) * b  # 防溢出
```

**性质**:
- gcd(a, b) = gcd(b, a mod b)
- gcd(a, 0) = a
- gcd(ka, kb) = k·gcd(a, b)

---

## 5. 质数判定与筛法

### 朴素判定 O(√n)

```python
def is_prime(n):
    if n < 2: return False
    for i in range(2, int(n**0.5) + 1):
        if n % i == 0: return False
    return True
```

### 埃氏筛 O(n log log n)

```python
def sieve(n):
    is_prime = [True] * (n + 1)
    is_prime[0] = is_prime[1] = False
    for i in range(2, int(n**0.5) + 1):
        if is_prime[i]:
            for j in range(i*i, n + 1, i):
                is_prime[j] = False
    return is_prime
```

### 欧拉筛(线性筛)O(n)

```python
def euler_sieve(n):
    primes = []
    is_prime = [True] * (n + 1)
    for i in range(2, n + 1):
        if is_prime[i]:
            primes.append(i)
        for p in primes:
            if i * p > n: break
            is_prime[i * p] = False
            if i % p == 0: break
    return primes
```

---

## 6. 模运算

### 基本规则

```cpp
(a + b) % m = ((a % m) + (b % m)) % m
(a * b) % m = ((a % m) * (b % m)) % m
(a - b) % m = ((a % m) - (b % m) + m) % m  // 注意非负
```

### 快速幂 O(log n)

```cpp
long long pow_mod(long long a, long long n, long long m) {
    long long res = 1;
    a %= m;
    while (n) {
        if (n & 1) res = res * a % m;
        a = a * a % m;
        n >>= 1;
    }
    return res;
}
```

### 矩阵快速幂 O(n^3 log k)

见 `algorithm/21-matrix-random.md`。

### 逆元

`a * a^(-1) ≡ 1 (mod m)`

- m 为质数:`a^(-1) = a^(m-2) (mod m)` (费马小定理)
- 扩展欧几里得:`ax + by = gcd(a,b) = 1`,x 即逆元

---

## 7. 组合数学速查

### 二项式系数 C(n,k)

```python
from math import comb
# 或手写: C(n,k) = C(n,k-1) * (n-k+1) / k
```

### 帕斯卡恒等式

C(n,k) = C(n-1,k-1) + C(n-1,k)

### 卢卡斯定理(大 n,k mod p)

```cpp
ll lucas(ll n, ll k, ll p) {
    if (k == 0) return 1;
    return comb(n % p, k % p) * lucas(n / p, k / p, p) % p;
}
```

### 卡特兰数

C_n = (1/(n+1)) * C(2n,n) = C(2n,n) - C(2n,n+1)

应用:合法括号、二叉树数、出栈序列

---

## 8. 容斥原理

`|A ∪ B ∪ C| = |A| + |B| + |C| - |A∩B| - |B∩C| - |A∩C| + |A∩B∩C|`

### 经典应用:1~n 中与 m 互质的数

```python
def coprime_count(n, m):
    # 分解 m 的质因数,枚举非空子集
    primes = factorize(m)
    res = 0
    for s in range(1, 1 << len(primes)):
        mult = 1
        bits = 0
        for i, p in enumerate(primes):
            if s >> i & 1:
                mult *= p
                bits += 1
        cnt = n // mult
        if bits & 1: res += cnt
        else:        res -= cnt
    return n - res
```

---

## 9. 排列与组合生成

### 全排列(DFS)

```python
def permute(nums):
    res, path, used = [], [], [False] * len(nums)
    def dfs():
        if len(path) == len(nums):
            res.append(path[:])
            return
        for i in range(len(nums)):
            if used[i]: continue
            used[i] = True
            path.append(nums[i])
            dfs()
            path.pop()
            used[i] = False
    dfs()
    return res
```

### 组合

```python
def combine(n, k):
    res, path = [], []
    def dfs(start):
        if len(path) == k:
            res.append(path[:])
            return
        for i in range(start, n + 1):
            path.append(i)
            dfs(i + 1)
            path.pop()
    dfs(1)
    return res
```

---

## 10. 课后 5 题

1. **LC 136** 只出现一次的数字(异或)
2. **LC 137** 只出现一次的数字 II(状态机位运算)
3. **LC 201** 数字范围按位与
4. **LC 204** 计数质数(埃氏筛)
5. **LC 50** Pow(x, n)(快速幂)

---

**下一步**:进入 `data-structure/` 目录,系统学习数据结构。
