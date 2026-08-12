# 二分查找全集

> LeetCode 上"二分"标签题 100+。需要彻底掌握 11 种变式。

---

## 1. 标准二分(精确查找)

### 1.1 闭区间 [lo, hi]

```python
def bsearch(nums, target):
    lo, hi = 0, len(nums) - 1
    while lo <= hi:
        mid = (lo + hi) // 2  # 防溢出:lo + (hi - lo) // 2
        if nums[mid] == target: return mid
        elif nums[mid] < target: lo = mid + 1
        else: hi = mid - 1
    return -1
```

不变量:`nums[lo..hi]` 一定是候选区。

### 1.2 左闭右开 [lo, hi)

```python
def bsearch2(nums, target):
    lo, hi = 0, len(nums)
    while lo < hi:
        mid = (lo + hi) // 2
        if nums[mid] < target: lo = mid + 1
        else: hi = mid
    return lo if lo < len(nums) and nums[lo] == target else -1
```

不变量:`nums[lo..hi-1]` 是候选。

---

## 2. 寻找边界(lower_bound / upper_bound)

### 2.1 第一个 ≥ target 的位置(lower_bound)

```python
def lower_bound(nums, target):
    lo, hi = 0, len(nums)
    while lo < hi:
        mid = (lo + hi) // 2
        if nums[mid] < target: lo = mid + 1
        else: hi = mid
    return lo  # 可能是 len(nums)
```

### 2.2 第一个 > target 的位置(upper_bound)

```python
def upper_bound(nums, target):
    lo, hi = 0, len(nums)
    while lo < hi:
        mid = (lo + hi) // 2
        if nums[mid] <= target: lo = mid + 1
        else: hi = mid
    return lo
```

### 2.3 用途

- 计数:`count = upper_bound - lower_bound`
- 找插入位置:lower_bound
- 找最接近:lower_bound 与前一个比较

---

## 3. 11 种二分变式

| # | 题目 | 模板 |
|---|------|------|
| 1 | 精确查找 | 闭区间 |
| 2 | 第一个 ≥ x | lower_bound |
| 3 | 第一个 > x | upper_bound |
| 4 | 最后一个 ≤ x | upper_bound(x) - 1 |
| 5 | 最后一个 < x | lower_bound(x) - 1 |
| 6 | 旋转数组中查找 | 判哪半有序 |
| 7 | 山脉数组峰顶 | 排除不可能 |
| 8 | 二分答案 | 最小/最大满足条件 |
| 9 | 二维矩阵 | 两次二分 |
| 10 | 二分 + 贪心 | 验证可行 |
| 11 | 第 K 大/小 | 快排 partition |

---

## 4. 旋转数组

### 4.1 搜索旋转排序数组(LC 33)

```python
def search(nums, target):
    lo, hi = 0, len(nums) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if nums[mid] == target: return mid
        if nums[lo] <= nums[mid]:  # 左半有序
            if nums[lo] <= target < nums[mid]:
                hi = mid - 1
            else:
                lo = mid + 1
        else:  # 右半有序
            if nums[mid] < target <= nums[hi]:
                lo = mid + 1
            else:
                hi = mid - 1
    return -1
```

### 4.2 找旋转点(LC 153/154)

```python
def find_min(nums):
    lo, hi = 0, len(nums) - 1
    while lo < hi:
        mid = (lo + hi) // 2
        if nums[mid] > nums[hi]:
            lo = mid + 1
        else:
            hi = mid  # 不能 mid-1,因为 mid 可能就是答案
    return nums[lo]
```

---

## 5. 山脉数组

### 5.1 山脉数组峰顶索引(LC 852)

```python
def peak_index(arr):
    lo, hi = 0, len(arr) - 1
    while lo < hi:
        mid = (lo + hi) // 2
        if arr[mid] < arr[mid + 1]:
            lo = mid + 1
        else:
            hi = mid
    return lo
```

### 5.2 在山脉数组中查找(LC 1095)

```python
def find_in_mountain_array(target, arr):
    n = len(arr)
    # 找峰
    lo, hi = 0, n - 1
    while lo < hi:
        mid = (lo + hi) // 2
        if arr[mid] < arr[mid+1]: lo = mid + 1
        else: hi = mid
    peak = lo
    # 左半递增
    lo, hi = 0, peak
    while lo < hi:
        mid = (lo + hi) // 2
        if arr[mid] < target: lo = mid + 1
        else: hi = mid
    if arr[lo] == target: return lo
    # 右半递减
    lo, hi = peak, n - 1
    while lo < hi:
        mid = (lo + hi + 1) // 2
        if arr[mid] > target: lo = mid + 1
        else: hi = mid
        # 等价写法: arr[mid] < target 时左移
    if arr[lo] == target: return lo
    return -1
```

---

## 6. 二分答案

### 6.1 模板

```python
def can(mid):
    """检查 mid 是否满足条件"""
    ...

def binary_search(lo, hi):
    while lo < hi:
        mid = (lo + hi) // 2
        if can(mid):
            hi = mid
        else:
            lo = mid + 1
    return lo
```

### 6.2 经典题

- **LC 875** 爱吃香蕉的珂珂
- **LC 1011** 在 D 天内送达包裹的能力
- **LC 410** 分割数组的最大值
- **LC 1482** 制作 m 束花所需的最少天数
- **LC 1283** 使结果不超过阈值的最小除数
- **LC 1552** 两球之间的磁力

```python
def smallest_divisor(nums, threshold):
    lo, hi = 1, max(nums)
    while lo < hi:
        mid = (lo + hi) // 2
        s = sum((x + mid - 1) // mid for x in nums)
        if s <= threshold: hi = mid
        else: lo = mid + 1
    return lo
```

---

## 7. 二分 + 验证

### 7.1 分割数组的最大值(LC 410)

```python
def split_array(nums, m):
    lo, hi = max(nums), sum(nums)
    def can(limit):
        cnt, cur = 1, 0
        for x in nums:
            if cur + x <= limit:
                cur += x
            else:
                cnt += 1
                cur = x
        return cnt <= m
    while lo < hi:
        mid = (lo + hi) // 2
        if can(mid): hi = mid
        else: lo = mid + 1
    return lo
```

---

## 8. 二分第 K 小/大

### 8.1 有序矩阵的 K 小元素(LC 378)

```python
def kth_smallest(matrix, k):
    n = len(matrix)
    lo, hi = matrix[0][0], matrix[-1][-1]
    while lo < hi:
        mid = (lo + hi) // 2
        cnt = 0
        j = n - 1
        for i in range(n):
            while j >= 0 and matrix[i][j] > mid: j -= 1
            cnt += j + 1
        if cnt < k: lo = mid + 1
        else: hi = mid
    return lo
```

---

## 9. 二分搜索树中的搜索(LC 700)

```python
def search_bst(root, val):
    while root and root.val != val:
        root = root.left if val < root.val else root.right
    return root
```

---

## 10. 寻找重复数(LC 287,O(1) 空间)

```python
def find_duplicate(nums):
    lo, hi = 1, len(nums) - 1
    while lo < hi:
        mid = (lo + hi) // 2
        cnt = sum(x <= mid for x in nums)
        if cnt > mid: hi = mid
        else: lo = mid + 1
    return lo
```

---

## 11. 课后 5 题

1. **LC 33** 搜索旋转排序数组
2. **LC 153** 寻找旋转排序数组中的最小值
3. **LC 875** 爱吃香蕉的珂珂
4. **LC 410** 分割数组的最大值
5. **LC 378** 有序矩阵中第 K 小的元素

---

**下一步**:`03-two-pointer.md`。
