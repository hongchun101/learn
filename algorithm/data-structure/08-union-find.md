# 并查集(Union-Find / DSU)

> 几乎所有"动态连通性"问题的银弹。LeetCode 高频题源。

---

## 1. 原理

维护若干不相交集合,支持:
- `find(x)`:返回 x 所在集合的代表
- `union(x, y)`:合并两个集合

---

## 2. 实现

### 2.1 朴素(树高度可能 O(n))

```python
class DSU:
    def __init__(self, n):
        self.par = list(range(n))
        self.rank = [0] * n
    def find(self, x):
        while self.par[x] != x:
            x = self.par[x]
        return x
    def union(self, x, y):
        rx, ry = self.find(x), self.find(y)
        if rx == ry: return False
        if self.rank[rx] < self.rank[ry]: rx, ry = ry, rx
        self.par[ry] = rx
        if self.rank[rx] == self.rank[ry]:
            self.rank[rx] += 1
        return True
```

### 2.2 路径压缩

```python
def find(self, x):
    if self.par[x] != x:
        self.par[x] = self.find(self.par[x])
    return self.par[x]
```

### 2.3 按秩合并 + 路径压缩

均摊 O(α(n)),几乎 O(1)。

---

## 3. 带权并查集

每个节点存到根的"距离",用于:

- 食物链(LC 170)
- 等式方程可满足性(LC 990)

```python
class WeightedDSU:
    def __init__(self, n):
        self.par = list(range(n))
        self.dist = [0] * n  # 到根的距离
    def find(self, x):
        if self.par[x] != x:
            r = self.find(self.par[x])
            self.dist[x] += self.dist[self.par[x]]
            self.par[x] = r
        return self.par[x]
    def union(self, x, y, w):
        # dist[x] + w = dist[y]
        rx, ry = self.find(x), self.find(y)
        if rx == ry: return
        self.par[rx] = ry
        self.dist[rx] = self.dist[y] - self.dist[x] - w
```

---

## 4. 经典应用

### 4.1 朋友圈(LC 547)

省份数量 = 集合数。

### 4.2 冗余连接(LC 684)

加入边时若两端已连通,该边冗余。

### 4.3 账户合并(LC 721)

按邮箱分组。

### 4.4 等式方程可满足性(LC 990)

先 union 所有 `==`,再检查 `!=`。

### 4.5 岛屿数量(LC 200)

用 DSU 而非 DFS:

```python
def num_islands(grid):
    if not grid: return 0
    m, n = len(grid), len(grid[0])
    dsu = DSU(m*n)
    cnt = 0
    for i in range(m):
        for j in range(n):
            if grid[i][j] == '1': cnt += 1
    for i in range(m):
        for j in range(n):
            if grid[i][j] == '1':
                for di, dj in [(1,0),(0,1)]:
                    ni, nj = i+di, j+dj
                    if 0 <= ni < m and 0 <= nj < n and grid[ni][nj] == '1':
                        if dsu.union(i*n+j, ni*n+nj): cnt -= 1
    return cnt
```

### 4.6 由斜杠划分区域(LC 959)

把每个 1x1 格子拆成 4 三角形。

### 4.7 水流问题(LC 778,优先级 + DSU)

并查集 + 按高度排序:从最低的格子开始"激活",太平洋/大西洋都能到达即答案。

### 4.8 交换字符串中的元素(LC 1202)

并查集 + 排序。

### 4.9 移除最多的同行或同列石头(LC 947)

能消掉多少石头?集合数 - 1。

---

## 5. DSU 的优化技巧

### 5.1 按大小合并

```python
if self.sz[rx] < self.sz[ry]: rx, ry = ry, rx
self.par[ry] = rx
self.sz[rx] += self.sz[ry]
```

### 5.2 路径压缩(递归版)

见上,推荐。

### 5.3 路径分裂 / 路径减半

```python
# 路径减半:find 过程中把父节点的父赋给自己
def find(self, x):
    while self.par[x] != x:
        self.par[x] = self.par[self.par[x]]
        x = self.par[x]
    return x
```

### 5.4 离线构造(预合并)

有时提前把关系合完,再批量查询更快。

---

## 6. DSU 复杂度表

| 操作 | 时间 |
|------|------|
| find | O(α(n)) |
| union | O(α(n)) |
| 构造 | O(n) |

α(n) 是反阿克曼函数,n ≤ 10^600 时 α(n) ≤ 5。

---

## 7. DSU vs 最短路

| 维度 | DSU | Dijkstra |
|------|-----|----------|
| 适用 | 维护连通性 | 计算距离 |
| 加边 | 不支持删边 | 加权 |
| 加权 | 困难 | 天然支持 |

---

## 8. 课后 5 题

1. **LC 547** 省份数量
2. **LC 684** 冗余连接
3. **LC 721** 账户合并
4. **LC 990** 等式方程可满足性
5. **LC 778** 水流问题

---

**下一步**:`09-segment-tree.md`。
