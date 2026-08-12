# 字符串算法(String Algorithms)

> LeetCode 2000 题中约 200+ 与字符串有关。

---

## 1. KMP 算法

### 1.1 核心:next 数组

`next[i]` = P[0..i] 最长公共前后缀(不含完整串)的长度。

### 1.2 实现

```python
def build_next(p):
    n = len(p)
    nxt = [0]*n
    j = 0
    for i in range(1, n):
        while j > 0 and p[i] != p[j]:
            j = nxt[j-1]
        if p[i] == p[j]: j += 1
        nxt[i] = j
    return nxt

def kmp(s, p):
    nxt = build_next(p)
    j = 0
    for i in range(len(s)):
        while j > 0 and s[i] != p[j]:
            j = nxt[j-1]
        if s[i] == p[j]: j += 1
        if j == len(p):
            yield i - j + 1  # 出现位置
            j = nxt[j-1]
```

O(n+m)。

### 1.3 经典题

- LC 28 实现 strStr
- LC 459 重复的子字符串(利用 next[-1] 与 n 的关系)
- LC 1392 最长快乐前缀

### 1.4 重复的子字符串判定

```python
def repeated_substring_pattern(s):
    nxt = build_next(s)
    n = len(s)
    if nxt[-1] != 0 and n % (n - nxt[-1]) == 0:
        return True
    return False
```

---

## 2. Z 函数

### 2.1 核心

`z[i]` = S[i..] 与 S[0..] 的最长公共前缀。

### 2.2 实现

```python
def z_function(s):
    n = len(s)
    z = [0]*n
    z[0] = n
    l = r = 0
    for i in range(1, n):
        if i <= r:
            z[i] = min(r - i + 1, z[i-l])
        while i + z[i] < n and s[z[i]] == s[i+z[i]]:
            z[i] += 1
        if i + z[i] - 1 > r:
            l, r = i, i + z[i] - 1
    return z
```

### 2.3 应用

- 模式匹配
- LC 2223 构造字符串的总得分和

---

## 3. 字符串哈希(滚动哈希)

### 3.1 单模哈希

```python
class Hash:
    def __init__(self, s, base=131, mod=(1<<61)-1):
        n = len(s)
        self.h = [0]*(n+1)
        self.p = [1]*(n+1)
        for i in range(n):
            self.h[i+1] = (self.h[i] * base + ord(s[i])) % mod
            self.p[i+1] = (self.p[i] * base) % mod
        self.mod = mod

    def get(self, l, r):  # [l, r)
        return (self.h[r] - self.h[l] * self.p[r-l]) % self.mod
```

### 3.2 双模哈希(防碰撞)

```python
class DoubleHash:
    def __init__(self, s):
        self.h1 = Hash(s, 131, (1<<61)-1)
        self.h2 = Hash(s, 137, (1<<31)-1)
    def get(self, l, r):
        return (self.h1.get(l, r), self.h2.get(l, r))
```

### 3.3 应用

- LC 187 重复的 DNA 序列
- LC 1044 最长重复子串(二分 + 哈希)
- LC 718 最长重复子数组
- LC 1143 最长公共子序列(也可以,但 DP 更常见)

### 3.4 二分最长重复子串

```python
def longest_dup_substring(s):
    n = len(s)
    h = Hash(s)
    def check(ln):
        seen = set()
        for i in range(n - ln + 1):
            sub = h.get(i, i + ln)
            if sub in seen: return i
            seen.add(sub)
        return -1
    lo, hi = 0, n - 1
    pos = -1
    while lo <= hi:
        mid = (lo + hi) // 2
        p = check(mid)
        if p != -1:
            pos = p; lo = mid + 1
        else:
            hi = mid - 1
    return s[pos:pos+hi+1] if pos != -1 else ''
```

---

## 4. Manacher(最长回文子串)

```python
def manacher(s):
    s = '#' + '#'.join(s) + '#'
    n = len(s)
    p = [0]*n
    c = r = 0
    for i in range(n):
        mirror = 2*c - i
        if i < r:
            p[i] = min(r - i, p[mirror])
        while i - p[i] - 1 >= 0 and i + p[i] + 1 < n and s[i-p[i]-1] == s[i+p[i]+1]:
            p[i] += 1
        if i + p[i] > r:
            c, r = i, i + p[i]
    return max(p)
```

O(n)。

### 4.1 经典题

- LC 5 最长回文子串
- LC 647 回文子串
- LC 214 最短回文串

---

## 5. 最小表示法

循环串字典序最小表示。

```python
def smallest_representation(s):
    n = len(s)
    i = j = 0
    while i < n and j < n:
        k = 0
        while k < n and s[(i+k)%n] == s[(j+k)%n]:
            k += 1
        if k == n: break
        if s[(i+k)%n] > s[(j+k)%n]:
            i = i + k + 1
        else:
            j = j + k + 1
        if i == j: i += 1
    return min(i, j)
```

---

## 6. 后缀数组 SA

### 6.1 倍增算法 O(n log n)

```python
def suffix_array(s):
    n = len(s)
    k = 1
    rank = [ord(c) for c in s]
    tmp = [0]*n
    sa = list(range(n))
    while True:
        sa.sort(key=lambda x: (rank[x], rank[x+k] if x+k < n else -1))
        tmp[sa[0]] = 0
        for i in range(1, n):
            prev, cur = sa[i-1], sa[i]
            tmp[cur] = tmp[prev] + ((rank[prev], rank[prev+k] if prev+k < n else -1) < (rank[cur], rank[cur+k] if cur+k < n else -1))
        rank, tmp = tmp, rank
        if rank[sa[-1]] == n - 1: break
        k <<= 1
    return sa
```

