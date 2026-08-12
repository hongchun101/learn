# 平衡树(AVL/红黑树/Treap/Splay)

> BST 在最坏情况下退化为链表。平衡树通过调整保持 O(log n)。

---

## 1. AVL 树

**平衡因子**:`BF = height(L) - height(R)`,必须 ∈ {-1, 0, 1}。

### 1.1 四种失衡

```
LL: 左子树的左子树过高 → 右旋
RR: 右子树的右子树过高 → 左旋
LR: 左子树的右子树过高 → 左旋左子树,再右旋根
RL: 右子树的左子树过高 → 右旋右子树,再左旋根
```

### 1.2 实现

见 `data-structure/05-tree.md` 第 9 节。

### 1.3 复杂度

| 操作 | 复杂度 |
|------|--------|
| 增/删/查 | O(log n) |
| 旋转 | O(1) |

---

## 2. 红黑树(RBT)

### 2.1 五大性质

1. 每个节点红或黑
2. 根黑
3. 叶(NIL)黑
4. 红节点子节点必黑
5. 任一节点到叶的路径黑节点数相同

### 2.2 平衡原理

最长路径 ≤ 2 × 最短路径,故树高 ≤ 2 log n。

### 2.3 操作

- 变色 + 旋转
- 插入:3 种情况修正
- 删除:4 种情况修正

### 2.4 C++ STL `std::map` 内部就是 RBT

---

## 3. Treap(树堆)

**思想**:BST + 堆。每个节点有 key(BST 序)和 priority(堆序)。

```
key: BST 性质
priority: 堆性质
```

### 3.1 实现(隐式 Treap,用作"有序数组")

```python
import random
class TreapNode:
    def __init__(self, key):
        self.key = key
        self.prio = random.random()
        self.size = 1
        self.left = None
        self.right = None

def update(node):
    if node:
        node.size = 1 + (node.left.size if node.left else 0) + (node.right.size if node.right else 0)

def rotate_right(p):
    q = p.left
    p.left = q.right
    q.right = p
    update(p); update(q)
    return q

def rotate_left(p):
    q = p.right
    p.right = q.left
    q.left = p
    update(p); update(q)
    return q

def treap_insert(node, key):
    if not node: return TreapNode(key)
    if key < node.key:
        node.left = treap_insert(node.left, key)
        if node.left.prio < node.prio:
            node = rotate_right(node)
    else:
        node.right = treap_insert(node.right, key)
        if node.right.prio < node.prio:
            node = rotate_left(node)
    update(node)
    return node
```

### 3.2 用途

- 平衡 BST
- 区间分裂/合并(隐式 Treap)
- 替代 Splay

---

## 4. Splay 树(伸展树)

### 4.1 思想

每次访问的节点通过"伸展"操作旋转到根。

### 4.2 旋转规则

- zig / zag
- zig-zig / zag-zag
- zig-zag / zag-zig

### 4.3 复杂度

均摊 O(log n),最坏 O(n)。

### 4.4 用途

- LRU 缓存
- 区间操作
- 动态树

---

## 5. 跳表(Skip List)

详见 `13-skiplist.md`。

---

## 6. 平衡树选型矩阵

| 场景 | 推荐 |
|------|------|
| 工程通用 | RBT |
| 教学/竞赛 | Treap |
| 自适应缓存 | Splay |
| 并发 | 跳表 |
| 静态排序 | 排序 |

| 数据结构 | 平均 | 最坏 | 实现难度 |
|---------|------|------|---------|
| AVL | O(log n) | O(log n) | 中 |
| RBT | O(log n) | O(log n) | 高 |
| Treap | O(log n) | O(log n) | 低 |
| Splay | O(log n) | O(n) | 中 |

---

## 7. LeetCode 平衡树题

### 7.1 数据流第 K 大(LC 703)

直接用堆更简单,平衡树用于"在线第 k 大 + 删除"。

### 7.2 黑名单随机数(LC 710)

用数组+哈希或平衡树。

### 7.3 我的日程安排(LC 729/731)

TreeMap 维护区间。

### 7.4 滑动窗口中位数(LC 480)

双堆+延迟删除或两个有序数据结构。

---

## 8. 工程实现参考

| 语言 | 容器 | 底层 |
|------|------|------|
| C++ STL | map / set | RBT |
| Java | TreeMap / TreeSet | RBT |
| Python | sortedcontainers | 跳表 |
| Go | map | 哈希 |
| Rust | BTreeMap | B 树 |

---

## 9. 课后 5 题

1. **LC 703** 数据流中的第 K 大元素
2. **LC 729** 我的日程安排表 I
3. **LC 731** 我的日程安排表 II
4. **LC 732** 我的日程安排表 III
5. **LC 855** 考场就座(用有序集合)

---

**下一步**:`12-monotonic.md`。
