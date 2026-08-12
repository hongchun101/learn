# 回溯(Backtracking)

> DFS + 剪枝。LeetCode 高频题源。

---

## 1. 通用模板

```python
def backtrack(path, choices):
    if is_solution(path):
        res.append(path[:])
        return
    for choice in choices:
        if not is_valid(choice, path): continue
        path.append(choice)
        backtrack(path, remaining_choices(choice))
        path.pop()
```

三要素:**路径 / 选择列表 / 结束条件**。

---

## 2. 排列(LC 46/47)

```python
def permute(nums):
    res, path, used = [], [], [False]*len(nums)
    def dfs():
        if len(path) == len(nums):
            res.append(path[:]); return
        for i in range(len(nums)):
            if used[i]: continue
            used[i] = True
            path.append(nums[i])
            dfs()
            path.pop()
            used[i] = False
    dfs()
    return res

# 去重(LC 47)
def permute_unique(nums):
    nums.sort()
    res, path = [], []
    used = [False] * len(nums)
    def dfs():
        if len(path) == len(nums):
            res.append(path[:]); return
        for i in range(len(nums)):
            if used[i]: continue
            if i > 0 and nums[i] == nums[i-1] and not used[i-1]: continue
            used[i] = True
            path.append(nums[i])
            dfs()
            path.pop()
            used[i] = False
    dfs()
    return res
```

---

## 3. 组合(LC 77/39/40/216)

### 3.1 组合(无重复)

```python
def combine(n, k):
    res, path = [], []
    def dfs(start):
        if len(path) == k:
            res.append(path[:]); return
        for i in range(start, n+1):
            path.append(i)
            dfs(i+1)
            path.pop()
    dfs(1)
    return res
```

### 3.2 剪枝

如果剩余不够,提前结束:

```python
for i in range(start, n - (k - len(path)) + 2):
    path.append(i)
    dfs(i+1)
    path.pop()
```

### 3.3 组合总和(可重复,LC 39)

```python
def combination_sum(candidates, target):
    res, path = [], []
    candidates.sort()
    def dfs(start, remain):
        if remain == 0:
            res.append(path[:]); return
        for i in range(start, len(candidates)):
            if candidates[i] > remain: break
            path.append(candidates[i])
            dfs(i, remain - candidates[i])
            path.pop()
    dfs(0, target)
    return res
```

### 3.4 组合总和 II(不重复,LC 40)

去重:`if i > start and candidates[i] == candidates[i-1]: continue`。

### 3.5 组合总和 III(LC 216,1-9 k个数)

---

## 4. 子集(LC 78/90)

```python
def subsets(nums):
    res, path = [], []
    def dfs(start):
        res.append(path[:])
        for i in range(start, len(nums)):
            path.append(nums[i])
            dfs(i+1)
            path.pop()
    dfs(0)
    return res
```

去重:排序 + `if i > start and nums[i] == nums[i-1]: continue`。

---

## 5. 分割回文串(LC 131/132)

```python
def partition(s):
    res, path = [], []
    n = len(s)
    def is_pal(l, r):
        while l < r:
            if s[l] != s[r]: return False
            l += 1; r -= 1
        return True
    def dfs(start):
        if start == n:
            res.append(path[:]); return
        for i in range(start, n):
            if is_pal(start, i):
                path.append(s[start:i+1])
                dfs(i+1)
                path.pop()
    dfs(0)
    return res
```

LC 132 用 DP 预处理 + 回溯,O(n²)。

---

## 6. 棋盘类

### 6.1 N 皇后(LC 51)

```python
def solve_n_queens(n):
    res = []
    path = [-1] * n  # path[i] = 第 i 行皇后在 path[i] 列

    def dfs(row):
        if row == n:
            res.append(['.'*c + 'Q' + '.'*(n-c-1) for c in path])
            return
        for col in range(n):
            ok = True
            for i in range(row):
                if path[i] == col or abs(path[i] - col) == row - i:
                    ok = False; break
            if ok:
                path[row] = col
                dfs(row+1)
                path[row] = -1

    dfs(0)
    return res
```

优化:用三个 boolean 数组记录列/主对角/副对角。

### 6.2 解数独(LC 37)

行/列/九宫各一个 set,递归填空格。

### 6.3 单词搜索 II(LC 212)

见 `data-structure/07-trie.md`。

---

## 7. 括号生成(LC 22)

```python
def generate_parenthesis(n):
    res, path = [], []
    def dfs(left, right):
        if len(path) == 2 * n:
            res.append(''.join(path)); return
        if left < n:
            path.append('('); dfs(left+1, right); path.pop()
        if right < left:
            path.append(')'); dfs(left, right+1); path.pop()
    dfs(0, 0)
    return res
```

---

## 8. 全排列 / 组合的变体

### 8.1 优美的排列(LC 526)

```python
def count_arrangement(n):
    self.res = 0
    used = [False] * (n+1)
    def dfs(pos):
        if pos > n:
            self.res += 1; return
        for i in range(1, n+1):
            if not used[i] and (i % pos == 0 or pos % i == 0):
                used[i] = True
                dfs(pos+1)
                used[i] = False
    dfs(1)
    return self.res
```

### 8.2 二进制手表(LC 401)

---

## 9. 6 种剪枝技巧

1. **可行性剪枝**:剩余能否凑够
2. **最优性剪枝**:已经不可能更优
3. **重复剪枝**:排序后跳过相同
4. **顺序剪枝**:调整循环顺序
5. **记忆化**:用 hash 缓存子状态
6. **预处理**:把合法性判断提前算好

### 9.1 例:最优性剪枝(LC 47)

```python
if len(path) > best_len: continue
```

### 9.2 例:可行性剪枝(LC 39)

```python
if candidates[i] > remain: break  # 排序后
```

---

## 10. 回溯的复杂度优化

| 优化 | 适用 |
|------|------|
| 排序 | 去重 |
| 预处理 is_valid | 子集/分割 |
| 选择树剪枝 | 排列/组合 |
| 状态压缩 | 子集问题 |
| 记忆化 | 重叠子问题 |

---

## 11. 回溯 vs 枚举

- 枚举:列出所有组合(子集 2^n)
- 回溯:在枚举上加约束

---

## 12. 课后 5 题

1. **LC 46** 全排列
2. **LC 78** 子集
3. **LC 39** 组合总和
4. **LC 51** N 皇后
5. **LC 22** 括号生成

---

**下一步**:`09-greedy.md`。
