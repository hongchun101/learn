# 博弈论(Game Theory)

> LeetCode 中博弈题约 30 道。常结合 DP。

---

## 1. 基本概念

### 1.1 零和博弈

一方赢 = 另一方输。

### 1.2 必胜/必败状态

- **N-position**(Next):必胜,轮到你时能赢
- **P-position**(Previous):必败,轮到你时必输

### 1.3 性质

- 终局是 P
- 一个状态是 N 当且仅当存在后继是 P
- 一个状态是 P 当且仅当所有后继都是 N

---

## 2. SG 函数(Sprague-Grundy)

### 2.1 定义

`SG(state) = mex{SG(next)}`

mex = 最小非负整数不在集合中。

### 2.2 定理

组合游戏的 SG = 各子游戏 SG 的异或。

### 2.3 实现

```python
def sg(state, memo):
    if state in memo: return memo[state]
    s = set()
    for nxt in next_states(state):
        s.add(sg(nxt, memo))
    g = 0
    while g in s: g += 1
    memo[state] = g
    return g
```

---

## 3. 经典博弈题

### 3.1 LC 292 Nim 游戏

```python
def can_win_nim(n):
    return n % 4 != 0
```

### 3.2 LC 294 翻转游戏 II

```python
def can_win(s):
    memo = {}
    def dfs(state):
        if state in memo: return memo[state]
        for i in range(len(state) - 1):
            if state[i:i+2] == '++':
                nxt = state[:i] + '--' + state[i+2:]
                if not dfs(nxt):
                    memo[state] = True
                    return True
        memo[state] = False
        return False
    return dfs(s)
```

### 3.3 LC 486 预测赢家

```python
def predict_winner(nums):
    n = len(nums)
    dp = [[0]*n for _ in range(n)]
    for i in range(n): dp[i][i] = nums[i]
    for i in range(n-2, -1, -1):
        for j in range(i+1, n):
            dp[i][j] = max(nums[i] - dp[i+1][j], nums[j] - dp[i][j-1])
    return dp[0][n-1] >= 0
```

### 3.4 LC 877 石子游戏

```python
def stone_game(piles):
    n = len(piles)
    dp = [[0]*n for _ in range(n)]
    for i in range(n): dp[i][i] = piles[i]
    for i in range(n-2, -1, -1):
        for j in range(i+1, n):
            dp[i][j] = max(piles[i] - dp[i+1][j], piles[j] - dp[i][j-1])
    return dp[0][n-1] > 0
```

### 3.5 LC 1140 石子游戏 II

```python
def stone_game_ii(piles):
    n = len(piles)
    from functools import lru_cache
    @lru_cache(None)
    def dfs(i, m):
        if i + 2*m >= n: return sum(piles[i:])
        res = float('-inf')
        for x in range(1, 2*m+1):
            res = max(res, sum(piles[i:i+x]) - dfs(i+x, max(m, x)))
        return res
    total = sum(piles)
    diff = dfs(0, 1)
    return (total + diff) // 2
```

### 3.6 LC 1406 石子游戏 III

### 3.7 LC 1510 石子游戏 IV

---

## 4. 极大极小搜索

```python
def minimax(state, depth, is_max):
    if depth == 0 or is_terminal(state):
        return evaluate(state)
    if is_max:
        best = -inf
        for move in moves(state):
            best = max(best, minimax(apply(state, move), depth-1, False))
        return best
    else:
        best = inf
        for move in moves(state):
            best = min(best, minimax(apply(state, move), depth-1, True))
        return best
```

### 4.1 Alpha-Beta 剪枝

```python
def alpha_beta(state, depth, alpha, beta, is_max):
    if depth == 0 or is_terminal(state):
        return evaluate(state)
    if is_max:
        for move in moves(state):
            alpha = max(alpha, alpha_beta(apply(state, move), depth-1, alpha, beta, False))
            if alpha >= beta: break
        return alpha
    else:
        for move in moves(state):
            beta = min(beta, alpha_beta(apply(state, move), depth-1, alpha, beta, True))
            if alpha >= beta: break
        return beta
```

---

## 5. LC 913 猫和老鼠

```python
def cat_mouse_game(graph):
    from collections import deque
    n = len(graph)
    # state: (cat, mouse, turn)
    # 0=未知,1=鼠赢,2=猫赢
    degree = [[[0]*n for _ in range(n)] for _ in range(2)]
    result = [[[0]*n for _ in range(n)] for _ in range(2)]
    for cat in range(n):
        for mouse in range(n):
            degree[0][cat][mouse] = len(graph[mouse])
            degree[1][cat][mouse] = len(graph[cat])
    q = deque()
    for cat in range(1, n):
        for turn in range(2):
            result[turn][cat][0] = 2
            q.append((cat, 0, turn))
    for mouse in range(1, n):
        for turn in range(2):
            result[turn][0][mouse] = 1
            q.append((0, mouse, turn))
    while q:
        cat, mouse, turn = q.popleft()
        if cat == mouse and mouse != 0:
            result[turn][cat][mouse] = 2
        if mouse == 0:
            result[turn][cat][mouse] = 1
        # ... 处理后续
```

详见 LC 913。

---

## 6. 阶梯博弈

特殊 Nim:每次移动限制。

```python
def staircase_nim(stones):
    xor = 0
    n = len(stones)
    # 只看奇数位
    for i in range(n-1, -1, -2):
        xor ^= stones[i]
    return xor != 0
```

---

## 7. 不平等博弈

先手优势不一定决定胜负。

LC 810 黑板异或游戏:

```python
def xor_game(nums):
    xor = 0
    for x in nums: xor ^= x
    if xor == 0: return True  # Alice 必败
    return len(nums) % 2 == 0  # 偶数个,Alice 必胜
```

---

## 8. 概率博弈

LC 464 我能赢吗(状压):

```python
def can_i_win(max_choosable, desired_total):
    if desired_total <= max_choosable: return True
    if sum(range(1, max_choosable+1)) < desired_total: return False
    @lru_cache(None)
    def dfs(state, cur):
        for i in range(max_choosable):
            if state >> i & 1 == 0:
                if i + 1 + cur >= desired_total: return True
                if not dfs(state | (1 << i), cur + i + 1):
                    return True
        return False
    return dfs(0, 0)
```

---

## 9. 课后 5 题

1. **LC 292** Nim 游戏
2. **LC 486** 预测赢家
3. **LC 877** 石子游戏
4. **LC 294** 翻转游戏 II
5. **LC 464** 我能赢吗

---

**下一步**:`20-geometry.md`(计算几何)。
