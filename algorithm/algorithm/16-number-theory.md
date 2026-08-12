# 数论(Number Theory)

> LeetCode 中数论题约 80 道,集中在"质数"、"因数分解"、"模运算"等。

---

## 1. 基础概念

### 1.1 整除与同余

- `a | b`: a 整除 b
- `a ≡ b (mod m)`: a, b 模 m 同余
- 同余的加减乘仍同余,除法需用逆元

### 1.2 质数与合数

- 质数:大于 1 且只有 1 和自身两个因子
- 1 既不是质数也不是合数

---

## 2. GCD 与 LCM

见 `02-math-bit.md`。

扩展欧几里得:

```python
def ext_gcd(a, b):
    if b == 0: return (a, 1, 0)
    g, x, y = ext_gcd(b, a % b)
    return (g, y, x - (a // b) * y)
```

`ax + by = gcd(a, b)`。

---

## 3. 质数判定与筛法

见 `02-math-bit.md`。

---

## 4. 模运算与快速幂

### 4.1 模运算基础

```python
MOD = 10**9 + 7
(a + b) % MOD  # 加
(a - b) % MOD  # 减(注意非负)
(a * b) % MOD  # 乘
pow(a, b, MOD) # Python 内置快速幂
```

### 4.2 快速幂

见 `02-math-bit.md`。

### 4.3 逆元

- m 质数:`a^(-1) ≡ a^(m-2) (mod m)` (费马小定理)
- 一般 m:`ax ≡ 1 (mod m)`,用扩展欧几里得求 x

### 4.4 LC 372 超级次方

```python
def super_pow(a, b):
    MOD = 1337
    def pow_mod(x, n):
        res = 1
        x %= MOD
        while n:
            if n & 1: res = res * x % MOD
            x = x * x % MOD
            n >>= 1
        return res
    res = 1
    for d in b:
        res = pow_mod(res, 10) * pow_mod(a, d) % MOD
    return res
```

---

## 5. 因子分解

### 5.1 朴素 O(√n)

```python
def factorize(n):
    factors = []
    i = 2
    while i * i <= n:
        while n % i == 0:
            factors.append(i); n //= i
        i += 1
    if n > 1: factors.append(n)
    return factors
```

### 5.2 筛法预处理

预处理 spf(最小质因子)数组。

```python
def smallest_prime_factor(n):
    spf = list(range(n+1))
    for i in range(2, int(n**0.5)+1):
        if spf[i] == i:
            for j in range(i*i, n+1, i):
                if spf[j] == j: spf[j] = i
    return spf
```

### 5.3 因子计数

```python
def count_divisors(n):
    cnt = 0
    i = 1
    while i * i <= n:
        if n % i == 0:
            cnt += 2 if i*i != n else 1
        i += 1
    return cnt
```

### 5.4 LC 1362 最接近的因数

```python
def closest_divisors(num):
    for i in range(int((num + 2) ** 0.5), 0, -1):
        if (num + 1) % i == 0: return [i, (num+1)//i]
        if (num + 2) % i == 0: return [i, (num+2)//i]
```

---

## 6. 欧拉函数

`φ(n)` = 1..n 中与 n 互质的数的个数。

### 6.1 计算

```python
def euler_phi(n):
    res = n
    p = 2
    while p * p <= n:
        if n % p == 0:
            while n % p == 0: n //= p
            res -= res // p
        p += 1
    if n > 1: res -= res // n
    return res
```

### 6.2 性质

- `φ(p) = p - 1`(p 质数)
- `φ(p^k) = p^k - p^(k-1)`
- `φ(ab) = φ(a)φ(b)` (a, b 互质)

### 6.3 筛法计算 1..n 的 φ

```python
def euler_sieve_phi(n):
    phi = list(range(n+1))
    primes = []
    is_prime = [True]*(n+1)
    for i in range(2, n+1):
        if is_prime[i]:
            primes.append(i); phi[i] = i - 1
        for p in primes:
            if i*p > n: break
            is_prime[i*p] = False
            if i % p == 0:
                phi[i*p] = phi[i] * p
                break
            else:
                phi[i*p] = phi[i] * (p - 1)
    return phi
```

---

## 7. 中国剩余定理(CRT)

求解:
```
x ≡ a1 (mod m1)
x ≡ a2 (mod m2)
...
```

互质情形:

```python
def crt(a, m):
    M = 1
    for mi in m: M *= mi
    res = 0
    for ai, mi in zip(a, m):
        Mi = M // mi
        # 求 Mi^(-1) mod mi
        inv = pow(Mi, -1, mi)
        res = (res + ai * Mi * inv) % M
    return res
```

不互质情形:扩展 CRT。

---

## 8. 常见数论函数

### 8.1 σ(n) 因子和

`σ(n) = Π (p^(k+1) - 1) / (p - 1)`,n = Π p^k

### 8.2 d(n) 因子个数

`d(n) = Π (k+1)`

### 8.3 μ(n) Möbius 函数

```
μ(1) = 1
μ(n) = 0  if n 有平方因子
μ(n) = (-1)^k if n 是 k 个不同质数之积
```

筛法预处理:

```python
def mobius(n):
    mu = [1]*(n+1)
    is_prime = [True]*(n+1)
    primes = []
    for i in range(2, n+1):
        if is_prime[i]:
            primes.append(i); mu[i] = -1
        for p in primes:
            if i*p > n: break
            is_prime[i*p] = False
            if i % p == 0:
                mu[i*p] = 0; break
            else:
                mu[i*p] = -mu[i]
    return mu
```

### 8.4 应用:容斥

```
Σ_{d|n} μ(d) = [n == 1]
```

---

## 9. 威尔逊定理、费马小定理

- 威尔逊:`(p-1)! ≡ -1 (mod p)` (p 质数)
- 费马:`a^(p-1) ≡ 1 (mod p)` (p 质数, gcd(a,p)=1)
- 欧拉:`a^φ(n) ≡ 1 (mod n)` (gcd(a,n)=1)

---

## 10. LeetCode 数论题

| 题号 | 应用 |
|------|------|
| LC 204 | 质数筛 |
| LC 50 | 快速幂 |
| LC 372 | 超级次方 |
| LC 866 | 回文质数 |
| LC 952 | 最大公约数 |
| LC 1362 | 最近因数 |
| LC 1627 | 带阈值的图连通性 |
| LC 1819 | 序列中不同最大公约数的数目 |
| LC 1991 | 找到数组的中间位置 |

---

## 11. 课后 5 题

1. **LC 204** 计数质数
2. **LC 50** Pow(x, n)
3. **LC 372** 超级次方
4. **LC 1362** 最接近的因数
5. **LC 1819** 序列中不同最大公约数的数目

---

**下一步**:`17-combinatorics.md`(组合数学)。
