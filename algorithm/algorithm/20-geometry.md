# 计算几何(Computational Geometry)

> LeetCode 计算几何题约 50 道。

---

## 1. 基础:点与向量

### 1.1 定义

```python
from dataclasses import dataclass
@dataclass
class Point:
    x: float; y: float
```

### 1.2 运算

```python
def add(a, b): return Point(a.x + b.x, a.y + b.y)
def sub(a, b): return Point(a.x - b.x, a.y - b.y)
def mul(a, k): return Point(a.x * k, a.y * k)
def dot(a, b): return a.x * b.x + a.y * b.y
def cross(a, b): return a.x * b.y - a.y * b.x  # 叉积
def length(a): return (a.x**2 + a.y**2) ** 0.5
```

### 1.3 叉积的方向

- `cross(a, b) > 0`:b 在 a 左侧(逆时针)
- `cross(a, b) < 0`:b 在 a 右侧
- `cross(a, b) = 0`:共线

---

## 2. 几何关系判定

### 2.1 三点共线

```python
def is_collinear(a, b, c):
    return cross(sub(b, a), sub(c, a)) == 0
```

### 2.2 叉积定左右转

```python
def direction(a, b, c):
    return cross(sub(b, a), sub(c, a))
```

### 2.3 点是否在直线段上

```python
def on_segment(p, a, b):
    return min(a.x, b.x) <= p.x <= max(a.x, b.x) and min(a.y, b.y) <= p.y <= max(a.y, b.y) and is_collinear(a, b, p)
```

### 2.4 两线段相交

```python
def segments_intersect(a, b, c, d):
    d1 = direction(c, d, a); d2 = direction(c, d, b)
    d3 = direction(a, b, c); d4 = direction(a, b, d)
    if ((d1 > 0 and d2 < 0) or (d1 < 0 and d2 > 0)) and ((d3 > 0 and d4 < 0) or (d3 < 0 and d4 > 0)):
        return True
    # 共线时的端点
    if d1 == 0 and on_segment(a, c, d): return True
    if d2 == 0 and on_segment(b, c, d): return True
    if d3 == 0 and on_segment(c, a, b): return True
    if d4 == 0 and on_segment(d, a, b): return True
    return False
```

---

## 3. 凸包

### 3.1 Graham 扫描 O(n log n)

```python
def convex_hull(points):
    points = sorted(points, key=lambda p: (p.x, p.y))
    if len(points) <= 1: return points
    def cross(o, a, b):
        return (a.x - o.x) * (b.y - o.y) - (b.x - o.x) * (a.y - o.y)
    lower = []
    for p in points:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    upper = []
    for p in reversed(points):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    return lower[:-1] + upper[:-1]
```

### 3.2 Andrew 算法(单调链)

```python
# 同上
```

### 3.3 应用

- LC 587 安装栅栏
- LC 469 凸多边形
- LC 2152 全部对齐的最少操作次数

---

## 4. 凸包相关

### 4.1 旋转卡壳(求直径)

```python
def rotating_calipers(points):
    hull = convex_hull(points)
    n = len(hull)
    if n < 2: return 0
    res = 0
    k = 1
    for i in range(n):
        nxt = (i + 1) % n
        while abs(cross(sub(hull[nxt], hull[i]), sub(hull[(k+1) % n], hull[k]))) > abs(cross(sub(hull[nxt], hull[i]), sub(hull[k], hull[(k-1) % n]))):
            k = (k + 1) % n
        res = max(res, max(dist(hull[i], hull[k]), dist(hull[nxt], hull[k])))
    return res

def dist(a, b): return (a.x - b.x)**2 + (a.y - b.y)**2
```

### 4.2 LC 587 / LC 593

---

## 5. 平面扫描

### 5.1 求最近点对 O(n log n)

```python
def closest_pair(points):
    points.sort(key=lambda p: p.x)
    def rec(lo, hi):
        if hi - lo <= 1: return float('inf')
        mid = (lo + hi) // 2
        d = min(rec(lo, mid), rec(mid, hi))
        # 处理跨中线
        strip = [p for p in points[lo:hi] if (p.x - points[mid].x)**2 < d]
        strip.sort(key=lambda p: p.y)
        for i in range(len(strip)):
            for j in range(i+1, min(i+8, len(strip))):
                dy = strip[i].y - strip[j].y
                if dy*dy >= d: break
                d = min(d, (strip[i].x - strip[j].x)**2 + dy*dy)
        return d
    return rec(0, len(points))
```

---

## 6. 半平面交

```python
def half_plane_intersection(lines):
    # lines: [(a, b, c) 表示 ax + by + c ≥ 0]
    ...
```

LeetCode 较少用。

---

## 7. 简单几何题

### 7.1 直线斜率

```python
def slope(a, b):
    dx = b.x - a.x; dy = b.y - a.y
    if dx == 0: return float('inf')
    return dy / dx
```

### 7.2 LC 149 直线上最多的点数

