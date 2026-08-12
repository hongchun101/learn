# 单调栈与单调队列

> 一类特殊的栈/队列,内部元素保持单调性。O(n) 解很多"区间最值"问题。

---

## 1. 单调栈

### 1.1 模板(下一个更大元素)

```python
def next_greater(nums):
    stack = []  # 存索引,对应值单调递减
    res = [-1] * len(nums)
    for i, x in enumerate(nums):
        while stack and nums[stack[-1]] < x:
            j = stack.pop()
            res[j] = x
        stack.append(i)
    return res
```

### 1.2 复杂度

每个元素入栈出栈各一次 → O(n)。

### 1.3 变式

| 题目 | 改法 |
|------|------|
| 下一个更大 | 单调递减栈 |
| 下一个更小 | 单调递增栈 |
| 上一个更大 | 反向遍历 |
| 上一个更小 | 反向 + 递增 |

---

## 2. 单调栈经典题

### 2.1 每日温度(LC 739)

下一个更高温度距几天。

### 2.2 下一个更大元素 I(LC 496)

两个数组,小数组查大数组。

### 2.3 下一个更大元素 II(LC 503)

循环数组,遍历 2 次或模运算。

### 2.4 柱状图最大矩形(LC 84)

```python
def largest_rectangle(heights):
    stack = []
    heights = [0] + heights + [0]
    res = 0
    for i, h in enumerate(heights):
        while stack and heights[stack[-1]] > h:
            j = stack.pop()
            res = max(res, heights[j] * (i - stack[-1] - 1))
        stack.append(i)
    return res
```

### 2.5 矩形最大面积(LC 85,字符矩阵)

把每行看作直方图,逐行计算最大矩形。

```python
def maximal_rectangle(matrix):
    if not matrix: return 0
    n = len(matrix[0])
    heights = [0] * (n + 1)
    res = 0
    for row in matrix:
        for j in range(n):
            heights[j] = heights[j] + 1 if row[j] == '1' else 0
        # 计算最大矩形
        stack = []
        for i, h in enumerate(heights):
            while stack and heights[stack[-1]] > h:
                j = stack.pop()
                res = max(res, heights[j] * (i - stack[-1] - 1))
            stack.append(i)
    return res
```

### 2.6 去除重复字母(LC 316)

### 2.7 移掉 K 位数字(LC 402)

### 2.8 拼接最大数(LC 321)

---

## 3. 单调队列

### 3.1 模板(滑动窗口最大值)

```python
from collections import deque
def max_sliding_window(nums, k):
    q = deque()  # 存索引,对应值单调递减
    res = []
    for i, x in enumerate(nums):
        while q and nums[q[-1]] < x: q.pop()
        q.append(i)
        if q[0] <= i - k: q.popleft()
        if i >= k - 1: res.append(nums[q[0]])
    return res
```

### 3.2 复杂度

O(n),每个元素入队出队各一次。

---

## 4. 单调队列经典题

### 4.1 滑动窗口最大值(LC 239)

### 4.2 滑动窗口最小值(类似)

### 4.3 跳跃游戏 VI(LC 1696)

DP[i] = max(DP[j]) + nums[i], j ∈ [i-k, i-1],用单调队列优化。

### 4.4 最短子数组和至少 K(LC 862)

前缀和 + 单调队列(类似最大子段和变式)。

### 4.5 绝对差不超过限制的最长连续子数组(LC 1438)

`max - min` 受限,需要单调队列同时维护 max 和 min。

---

## 5. 单调栈/队列的算法框架

```python
def monotonic_stack(arr):
    stack = []
    res = [None] * len(arr)
    for i in range(len(arr)):
        while stack and cmp(arr[stack[-1]], arr[i]):
            j = stack.pop()
            res[j] = ... # 用 i 计算答案
        stack.append(i)
    return res
```

cmp 是关键:
- `arr[top] < arr[i]` 找下一个更大
- `arr[top] > arr[i]` 找下一个更小
- 处理相等:`<` vs `<=` 影响"严格 vs 非严格"

---

## 6. 单调结构在 DP 优化中的应用

### 6.1 决策单调性

当 DP[i] = min(DP[j] + cost(j, i)),且 cost 满足四边形不等式,可用单调队列/单调栈优化。

### 6.2 分治优化(决策单调)

把"最优决策点"用单调性分成两半递归。

### 6.3 斜率优化(凸包)

`DP[i] = min(DP[j] + (S[i] - S[j])^2)` 形式。

详见 `algorithm/12-dp-optimization.md`。

---

## 7. 单调栈/队列 vs 线段树

| 维度 | 单调栈/队列 | 线段树 |
|------|-----------|--------|
| 维护 | 区间最值 | 任意聚合 |
| 复杂度 | O(n) | O(n log n) |
| 通用性 | 受限 | 高 |

**优先用单调结构**,简洁常数小;不行才上线段树。

---

## 8. 课后 5 题

1. **LC 739** 每日温度
2. **LC 84** 柱状图中最大的矩形
3. **LC 239** 滑动窗口最大值
4. **LC 85** 最大矩形
5. **LC 862** 和至少为 K 的最短子数组

---

**下一步**:`13-skiplist.md`。
