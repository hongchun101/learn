# 链表

> 指针操作的极致练习。LeetCode 上有 60+ 道链表题。

---

## 1. 链表节点定义

```cpp
struct ListNode {
    int val;
    ListNode* next;
    ListNode(int x) : val(x), next(nullptr) {}
};
```

```python
class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next
```

---

## 2. 虚拟头节点(哑节点)

**核心技巧**:几乎所有链表题都用它简化边界处理。

```python
dummy = ListNode(0)
dummy.next = head
# ... 操作
return dummy.next
```

---

## 3. 反转链表(必须闭眼写)

### 3.1 全部反转

```python
def reverse(head):
    prev, cur = None, head
    while cur:
        nxt = cur.next
        cur.next = prev
        prev = cur
        cur = nxt
    return prev
```

### 3.2 反转区间 [m, n]

```python
def reverse_between(head, m, n):
    dummy = ListNode(0, head)
    pre = dummy
    for _ in range(m - 1):
        pre = pre.next
    cur = pre.next
    for _ in range(n - m):
        nxt = cur.next
        cur.next = nxt.next
        nxt.next = pre.next
        pre.next = nxt
    return dummy.next
```

### 3.3 K 个一组反转

```python
def reverse_k_group(head, k):
    dummy = ListNode(0, head)
    pre = dummy
    while True:
        end = pre
        for _ in range(k):
            end = end.next
            if not end: return dummy.next
        # 反转 pre.next 到 end
        start = pre.next
        cur = start.next
        while cur != end.next:
            nxt = cur.next
            cur.next = pre.next
            pre.next = cur
            cur = nxt
        start.next = end.next
        pre = start
    return dummy.next
```

---

## 4. 快慢指针

### 4.1 链表判环(LC 141)

```python
def has_cycle(head):
    slow = fast = head
    while fast and fast.next:
        slow = slow.next
        fast = fast.next.next
        if slow is fast: return True
    return False
```

### 4.2 找环入口(LC 142)

相遇后,一个指针回到 head,同步前进,再次相遇即入口。

### 4.3 找链表中点(LC 876)

```python
def middle_node(head):
    slow = fast = head
    while fast and fast.next:
        slow = slow.next
        fast = fast.next.next
    return slow
```

### 4.4 找倒数第 k 个

```python
def kth_from_end(head, k):
    fast = head
    for _ in range(k):
        fast = fast.next
    slow = head
    while fast:
        slow = slow.next
        fast = fast.next
    return slow
```

---

## 5. 链表合并

### 5.1 合并两个有序链表(LC 21)

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

### 5.2 合并 K 个有序链表(LC 23)

```python
import heapq
def merge_k(lists):
    heap = [(l.val, i, l) for i, l in enumerate(lists) if l]
    heapq.heapify(heap)
    dummy = ListNode(0); cur = dummy
    while heap:
        val, i, node = heapq.heappop(heap)
        cur.next = node; cur = cur.next
        if node.next:
            heapq.heappush(heap, (node.next.val, i, node.next))
    return dummy.next
```

复杂度:O(N log k),其中 N 是总节点数。

### 5.3 归并排序链表(LC 148)

```python
def sort_list(head):
    if not head or not head.next: return head
    mid = middle_node(head)
    right = mid.next
    mid.next = None
    return merge(sort_list(head), sort_list(right))
```

复杂度:O(n log n),空间 O(log n) 递归栈。

---

## 6. 链表相交与删除

### 6.1 相交链表(LC 160)

```python
def get_intersection(a, b):
    p, q = a, b
    while p is not q:
        p = p.next if p else b
        q = q.next if q else a
    return p
```

原理:两个指针走"a+b"和"b+a",必然在交点相遇。

### 6.2 删除倒数第 N 个(LC 19)

```python
def remove_nth_from_end(head, n):
    dummy = ListNode(0, head)
    fast = dummy
    for _ in range(n):
        fast = fast.next
    slow = dummy
    while fast.next:
        slow = slow.next
        fast = fast.next
    slow.next = slow.next.next
    return dummy.next
```

---

## 7. 复杂链表操作

### 7.1 复杂链表复制(LC 138,带 random 指针)

**方法一**:哈希映射
```python
def copy_random_list(head):
    if not head: return None
    m = {}
    cur = head
    while cur:
        m[cur] = Node(cur.val)
        cur = cur.next
    cur = head
    while cur:
        m[cur].next = m.get(cur.next)
        m[cur].random = m.get(cur.random)
        cur = cur.next
    return m[head]
```

**方法二**:原地拼接,O(1) 额外空间
```python
def copy_random_list(head):
    if not head: return None
    # 1. 拼接 A->A'->B->B'->...
    cur = head
    while cur:
        nxt = cur.next
        cur.next = Node(cur.val, nxt)
        cur = nxt
    # 2. 设置 random
    cur = head
    while cur:
        if cur.random:
            cur.next.random = cur.random.next
        cur = cur.next.next
    # 3. 拆分
    cur = head
    nhead = head.next
    while cur.next:
        tmp = cur.next
        cur.next = tmp.next
        cur = tmp
    return nhead
```

### 7.2 链表重排(LC 143)

1. 找中点
2. 反转后半
3. 交替合并

### 7.3 链表求和(LC 2)

模拟加法,处理进位。

---

## 8. 双向链表

```cpp
struct DListNode {
    int val;
    DListNode* prev, *next;
};
```

- LRU Cache(LC 146)用双向链表 + 哈希
- Python 的 `OrderedDict` 内部就是双向链表

---

## 9. 链表设计题

### 9.1 LRU Cache(LC 146)

```python
class LRUCache:
    def __init__(self, capacity):
        self.cap = capacity
        self.cache = {}  # key -> (value, node)
        self.head = DListNode(0, 0)  # 哨兵
        self.tail = DListNode(0, 0)
        self.head.next = self.tail
        self.tail.prev = self.head

    def get(self, key):
        if key not in self.cache: return -1
        self._move_to_front(key)
        return self.cache[key][0]

    def put(self, key, value):
        if key in self.cache:
            self.cache[key] = (value, self.cache[key][1])
            self._move_to_front(key)
        else:
            if len(self.cache) >= self.cap:
                # 淘汰 tail.prev
                lru = self.tail.prev
                del self.cache[lru.key]
                self._remove(lru)
            node = DListNode(key, value)
            self.cache[key] = (value, node)
            self._insert_front(node)

    def _remove(self, node):
        node.prev.next = node.next
        node.next.prev = node.prev

    def _insert_front(self, node):
        node.next = self.head.next
        node.prev = self.head
        self.head.next.prev = node
        self.head.next = node

    def _move_to_front(self, key):
        node = self.cache[key][1]
        self._remove(node)
        self._insert_front(node)
```

### 9.2 LFU Cache(LC 460)

用"频率链表 + 哈希"实现。

### 9.3 设计 Twitter(LC 355)

合并多链表。

---

## 10. 链表与数组的选择

| 场景 | 选择 |
|------|------|
| 频繁随机访问 | 数组 |
| 频繁插入删除 | 链表 |
| 内存敏感 | 数组(连续,无额外指针) |
| 大小未知 | 动态数组 |
| 实现 LRU/LFU | 链表 + 哈希 |

---

## 11. 课后 5 题

1. **LC 206** 反转链表
2. **LC 25** K 个一组翻转链表
3. **LC 146** LRU 缓存机制
4. **LC 23** 合并 K 个升序链表
5. **LC 138** 复制带随机指针的链表

---

**下一步**:`03-stack-queue.md`。
