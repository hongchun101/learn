# 字典树 Trie

> 前缀匹配的王者。O(|s|) 查询,空间 O(总字符数)。

---

## 1. 原理

```
插入 "abc", "abd", "bcd"
        root
       /    \
      a      b
      |      |
      b      c
     / \      \
    c   d      d
```

每个节点有 `children[26]`(字母表大小)和 `is_end`。

---

## 2. 实现

### 2.1 数组版(26 子节点)

```python
class Trie:
    def __init__(self):
        self.children = [None] * 26
        self.is_end = False

    def insert(self, word):
        node = self
        for c in word:
            idx = ord(c) - ord('a')
            if not node.children[idx]:
                node.children[idx] = Trie()
            node = node.children[idx]
        node.is_end = True

    def search(self, word):
        node = self._find(word)
        return node is not None and node.is_end

    def starts_with(self, prefix):
        return self._find(prefix) is not None

    def _find(self, s):
        node = self
        for c in s:
            idx = ord(c) - ord('a')
            if not node.children[idx]: return None
            node = node.children[idx]
        return node
```

### 2.2 哈希版(节省空间)

```python
class Trie:
    def __init__(self):
        self.children = {}
        self.is_end = False
    # ... 其余同上,children 改为 dict
```

---

## 3. 复杂度分析

| 操作 | 时间 | 空间 |
|------|------|------|
| insert | O(L) | O(L) |
| search | O(L) | - |
| starts_with | O(L) | - |

L = 字符串长度。空间 O(总字符数)。

---

## 4. 经典应用

### 4.1 实现前缀搜索(LC 208)

### 4.2 单词搜索 II(LC 212)

Trie + 回溯:

```python
def find_words(board, words):
    trie = Trie()
    for w in words: trie.insert(w)
    m, n = len(board), len(board[0])
    res = set()
    def dfs(i, j, node, path):
        c = board[i][j]
        if c not in node.children: return
        nxt = node.children[c]
        path += c
        if nxt.is_end: res.add(path)
        board[i][j] = '#'
        for di, dj in [(1,0),(-1,0),(0,1),(0,-1)]:
            ni, nj = i+di, j+dj
            if 0 <= ni < m and 0 <= nj < n and board[ni][nj] != '#':
                dfs(ni, nj, nxt, path)
        board[i][j] = c
    for i in range(m):
        for j in range(n):
            dfs(i, j, trie, "")
    return list(res)
```

### 4.3 添加与搜索单词(LC 211)

支持 `.` 通配符。

### 4.4 词搜索(LC 79)

不用 Trie 也能做,但大集合下 Trie 剪枝。

---

## 5. 进阶:Trie 的变体

### 5.1 压缩 Trie

合并单链节点:

```
abc → [a-b-c]
```

### 5.2 后缀 Trie

把每个后缀插入,做后缀匹配。

### 5.3 01-Trie(异或应用,LC 421)

```python
class BitTrie:
    def __init__(self):
        self.children = [None, None]
    def insert(self, x):
        node = self
        for k in range(31, -1, -1):
            b = (x >> k) & 1
            if not node.children[b]:
                node.children[b] = BitTrie()
            node = node.children[b]
    def max_xor(self, x):
        node = self
        res = 0
        for k in range(31, -1, -1):
            b = (x >> k) & 1
            if node.children[1-b]:
                res |= (1 << k)
                node = node.children[1-b]
            else:
                node = node.children[b]
        return res

def find_maximum_xor(nums):
    if len(nums) < 2: return 0
    trie = BitTrie()
    trie.insert(nums[0])
    res = 0
    for x in nums[1:]:
        res = max(res, trie.max_xor(x))
        trie.insert(x)
    return res
```

### 5.4 AC 自动机(见 algorithm/15-string.md)

### 5.5 可持久化 Trie

每次插入返回新根,见"主席树"。

---

## 6. Trie 的空间优化

### 6.1 静态数组池

```cpp
int trie[MAXN][26];  // 共享大数组
int tot = 1;
void insert(const string& s) {
    int p = 1;
    for (char c : s) {
        int k = c - 'a';
        if (!trie[p][k]) trie[p][k] = ++tot;
        p = trie[p][k];
    }
}
```

### 6.2 双数组 Trie(DAT)

`base` 和 `check` 两个数组实现 O(L) 查询。

### 6.3 字母表压缩

只在实际用到的字符间建边。

---

## 7. Trie vs 哈希表

| 维度 | Trie | 哈希 |
|------|------|------|
| 前缀查询 | O(L) 极快 | O(n·L) |
| 精确查询 | O(L) | O(1) |
| 空间 | 大 | 小 |
| 实现 | 复杂 | 简单 |

**选型**:需要前缀 → Trie;只需精确查找 → 哈希。

---

## 8. 课后 5 题

1. **LC 208** 实现 Trie
2. **LC 212** 单词搜索 II
3. **LC 421** 数组中两个数的最大异或值
4. **LC 677** 键值映射
5. **LC 1707** 与数组中元素的最大异或值(离线 + 01-Trie)

---

**下一步**:`08-union-find.md`。
