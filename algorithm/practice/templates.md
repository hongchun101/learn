# 80+ 高频代码模板

> 80 个核心模式对应的 LeetCode 高频代码模板。背下来,2000 题全打通。

---

## 使用说明

- 每条模板都给出"模板代码 + 适用场景 + 经典题"
- 模板是骨架,改条件即可套用 80% 的题
- 配套 Python / C++ 双版本

---

## 模板总览(80 个)

```
T01-T10:  数组/字符串
T11-T20:  链表
T21-T30:  栈/队列
T31-T40:  哈希/堆
T41-T50:  树
T51-T60:  图
T61-T70:  字符串
T71-T80:  DP
```

---

## 一、数组/字符串(10)

### T01:二分查找精确值

```python
def bsearch(nums, target):
    lo, hi = 0, len(nums) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if nums[mid] == target: return mid
        elif nums[mid] < target: lo = mid + 1
        else: hi = mid - 1
    return -1
```

**适用**:LC 35, 69, 367, 374, 704 / 旋转数组:LC 33, 81, 153, 154

### T02:二分查找边界

```python
def lower_bound(nums, target):
    lo, hi = 0, len(nums)
    while lo < hi:
        mid = (lo + hi) // 2
        if nums[mid] < target: lo = mid + 1
        else: hi = mid
    return lo
```

**适用**:LC 34, 436, 658, 875, 1011

### T03:双指针(对撞)

```python
def two_pointer(arr):
    lo, hi = 0, len(arr) - 1
    while lo < hi:
        if condition(arr[lo], arr[hi]):
            lo += 1
        else:
            hi -= 1
```

**适用**:LC 11, 15, 16, 18, 42, 167

### T04:快慢指针(原地去重)

```python
def dedup(nums):
    slow = 0
    for fast in range(len(nums)):
        if nums[fast] != nums[slow]:
            slow += 1
            nums[slow] = nums[fast]
    return slow + 1
```

**适用**:LC 26, 27, 80, 283

### T05:滑动窗口(定长)

```python
def fixed_window(nums, k):
    cur = sum(nums[:k])
    res = cur
    for i in range(k, len(nums)):
        cur += nums[i] - nums[i - k]
        res = max(res, cur)
    return res
```

**适用**:LC 643, 1052, 1343

### T06:滑动窗口(变长)

```python
def variable_window(s, target):
    from collections import Counter
    need = Counter(target); window = {}
    have, need_cnt = 0, len(need)
    lo = res = 0
    for hi, c in enumerate(s):
        window[c] = window.get(c, 0) + 1
        if c in need and window[c] == need[c]: have += 1
        while have == need_cnt:
            res = min(res, hi - lo + 1)
            d = s[lo]; lo += 1
            if d in need and window[d] == need[d]: have -= 1
            window[d] -= 1
    return res
```

**适用**:LC 3, 76, 209, 438, 567, 862, 992

### T07:前缀和(一维)

```python
def prefix_sum(nums):
    p = [0] * (len(nums) + 1)
    for i, x in enumerate(nums):
        p[i+1] = p[i] + x
    return lambda l, r: p[r+1] - p[l]
```

**适用**:LC 303, 560, 523, 525, 974

### T08:前缀和+哈希(子数组计数)

```python
def subarray_count(nums, target):
    from collections import defaultdict
    cnt = defaultdict(int, {0: 1})
    cur = res = 0
    for x in nums:
        cur += x
        res += cnt[cur - target]
        cnt[cur] += 1
    return res
```

**适用**:LC 560, 437, 930, 974

### T09:差分(区间修改)

```python
class Diff:
    def __init__(self, n):
        self.diff = [0] * (n + 1)
    def update(self, l, r, v):
        self.diff[l] += v
        self.diff[r+1] -= v
    def result(self):
        cur = 0
        for i in range(len(self.diff) - 1):
            cur += self.diff[i]
            self.diff[i] = cur
        return self.diff[:-1]
```

**适用**:LC 1094, 1109, 1674

### T10:二维前缀和

```python
class MatrixSum:
    def __init__(self, m):
        self.S = [[0] * (len(m[0]) + 1) for _ in range(len(m) + 1)]
        for i in range(len(m)):
            for j in range(len(m[0])):
                self.S[i+1][j+1] = m[i][j] + self.S[i][j+1] + self.S[i+1][j] - self.S[i][j]
    def query(self, r1, c1, r2, c2):
        return self.S[r2+1][c2+1] - self.S[r1][c2+1] - self.S[r2+1][c1] + self.S[r1][c1]
```

