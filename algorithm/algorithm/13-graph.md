# 图论(Graph Theory)

> LeetCode 上图论题约 200+ 道,从基础到高级。

---

## 1. 图的表示

### 1.1 邻接表

```python
g = defaultdict(list)
g[u].append(v)  # u → v
g[v].append(u)  # 无向
```

### 1.2 邻接矩阵

```python
g = [[inf]*n for _ in range(n)]
g[u][v] = w
```

### 1.3 边列表

```python
edges = [(u, v, w), ...]
```

---

## 2. 最短路

### 2.1 Dijkstra(非负权,单源最短路)

```python
import heapq
def dijkstra(g, start, n):
    INF = float('inf')
    dist = [INF] * n
    dist[start] = 0
    pq = [(0, start)]
    while pq:
        d, u = heapq.heappop(pq)
        if d > dist[u]: continue
        for v, w in g[u]:
            nd = d + w
            if nd < dist[v]:
                dist[v] = nd
                heapq.heappush(pq, (nd, v))
    return dist
```

O((n+m) log n)。

### 2.2 Bellman-Ford(可负权)

```python
def bellman_ford(edges, n, start):
    INF = float('inf')
    dist = [INF] * n
    dist[start] = 0
    for _ in range(n - 1):
        for u, v, w in edges:
            if dist[u] + w < dist[v]:
                dist[v] = dist[u] + w
    # 检测负环
    for u, v, w in edges:
        if dist[u] + w < dist[v]:
            return None  # 有负环
    return dist
```

O(nm)。

### 2.3 SPFA

BFS 优化版 Bellman-Ford,平均较快,最坏 O(nm)。

```python
def spfa(g, start, n):
    INF = float('inf')
    dist = [INF] * n
    dist[start] = 0
    in_queue = [False] * n
    cnt = [0] * n
    from collections import deque
    q = deque([start])
    in_queue[start] = True
    while q:
        u = q.popleft()
        in_queue[u] = False
        for v, w in g[u]:
            if dist[u] + w < dist[v]:
                dist[v] = dist[u] + w
                if not in_queue[v]:
                    q.append(v); in_queue[v] = True
                    cnt[v] += 1
                    if cnt[v] > n: return None  # 负环
    return dist
```

### 2.4 Floyd(全源最短路)

```python
def floyd(g, n):
    INF = float('inf')
    for k in range(n):
        for i in range(n):
            for j in range(n):
                if g[i][k] + g[k][j] < g[i][j]:
                    g[i][j] = g[i][k] + g[k][j]
    return g
```

O(n³)。

### 2.5 Johnson(全源 + 稀疏图,负权)

Dijkstra + 虚拟源。

---

## 3. 最小生成树(MST)

### 3.1 Kruskal(稀疏图)

```python
def kruskal(n, edges):
    from data_structure.union_find import DSU
    dsu = DSU(n)
    edges.sort(key=lambda x: x[2])
    mst = []
    total = 0
    for u, v, w in edges:
        if dsu.union(u, v):
            mst.append((u, v, w))
            total += w
            if len(mst) == n - 1: break
    return total, mst
```

O(m log m)。

### 3.2 Prim(稠密图)

```python
def prim(g, n):
    INF = float('inf')
    in_mst = [False] * n
    dist = [INF] * n
    dist[0] = 0
    total = 0
    for _ in range(n):
        u = min(range(n), key=lambda x: (in_mst[x], dist[x]))
        in_mst[u] = True
        total += dist[u]
        for v, w in g[u]:
            if not in_mst[v] and w < dist[v]:
                dist[v] = w
    return total
```

O(n²),堆优化 O(m log n)。

---

## 4. 拓扑排序

见 `algorithm/07-dfs-bfs.md`。

### 4.1 LC 269 火星词典

