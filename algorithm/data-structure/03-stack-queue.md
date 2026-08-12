# 栈与队列

> 受限线性表。栈:DFS、表达式、括号匹配;队列:BFS、滑动窗口。

---

## 1. 栈基础

### 1.1 数组实现

```python
class Stack:
    def __init__(self):
        self.data = []
    def push(self, x): self.data.append(x)
    def pop(self): return self.data.pop()
    def top(self): return self.data[-1]
    def empty(self): return not self.data
```

### 1.2 链表实现

```python
class Node:
    def __init__(self, val, nxt=None):
        self.val, self.next = val, nxt
class Stack:
    def __init__(self): self.head = None
    def push(self, x): self.head = Node(x, self.head)
    def pop(self): v = self.head.val; self.head = self.head.next; return v
```

### 1.3 链表 vs 数组栈

- 数组:缓存友好,均摊 O(1) push
- 链表:无扩容开销,O(1) push/pop

---

## 2. 栈的经典应用

### 2.1 括号匹配(LC 20)

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

### 2.2 表达式求值(逆波兰式 LC 150)

```python
def eval_rpn(tokens):
    stack = []
    for t in tokens:
        if t in '+-*/':
            b, a = stack.pop(), stack.pop()
            if t == '+': stack.append(a + b)
            elif t == '-': stack.append(a - b)
            elif t == '*': stack.append(a * b)
            else: stack.append(int(a / b))  # 截断
        else:
            stack.append(int(t))
    return stack[0]
```

### 2.3 中缀转后缀(Shunting Yard)

```python
def infix_to_postfix(s):
    prec = {'+':1, '-':1, '*':2, '/':2}
    output, stack = [], []
    i = 0
    while i < len(s):
        if s[i].isdigit():
            j = i
            while j < len(s) and s[j].isdigit(): j += 1
            output.append(s[i:j])
            i = j
        elif s[i] == '(':
            stack.append(s[i]); i += 1
        elif s[i] == ')':
            while stack and stack[-1] != '(':
                output.append(stack.pop())
            stack.pop()
            i += 1
        else:
            while stack and stack[-1] != '(' and prec[stack[-1]] >= prec[s[i]]:
                output.append(stack.pop())
            stack.append(s[i]); i += 1
    while stack: output.append(stack.pop())
    return output
```

### 2.4 字符串解码(LC 394)

```python
def decode(s):
    stack = []
    for c in s:
        if c != ']':
            stack.append(c)
        else:
            sub = ''
            while stack and stack[-1] != '[':
                sub = stack.pop() + sub
            stack.pop()  # '['
            k = ''
            while stack and stack[-1].isdigit():
                k = stack.pop() + k
            stack.append(sub * int(k))
    return ''.join(stack)
```

### 2.5 最小栈(LC 155)

```python
class MinStack:
    def __init__(self): self.stack = []
    def push(self, x):
        cur_min = x if not self.stack else min(x, self.stack[-1][1])
        self.stack.append((x, cur_min))
    def pop(self): self.stack.pop()
    def top(self): return self.stack[-1][0]
    def get_min(self): return self.stack[-1][1]
```

### 2.6 每日温度(LC 739,单调栈入门)

```python
def daily_temperatures(T):
    stack = []  # 存索引,保持温度单调递减
    res = [0] * len(T)
    for i, t in enumerate(T):
        while stack and T[stack[-1]] < t:
            j = stack.pop()
            res[j] = i - j
        stack.append(i)
    return res
```

---

## 3. 队列基础

### 3.1 数组实现(循环队列 LC 622)

```python
class CircularQueue:
    def __init__(self, k):
        self.data = [0] * (k + 1)
        self.head = self.tail = 0
        self.cap = k + 1
    def enqueue(self, v):
        if (self.tail + 1) % self.cap == self.head: return False
        self.data[self.tail] = v
        self.tail = (self.tail + 1) % self.cap
        return True
    def dequeue(self):
        if self.head == self.tail: return False
        self.head = (self.head + 1) % self.cap
        return True
    def front(self):
        if self.head == self.tail: return -1
        return self.data[self.head]
```