**适用**:LC 304, 1074, 1314

---

## 二、链表(10)

### T11:反转链表

```python
def reverse(head):
    pre, cur = None, head
    while cur:
        nxt = cur.next
        cur.next = pre
        pre = cur
        cur = nxt
    return pre
```

**适用**:LC 206, 92, 25

### T12:快慢指针(找中点/判环)

```python
def find_mid(head):
    slow = fast = head
    while fast and fast.next:
        slow = slow.next
        fast = fast.next.next
    return slow

def has_cycle(head):
    slow = fast = head
    while fast and fast.next:
        slow = slow.next
        fast = fast.next.next
        if slow is fast: return True
    return False
```

**适用**:LC 141, 142, 876, 234

### T13:合并有序链表

```python
def merge(l1, l2):
    dummy = ListNode(0)
    cur = dummy
    while l1 and l2:
        if l1.val < l2.val:
            cur.next = l1; l1 = l1.next
        else:
            cur.next = l2; l2 = l2.next
        cur = cur.next
    cur.next = l1 or l2
    return dummy.next
```

**适用**:LC 21, 23, 148

### T14:链表 K 个一组反转

```python
def reverse_k_group(head, k):
    dummy = ListNode(0, head)
    pre = dummy
    while True:
        end = pre
        for _ in range(k):
            end = end.next
            if not end: return dummy.next
        start = pre.next
        cur = start.next
        while cur != end:
            nxt = cur.next
            cur.next = pre.next
            pre.next = cur
            cur = nxt
        start.next = end.next
        pre = start
    return dummy.next
```

**适用**:LC 25

### T15:复杂链表复制(原地)

```python
def copy_random(head):
    if not head: return None
    # 拼接 A→A'→B→B'...
    cur = head
    while cur:
        nxt = cur.next
        cur.next = Node(cur.val, nxt)
        cur = nxt
    # random
    cur = head
    while cur:
        if cur.random: cur.next.random = cur.random.next
        cur = cur.next.next
    # 拆分
    cur = head
    nhead = head.next
    while cur.next:
        nxt = cur.next
        cur.next = nxt.next
        cur = nxt
    return nhead
```

**适用**:LC 138

### T16:LRU 缓存

```python
class LRUCache:
    def __init__(self, capacity):
        from collections import OrderedDict
        self.cache = OrderedDict()
        self.cap = capacity
    def get(self, key):
        if key not in self.cache: return -1
        self.cache.move_to_end(key)
        return self.cache[key]
    def put(self, key, value):
        if key in self.cache:
            self.cache.move_to_end(key)
        self.cache[key] = value
        if len(self.cache) > self.cap:
            self.cache.popitem(last=False)
```

**适用**:LC 146

### T17:链表相交

```python
def get_intersection(a, b):
    p, q = a, b
    while p is not q:
        p = p.next if p else b
        q = q.next if q else a
    return p
```

**适用**:LC 160, 1650

### T18:链表重排

```python
def reorder(head):
    # 1. 找中点
    slow, fast = head, head.next
    while fast and fast.next:
        slow = slow.next
        fast = fast.next.next
    # 2. 反转后半
    p, q = None, slow.next
    slow.next = None
    while q:
        nxt = q.next; q.next = p; p = q; q = nxt
    # 3. 合并
    l, r = head, p
    while r:
        l.next, r.next, l, r = r, l.next, l.next, r.next
    return head
```

**适用**:LC 143

### T19:链表排序

```python
def sort_list(head):
    if not head or not head.next: return head
    slow, fast = head, head.next
    while fast and fast.next:
        slow = slow.next
        fast = fast.next.next
    mid = slow.next
    slow.next = None
    return merge(sort_list(head), sort_list(mid))
```

**适用**:LC 148

### T20:删除倒数第 N 个

```python
def remove_nth(head, n):
    dummy = ListNode(0, head)
    fast = dummy
    for _ in range(n): fast = fast.next
    slow = dummy
    while fast.next:
        slow = slow.next; fast = fast.next
    slow.next = slow.next.next
    return dummy.next
```

**适用**:LC 19

---

## 三、栈/队列(10)

### T21:有效括号

```python
def is_valid(s):
    stack = []
    pairs = {')':'(', ']':'[', '}':'{'}
    for c in s:
        if c in '([{':
            stack.append(c)
        elif not stack or stack.pop() != pairs[c]:
            return False
    return not stack
```

