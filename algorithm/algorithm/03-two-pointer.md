# 双指针(Two Pointers)

> 用两个指针协同遍历,O(n) 解大量问题。

---

## 1. 分类

| 类型 | 描述 | 示例 |
|------|------|------|
| 对撞指针 | 头尾相向而行 | 两数之和 |
| 快慢指针 | 同向不同速 | 链表判环 |
| 滑动窗口 | 维护可变区间 | 最长子串 |
| 分离指针 | 两个数组分别遍历 | 归并 |
| 输出指针 | 一边读一边写 | 原地去重 |

---

## 2. 对撞指针(两数之和变体)

### 2.1 两数之和 II(LC 167)

```python
def two_sum(numbers, target):
    lo, hi = 0, len(numbers) - 1
    while lo < hi:
        s = numbers[lo] + numbers[hi]
        if s == target: return [lo+1, hi+1]
        elif s < target: lo += 1
        else: hi -= 1
```

### 2.2 三数之和(LC 15)

```python
def three_sum(nums):
    nums.sort()
    res = []
    for i in range(len(nums) - 2):
        if nums[i] > 0: break
        if i > 0 and nums[i] == nums[i-1]: continue
        lo, hi = i + 1, len(nums) - 1
        while lo < hi:
            s = nums[i] + nums[lo] + nums[hi]
            if s == 0:
                res.append([nums[i], nums[lo], nums[hi]])
                while lo < hi and nums[lo] == nums[lo+1]: lo += 1
                while lo < hi and nums[hi] == nums[hi-1]: hi -= 1
                lo += 1; hi -= 1
            elif s < 0: lo += 1
            else: hi -= 1
    return res
```

### 2.3 盛最多水的容器(LC 11)

```python
def max_area(height):
    lo, hi = 0, len(height) - 1
    res = 0
    while lo < hi:
        res = max(res, (hi - lo) * min(height[lo], height[hi]))
        if height[lo] < height[hi]: lo += 1
        else: hi -= 1
    return res
```

### 2.4 接雨水(LC 42)

```python
def trap(height):
    lo, hi = 0, len(height) - 1
    left, right = 0, 0
    res = 0
    while lo < hi:
        if height[lo] < height[hi]:
            if height[lo] > left: left = height[lo]
            else: res += left - height[lo]
            lo += 1
        else:
            if height[hi] > right: right = height[hi]
            else: res += right - height[hi]
            hi -= 1
    return res
```

### 2.5 有效三角形的个数(LC 611)

```python
def triangle_number(nums):
    nums.sort()
    n = len(nums)
    res = 0
    for i in range(n - 1, 1, -1):
        lo, hi = 0, i - 1
        while lo < hi:
            if nums[lo] + nums[hi] > nums[i]:
                res += hi - lo
                hi -= 1
            else:
                lo += 1
    return res
```

---

## 3. 快慢指针

### 3.1 链表判环(LC 141)

见 `data-structure/02-linked-list.md`。

### 3.2 删除重复项(LC 26,LC 80)

```python
def remove_duplicates(nums):
    slow = 0
    for fast in range(len(nums)):
        if nums[fast] != nums[slow]:
            slow += 1
            nums[slow] = nums[fast]
    return slow + 1
```

### 3.3 移除元素(LC 27)

```python
def remove_element(nums, val):
    slow = 0
    for fast in range(len(nums)):
        if nums[fast] != val:
            nums[slow] = nums[fast]
            slow += 1
    return slow
```

### 3.4 移动零(LC 283)

```python
def move_zeroes(nums):
    slow = 0
    for fast in range(len(nums)):
        if nums[fast] != 0:
            nums[slow], nums[fast] = nums[fast], nums[slow]
            slow += 1
```

### 3.5 判断子序列(LC 392)

```python
def is_subsequence(s, t):
    i = 0
    for c in t:
        if i < len(s) and s[i] == c: i += 1
    return i == len(s)
```

---

## 4. 滑动窗口

详见 `04-sliding-window.md`。

---

## 5. 分离指针

### 5.1 两个数组的交集(LC 349,350)

```python
def intersect(nums1, nums2):
    nums1.sort(); nums2.sort()
    i = j = 0
    res = []
    while i < len(nums1) and j < len(nums2):
        if nums1[i] < nums2[j]: i += 1
        elif nums1[i] > nums2[j]: j += 1
        else:
            res.append(nums1[i])
            i += 1; j += 1
    return res
```

### 5.2 比较版本号(LC 165)

```python
def compare_version(v1, v2):
    a, b = v1.split('.'), v2.split('.')
    for i in range(max(len(a), len(b))):
        x = int(a[i]) if i < len(a) else 0
        y = int(b[i]) if i < len(b) else 0
        if x != y: return 1 if x > y else -1
    return 0
```

### 5.3 合并两个有序数组(LC 88)

从后往前填充。

```python
def merge(nums1, m, nums2, n):
    i, j, k = m-1, n-1, m+n-1
    while i >= 0 and j >= 0:
        if nums1[i] > nums2[j]:
            nums1[k] = nums1[i]; i -= 1
        else:
            nums1[k] = nums2[j]; j -= 1
        k -= 1
    while j >= 0:
        nums1[k] = nums2[j]; k -= 1; j -= 1
```

---

## 6. 输出指针(原地操作)

### 6.1 删除排序数组中的重复项 II(LC 80)

保留最多 2 个。

```python
def remove_dup_ii(nums):
    slow = 0
    for fast in range(len(nums)):
        if slow < 2 or nums[fast] != nums[slow-2]:
            nums[slow] = nums[fast]
            slow += 1
    return slow
```

### 6.2 压缩字符串(LC 443)

见 `data-structure/01-array-string.md`。

### 6.3 移除元素的所有实例(LC 27)

### 6.4 按奇偶排序数组(LC 905)

---

## 7. 同向双指针 + 哈希

### 7.1 最长无重复子串(LC 3)

```python
def length_of_longest_substring(s):
    last = {}
    lo = res = 0
    for hi, c in enumerate(s):
        if c in last and last[c] >= lo: lo = last[c] + 1
        last[c] = hi
        res = max(res, hi - lo + 1)
    return res
```

### 7.2 最小覆盖子串(LC 76)

见滑动窗口章节。

---

## 8. 课后 5 题

1. **LC 15** 三数之和
2. **LC 11** 盛最多水的容器
3. **LC 42** 接雨水
4. **LC 3** 无重复字符的最长子串
5. **LC 88** 合并两个有序数组

---

**下一步**:`04-sliding-window.md`。