### 6.2 应用

- 不同子串数 = n(n+1)/2 - Σ height[i]
- LCP 查询(最长公共前缀):用 RMQ
- 子串匹配

---

## 7. 后缀自动机 SAM

### 7.1 结构

每个状态代表一个 endpos 集合。

### 7.2 实现

```python
class SAMNode:
    def __init__(self):
        self.next = {}
        self.link = -1
        self.len = 0

class SAM:
    def __init__(self):
        self.nodes = [SAMNode()]  # 0 是初始
        self.last = 0

    def extend(self, c):
        cur = len(self.nodes)
        self.nodes.append(SAMNode())
        self.nodes[cur].len = self.nodes[self.last].len + 1
        p = self.last
        while p != -1 and c not in self.nodes[p].next:
            self.nodes[p].next[c] = cur
            p = self.nodes[p].link
        if p == -1:
            self.nodes[cur].link = 0
        else:
            q = self.nodes[p].next[c]
            if self.nodes[p].len + 1 == self.nodes[q].len:
                self.nodes[cur].link = q
            else:
                clone = len(self.nodes)
                self.nodes.append(SAMNode())
                self.nodes[clone].len = self.nodes[p].len + 1
                self.nodes[clone].next = self.nodes[q].next.copy()
                self.nodes[clone].link = self.nodes[q].link
                while p != -1 and self.nodes[p].next.get(c) == q:
                    self.nodes[p].next[c] = clone
                    p = self.nodes[p].link
                self.nodes[q].link = self.nodes[cur].link = clone
        self.last = cur

    def build(self, s):
        for c in s: self.extend(c)
        return self
```

### 7.3 应用

- 不同子串数:每个状态贡献 `len - link.len`
- 子串出现次数:endpos 集合大小
- LC 727 最小窗口子序列
- 字符串 LCS、字典序第 k 小子串

---

## 8. AC 自动机(多模式匹配)

### 8.1 结构

Trie + fail 链(Trie 上做 KMP)。

### 8.2 实现

```python
from collections import deque

class ACAutomaton:
    def __init__(self):
        self.children = [{}]  # 0 是根
        self.fail = [0]
        self.output = [[]]

    def insert(self, s):
        node = 0
        for c in s:
            if c not in self.children[node]:
                self.children[node][c] = len(self.children)
                self.children.append({})
                self.fail.append(0)
                self.output.append([])
            node = self.children[node][c]

    def build(self):
        q = deque()
        for c, v in self.children[0].items():
            q.append(v)
        while q:
            u = q.popleft()
            for c, v in self.children[u].items():
                q.append(v)
                f = self.fail[u]
                while f and c not in self.children[f]:
                    f = self.fail[f]
                self.fail[v] = self.children[f].get(c, 0)

    def query(self, s):
        node = 0; res = 0
        for c in s:
            while node and c not in self.children[node]:
                node = self.fail[node]
            node = self.children[node].get(c, 0)
            res += len(self.output[node])
        return res
```

### 8.3 经典题

- LC 1032 字符流
- LC 1397 找到所有好字符串

---

## 9. 回文树(Palindromic Tree)

### 9.1 结构

两棵树:长度奇/偶回文。

### 9.2 实现

```python
class PalTree:
    def __init__(self):
        # 0 = 长度 -1 节点,1 = 长度 0 节点(偶回文)
        self.len = [-1, 0]
        self.link = [0, 0]
        self.next = [{}, {}]
        self.cnt = [0, 0]
        self.last = 1
        self.size = 2

    def add(self, c):
        cur = self.last
        while True:
            cur_len = self.len[cur]
            if c == self.s[len(self.s) - cur_len - 1] if len(self.s) - cur_len - 1 >= 0 else False:
                break
            cur = self.link[cur]
        if c in self.next[cur]:
            self.last = self.next[cur][c]
            self.cnt[self.last] += 1
            return
        new = self.size
        self.size += 1
        self.len.append(self.len[cur] + 2)
        self.next.append({})
        self.cnt.append(1)
        while True:
            if cur == 0: break
            if len(self.s) - self.len[cur] - 1 >= 0 and self.s[len(self.s) - self.len[cur] - 1] == c:
                self.link.append(self.next[cur].get(c, 1))
                break
            cur = self.link[cur]
        else:
            self.link.append(1)
        self.next[cur][c] = new
        self.last = new
```

### 9.3 应用

- 不同回文子串数
- 回文出现次数

---

## 10. 经典字符串 DP 题

- LC 10 正则表达式匹配
- LC 44 通配符匹配
- LC 72 编辑距离
- LC 115 不同子序列
- LC 1143 最长公共子序列
- LC 583 两个字符串的删除操作

---

## 11. 课后 5 题

1. **LC 28** 实现 strStr()(KMP)
2. **LC 1044** 最长重复子串(后缀数组/二分哈希)
3. **LC 5** 最长回文子串(Manacher)
4. **LC 1397** 找到所有好字符串(AC 自动机)
5. **LC 727** 最小窗口子序列(SAM/DP)

---

**下一步**:`16-number-theory.md`(数论)。