**适用**:LC 20, 32, 678, 1021

### T22:单调栈(下一个更大)

```python
def next_greater(nums):
    stack = []
    res = [-1] * len(nums)
    for i, x in enumerate(nums):
        while stack and nums[stack[-1]] < x:
            res[stack.pop()] = x
        stack.append(i)
    return res
```

**适用**:LC 496, 503, 739, 901, 907

### T23:柱状图最大矩形

```python
def largest_rect(heights):
    heights = [0] + heights + [0]
    stack = []
    res = 0
    for i, h in enumerate(heights):
        while stack and heights[stack[-1]] > h:
            j = stack.pop()
            res = max(res, heights[j] * (i - stack[-1] - 1))
        stack.append(i)
    return res
```

**适用**:LC 84, 85

### T24:单调队列(滑动窗口最大)

```python
def max_sliding(nums, k):
    from collections import deque
    q = deque()
    res = []
    for i, x in enumerate(nums):
        while q and nums[q[-1]] < x: q.pop()
        q.append(i)
        if q[0] <= i - k: q.popleft()
        if i >= k - 1: res.append(nums[q[0]])
    return res
```

**适用**:LC 239, 480, 862, 1438, 1696

### T25:中缀转后缀 + 计算

```python
def eval_expr(s):
    prec = {'+':1, '-':1, '*':2, '/':2}
    out, op = [], []
    i = 0
    while i < len(s):
        if s[i].isdigit():
            j = i
            while j < len(s) and s[j].isdigit(): j += 1
            out.append(int(s[i:j])); i = j
        elif s[i] == '(':
            op.append(s[i]); i += 1
        elif s[i] == ')':
            while op and op[-1] != '(':
                out.append(op.pop())
            op.pop(); i += 1
        else:
            while op and op[-1] != '(' and prec[op[-1]] >= prec[s[i]]:
                out.append(op.pop())
            op.append(s[i]); i += 1
    while op: out.append(op.pop())
    # 计算后缀
    st = []
    for x in out:
        if isinstance(x, int): st.append(x)
        else:
            b, a = st.pop(), st.pop()
            if x == '+': st.append(a + b)
            elif x == '-': st.append(a - b)
            elif x == '*': st.append(a * b)
            else: st.append(int(a / b))
    return st[0]
```

**适用**:LC 150, 224, 227, 772, 1006

### T26:逆波兰式

```python
def eval_rpn(tokens):
    st = []
    for t in tokens:
        if t in '+-*/':
            b, a = st.pop(), st.pop()
            if t == '+': st.append(a + b)
            elif t == '-': st.append(a - b)
            elif t == '*': st.append(a * b)
            else: st.append(int(a / b))
        else: st.append(int(t))
    return st[0]
```

**适用**:LC 150

### T27:栈模拟递归(逆波兰 + 括号)

```python
def decode(s):
    stack = []
    for c in s:
        if c != ']': stack.append(c)
        else:
            sub = ''
            while stack and stack[-1] != '[':
                sub = stack.pop() + sub
            stack.pop()
            k = ''
            while stack and stack[-1].isdigit():
                k = stack.pop() + k
            stack.append(sub * int(k))
    return ''.join(stack)
```

**适用**:LC 394, 394, 1106, 726

### T28:字符串去重(字典序最小)

```python
def remove_duplicates(s):
    last = {c: i for i, c in enumerate(s)}
    seen = set()
    stack = []
    for i, c in enumerate(s):
        if c in seen: continue
        while stack and stack[-1] > c and last[stack[-1]] > i:
            seen.discard(stack.pop())
        stack.append(c)
        seen.add(c)
    return ''.join(stack)
```

**适用**:LC 316, 1081

### T29:用栈实现队列

```python
class MyQueue:
    def __init__(self):
        self.in_, self.out = [], []
    def push(self, x):
        self.in_.append(x)
    def pop(self):
        if not self.out:
            while self.in_: self.out.append(self.in_.pop())
        return self.out.pop()
    def peek(self):
        if not self.out:
            while self.in_: self.out.append(self.in_.pop())
        return self.out[-1]
    def empty(self):
        return not self.in_ and not self.out
```

**适用**:LC 232, 895

### T30:最小栈