```python
def max_points(points):
    from collections import defaultdict
    if len(points) <= 1: return len(points)
    res = 1
    for i in range(len(points)):
        cnt = defaultdict(int)
        for j in range(len(points)):
            if i == j: continue
            dx = points[j][0] - points[i][0]
            dy = points[j][1] - points[i][1]
            g = gcd(dx, dy)
            dx //= g; dy //= g
            cnt[(dx, dy)] += 1
        res = max(res, max(cnt.values(), default=0) + 1)
    return res
```

### 7.3 LC 1266 访问所有点的最小时间

切比雪夫距离:`max(|dx|, |dy|)`。

### 7.4 LC 892 三维形体的表面积

### 7.5 LC 1401 圆和矩形是否有重叠

---

## 8. 圆

### 8.1 圆心到直线距离

```python
def dist_to_line(c, a, b):
    return abs(cross(sub(b, a), sub(c, a))) / length(sub(b, a))
```

### 8.2 两圆相交面积

```python
def circle_intersection_area(r1, r2, d):
    if d >= r1 + r2: return 0
    if d <= abs(r1 - r2): return math.pi * min(r1, r2)**2
    a1 = math.acos((d**2 + r1**2 - r2**2) / (2 * d * r1))
    a2 = math.acos((d**2 + r2**2 - r1**2) / (2 * d * r2))
    return r1**2 * a1 + r2**2 * a2 - 0.5 * (r1**2 * math.sin(2*a1) + r2**2 * math.sin(2*a2))
```

### 8.3 LC 1401 / LC 1453 / LC 478 等

---

## 9. 矩形

### 9.1 矩形重叠

```python
def is_rect_overlap(rec1, rec2):
    x1, y1, x2, y2 = rec1
    a1, b1, a2, b2 = rec2
    return not (x2 <= a1 or a2 <= x1 or y2 <= b1 or b2 <= y1)
```

### 9.2 LC 836 矩形重叠

### 9.3 LC 223 矩形面积

```python
def compute_area(ax1, ay1, ax2, ay2, bx1, by1, bx2, by2):
    area1 = (ax2 - ax1) * (ay2 - ay1)
    area2 = (bx2 - bx1) * (by2 - by1)
    overlap = max(0, min(ax2, bx2) - max(ax1, bx1)) * max(0, min(ay2, by2) - max(ay1, by1))
    return area1 + area2 - overlap
```

### 9.4 LC 391 完美矩形

```python
def is_rectangle_cover(rectangles):
    X1, Y1 = float('inf'), float('inf')
    X2, Y2 = -float('inf'), -float('inf')
    area = 0
    seen = set()
    for x1, y1, x2, y2 in rectangles:
        X1 = min(X1, x1); Y1 = min(Y1, y1)
        X2 = max(X2, x2); Y2 = max(Y2, y2)
        area += (x2 - x1) * (y2 - y1)
        for p in [(x1, y1), (x1, y2), (x2, y1), (x2, y2)]:
            if p in seen: seen.remove(p)
            else: seen.add(p)
    return area == (X2 - X1) * (Y2 - Y1) and seen == {(X1, Y1), (X1, Y2), (X2, Y1), (X2, Y2)}
```

---

## 10. 多边形

### 10.1 多边形面积(鞋带公式)

```python
def polygon_area(pts):
    n = len(pts)
    s = 0
    for i in range(n):
        s += pts[i][0] * pts[(i+1) % n][1] - pts[i][1] * pts[(i+1) % n][0]
    return abs(s) / 2
```

### 10.2 点是否在多边形内

射线法:

```python
def point_in_polygon(p, poly):
    n = len(poly)
    inside = False
    j = n - 1
    for i in range(n):
        if (poly[i][1] > p[1]) != (poly[j][1] > p[1]):
            if p[0] < (poly[j][0] - poly[i][0]) * (p[1] - poly[i][1]) / (poly[j][1] - poly[i][1]) + poly[i][0]:
                inside = not inside
        j = i
    return inside
```

### 10.3 LC 1037 有效的回旋镖

### 10.4 LC 1453 圆心攻击

---

## 11. 三维几何

### 11.1 三维叉积

```python
def cross3d(a, b):
    return (a[1]*b[2] - a[2]*b[1], a[2]*b[0] - a[0]*b[2], a[0]*b[1] - a[1]*b[0])
```

### 11.2 三维点积

```python
def dot3d(a, b):
    return a[0]*b[0] + a[1]*b[1] + a[2]*b[2]
```

### 11.3 LC 592 分数加减运算

---

## 12. 浮点精度

避免直接比较浮点数,用 ε:

```python
def cmp(a, b, eps=1e-9):
    if abs(a - b) < eps: return 0
    return -1 if a < b else 1
```

---

## 13. 课后 5 题

1. **LC 149** 直线上最多的点数
2. **LC 223** 矩形面积
3. **LC 587** 安装栅栏
4. **LC 391** 完美矩形
5. **LC 1401** 圆和矩形是否有重叠

---

**下一步**:`21-matrix-random.md`(矩阵快速幂与随机化)。
