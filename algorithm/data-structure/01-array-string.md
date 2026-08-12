# 数组与字符串

> 最基础也是最高频的容器。LeetCode 50% 的题从数组出发。

---

## 1. 数组基础

### 静态 vs 动态数组

| 类型 | 静态 | 动态 |
|------|------|------|
| 容量固定 | 是 | 否 |
| 插入复杂度 | O(n) | 摊销 O(1) |
| 实现 | C/C++ 数组 | vector, list, arraylist |

### Python 列表的隐藏复杂度

```python
list.append(x)     # 摊销 O(1)
list.insert(i, x)  # O(n) 后续元素后移
list.pop()         # O(1)
list.pop(i)        # O(n)
x in list          # O(n)
```

### Java ArrayList 同理

`add` 摊销 O(1),但触发扩容时是 O(n)。

---

## 2. 数组常用技巧

### 2.1 原地操作(双指针)

```python
def remove_duplicates(nums):
    slow = 0
    for fast in range(len(nums)):
        if nums[fast] != nums[slow]:
            slow += 1
            nums[slow] = nums[fast]
    return slow + 1
```

### 2.2 前缀和(见 algorithm/05-prefix-diff.md)

### 2.3 差分(见 algorithm/05-prefix-diff.md)

### 2.4 数组旋转

```python
def rotate(nums, k):
    k %= len(nums)
    nums[:] = nums[-k:] + nums[:-k]
    # 原地三次翻转:O(1) 空间
    # reverse(0, n-1), reverse(0, k-1), reverse(k, n-1)
```

### 2.5 下一个排列

```python
def next_permutation(nums):
    n = len(nums)
    i = n - 2
    while i >= 0 and nums[i] >= nums[i+1]:
        i -= 1
    if i >= 0:
        j = n - 1
        while nums[j] <= nums[i]:
            j -= 1
        nums[i], nums[j] = nums[j], nums[i]
    nums[i+1:] = reversed(nums[i+1:])
```

### 2.6 矩阵旋转 90°

```python
# 先转置,再每行翻转
for i in range(n):
    for j in range(i+1, n):
        matrix[i][j], matrix[j][i] = matrix[j][i], matrix[i][j]
for row in matrix:
    row.reverse()
```

---

## 3. 字符串

### 3.1 Python 字符串 vs C++ string

```python
s = "abc"
s[0]            # 访问 O(1)
s[1:3]          # 切片 O(k)
s + "d"         # 新字符串 O(n+m)
s.upper()       # 新字符串
```

```cpp
string s = "abc";
s[0];           // O(1)
s.substr(1,2);  // O(k)
s + "d";        // O(n+m)
```

### 3.2 字符串不可变带来的好处

- 哈希值可以缓存(用于哈希匹配)
- 线程安全
- 子串共享底层 char 数组(Python 的优化)

### 3.3 字符数组 vs 字符串

```cpp
char buf[100];
char* p = strtok(buf, " ");  // 分割,会修改原串
```

---

## 4. 字符串处理技巧

### 4.1 翻转单词顺序

```python
def reverse_words(s):
    return ' '.join(s.split()[::-1])
```

### 4.2 字符串压缩

```python
def compress(chars):
    write = 0
    i = 0
    while i < len(chars):
        j = i
        while j < len(chars) and chars[j] == chars[i]:
            j += 1
        chars[write] = chars[i]
        write += 1
        count = j - i
        if count > 1:
            for c in str(count):
                chars[write] = c
                write += 1
        i = j
    return write
```

### 4.3 KMP(见 algorithm/15-string.md)

### 4.4 字符串哈希(见 algorithm/15-string.md)

---

## 5. 数组越界与循环不变量

### 循环不变量三要素

1. **初始化**:循环开始前为真
2. **保持**:每次迭代后仍为真
3. **终止**:循环结束时给出正确结果

### 经典不变量

```python
# 二分查找
# 不变量: nums[left-1] < target, nums[right+1] >= target
while left <= right:
    mid = (left + right) // 2
    if nums[mid] < target:
        left = mid + 1
    else:
        right = mid - 1
# 终止时 left == right+1,left 即插入位置
```

---

## 6. 数组与字符串的特殊题型

### 6.1 最大子段和(Kadane)

```python
def max_subarray(nums):
    cur = res = nums[0]
    for x in nums[1:]:
        cur = max(x, cur + x)
        res = max(res, cur)
    return res
```

### 6.2 乘积最大子数组(处理负数)

```python
def max_product(nums):
    cur_max = cur_min = res = nums[0]
    for x in nums[1:]:
        if x < 0:
            cur_max, cur_min = cur_min, cur_max
        cur_max = max(x, cur_max * x)
        cur_min = min(x, cur_min * x)
        res = max(res, cur_max)
    return res
```

### 6.3 缺失的第一个正数(O(n) 时间 + O(1) 空间)

```python
def first_missing_positive(nums):
    n = len(nums)
    for i in range(n):
        while 1 <= nums[i] <= n and nums[nums[i]-1] != nums[i]:
            nums[nums[i]-1], nums[i] = nums[i], nums[nums[i]-1]
    for i in range(n):
        if nums[i] != i + 1:
            return i + 1
    return n + 1
```

### 6.4 跳跃游戏

```python
def can_jump(nums):
    farthest = 0
    for i, x in enumerate(nums):
        if i > farthest: return False
        farthest = max(farthest, i + x)
    return True
```

---

## 7. 高维数组与稀疏数组

### 7.1 二维前缀和

```python
# prefix[i+1][j+1] = sum of matrix[0..i][0..j]
# 查询 (r1,r2) x (c1,c2):
# = p[r2+1][c2+1] - p[r1][c2+1] - p[r2+1][c1] + p[r1][c1]
```

### 7.2 稀疏数组:用 dict 存非零元素

```python
matrix = {}
matrix[(0, 5)] = 1
# 节省空间,适合大部分元素为 0
```

### 7.3 CSR/CSC 存储

科学计算中常用,LeetCode 较少见。

---

## 8. 课后 5 题

1. **LC 189** 旋转数组
2. **LC 238** 除自身以外数组的乘积
3. **LC 31** 下一个排列
4. **LC 41** 缺失的第一个正数
5. **LC 152** 乘积最大子数组

---

**下一步**:`02-linked-list.md`。