```python
class MinStack:
    def __init__(self):
        self.stack = []
    def push(self, x):
        cur = x if not self.stack else min(x, self.stack[-1][1])
        self.stack.append((x, cur))
    def pop(self):
        self.stack.pop()
    def top(self):
        return self.stack[-1][0]
    def get_min(self):
        return self.stack[-1][1]
```

**适用**:LC 155

---

## 四、哈希/堆(10)

### T31:堆(优先队列)

```python
import heapq
heap = []
heapq.heappush(heap, x)
heapq.heappop(heap)
heap[0]  # peek O(1)
```

**适用**:LC 215, 347, 264, 407, 355

### T32:第 K 大/小

```python
def kth_largest(nums, k):
    import heapq
    heap = nums[:k]
    heapq.heapify(heap)
    for x in nums[k:]:
        if x > heap[0]:
            heapq.heapreplace(heap, x)
    return heap[0]
```

**适用**:LC 215, 378, 786, 973

### T33:数据流中位数

```python
import heapq
class MedianFinder:
    def __init__(self):
        self.lo = []  # 大顶堆(取负)
        self.hi = []  # 小顶堆
    def add_num(self, num):
        heapq.heappush(self.lo, -num)
        heapq.heappush(self.hi, -heapq.heappop(self.lo))
        if len(self.hi) > len(self.lo):
            heapq.heappush(self.lo, -heapq.heappop(self.hi))
    def find_median(self):
        if len(self.lo) > len(self.hi): return -self.lo[0]
        return (-self.lo[0] + self.hi[0]) / 2
```

**适用**:LC 295, 480

### T34:LRU(LFU)

见 T16。

### T35:前缀和哈希(子数组计数)

见 T08。

### T36:滑动窗口+哈希

见 T06。

### T37:建堆 O(n)

```python
def heapify(arr):
    n = len(arr)
    for i in range((n - 2) // 2, -1, -1):
        sift_down(arr, i, n)
```

**适用**:堆排基础

### T38:合并 K 个有序流

```python
def merge_k(streams):
    import heapq
    heap = []
    for i, s in enumerate(streams):
        if s: heapq.heappush(heap, (s[0], i, 0))
    res = []
    while heap:
        v, i, j = heapq.heappop(heap)
        res.append(v)
        if j + 1 < len(streams[i]):
            heapq.heappush(heap, (streams[i][j+1], i, j+1))
    return res
```

**适用**:LC 23, 632, 786

### T39:蓄水池抽样

```python
import random
def reservoir(stream, k):
    sample = []
    for i, x in enumerate(stream):
        if i < k:
            sample.append(x)
        elif random.randint(0, i) < k:
            sample[random.randint(0, k-1)] = x
    return sample
```

**适用**:LC 382, 398, 528

### T40:Counter + defaultdict

```python
from collections import Counter, defaultdict
cnt = Counter(arr)
g = defaultdict(list)
```

**适用**:LC 49, 347, 692, 954

---

## 五、树(10)

### T41:二叉树三种遍历(递归)

```python
def preorder(node):
    if not node: return []
    return [node.val] + preorder(node.left) + preorder(node.right)

def inorder(node):
    if not node: return []
    return inorder(node.left) + [node.val] + inorder(node.right)

def postorder(node):
    if not node: return []
    return postorder(node.left) + postorder(node.right) + [node.val]
```

**适用**:LC 94, 144, 145, 102

### T42:二叉树迭代遍历

```python
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

**适用**:LC 94, 144, 145, 173

### T43:BFS 层序

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

**适用**:LC 102, 107, 103, 199, 429

### T44:树形 DP 模板

```python
def solve(root):
    def dfs(node):
        if not node: return ...
        l = dfs(node.left); r = dfs(node.right)
        return combine(node.val, l, r)
    return dfs(root)
```

**适用**:LC 124, 337, 543, 687, 968

### T45:最近公共祖先(LCA)

```python
def lca(root, p, q):
    if not root or root in (p, q): return root
    l = lca(root.left, p, q); r = lca(root.right, p, q)
    return root if l and r else l or r
```

**适用**:LC 235, 236, 1644, 1650, 1676

### T46:由遍历构造树

```python
def build(pre, ino):
    if not pre: return None
    root = TreeNode(pre[0])
    mid = ino.index(pre[0])
    root.left = build(pre[1:mid+1], ino[:mid])
    root.right = build(pre[mid+1:], ino[mid+1:])
    return root
```

**适用**:LC 105, 106, 889

### T47:BST 增删查

```python
def insert(root, v):
    if not root: return TreeNode(v)
    if v < root.val: root.left = insert(root.left, v)
    else: root.right = insert(root.right, v)
    return root

