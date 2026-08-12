# 深度优先搜索(DFS)与广度优先搜索(BFS)

> 一切搜索的基础。

---

## 1. DFS 模板

### 1.1 递归

```python
def dfs(node, visited):
    if not node or node in visited: return
    visited.add(node)
    # 处理 node
    for nb in neighbors(node):
        dfs(nb, visited)
```

### 1.2 迭代

```python
def dfs_iter(start):
    stack = [start]
    visited = set()
    while stack:
        node = stack.pop()
        if node in visited: continue
        visited.add(node)
        # 处理
        for nb in neighbors(node):
            if nb not in visited:
                stack.append(nb)
```

### 1.3 路径记录

```python
def dfs_path(node, target, path, visited):
    if node == target: return path[:]
    visited.add(node)
    for nb in neighbors(node):
        if nb not in visited:
            res = dfs_path(nb, target, path + [nb], visited)
            if res: return res
    return None
```

---

## 2. BFS 模板

### 2.1 单源 BFS

```python
from collections import deque
def bfs(start):
    q = deque([start])
    visited = {start}
    dist = {start: 0}
    while q:
        node = q.popleft()
        for nb in neighbors(node):
            if nb not in visited:
                visited.add(nb)
                dist[nb] = dist[node] + 1
                q.append(nb)
```

### 2.2 多源 BFS

```python
def bfs_multi(sources):
    q = deque(sources)
    dist = {s: 0 for s in sources}
    while q:
        node = q.popleft()
        for nb in neighbors(node):
            if nb not in dist:
                dist[nb] = dist[node] + 1
                q.append(nb)
```

### 2.3 双向 BFS

起点和终点同时 BFS,在中间相遇。

---

## 3. DFS vs BFS 选型

| 维度 | DFS | BFS |
|------|-----|-----|
| 最短路 | ✗ | ✓ (无权图) |
| 空间 | O(h) | O(n) |
| 拓扑序 | 适合 | 不适合 |
| 连通性 | 适合 | 适合 |
| 找所有路径 | 适合 | ✗ |

---

## 4. DFS 经典题

### 4.1 岛屿数量(LC 200)

```python
def num_islands(grid):
    m, n = len(grid), len(grid[0])
    def dfs(i, j):
        if 0 <= i < m and 0 <= j < n and grid[i][j] == '1':
            grid[i][j] = '0'
            for di, dj in [(1,0),(-1,0),(0,1),(0,-1)]:
                dfs(i+di, j+dj)
    cnt = 0
    for i in range(m):
        for j in range(n):
            if grid[i][j] == '1':
                dfs(i, j); cnt += 1
    return cnt
```

### 4.2 单词搜索(LC 79)

### 4.3 岛屿的最大面积(LC 695)

### 4.4 被围绕的区域(LC 130)

### 4.5 太平洋大西洋水流(LC 417)

### 4.6 矩阵中的最长递增路径(LC 329)

记忆化 DFS。

---

## 5. BFS 经典题

### 5.1 二叉树的层序遍历(LC 102/107/103)

### 5.2 腐烂的橘子(LC 994)

多源 BFS。

```python
def oranges_rotting(grid):
    from collections import deque
    m, n = len(grid), len(grid[0])
    q = deque()
    fresh = 0
    for i in range(m):
        for j in range(n):
            if grid[i][j] == 2: q.append((i, j, 0))
            elif grid[i][j] == 1: fresh += 1
    res = 0
    while q:
        i, j, t = q.popleft()
        res = t
        for di, dj in [(1,0),(-1,0),(0,1),(0,-1)]:
            ni, nj = i+di, j+dj
            if 0 <= ni < m and 0 <= nj < n and grid[ni][nj] == 1:
                grid[ni][nj] = 2; fresh -= 1
                q.append((ni, nj, t+1))
    return res if fresh == 0 else -1
```

### 5.3 单词接龙(LC 127)

BFS 最短路。

### 5.4 滑动谜题(LC 773)

状态 BFS。

### 5.5 最小基因变化(LC 433)

### 5.6 公交路线(LC 815)

---

## 6. 拓扑排序

### 6.1 Kahn 算法

```python
def topo_sort(n, edges):
    from collections import deque
    indeg = [0] * n
    g = [[] for _ in range(n)]
    for u, v in edges:
        g[u].append(v); indeg[v] += 1
    q = deque([i for i in range(n) if indeg[i] == 0])
    res = []
    while q:
        u = q.popleft()
        res.append(u)
        for v in g[u]:
            indeg[v] -= 1
            if indeg[v] == 0: q.append(v)
    return res if len(res) == n else []
```

### 6.2 DFS 拓扑(后序反转)

```python
def topo_dfs(n, g):
    visited = [0]*n  # 0=未访, 1=访中, 2=完成
    res = []
    def dfs(u):
        if visited[u] == 1: return False  # 有环
        if visited[u] == 2: return True
        visited[u] = 1
        for v in g[u]:
            if not dfs(v): return False
        visited[u] = 2
        res.append(u)
        return True
    for i in range(n):
        if not dfs(i): return []
    return res[::-1]
```

---

## 7. 连通性

### 7.1 求连通分量数

BFS/DFS/DSU 均可。

### 7.2 强连通分量(Tarjan/Kosaraju)

```python
def tarjan_scc(n, g):
    index_counter = [0]
    stack = []
    low = [0] * n
    index = [0] * n
    on_stack = [False] * n
    sccs = []

    def strongconnect(v):
        index[v] = index_counter[0]
        low[v] = index_counter[0]
        index_counter[0] += 1
        stack.append(v)
        on_stack[v] = True
        for w in g[v]:
            if index[w] == 0:
                strongconnect(w)
                low[v] = min(low[v], low[w])
            elif on_stack[w]:
                low[v] = min(low[v], index[w])
        if low[v] == index[v]:
            scc = []
            while True:
                w = stack.pop()
                on_stack[w] = False
                scc.append(w)
                if w == v: break
            sccs.append(scc)

    for v in range(n):
        if index[v] == 0:
            strongconnect(v)
    return sccs
```

详见图论章节。

---

## 8. 状态空间搜索

### 8.1 隐式图 BFS(LC 752 打开转盘锁)

节点是状态,边是合法转移。

### 8.2 状态压缩 BFS(LC 864 最短访问所有钥匙)

### 8.3 A* 搜索(启发式)

```python
import heapq
def a_star(start, goal, h):
    g_score = {start: 0}
    f_score = {start: h(start)}
    open_set = [(f_score[start], start)]
    came_from = {}
    while open_set:
        _, cur = heapq.heappop(open_set)
        if cur == goal: return reconstruct(came_from, cur)
        for nb in neighbors(cur):
            tentative_g = g_score[cur] + dist(cur, nb)
            if tentative_g < g_score.get(nb, inf):
                came_from[nb] = cur
                g_score[nb] = tentative_g
                f_score[nb] = tentative_g + h(nb)
                heapq.heappush(open_set, (f_score[nb], nb))
```

---

## 9. 课后 5 题

1. **LC 200** 岛屿数量
2. **LC 994** 腐烂的橘子
3. **LC 207** 课程表
4. **LC 127** 单词接龙
5. **LC 1091** 二进制矩阵中的最短路径

---

**下一步**:`08-backtrack.md`。
