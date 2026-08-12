# 哈希表

> O(1) 查找的银弹。LeetCode 50% 的优化题都是"加一层哈希"。

---

## 1. 哈希表原理

### 1.1 核心思想

通过哈希函数 h(key) 将 key 映射到数组下标,实现 O(1) 平均查找。

### 1.2 冲突处理

| 方法 | 描述 | 复杂度 |
|------|------|--------|
| 链地址法 | 同一下标用链表 | 平均 O(1), 最坏 O(n) |
| 开放地址法 | 找下一个空槽 | 装载因子敏感 |
| 再哈希法 | 用多个哈希函数 | 较少用 |
| 公共溢出区 | 单独存溢出 | 较少用 |

### 1.3 装载因子

`α = n / m` (n 元素,m 槽)
- 链地址法 α ≤ 1
- 开放地址 α ≤ 0.7

超阈值时需要扩容(2x)。

---

## 2. 哈希函数设计

### 2.1 整数

```python
h(k) = k % m   # m 选质数
```

### 2.2 字符串(djb2)

```python
def h(s):
    h = 5381
    for c in s:
        h = (h * 33 + ord(c)) & 0xFFFFFFFF
    return h % m
```

### 2.3 浮点数

```python
h(k) = int(str(k).encode().hex(), 16) % m
```

### 2.4 复合 key

```python
h((x, y)) = (h(x) * p1 + h(y)) % m
```

---

## 3. Python 字典与集合

### 3.1 dict 内部实现

- **Python 3.7+** 保证插入顺序
- 开放地址法
- 装载因子 2/3 时扩容

### 3.2 dict 复杂度

| 操作 | 平均 | 最坏(哈希攻击) |
|------|------|---------------|
| `d[k]` | O(1) | O(n) |
| `d[k] = v` | O(1) | O(n) |
| `del d[k]` | O(1) | O(n) |
| `k in d` | O(1) | O(n) |

### 3.3 set vs dict

- `set` 只有 key,`dict` 是 key-value
- 内部都基于哈希表

### 3.4 Counter / defaultdict / OrderedDict

```python
from collections import Counter, defaultdict, OrderedDict

cnt = Counter(['a', 'b', 'a'])  # {'a':2, 'b':1}
g = defaultdict(list)
g['x'].append(1)  # 自动初始化

od = OrderedDict()
od.move_to_end('a')  # LRU
```

---

## 4. C++ unordered_map / unordered_set

### 4.1 复杂度(与 Python 类似)

### 4.2 自定义哈希(防止攻击)

```cpp
struct custom_hash {
    size_t operator()(uint64_t x) const {
        x ^= x >> 33;
        x *= 0xff51afd7ed558ccd;
        x ^= x >> 33;
        x *= 0xc4ceb9fe1a85ec53;
        x ^= x >> 33;
        return x;
    }
};
unordered_map<long long, int, custom_hash> mp;
```

### 4.3 pair 的哈希

```cpp
struct pair_hash {
    size_t operator()(const pair<int,int>& p) const {
        return hash<long long>()(((long long)p.first << 32) ^ p.second);
    }
};
```

---

## 5. Java HashMap

- 数组 + 链表 + 红黑树(链表长度 ≥ 8 升级)
- 默认装载因子 0.75

---

## 6. 哈希的经典应用

### 6.1 两数之和(LC 1)

```python
def two_sum(nums, target):
    seen = {}
    for i, x in enumerate(nums):
        if target - x in seen: return [seen[target - x], i]
        seen[x] = i
```

### 6.2 字母异位词分组(LC 49)

```python
def group_anagrams(strs):
    from collections import defaultdict
    groups = defaultdict(list)
    for s in strs:
        key = ''.join(sorted(s))
        groups[key].append(s)
    return list(groups.values())
```

### 6.3 最长连续序列(LC 128)

```python
def longest_consecutive(nums):
    s = set(nums)
    res = 0
    for x in s:
        if x - 1 not in s:  # 起点
            cur = 1
            while x + cur in s: cur += 1
            res = max(res, cur)
    return res
```

### 6.4 四数相加 II(LC 454)

O(n^2) 哈希,优于 O(n^4) 暴力。

### 6.5 LRU / LFU(见 02-linked-list.md)

---

## 7. 哈希表选型矩阵

| 场景 | Python | C++ |
|------|--------|-----|
| 通用 KV | dict | unordered_map |
| 集合 | set | unordered_set |
| 有序 | OrderedDict | map |
| 计数 | Counter | map |
| 多重集 | Counter | multiset |

---

## 8. 哈希表的"陷阱"

### 8.1 哈希冲突攻击

恶意构造 key 全部哈希到同槽,O(1) 退化为 O(n)。
防御:随机化哈希种子,使用加密哈希(如 SipHash)。

### 8.2 哈希表的常数很大

Python dict 实际常数约 50-100 ns。对于小数据,数组可能更快。

### 8.3 不可哈希的对象

- 列表:可变,不可哈希
- 集合:可变,不可哈希
- dict:可变,不可哈希

**解决**:用 `frozenset`、`tuple` 或自定义 `__hash__`。

### 8.4 浮点数哈希

```python
hash(1.0) == hash(1)  # True! 都映射到 1
```

---

## 9. 哈希表的进阶用法

### 9.1 一致性哈希

分布式缓存用,见系统设计。

### 9.2 布隆过滤器

多个哈希函数,空间 O(1) 判断"可能在/一定不在"。

### 9.3 完美哈希

静态集合 + 无冲突哈希。gperf 工具。

---

## 10. 课后 5 题

1. **LC 1** 两数之和
2. **LC 49** 字母异位词分组
3. **LC 128** 最长连续序列
4. **LC 146** LRU 缓存
5. **LC 560** 和为 K 的子数组(前缀和+哈希)

---

**下一步**:`05-tree.md`。