def delete(root, v):
    if not root: return None
    if v < root.val: root.left = delete(root.left, v)
    elif v > root.val: root.right = delete(root.right, v)
    else:
        if not root.left: return root.right
        if not root.right: return root.left
        mn = root.right
        while mn.left: mn = mn.left
        root.val = mn.val
        root.right = delete(root.right, mn.val)
    return root
```

**适用**:LC 700, 701, 450, 230, 538

### T48:Trie

```python
class Trie:
    def __init__(self):
        self.children = {}
        self.is_end = False
    def insert(self, word):
        node = self
        for c in word:
            if c not in node.children: node.children[c] = Trie()
            node = node.children[c]
        node.is_end = True
    def search(self, word):
        node = self._find(word)
        return node is not None and node.is_end
    def starts_with(self, p):
        return self._find(p) is not None
    def _find(self, s):
        node = self
        for c in s:
            if c not in node.children: return None
            node = node.children[c]
        return node
```

**适用**:LC 208, 211, 212, 421, 648, 676

### T49:线段树(懒标记)

```python
class SegTreeLazy:
    def __init__(self, n):
        self.n = n; self.t = [0]*(4*n); self.lz = [0]*(4*n)
    def push(self, node, l, r):
        if self.lz[node]:
            m = (l+r)//2
            for c in (node*2, node*2+1):
                self.t[c] += self.lz[node] * (m-l+1 if c==node*2 else r-m)
                self.lz[c] += self.lz[node]
            self.lz[node] = 0
    def update(self, node, l, r, ql, qr, v):
        if ql <= l and r <= qr:
            self.t[node] += v * (r-l+1); self.lz[node] += v; return
        self.push(node, l, r)
        m = (l+r)//2
        if ql <= m: self.update(node*2, l, m, ql, qr, v)
        if qr > m: self.update(node*2+1, m+1, r, ql, qr, v)
        self.t[node] = self.t[node*2] + self.t[node*2+1]
    def query(self, node, l, r, ql, qr):
        if ql <= l and r <= qr: return self.t[node]
        self.push(node, l, r)
        m = (l+r)//2; s = 0
        if ql <= m: s += self.query(node*2, l, m, ql, qr)
        if qr > m: s += self.query(node*2+1, m+1, r, ql, qr)
        return s
```

**适用**:LC 307, 732, 1500

### T50:BIT

```python
class BIT:
    def __init__(self, n):
        self.n = n; self.t = [0]*(n+1)
    def add(self, i, v):
        while i <= self.n:
            self.t[i] += v; i += i & -i
    def sum(self, i):
        s = 0
        while i > 0:
            s += self.t[i]; i -= i & -i
        return s
    def range_sum(self, l, r):
        return self.sum(r) - self.sum(l-1)
```

**适用**:LC 307, 315, 493, 308, 2407

---

## 六、图(10)

### T51:Dijkstra

```python
import heapq
def dijkstra(g, start, n):
    INF = float('inf'); dist = [INF]*n
    dist[start] = 0
    pq = [(0, start)]
    while pq:
        d, u = heapq.heappop(pq)
        if d > dist[u]: continue
        for v, w in g[u]:
            if d + w < dist[v]:
                dist[v] = d + w
                heapq.heappush(pq, (dist[v], v))
    return dist
```

**适用**:LC 743, 787, 882, 1102, 1514

### T52:拓扑排序(Kahn)

```python
def topo(n, g, indeg):
    from collections import deque
    q = deque([i for i in range(n) if indeg[i] == 0])
    res = []
    while q:
        u = q.popleft()
        res.append(u)
        for v in g[u]:
            indeg[v] -= 1
            if indeg[v] == 0: q.append(v)
    return res if len(res) == n else []
```

**适用**:LC 207, 210, 269, 802

### T53:并查集(DSU)

```python
class DSU:
    def __init__(self, n):
        self.par = list(range(n)); self.rk = [0]*n
    def find(self, x):
        while self.par[x] != x:
            self.par[x] = self.par[self.par[x]]; x = self.par[x]
        return x
    def union(self, x, y):
        rx, ry = self.find(x), self.find(y)
        if rx == ry: return False
        if self.rk[rx] < self.rk[ry]: rx, ry = ry, rx
        self.par[ry] = rx
        if self.rk[rx] == self.rk[ry]: self.rk[rx] += 1
        return True
