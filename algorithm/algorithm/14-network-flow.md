# 网络流(Network Flow)

> 一类特殊的图论问题。LeetCode 直接考得少,但思想广泛用于建模。

---

## 1. 最大流基础

### 1.1 Ford-Fulkerson

```python
def ford_fulkerson(g, s, t):
    flow = 0
    while True:
        path = find_path(g, s, t)
        if not path: break
        m = min(g[u][v] for u, v in path)
        for u, v in path:
            g[u][v] -= m
            g[v][u] += m
        flow += m
    return flow
```

复杂度 O(E·max_flow)。

### 1.2 Edmonds-Karp(BFS 增广)

```python
from collections import deque
def bfs_path(g, s, t, parent):
    visited = {s}
    q = deque([s])
    while q:
        u = q.popleft()
        for v in range(len(g)):
            if v not in visited and g[u][v] > 0:
                visited.add(v); parent[v] = u
                if v == t: return True
                q.append(v)
    return False

def edmonds_karp(capacity, s, t):
    n = len(capacity)
    g = [row[:] for row in capacity]
    parent = [-1]*n
    flow = 0
    while bfs_path(g, s, t, parent):
        m = float('inf')
        v = t
        while v != s:
            u = parent[v]
            m = min(m, g[u][v])
            v = u
        v = t
        while v != s:
            u = parent[v]
            g[u][v] -= m
            g[v][u] += m
            v = u
        flow += m
    return flow
```

O(V·E²)。

### 1.3 Dinic(主流,快)

```python
from collections import deque
class Dinic:
    def __init__(self, n):
        self.n = n
        self.g = [[] for _ in range(n)]

    def add_edge(self, u, v, c):
        self.g[u].append([v, c, len(self.g[v])])
        self.g[v].append([u, 0, len(self.g[u]) - 1])

    def bfs(self, s, t, level):
        level[:] = [-1] * self.n
        level[s] = 0
        q = deque([s])
        while q:
            u = q.popleft()
            for e in self.g[u]:
                if e[1] > 0 and level[e[0]] < 0:
                    level[e[0]] = level[u] + 1
                    q.append(e[0])

    def dfs(self, u, t, f, level, it):
        if u == t: return f
        for i in range(it[u], len(self.g[u])):
            it[u] = i
            e = self.g[u][i]
            if e[1] > 0 and level[u] + 1 == level[e[0]]:
                ret = self.dfs(e[0], t, min(f, e[1]), level, it)
                if ret > 0:
                    e[1] -= ret
                    self.g[e[0]][e[2]][1] += ret
                    return ret
        return 0

    def max_flow(self, s, t):
        flow = 0
        level = [-1] * self.n
        while True:
            self.bfs(s, t, level)
            if level[t] < 0: break
            it = [0] * self.n
            while True:
                f = self.dfs(s, t, float('inf'), level, it)
                if f == 0: break
                flow += f
        return flow
```

O(E·√V)(单位容量) 或 O(V²·E)(一般)。

### 1.4 ISAP

类似 Dinic,常数更小。

---

## 2. 最小割

**最大流最小割定理**:最大流 = 最小割。

```python
def min_cut(g, s, t):
    flow = max_flow(g, s, t)
    # 从 s 出发可达的节点是 S 集
    return flow, get_reachable(g, s)
```

---

## 3. 费用流

每条边有费用,求最小费用最大流。

```python
def min_cost_flow(g, s, t, maxf):
    n = len(g)
    INF = float('inf')
    res = 0
    h = [0] * n  # 势
    prevv = [0] * n
    preve = [0] * n
    flow = 0
    while flow < maxf:
        dist = [INF] * n
        dist[s] = 0
        # 优先队列
        import heapq
        pq = [(0, s)]
        while pq:
            d, v = heapq.heappop(pq)
            if dist[v] < d: continue
            for i, e in enumerate(g[v]):
                if e[1] > 0 and dist[e[0]] > dist[v] + e[2] + h[v] - h[e[0]]:
                    dist[e[0]] = dist[v] + e[2] + h[v] - h[e[0]]
                    prevv[e[0]] = v
                    preve[e[0]] = i
                    heapq.heappush(pq, (dist[e[0]], e[0]))
        if dist[t] == INF: return -1
        for v in range(n):
            h[v] += dist[v] if dist[v] < INF else 0
        d = maxf - flow
        v = t
        while v != s:
            d = min(d, g[prevv[v]][preve[v]][1])
            v = prevv[v]
        flow += d
        res += d * h[t]
        v = t
        while v != s:
            e = g[prevv[v]][preve[v]]
            e[1] -= d
            g[v][e[3]][1] += d
            v = prevv[v]
    return res
```

---

## 4. 二分图匹配

### 4.1 最大匹配(HK / Dinic)

```python
def max_bipartite_matching(g, n_left, n_right):
    # g[u] 是 u 左侧连到的右侧节点列表
    dinic = Dinic(n_left + n_right + 2)
    S = n_left + n_right; T = n_left + n_right + 1
    for u in range(n_left):
        dinic.add_edge(S, u, 1)
    for u in range(n_left):
        for v in g[u]:
            dinic.add_edge(u, n_left + v, 1)
    for v in range(n_right):
        dinic.add_edge(n_left + v, T, 1)
    return dinic.max_flow(S, T)
```

### 4.2 LC 1349 参加考试的最大学生数(状压 + 匹配)

---

## 5. 经典网络流建模

### 5.1 二分图最大匹配 → 任务分配

### 5.2 最小路径覆盖(用最大匹配)

有向无环图 G,最小路径覆盖 = n - 最大匹配。

构造:把 G 每个点拆成左/右,边 u→v 加边 L_u → R_v,跑最大匹配。

### 5.3 最大权闭合子图(选子集收益最大)

源点连正权点(容量 = 权),负权点连汇点(容量 = -权),原图无边限 inf。
最大权 = 正权和 - 最小割。

### 5.4 最小割的常见应用

- LC 1349 考试座位(状态压缩 + 最大匹配)
- 任务分配
- 选课问题

### 5.5 有上下界的网络流

见进阶章节,需添加超级源汇。

---

## 6. 网络流在 LeetCode 的应用

### 6.1 直接考的题

- LC 1349 参加考试的最大学生数
- LC 1514 概率最大的路径(用最大概率路径,非传统流)

### 6.2 思想间接应用

- 二分图匹配:任务分配、连通性
- 最小割:二分判定

---

## 7. 课后 5 题

1. **LC 1349** 参加考试的最大学生数
2. **LC 1514** 概率最大的路径
3. 实现 Dinic 最大流
4. 实现费用流
5. **LC 1135** 最低成本联通所有城市(Kruskal)

---

**下一步**:`15-string.md`(字符串算法)。
