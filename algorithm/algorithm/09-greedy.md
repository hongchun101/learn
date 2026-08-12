# 贪心算法(Greedy)

> 每步取当前最优,期望全局最优。

---

## 1. 适用条件

贪心算法需要满足:

1. **贪心选择性质**:局部最优能推出全局最优
2. **最优子结构**:问题可以分解为子问题

---

## 2. 经典贪心

### 2.1 跳跃游戏(LC 55)

```python
def can_jump(nums):
    farthest = 0
    for i, x in enumerate(nums):
        if i > farthest: return False
        farthest = max(farthest, i + x)
    return True
```

### 2.2 跳跃游戏 II(LC 45,最少步数)

```python
def jump(nums):
    farthest = end = jumps = 0
    for i in range(len(nums) - 1):
        farthest = max(farthest, i + nums[i])
        if i == end:
            jumps += 1
            end = farthest
    return jumps
```

### 2.3 分发饼干(LC 455)

```python
def find_content_children(g, s):
    g.sort(); s.sort()
    i = j = 0
    while i < len(g) and j < len(s):
        if s[j] >= g[i]: i += 1
        j += 1
    return i
```

### 2.4 买卖股票的最佳时机 II(LC 122)

```python
def max_profit(prices):
    return sum(max(0, prices[i] - prices[i-1]) for i in range(1, len(prices)))
```

### 2.5 摆动序列(LC 376)

```python
def wiggle_max_length(nums):
    up = down = 1
    for i in range(1, len(nums)):
        if nums[i] > nums[i-1]:
            up = down + 1
        elif nums[i] < nums[i-1]:
            down = up + 1
    return max(up, down)
```

### 2.6 划分字母区间(LC 763)

```python
def partition_labels(s):
    last = {c: i for i, c in enumerate(s)}
    start = end = 0
    res = []
    for i, c in enumerate(s):
        end = max(end, last[c])
        if i == end:
            res.append(end - start + 1)
            start = i + 1
    return res
```

### 2.7 加油站(LC 134)

```python
def can_complete_circuit(gas, cost):
    if sum(gas) < sum(cost): return -1
    tank = start = 0
    for i in range(len(gas)):
        tank += gas[i] - cost[i]
        if tank < 0:
            start = i + 1
            tank = 0
    return start
```

---

## 3. 区间类贪心

### 3.1 区间调度(最多不重叠)

按右端点排序。

```python
def erase_overlap(intervals):
    intervals.sort(key=lambda x: x[1])
    res = 0; end = float('-inf')
    for a, b in intervals:
        if a >= end:
            end = b
        else:
            res += 1
    return res
```

### 3.2 最小箭头射气球(LC 452)

### 3.3 合并区间(LC 56)

### 3.4 插入区间(LC 57)

### 3.5 无重叠区间(LC 435)

---

## 4. 双指针贪心

### 4.1 两地调度(LC 1029)

按 cost 差排序。

### 4.2 优势洗牌(LC 870)

田忌赛马。

```python
def advantage_count(nums1, nums2):
    nums1.sort()
    n = len(nums1)
    res = [-1] * n
    used = [False] * n
    for x in sorted(nums2):
        # 找 nums1 中最小的大于 x 的数
        lo, hi = 0, n-1
        while lo < hi:
            mid = (lo+hi)//2
            if nums1[mid] <= x: lo = mid + 1
            else: hi = mid
        if nums1[lo] > x:
            res[nums2.index(x)] = nums1[lo]
            # nums1[lo] = -inf (实际删除)
            nums1.pop(lo)
            # 但 nums2 顺序已变,改用哈希
```

实际做法:

```python
def advantage_count(nums1, nums2):
    nums1.sort()
    res = [-1] * len(nums1)
    from sortedcontainers import SortedList
    sl = SortedList(nums1)
    idx = {v: i for i, v in enumerate(nums2)}
    for x in nums2:
        pos = sl.bisect_right(x)
        if pos < len(sl):
            v = sl.pop(pos)
            res[idx[x]] = v
    # 剩余填充最小
    j = 0
    for i, v in enumerate(res):
        if v == -1:
            while sl and j < len(nums1) - 1: j += 1
            # 简化,直接取最小
            v = sl.pop(0) if sl else nums1[j]
            res[i] = v
    return res
```

---

## 5. 复杂贪心

### 5.1 任务调度器(LC 621)

```python
def least_interval(tasks, n):
    from collections import Counter
    cnt = Counter(tasks)
    max_cnt = max(cnt.values())
    num_max = sum(1 for v in cnt.values() if v == max_cnt)
    return max(len(tasks), (max_cnt - 1) * (n + 1) + num_max)
```

### 5.2 重构字符串(LC 767)

### 5.3 最多可以参加的会议数目(LC 1353)

用最小堆按结束时间贪心。

### 5.4 分糖果(LC 135)

两次遍历(左到右 + 右到左)。

---

## 6. 反悔贪心(堆)

### 6.1 课程表 III(LC 630)

```python
def schedule_course(courses):
    import heapq
    courses.sort(key=lambda x: x[1])
    cur = 0
    heap = []
    for d, l in courses:
        cur += d
        heapq.heappush(heap, -d)
        if cur > l:
            cur -= -heapq.heappop(heap)
    return len(heap)
```

### 6.2 IPO(LC 502)

### 6.3 雇佣 K 名工人的最低成本(LC 857)

### 6.4 经营摩天轮的最大利润(LC 1599)

---

## 7. 字典序贪心

### 7.1 移掉 K 位数字(LC 402)

```python
def remove_kdigits(num, k):
    stack = []
    for c in num:
        while k and stack and stack[-1] > c:
            stack.pop(); k -= 1
        stack.append(c)
    res = ''.join(stack[:len(stack)-k]).lstrip('0')
    return res or '0'
```

### 7.2 最大数(LC 179)

```python
def largest_number(nums):
    from functools import cmp_to_key
    def cmp(a, b):
        if a + b > b + a: return -1
        elif a + b < b + a: return 1
        return 0
    nums = [str(x) for x in nums]
    nums.sort(key=cmp_to_key(cmp))
    return str(int(''.join(nums)))
```

### 7.3 拼接最大数(LC 321)

---

## 8. 贪心的"证伪"与"证明"

### 8.1 证明技巧

1. **交换论证**:假设存在更优解,逐步交换为贪心解
2. **归纳**:前 k 步最优 → 第 k+1 步也最优
3. **反证**:假设贪心不对,推出矛盾

### 8.2 何时不能用贪心

- 不满足贪心选择性质(常反例:背包 0/1)
- 局部最优与全局最优不一致(常反例:最长路径)

---

## 9. 课后 5 题

1. **LC 55** 跳跃游戏
2. **LC 435** 无重叠区间
3. **LC 763** 划分字母区间
4. **LC 134** 加油站
5. **LC 630** 课程表 III

---

**下一步**:`10-dp-basic.md`。