```

**适用**:LC 547, 684, 721, 990, 1202

### T54:Kruskal MST

```python
def kruskal(n, edges):
    dsu = DSU(n)
    edges.sort(key=lambda x: x[2])
    mst = []
    for u, v, w in edges:
        if dsu.union(u, v):
            mst.append((u, v, w))
            if len(mst) == n-1: break
    return mst
```

**适用**:LC 1135, 1168, 1489, 1584

### T55:BFS 最短路

```python
from collections import deque
def bfs(start, target, neighbors):
    visited = {start}; q = deque([(start, 0)])
    while q:
        node, d = q.popleft()
        if node == target: return d
        for nb in neighbors(node):
            if nb not in visited:
                visited.add(nb); q.append((nb, d+1))
    return -1
```

**适用**:LC 1091, 127, 433, 542, 773, 815

### T56:DFS(连通分量)

```python
def dfs(node, visited):
    visited.add(node)
    for nb in neighbors(node):
        if nb not in visited: dfs(nb, visited)
```

**适用**:LC 200, 547, 695, 994, 130, 417

### T57:Tarjan SCC

```python
def tarjan(n, g):
    idx, low, on_stack, stack, comp = [0]*n, [0]*n, [False]*n, [], []
    cnt = [0]; comps = []
    def dfs(u):
        idx[u] = low[u] = cnt[0]; cnt[0] += 1
        stack.append(u); on_stack[u] = True
        for v in g[u]:
            if idx[v] == 0:
                dfs(v); low[u] = min(low[u], low[v])
            elif on_stack[v]:
                low[u] = min(low[u], idx[v])
        if low[u] == idx[u]:
            c = []
            while True:
                v = stack.pop(); on_stack[v] = False
                c.append(v)
                if v == u: break
            comps.append(c)
    for i in range(n):
        if idx[i] == 0: dfs(i)
    return comps
```

**适用**:LC 1192, 1489

### T58:Bellman-Ford

```python
def bf(n, edges, start):
    INF = float('inf'); dist = [INF]*n
    dist[start] = 0
    for _ in range(n - 1):
        for u, v, w in edges:
            if dist[u] + w < dist[v]: dist[v] = dist[u] + w
    # 检测负环
    for u, v, w in edges:
        if dist[u] + w < dist[v]: return None
    return dist
```

**适用**:LC 787, K 站中转内

### T59:Floyd 全源最短路

```python
def floyd(g, n):
    for k in range(n):
        for i in range(n):
            for j in range(n):
                if g[i][k] + g[k][j] < g[i][j]:
                    g[i][j] = g[i][k] + g[k][j]
    return g
```

**适用**:稠密图全源

### T60:LCA 倍增

```python
class LCA:
    def __init__(self, g, root, n):
        self.LOG = n.bit_length()
        self.up = [[-1]*n for _ in range(self.LOG)]
        self.depth = [0]*n
        self._dfs(root, -1)
        for j in range(1, self.LOG):
            for i in range(n):
                if self.up[j-1][i] != -1:
                    self.up[j][i] = self.up[j-1][self.up[j-1][i]]
    def _dfs(self, u, p):
        self.up[0][u] = p
        for v in self.g[u]:
            if v != p:
                self.depth[v] = self.depth[u] + 1
                self._dfs(v, u)
    def lca(self, u, v):
        if self.depth[u] < self.depth[v]: u, v = v, u
        d = self.depth[u] - self.depth[v]
        for k in range(self.LOG):
            if d >> k & 1: u = self.up[k][u]
        if u == v: return u
        for k in range(self.LOG-1, -1, -1):
            if self.up[k][u] != self.up[k][v]:
                u = self.up[k][u]; v = self.up[k][v]
        return self.up[0][u]
```

**适用**:LC 1483, 1740, 2096

---

## 七、字符串(10)

### T61:KMP

```python
def kmp(s, p):
    n, m = len(s), len(p)
    nxt = [0] * m
    j = 0
    for i in range(1, m):
        while j > 0 and p[i] != p[j]: j = nxt[j-1]
        if p[i] == p[j]: j += 1
        nxt[i] = j
    j = 0
    for i in range(n):
        while j > 0 and s[i] != p[j]: j = nxt[j-1]
        if s[i] == p[j]: j += 1
        if j == m: yield i - m + 1; j = nxt[j-1]