### 3.2 链表实现

```python
class Node:
    def __init__(self, v): self.v, self.next = v, None
class Queue:
    def __init__(self):
        self.head = self.tail = None
    def push(self, x):
        n = Node(x)
        if self.tail: self.tail.next = n
        else: self.head = n
        self.tail = n
    def pop(self):
        v = self.head.v
        self.head = self.head.next
        if not self.head: self.tail = None
        return v
```

### 3.3 双端队列(Deque)

Python `collections.deque` / C++ `deque`:
- push_front / push_back: O(1)
- pop_front / pop_back: O(1)
- 随机访问: O(n)

---

## 4. 队列经典应用

### 4.1 滑动窗口最大值(LC 239,单调队列)

```python
from collections import deque
def max_sliding_window(nums, k):
    q = deque()  # 存索引,对应值单调递减
    res = []
    for i, x in enumerate(nums):
        while q and nums[q[-1]] < x: q.pop()
        q.append(i)
        if q[0] <= i - k: q.popleft()
        if i >= k - 1: res.append(nums[q[0]])
    return res
```

### 4.2 用栈实现队列(LC 232)

```python
class MyQueue:
    def __init__(self):
        self.in_, self.out = [], []
    def push(self, x): self.in_.append(x)
    def pop(self):
        if not self.out:
            while self.in_: self.out.append(self.in_.pop())
        return self.out.pop()
    def peek(self):
        if not self.out:
            while self.in_: self.out.append(self.in_.pop())
        return self.out[-1]
    def empty(self): return not self.in_ and not self.out
```

均摊 O(1)。

### 4.3 用队列实现栈(LC 225)

把前 n-1 个元素移到队尾,留下队首即栈顶。

### 4.4 设计循环双端队列(LC 641)

见上 circular queue 实现。

---

## 5. 优先队列(堆)

详见 `06-heap.md`。简单说:`heapq`(小顶堆)/ `priority_queue`(大顶堆)。

### 5.1 前 K 高频元素(LC 347)

```python
import heapq
def top_k_frequent(nums, k):
    from collections import Counter
    cnt = Counter(nums)
    return heapq.nlargest(k, cnt.keys(), key=cnt.get)
```

### 5.2 数据流中位数(LC 295)

大顶堆存较小一半,小顶堆存较大一半。

```python
import heapq
class MedianFinder:
    def __init__(self):
        self.lo = []  # 大顶堆(存负数)
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

---

## 6. 单调栈全家桶

详见 `12-monotonic.md`。这里列模板:

### 6.1 下一个更大元素

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

### 6.2 柱状图最大矩形(LC 84)

```python
def largest_rectangle(heights):
    stack = []
    heights = [0] + heights + [0]
    res = 0
    for i, h in enumerate(heights):
        while stack and heights[stack[-1]] > h:
            j = stack.pop()
            res = max(res, heights[j] * (i - stack[-1] - 1))
        stack.append(i)
    return res
```

---

## 7. 栈与队列的工程应用

| 场景 | 工具 |
|------|------|
| 函数调用 | 系统栈 |
| 表达式求值 | 栈 |
| 括号匹配 | 栈 |
| 浏览器前进后退 | 双栈 |
| 消息队列 | 队列 |
| BFS | 队列 |
| 滑动窗口 | 双端队列 |
| 生产者-消费者 | 阻塞队列 |
| 撤销操作 | 栈 |

---

## 8. 课后 5 题

1. **LC 20** 有效的括号
2. **LC 155** 最小栈
3. **LC 239** 滑动窗口最大值
4. **LC 84** 柱状图中最大的矩形
5. **LC 295** 数据流的中位数

---

**下一步**:`04-hash.md`。