```python
def alien_order(words):
    g = defaultdict(set)
    in_deg = Counter()
    for w in words:
        for c in w: in_deg[c] = 0
    for i in range(len(words) - 1):
        a, b = words[i], words[i+1]
        for j in range(min(len(a), len(b))):
            if a[j] != b[j]:
                if b[j] not in g[a[j]]:
                    g[a[j]].add(b[j]); in_deg[b[j]] += 1
                break
        else:
            if len(a) > len(b): return ''
    # 拓扑排序
    from collections import deque
    q = deque([c for c in in_deg if in_deg[c] == 0])
    res = []
    while q:
        c = q.popleft()
        res.append(c)
        for nb in g[c]:
            in_deg[nb] -= 1
            if in_deg[nb] == 0: q.append(nb)
    return ''.join(res) if len(res) == len(in_deg) else ''
```

---

## 5. 强连通分量(SCC)

### 5.1 Kosaraju

```python
def kosaraju(g, n):
    visited = [False]*n
    order = []
    def dfs1(u):
        if visited[u]: return
        visited[u] = True
        for v in g[u]: dfs1(v)
        order.append(u)
    for i in range(n): dfs1(i)
    # 反图
    rg = [[] for _ in range(n)]
    for u in range(n):
        for v in g[u]: rg[v].append(u)
    visited = [False]*n
    sccs = []
    def dfs2(u, comp):
        visited[u] = True; comp.append(u)
        for v in rg[u]: 
            if not visited[v]: dfs2(v, comp)
    for u in reversed(order):
        if not visited[u]:
            comp = []
            dfs2(u, comp); sccs.append(comp)
    return sccs
```

### 5.2 Tarjan

见 `algorithm/07-dfs-bfs.md`。

### 5.3 应用:缩点成 DAG

SCC 缩点后,得到 DAG,可以做后续 DP。

---

## 6. 桥与割点

### 6.1 Tarjan 求桥

```python
def bridges(n, edges):
    g = [[] for _ in range(n)]
    for u, v in edges:
        g[u].append((v, len(edges)))  # 不一定需要存边 ID
        g[v].append((u, len(edges)))
    disc = [-1]*n; low = [0]*n; res = []
    time = 0
    def dfs(u, parent_edge):
        nonlocal time
        disc[u] = low[u] = time; time += 1
        for v, eid in g[u]:
            if disc[v] == -1:
                dfs(v, eid)
                low[u] = min(low[u], low[v])
                if low[v] > disc[u]:
                    res.append((u, v))
            elif eid != parent_edge:
                low[u] = min(low[u], disc[v])
    for i in range(n):
        if disc[i] == -1: dfs(i, -1)
    return res
```

### 6.2 LC 1192 查找集群内的关键连接

### 6.3 割点

```python
# 如果 u 不是根,low[v] >= disc[u],则 u 是割点
```

---

## 7. 二分图

### 7.1 染色判定

```python
def is_bipartite(g, n):
    color = [-1]*n
    for i in range(n):
        if color[i] == -1:
            color[i] = 0
            stack = [i]
            while stack:
                u = stack.pop()
                for v in g[u]:
                    if color[v] == -1:
                        color[v] = 1 - color[u]
                        stack.append(v)
                    elif color[v] == color[u]:
                        return False
    return True
```

### 7.2 二分图最大匹配(HK 算法或网络流)

详见网络流章节。

### 7.3 LC 886 可能的二分法

---

## 8. LCA(最近公共祖先)

### 8.1 倍增法

```python
class LCA:
    def __init__(self, g, root, n):
        self.LOG = n.bit_length()
        self.up = [[-1]*n for _ in range(self.LOG)]
        self.depth = [0]*n
        self._dfs(root, -1)
        for j in range(1, self.LOG):
            for i in range(n):
                if self.up[j-1][i] != -1:
                    self.up[j][i] = self.up[j-1][self.up[j-1][i]]

    def _dfs(self, u, p):
        self.up[0][u] = p
        for v in self.g[u]:
            if v != p:
                self.depth[v] = self.depth[u] + 1
                self._dfs(v, u)

    def lca(self, u, v):
        if self.depth[u] < self.depth[v]: u, v = v, u
        # u 提到 v 深度
        diff = self.depth[u] - self.depth[v]
        for k in range(self.LOG):
            if diff >> k & 1:
                u = self.up[k][u]
        if u == v: return u
        for k in range(self.LOG - 1, -1, -1):
            if self.up[k][u] != self.up[k][v]:
                u = self.up[k][u]
                v = self.up[k][v]
        return self.up[0][u]
```