```

**适用**:LC 28, 459, 1392

### T62:Z 函数

```python
def z_function(s):
    n = len(s); z = [0]*n; z[0] = n
    l = r = 0
    for i in range(1, n):
        if i <= r: z[i] = min(r-i+1, z[i-l])
        while i+z[i] < n and s[z[i]] == s[i+z[i]]: z[i] += 1
        if i+z[i]-1 > r: l, r = i, i+z[i]-1
    return z
```

**适用**:LC 2223, 字符串匹配

### T63:滚动哈希

```python
class Hash:
    def __init__(self, s, base=131, mod=(1<<61)-1):
        n = len(s); self.h = [0]*(n+1); self.p = [1]*(n+1)
        for i in range(n):
            self.h[i+1] = (self.h[i]*base + ord(s[i])) % mod
            self.p[i+1] = (self.p[i]*base) % mod
        self.mod = mod
    def get(self, l, r):
        return (self.h[r] - self.h[l]*self.p[r-l]) % self.mod
```

**适用**:LC 187, 1044, 718, 1143

### T64:Manacher

```python
def manacher(s):
    s = '#' + '#'.join(s) + '#'
    n = len(s); p = [0]*n
    c = r = 0
    for i in range(n):
        mir = 2*c - i
        if i < r: p[i] = min(r-i, p[mir])
        while i-p[i]-1 >= 0 and i+p[i]+1 < n and s[i-p[i]-1] == s[i+p[i]+1]:
            p[i] += 1
        if i+p[i] > r: c, r = i, i+p[i]
    return max(p)
```

**适用**:LC 5, 647, 214, 1960

### T65:编辑距离

```python
def edit(s1, s2):
    m, n = len(s1), len(s2)
    dp = [[0]*(n+1) for _ in range(m+1)]
    for i in range(m+1): dp[i][0] = i
    for j in range(n+1): dp[0][j] = j
    for i in range(1, m+1):
        for j in range(1, n+1):
            if s1[i-1] == s2[j-1]: dp[i][j] = dp[i-1][j-1]
            else:
                dp[i][j] = 1 + min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1])
    return dp[m][n]
```

**适用**:LC 72, 583, 712

### T66:LCS 最长公共子序列

```python
def lcs(a, b):
    m, n = len(a), len(b)
    dp = [[0]*(n+1) for _ in range(m+1)]
    for i in range(1, m+1):
        for j in range(1, n+1):
            if a[i-1] == b[j-1]:
                dp[i][j] = dp[i-1][j-1] + 1
            else:
                dp[i][j] = max(dp[i-1][j], dp[i][j-1])
    return dp[m][n]
```

**适用**:LC 1143, 1035, 1450

### T67:AC 自动机

```python
class ACAuto:
    def __init__(self):
        self.ch = [{}]; self.fail = [0]; self.out = [[]]
    def insert(self, s):
        node = 0
        for c in s:
            if c not in self.ch[node]:
                self.ch[node][c] = len(self.ch)
                self.ch.append({}); self.fail.append(0); self.out.append([])
            node = self.ch[node][c]
    def build(self):
        from collections import deque
        q = deque()
        for c, v in self.ch[0].items():
            q.append(v)
        while q:
            u = q.popleft()
            for c, v in self.ch[u].items():
                q.append(v)
                f = self.fail[u]
                while f and c not in self.ch[f]:
                    f = self.fail[f]
                self.fail[v] = self.ch[f].get(c, 0)
```

**适用**:LC 1032, 1397

### T68:最小表示法

```python
def min_rep(s):
    n = len(s)
    i, j = 0, 1
    k = 0
    while i < n and j < n and k < n:
        a, b = s[(i+k)%n], s[(j+k)%n]
        if a == b: k += 1
        elif a > b: i += k + 1; k = 0
        else: j += k + 1; k = 0
        if i == j: i += 1
    return min(i, j)
```

**适用**:循环串最小字典序

### T69:回文中心扩展

```python
def expand(s, l, r):
    while l >= 0 and r < len(s) and s[l] == s[r]:
        l -= 1; r += 1
    return s[l+1:r]
```

**适用**:LC 5, 647

### T70:SAM / 后缀自动机(进阶)

见 `algorithm/15-string.md` 第 7 节。

**适用**:LC 727(最小窗口子序列)

---

## 八、DP(10)

### T71:0/1 背包

```python
def knapsack01(w, v, W):
    dp = [0]*(W+1)
    for i in range(len(w)):
        for j in range(W, w[i]-1, -1):
            dp[j] = max(dp[j], dp[j-w[i]] + v[i])
    return dp[W]
