# 排序全家桶

> 排序是基础,也是各种算法的子过程。

---

## 1. 排序复杂度表

| 算法 | 平均 | 最坏 | 空间 | 稳定 | 备注 |
|------|------|------|------|------|------|
| 冒泡 | O(n²) | O(n²) | O(1) | ✓ | 教学用 |
| 选择 | O(n²) | O(n²) | O(1) | ✗ | 简单 |
| 插入 | O(n²) | O(n²) | O(1) | ✓ | 小数据优秀 |
| 希尔 | O(n log n) | O(n²) | O(1) | ✗ | 升级插入 |
| 归并 | O(n log n) | O(n log n) | O(n) | ✓ | 分治典范 |
| 快速 | O(n log n) | O(n²) | O(log n) | ✗ | 实践最快 |
| 堆排序 | O(n log n) | O(n log n) | O(1) | ✗ | 空间优 |
| 计数 | O(n+k) | O(n+k) | O(k) | ✓ | 范围小时 |
| 桶排 | O(n+k) | O(n²) | O(n+k) | ✓ | 数据均匀 |
| 基数 | O(d·n) | O(d·n) | O(n+k) | ✓ | 多关键字 |

---

## 2. 快速排序(必背)

```python
def quick_sort(nums, lo=0, hi=None):
    if hi is None: hi = len(nums) - 1
    if lo >= hi: return
    pivot = nums[lo]
    i, j = lo, hi
    while i < j:
        while i < j and nums[j] >= pivot: j -= 1
        while i < j and nums[i] <= pivot: i += 1
        if i < j: nums[i], nums[j] = nums[j], nums[i]
    nums[lo], nums[i] = nums[i], nums[lo]
    quick_sort(nums, lo, i - 1)
    quick_sort(nums, i + 1, hi)
```

### 2.1 三路快排(处理重复元素)

```python
def quick_sort_3way(nums, lo=0, hi=None):
    if hi is None: hi = len(nums) - 1
    if lo >= hi: return
    lt, gt = lo, hi
    i = lo
    pivot = nums[lo]
    while i <= gt:
        if nums[i] < pivot:
            nums[i], nums[lt] = nums[lt], nums[i]
            lt += 1; i += 1
        elif nums[i] > pivot:
            nums[i], nums[gt] = nums[gt], nums[i]
            gt -= 1
        else:
            i += 1
    quick_sort_3way(nums, lo, lt - 1)
    quick_sort_3way(nums, gt + 1, hi)
```

### 2.2 随机化 pivot(避免最坏)

```python
import random
def partition(nums, lo, hi):
    r = random.randint(lo, hi)
    nums[lo], nums[r] = nums[r], nums[lo]
    pivot = nums[lo]
    i, j = lo, hi
    while i < j:
        while i < j and nums[j] >= pivot: j -= 1
        while i < j and nums[i] <= pivot: i += 1
        nums[i], nums[j] = nums[j], nums[i]
    nums[i], nums[lo] = nums[lo], nums[i]
    return i
```

---

## 3. 归并排序

### 3.1 自顶向下

```python
def merge_sort(nums):
    if len(nums) <= 1: return nums
    mid = len(nums) // 2
    left = merge_sort(nums[:mid])
    right = merge_sort(nums[mid:])
    return merge(left, right)

def merge(a, b):
    res = []
    i = j = 0
    while i < len(a) and j < len(b):
        if a[i] <= b[j]: res.append(a[i]); i += 1
        else: res.append(b[j]); j += 1
    return res + a[i:] + b[j:]
```

### 3.2 自底向上(迭代)

```python
def merge_sort_iter(nums):
    n = len(nums)
    size = 1
    while size < n:
        for lo in range(0, n, 2 * size):
            mid = lo + size
            hi = min(lo + 2 * size, n)
            # 合并 nums[lo:mid] 与 nums[mid:hi]
            a = nums[lo:mid]
            b = nums[mid:hi]
            i = j = 0; k = lo
            while i < len(a) and j < len(b):
                if a[i] <= b[j]:
                    nums[k] = a[i]; i += 1
                else:
                    nums[k] = b[j]; j += 1
                k += 1
            while i < len(a): nums[k] = a[i]; i += 1; k += 1
            while j < len(b): nums[k] = b[j]; j += 1; k += 1
        size *= 2
```

---

## 4. 堆排序

见 `data-structure/06-heap.md` 第 2.5 节。

---

## 5. 计数排序

```python
def counting_sort(nums, k):
    cnt = [0] * (k + 1)
    for x in nums: cnt[x] += 1
    # 前缀和
    for i in range(1, k + 1): cnt[i] += cnt[i-1]
    res = [0] * len(nums)
    for x in reversed(nums):
        cnt[x] -= 1
        res[cnt[x]] = x
    return res
```

---

## 6. 桶排序

```python
def bucket_sort(nums, k=10):
    if not nums: return []
    lo, hi = min(nums), max(nums)
    bs = (hi - lo) / k
    buckets = [[] for _ in range(k)]
    for x in nums:
        idx = min(k - 1, int((x - lo) / bs))
        buckets[idx].append(x)
    res = []
    for b in buckets:
        res.extend(sorted(b))
    return res
```

---

## 7. 基数排序(LSD)

```python
def radix_sort(nums):
    if not nums: return []
    exp = 1
    max_val = max(nums)
    while max_val // exp > 0:
        buckets = [[] for _ in range(10)]
        for x in nums:
            buckets[(x // exp) % 10].append(x)
        nums = [x for b in buckets for x in b]
        exp *= 10
    return nums
```

---

## 8. 链表排序

```python
def sort_list(head):
    if not head or not head.next: return head
    slow, fast = head, head.next
    while fast and fast.next:
        slow = slow.next
        fast = fast.next.next
    mid = slow.next
    slow.next = None
    return merge_two(sort_list(head), sort_list(mid))
```

---

## 9. 排序的工程考量

### 9.1 混合排序(IntroSort)

C++ STL `std::sort` 实际是:
- 快速 + 堆 + 插入
- 深度超限时切堆排

### 9.2 TimSort(Python)

插入 + 归并,利用已有顺序,最坏 O(n log n),最佳 O(n)。

### 9.3 Java DualPivotQuickSort

双基准快排。

---

## 10. 排序应用题

### 10.1 颜色分类(LC 75,荷兰国旗)

三路快排 partition。

### 10.2 数组中的第 K 个最大元素(LC 215)

快排 partition 或堆排。

### 10.3 最大间距(LC 164)

桶排。

### 10.4 摆动排序 II(LC 324)

排序 + 穿插。

### 10.5 出现次数最多的子树和(LC 508 + 排序)

### 10.6 排序链表(LC 148)

归并排序。

### 10.7 按频率排序数组(LC 1636)

排序 + 自定义比较。

### 10.8 距离相等的条形码(LC 1054)

贪心 + 桶。

---

## 11. 课后 5 题

1. **LC 75** 颜色分类
2. **LC 215** 数组中的第 K 个最大元素
3. **LC 148** 排序链表
4. **LC 164** 最大间距
5. **LC 324** 摆动排序 II

---

**下一步**:`02-binary-search.md`。