### 8.2 Tarjan 离线(DFS + DSU)

```python
def tarjan_lca(g, n, queries, root):
    parent = list(range(n))
    visited = [False]*n
    ans = {}
    ancestor = list(range(n))
    def find(u):
        while parent[u] != u:
            parent[u] = parent[parent[u]]  # 路径压缩
            u = parent[u]
        return u
    def union(u, v):
        u = find(u); v = find(v)
        parent[u] = v
    def dfs(u):
        visited[u] = True
        ancestor[u] = u
        for v in g[u]:
            if not visited[v]:
                dfs(v)
                union(u, v)
                ancestor[find(u)] = u
        for v, idx in queries.get(u, []):
            if visited[v]:
                ans[idx] = ancestor[find(v)]
    dfs(root)
    return ans
```

### 8.3 LC 1483 树节点的第 K 个祖先(动态树预处理)

---

## 9. 欧拉回路

```python
def euler_path(g, n):
    from collections import Counter
    in_deg = Counter()
    for u in range(n):
        for v in g[u]: in_deg[v] += 1
    start = next((u for u in range(n) if len(g[u]) > in_deg[u] + (1 if u in [v for v in g[u]] else 0)), 0)
    # Hierholzer
    stack = [start]; path = []
    g_copy = [list(adj) for adj in g]
    g_idx = [0]*n
    while stack:
        u = stack[-1]
        if g_idx[u] < len(g_copy[u]):
            v = g_copy[u][g_idx[u]]; g_idx[u] += 1
            stack.append(v)
        else:
            path.append(stack.pop())
    return path[::-1]
```

---

## 10. 2-SAT

```python
def two_sat(n, clauses):
    # clause: (a, b),a 和 b 是字面量,正数表示真,负数表示假
    # 例如: clauses = [(1, 2), (-1, -2)] 表示 x1 ∨ x2 和 ¬x1 ∨ ¬x2
    g = [[] for _ in range(2*n)]
    rg = [[] for _ in range(2*n)]
    def add(u, v):  # u → v
        g[u].append(v); rg[v].append(u)
    def var(lit):  # 字面量 → 节点
        if lit > 0: return 2*(lit-1)
        else: return 2*(-lit-1) + 1
    def neg(node): return node ^ 1
    for a, b in clauses:
        add(neg(var(a)), var(b))
        add(neg(var(b)), var(a))
    # SCC
    order = []; visited = [False]*(2*n)
    def dfs1(u):
        if visited[u]: return
        visited[u] = True
        for v in g[u]: dfs1(v)
        order.append(u)
    for i in range(2*n): dfs1(i)
    comp = [-1]*(2*n); k = 0
    def dfs2(u, k):
        comp[u] = k
        for v in rg[u]:
            if comp[v] == -1: dfs2(v, k)
    for u in reversed(order):
        if comp[u] == -1: dfs2(u, k); k += 1
    res = [False]*n
    for i in range(n):
        if comp[2*i] == comp[2*i+1]: return None
        res[i] = comp[2*i] > comp[2*i+1]
    return res
```

---

## 11. 课后 5 题

1. **LC 743** 网络延迟时间(Dijkstra)
2. **LC 1584** 连接所有点的最小费用(Kruskal)
3. **LC 269** 火星词典(拓扑)
4. **LC 1192** 查找集群内的关键连接(桥)
5. **LC 1483** 树节点的第 K 个祖先(LCA/倍增)

---

**下一步**:`14-network-flow.md`。