```

**适用**:LC 416, 494, 474, 1049, 879

### T72:完全背包

```python
def knapsack_full(w, v, W):
    dp = [0]*(W+1)
    for i in range(len(w)):
        for j in range(w[i], W+1):
            dp[j] = max(dp[j], dp[j-w[i]] + v[i])
    return dp[W]
```

**适用**:LC 322, 518, 1449

### T73:区间 DP

```python
def interval_dp(n):
    dp = [[0]*n for _ in range(n)]
    for length in range(2, n+1):
        for i in range(n-length+1):
            j = i + length - 1
            for k in range(i, j):
                dp[i][j] = min(dp[i][j], dp[i][k] + dp[k+1][j] + cost)
    return dp[0][n-1]
```

**适用**:LC 5, 312, 516, 664, 1000, 1547

### T74:树形 DP

```python
def tree_dp(root):
    def dfs(node):
        if not node: return ...
        l = dfs(node.left); r = dfs(node.right)
        return combine(node.val, l, r)
    return dfs(root)
```

**适用**:LC 337, 543, 687, 968

### T75:状压 DP

```python
def state_dp(n, cost):
    dp = [float('inf')]*(1<<n)
    dp[0] = 0
    for s in range(1<<n):
        if dp[s] == float('inf'): continue
        for i in range(n):
            if s >> i & 1 == 0:
                dp[s | (1<<i)] = min(dp[s | (1<<i)], dp[s] + cost(s, i))
    return dp[(1<<n)-1]
```

**适用**:LC 464, 526, 691, 847, 1349, 1434

### T76:数位 DP

```python
def digit_dp(n):
    from functools import lru_cache
    digits = list(map(int, str(n)))
    @lru_cache(None)
    def dfs(pos, tight, state):
        if pos == len(digits):
            return 1  # 或终止条件
        limit = digits[pos] if tight else 9
        res = 0
        for d in range(0, limit+1):
            res += dfs(pos+1, tight and d==limit, new_state(d, state))
        return res
    return dfs(0, True, 0)
```

**适用**:LC 233, 357, 902, 1012, 1088

### T77:LIS(贪心 + 二分)

```python
def lis(nums):
    tails = []
    for x in nums:
        lo, hi = 0, len(tails)
        while lo < hi:
            mid = (lo+hi)//2
            if tails[mid] < x: lo = mid+1
            else: hi = mid
        if lo == len(tails): tails.append(x)
        else: tails[lo] = x
    return len(tails)
```

**适用**:LC 300, 673, 354, 1671, 2407

### T78:最大子段和(Kadane)

```python
def kadane(nums):
    cur = res = nums[0]
    for x in nums[1:]:
        cur = max(x, cur + x)
        res = max(res, cur)
    return res
```

**适用**:LC 53, 152, 918, 2321

### T79:股票问题(通用)

```python
def stock_dp(prices, k=1):
    # dp[i][k][s]: s=0 不持, s=1 持
    if k >= len(prices)//2:
        return sum(max(0, prices[i] - prices[i-1]) for i in range(1, len(prices)))
    dp = [[0]*(len(prices)) for _ in range(k+1)]
    for j in range(1, k+1):
        pre = -prices[0]
        for i in range(1, len(prices)):
            dp[j][i] = max(dp[j][i-1], prices[i] + pre)
            pre = max(pre, dp[j-1][i-1] - prices[i])
    return dp[k][-1]
```

**适用**:LC 121, 122, 123, 188, 309, 714

### T80:博弈 SG

```python
def sg(state, memo):
    if state in memo: return memo[state]
    s = set()
    for nxt in moves(state):
        s.add(sg(nxt, memo))
    g = 0
    while g in s: g += 1
    memo[state] = g
    return g
```

**适用**:LC 292, 294, 464, 810, 913

---

## 附录:各模式刷题路线

| 模板 | 刷题量 | 推荐顺序 |
|------|-------|---------|
| T01-T10 | 250 | 入门,先做 |
| T11-T20 | 200 | 链表专练 |
| T21-T30 | 150 | 栈/队列 |
| T31-T40 | 100 | 哈希/堆 |
| T41-T50 | 300 | 树 |
| T51-T60 | 300 | 图论 |
| T61-T70 | 250 | 字符串 |
| T71-T80 | 450 | DP |

合计 2000 题。
