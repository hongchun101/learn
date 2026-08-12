# 滑动窗口(Sliding Window)

> 数组/字符串问题的高频解法。维护一个"窗口",左右边界移动。

---

## 1. 模板

### 1.1 固定窗口

```python
def fixed_window(nums, k):
    # 维护长度为 k 的窗口
    window = nums[:k]
    res = reduce(window)  # 初值
    for i in range(k, len(nums)):
        # 窗口: [i-k+1, i]
        window = window[1:] + [nums[i]]  # 实际维护用数组/hash
        res = max(res, reduce(window))
    return res
```

### 1.2 可变窗口

```python
def variable_window(s):
    window = {}
    lo = 0
    res = 0
    for hi, c in enumerate(s):
        # 1. 加入 c
        window[c] = window.get(c, 0) + 1
        # 2. 收缩(条件不满足时)
        while not is_valid(window):
            window[s[lo]] -= 1
            lo += 1
        # 3. 更新答案
        res = max(res, hi - lo + 1)
    return res
```

---

## 2. 经典应用

### 2.1 长度最小的子数组(LC 209,≥ target)

```python
def min_sub_array_len(target, nums):
    lo, s, res = 0, 0, float('inf')
    for hi, x in enumerate(nums):
        s += x
        while s >= target:
            res = min(res, hi - lo + 1)
            s -= nums[lo]; lo += 1
    return 0 if res == float('inf') else res
```

### 2.2 无重复字符的最长子串(LC 3)

见双指针章节。

### 2.3 最小覆盖子串(LC 76)

```python
def min_window(s, t):
    from collections import Counter
    need = Counter(t)
    window = {}
    have, need_cnt = 0, len(need)
    lo, res = 0, (float('inf'), '')
    for hi, c in enumerate(s):
        window[c] = window.get(c, 0) + 1
        if c in need and window[c] == need[c]:
            have += 1
        while have == need_cnt:
            if hi - lo + 1 < res[0]:
                res = (hi - lo + 1, s[lo:hi+1])
            d = s[lo]
            if d in need and window[d] == need[d]:
                have -= 1
            window[d] -= 1
            lo += 1
    return res[1]
```

### 2.4 找到字符串中所有字母异位词(LC 438)

```python
def find_anagrams(s, p):
    from collections import Counter
    need = Counter(p)
    res = []
    window = {}
    have, lo = 0, 0
    for hi, c in enumerate(s):
        window[c] = window.get(c, 0) + 1
        if c in need and window[c] == need[c]: have += 1
        while hi - lo + 1 > len(p):
            d = s[lo]
            if d in need and window[d] == need[d]: have -= 1
            window[d] -= 1
            lo += 1
        if have == len(need):
            res.append(lo)
    return res
```

### 2.5 字符串的排列(LC 567)

`p` 的排列出现在 `s` 中。

---

## 3. 滑动窗口 + 计数

### 3.1 找到 K 个最接近的元素(LC 658)

### 3.2 替换后的最长重复字符(LC 424)

```python
def character_replacement(s, k):
    from collections import Counter
    cnt = Counter()
    lo = res = 0
    for hi, c in enumerate(s):
        cnt[c] += 1
        # 窗口大小 - 最高频字符数 ≤ k 即可
        while (hi - lo + 1) - max(cnt.values()) > k:
            cnt[s[lo]] -= 1
            lo += 1
        res = max(res, hi - lo + 1)
    return res
```

### 3.3 最多 K 个删除后的最长子串

### 3.4 区间内最多数目的点(LC 1451)

---

## 4. 计数窗口 vs 单调队列窗口

### 4.1 计数窗口(LC 438,76,567)

窗口条件用"计数器"维护。

### 4.2 单调队列窗口(LC 239,480)

维护窗口极值,用单调队列。

---

## 5. 固定窗口应用

### 5.1 大小为 K 的子数组的最大和(LC 643)

```python
def max_subarray_sum(nums, k):
    cur = sum(nums[:k])
    res = cur
    for i in range(k, len(nums)):
        cur += nums[i] - nums[i-k]
        res = max(res, cur)
    return res
```

### 5.2 字符串中的元音子串(LC 1456)

### 5.3 K 进制表示下各位数字总和(LC 1837)

### 5.4 子数组最大平均值(LC 643)

### 5.5 大小为 K 的一半子数组(LC 1343)

---

## 6. 双滑窗(LC 992,K 个不同整数)

```python
def subarrays_with_k_distinct(nums, k):
    return at_most_k(nums, k) - at_most_k(nums, k-1)

def at_most_k(nums, k):
    from collections import Counter
    cnt = Counter()
    lo = res = 0
    for hi, x in enumerate(nums):
        if cnt[x] == 0: k -= 1
        cnt[x] += 1
        while k < 0:
            cnt[nums[lo]] -= 1
            if cnt[nums[lo]] == 0: k += 1
            lo += 1
        res += hi - lo + 1
    return res
```

---

## 7. 多指针滑窗

### 7.1 三指针(LC 76,LC 727,LC 992)

### 7.2 计数滑窗 + 双指针(LC 930)

---

## 8. 课后 5 题

1. **LC 3** 无重复字符的最长子串
2. **LC 76** 最小覆盖子串
3. **LC 209** 长度最小的子数组
4. **LC 438** 找到字符串中所有字母异位词
5. **LC 239** 滑动窗口最大值(单调队列)

---

**下一步**:`05-prefix-diff.md`。
