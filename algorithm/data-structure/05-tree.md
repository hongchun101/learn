# 树与二叉树

> LeetCode 2000 题中约 25% 与树有关。二叉树是入门,BST 是核心,平衡树是进阶。

---

## 1. 树的术语

- 节点、边、根、叶子
- 子节点、父节点、兄弟节点
- 深度(从根往下)、高度(从叶往上)
- 子树、森林

---

## 2. 二叉树节点

```python
class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right
```

---

## 3. 三大遍历(必须闭眼写)

### 3.1 前序(根-左-右)

```python
def preorder(root):
    if not root: return []
    return [root.val] + preorder(root.left) + preorder(root.right)
```

```python
# 迭代
def preorder_iter(root):
    res, stack = [], [root]
    while stack:
        node = stack.pop()
        if not node: continue
        res.append(node.val)
        stack.append(node.right)
        stack.append(node.left)
    return res
```

### 3.2 中序(左-根-右) — BST 排序

```python
def inorder(root):
    if not root: return []
    return inorder(root.left) + [root.val] + inorder(root.right)
```

```python
# 迭代
def inorder_iter(root):
    res, stack = [], []
    cur = root
    while cur or stack:
        while cur:
            stack.append(cur); cur = cur.left
        cur = stack.pop()
        res.append(cur.val)
        cur = cur.right
    return res
```

### 3.3 后序(左-右-根) — 子树销毁、依赖后序

```python
def postorder(root):
    if not root: return []
    return postorder(root.left) + postorder(root.right) + [root.val]
```

```python
# 迭代(技巧:前序"根右左"再 reverse)
def postorder_iter(root):
    res, stack = [], [root]
    while stack:
        node = stack.pop()
        if not node: continue
        res.append(node.val)
        stack.append(node.left)
        stack.append(node.right)
    return res[::-1]
```

### 3.4 层序(BFS)

```python
from collections import deque
def level_order(root):
    if not root: return []
    res, q = [], deque([root])
    while q:
        level = []
        for _ in range(len(q)):
            node = q.popleft()
            level.append(node.val)
            if node.left: q.append(node.left)
            if node.right: q.append(node.right)
        res.append(level)
    return res
```

---

## 4. 由遍历构造树

### 4.1 前序 + 中序 → 二叉树(LC 105)

```python
def build_tree(preorder, inorder):
    if not preorder: return None
    root_val = preorder[0]
    root = TreeNode(root_val)
    mid = inorder.index(root_val)
    root.left = build_tree(preorder[1:mid+1], inorder[:mid])
    root.right = build_tree(preorder[mid+1:], inorder[mid+1:])
    return root
```

### 4.2 中序 + 后序 → 二叉树(LC 106)

后序的最后一个是根。

### 4.3 前序 + 后序 → 不唯一(除非满二叉树)

---

## 5. 树的递归套路

**万能框架**:

```python
def solve(root):
    # 1. base case
    if not root: return ...
    # 2. 收集左右子树的信息
    left = solve(root.left)
    right = solve(root.right)
    # 3. 用左右信息计算当前
    return combine(root.val, left, right)
```

### 5.1 最大深度(LC 104)

```python
def max_depth(root):
    if not root: return 0
    return 1 + max(max_depth(root.left), max_depth(root.right))
```

### 5.2 最小深度(LC 111)

注意叶子节点判断,不能简单取 min。

### 5.3 树的直径(LC 543)

```python
def diameter(root):
    self.res = 0
    def dfs(node):
        if not node: return 0
        l = dfs(node.left); r = dfs(node.right)
        self.res = max(self.res, l + r)
        return 1 + max(l, r)
    dfs(root)
    return self.res
```

### 5.4 翻转二叉树(LC 226)

```python
def invert(root):
    if not root: return None
    root.left, root.right = invert(root.right), invert(root.left)
    return root
```

### 5.5 验证 BST(LC 98)

```python
def is_valid_bst(root):
    def dfs(node, lo, hi):
        if not node: return True
        if not (lo < node.val < hi): return False
        return dfs(node.left, lo, node.val) and dfs(node.right, node.val, hi)
    return dfs(root, -inf, inf)
```

### 5.6 最近公共祖先(LC 236)

```python
def lowest_common_ancestor(root, p, q):
    if not root or root in (p, q): return root
    left = lowest_common_ancestor(root.left, p, q)
    right = lowest_common_ancestor(root.right, p, q)
    if left and right: return root
    return left or right
```

---

## 6. 路径类问题

### 6.1 路径总和(LC 112/113)

```python
def has_path_sum(root, target):
    if not root: return False
    if not root.left and not root.right:
        return root.val == target
    return (has_path_sum(root.left, target - root.val) or
            has_path_sum(root.right, target - root.val))
```

### 6.2 二叉树最大路径和(LC 124)

