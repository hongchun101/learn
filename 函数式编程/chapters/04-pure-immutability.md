# 第 4 章  纯函数与不可变性

> 读完本章,你将理解函数式编程的两个最重要的支柱:纯函数与不可变性,以及两者如何把"程序"从"过程"变成"值"。

## 4.1 纯函数

### 4.1.1 定义

**纯函数 (pure function)** $f: A \to B$ 满足:

1. **确定性**: 同一输入始终给出同一输出。
2. **无副作用**: 求值过程不观察也不改变外部世界。

### 4.1.2 数学 vs. 编程

```
数学:        f(x) = x + 1
JS (可能):   let count = 0
             function f(x) { count++; return x + 1 }
```

`f` 在数学里是函数,在 JS 里是"返回 x+1 同时还做一些事的子程序"。

### 4.1.3 副作用的种类

```haskell
--  1. 异常    throw / error / div by 0
--  2. 状态    ref / mutable var
--  3. I/O     读文件、socket、println
--  4. 非终止  死循环、stack overflow
--  5. 时间    getCurrentTime, random
```

每一种副作用都需要代数接口去"持有"它,这是 Ch8-Functor 以后所有 monad 的来源。

### 4.1.4 纯函数的好处

| 性质 | 含义 |
|------|------|
| 引用透明 | $f(x)$ 可以被替换为 $f(x)$ 的值,而不改变程序行为 |
| 局部推理 | 改一个函数不影响其他函数 |
| 可并行 | 多个调用之间无共享 |
| 可缓存 | same input → same output,可 memoize |
| 可置换 | `await f(x)` 与 `f(x)` 在求值后等价 |
| 易于测试 | 无需 mock,无需 setup |

### 4.1.5 引用透明 (referential transparency)

**定义**: 表达式 $e$ 在程序 $P$ 中,如果可以用 $e$ 的值替换 $P$ 中所有 $e$ 的出现而得不到不同的可观察行为,就说 $e$ 是引用透明的。

```haskell
-- 十进制下的例子
f x = (10 + 20) + x    -- 引用透明: 30 + x
g x = (30      ) + x    -- 与 f 行为完全相同

-- 反例
h :: IO ()
h = do
  putStrLn "hi"
  putStrLn "hi"
  -- 两次 "hi" 不能合并成一次, 因为是 IO
```

## 4.2 不可变性

### 4.2.1 默认不可变

```haskell
-- Haskell/Scala: 默认不可变
xs :: [Int]
xs = [1, 2, 3]
ys = xs ++ [4]    -- xs 仍 = [1,2,3], ys = [1,2,3,4]
```

```scala
// Scala 3
val xs = List(1, 2, 3)
val ys = xs :+ 4  // xs 不变
```

```python
# Python: 默认可变
xs = [1, 2, 3]
ys = xs + [4]  # xs 不变,但 [1,2,3] 不能再被 "之外" 修改
xs.append(5)   # 这破坏不可变性
```

### 4.2.2 共享与结构共享

不可变不意味着"复制整个树"。FP 运行时广泛使用**结构共享 (structural sharing)**:

```
xs = [1, 2, 3]      -- 节点: 1 → 2 → 3 → nil
xs' = prepended 0 xs  -- 0 → 1 → 2 → 3 → nil
```

`xs'` 仅多一个新节点 `0`,共享了 `xs` 后续所有节点。O(1) 时间、O(1) 空间。

### 4.2.3 不可变的数据结构

| 数据结构 | 持久化方式 |
|----------|----------|
| `List` | cons 单链表 |
| `Vector` | 32-way trie |
| `HashMap` | HAMT (Hash Array Mapped Trie) |
| `Set` | 二叉树 / HAMT |
| `Seq` | Finger tree |
| `Map` (persistent) | 平衡树 |

这些都是经典数据结构,关键是任何"修改"都返回新结构,而原结构廉价等价。

### 4.2.4 性能对比

```haskell
import qualified Data.Sequence as Seq
import qualified Data.Vector  as V
import Data.List

-- list 头部 cons: O(1)
-- list 任意位置 update: O(n)
-- Seq 任意位置 update: O(log n)
-- Vector 任意位置 update: O(log n) (32-way trie)
```

### 4.2.5 不可变与并发

没有可变状态 = 没有共享可变状态 = 没有 race condition。

```haskell
-- 两个线程各自处理同一个 List
parMap :: (a -> b) -> [a] -> [b]
parMap f xs = map f xs `using` parList rdeepseq
```

无需锁,无需 atomic,无需 `synchronized`,因为没有可破坏的共享状态。

## 4.3 纯函数边界 与 不纯函数

```haskell
-- 纯: 一切有名字并接受输入输出类型
add :: Int -> Int -> Int
add x y = x + y

-- 不纯: IO 类型显式标注
main :: IO ()
main = putStrLn "hi"

-- 不纯: 显式返回类型暴露"可能失败"
data Result a = Ok a | Err String

readFileSafe :: FilePath -> IO (Result String)
```

**核心原则**: 让不纯的部分尽可能小,纯的逻辑尽可能大。

```
                  ┌─────────────────────────────┐
                  │   Pure Core (无限大)         │
                  │  业务逻辑、算法、模型         │
                  └─────────────────────────────┘
                              ↑   ↓
                  ┌─────────────────────────────┐
                  │   Imperative Shell (薄薄)    │
                  │  IO、读文件、HTTP、console    │
                  └─────────────────────────────┘
```

## 4.4 不可变性 vs. 性能优化的张力

不可变不意味着不能优化:

1. **延迟 / thunk**: 表达式无需求值
2. **结构共享**: 复用旧节点
3. **CSE / inlining**: 同样表达式计算一次
4. **严格性分析**: ghc 会自动选择合适点
5. **不可变数组 + 索引**: `Data.Vector.unsafeUpdate` 给你"C-style" 性能

## 4.5 思考题

1. 写出 `add :: Int -> Int -> Int`,并用等式推理证明 `add x 0 = x`。
2. 证明: 纯函数的复合仍是纯函数。
3. 列举你最近写的代码里三个不纯函数,把它们改写成纯函数,标注它们对应的副作用类型。
4. 解释为什么 `IO` 不能简单地"装在括号里"而不标注类型。

## 4.6 小结

- 纯函数 = 确定性 + 无副作用。
- 不可变性 = 默认"不修改,而是创建新值"。
- 二者一起 = 引用透明 = 推理容易 = 并发安全。
- 工程实践: 让不纯的部分尽可能小,纯的核心尽可能大("Functional Core, Imperative Shell")。

下一章我们讨论递归——FP 没有"循环",迭代通过递归/折叠实现。