```python
def max_path_sum(root):
    self.res = float('-inf')
    def dfs(node):
        if not node: return 0
        l = max(0, dfs(node.left))
        r = max(0, dfs(node.right))
        self.res = max(self.res, node.val + l + r)
        return node.val + max(l, r)
    dfs(root)
    return self.res
```

### 6.3 路径总和 III(LC 437,前缀和+哈希)

```python
def path_sum(root, target):
    from collections import defaultdict
    cnt = defaultdict(int, {0: 1})
    def dfs(node, cur):
        if not node: return 0
        cur += node.val
        res = cnt[cur - target]
        cnt[cur] += 1
        res += dfs(node.left, cur) + dfs(node.right, cur)
        cnt[cur] -= 1
        return res
    return dfs(root, 0)
```

---

## 7. 序列化与反序列化

### 7.1 层序序列化(LC 297)

```python
def serialize(root):
    if not root: return ""
    from collections import deque
    q = deque([root])
    res = []
    while q:
        node = q.popleft()
        if node:
            res.append(str(node.val))
            q.append(node.left)
            q.append(node.right)
        else:
            res.append('null')
    return ','.join(res)

def deserialize(data):
    if not data: return None
    from collections import deque
    vals = data.split(',')
    root = TreeNode(int(vals[0]))
    q = deque([root])
    i = 1
    while q:
        node = q.popleft()
        if vals[i] != 'null':
            node.left = TreeNode(int(vals[i]))
            q.append(node.left)
        i += 1
        if vals[i] != 'null':
            node.right = TreeNode(int(vals[i]))
            q.append(node.right)
        i += 1
    return root
```

---

## 8. BST(二叉搜索树)

### 8.1 性质

- 中序遍历是升序
- 左子树 < 根 < 右子树
- 查询/插入/删除 平均 O(log n)

### 8.2 BST 增删查

```python
def insert(root, val):
    if not root: return TreeNode(val)
    if val < root.val: root.left = insert(root.left, val)
    else: root.right = insert(root.right, val)
    return root

def search(root, val):
    while root:
        if val == root.val: return root
        root = root.left if val < root.val else root.right
    return None

def delete(root, val):
    if not root: return None
    if val < root.val: root.left = delete(root.left, val)
    elif val > root.val: root.right = delete(root.right, val)
    else:
        if not root.left: return root.right
        if not root.right: return root.left
        # 找右子树最小
        mn = root.right
        while mn.left: mn = mn.left
        root.val = mn.val
        root.right = delete(root.right, mn.val)
    return root
```

### 8.3 BST 第 K 小(LC 230)

中序遍历到第 k 个。

### 8.4 BST 转累加树(LC 538)

反向中序(右-根-左)累加。

### 8.5 BST 区间和(LC 938)

剪枝中序遍历。

---

## 9. 平衡二叉树(AVL)

**平衡因子**:左子树高 - 右子树高,绝对值 ≤ 1。

### 9.1 四种旋转

```
      y                x
     / \              / \
    x   T3   →      T1   y
   / \                 / \
  T1  z               z   T3
     / \             / \
    T2  T4          T2  T4
```

- LL:右旋
- RR:左旋
- LR:先左旋左子树,再右旋根
- RL:先右旋右子树,再左旋根

### 9.2 实现

```python
def rotate_right(y):
    x = y.left
    T2 = x.right
    x.right = y
    y.left = T2
    y.height = 1 + max(h(y.left), h(y.right))
    x.height = 1 + max(h(x.left), h(x.right))
    return x

def rotate_left(x):
    y = x.right
    T2 = y.left
    y.left = x
    x.right = T2
    # 更新高度
    return y
```

---

## 10. 红黑树(简化版)

### 10.1 性质

1. 每个节点红或黑
2. 根黑,叶(NIL)黑
3. 红节点的子节点必黑
4. 任一节点到叶子的所有路径黑节点数相同(黑高)

### 10.2 调整

- 左旋/右旋
- 变色

### 10.3 工程实现

- Java `TreeMap`
- C++ `std::map`
- Linux `rbtree`

---

## 11. 树的常见算法题汇总

### 11.1 叶子相似的树(LC 872)
### 11.2 对称二叉树(LC 101)
### 11.3 相同的树(LC 100)
### 11.4 填充每个节点的下一个右侧节点指针(LC 116)
### 11.5 二叉树的锯齿形层序遍历(LC 103)
### 11.6 从前序与中序遍历序列构造二叉树(LC 105)
### 11.7 二叉树的序列化与反序列化(LC 297)

---

## 12. 课后 5 题

1. **LC 124** 二叉树中的最大路径和
2. **LC 236** 二叉树的最近公共祖先
3. **LC 297** 二叉树的序列化与反序列化
4. **LC 98** 验证二叉搜索树
5. **LC 437** 路径总和 III

---

**下一步**:`06-heap.md`。
