# M17 集合深度

> Phase 2 核心模块。Scala 的集合是它最强大的标准库之一。
> 学完这章,你能精确预测每段集合代码的时间和空间复杂度。

## 1. 集合全景

```
Iterable
├── Seq
│   ├── IndexedSeq
│   │   ├── Vector      // O(log32 n) 随机访问
│   │   ├── Array       // 0(1) 随机访问(原生数组)
│   │   └── ArrayBuffer // 可变,头部 O(n) 但均摊
│   ├── LinearSeq
│   │   ├── List        // 头 O(1),随机 O(n)
│   │   ├── LazyList    // 懒求值
│   │   └── Queue       // O(1) head/tail,O(1) enqueue
│   └── ...
├── Set
│   ├── HashSet        // O(1) 查找
│   ├── TreeSet         // O(log n) 查找,有序
│   └── BitSet          // 压缩位
└── Map
    ├── HashMap
    ├── TreeMap
    └── ...
```

## 2. 不可变 vs 可变

**默认不可变**。在 Scala 标准库中,99% 的代码使用不可变集合。

```scala
val xs = List(1, 2, 3)         // 不可变
xs :+ 4                        // 创建新 List(1,2,3,4),xs 不变
// xs 仍是 List(1,2,3)

import scala.collection.mutable
val ys = mutable.ListBuffer(1, 2, 3)
ys += 4                        // 原地修改,ys = ListBuffer(1,2,3,4)
```

**生产建议**:
- 主体代码用**不可变**
- 性能敏感的内循环用**可变**(但封在内部,对外仍不可变)
- 写并发代码时**永远不可变**

## 3. List 细节

`List[A]` 是单链表:
- 头(head):O(1)
- 尾(tail):O(1)
- 随机访问 `apply(i)`:O(i)
- 长度:O(n)
- `::`(cons):O(1)
- `:+`(append):O(n)
- 模式匹配 `head :: tail`:O(1)

```scala
val xs = List(1, 2, 3, 4, 5)
xs.head            // 1
xs.tail            // List(2,3,4,5)
xs(3)              // 4
xs.init            // List(1,2,3,4) - O(n) 复制
xs.last            // 5 - O(n)
xs.length          // 5 - O(n)
```

**实践**:
- `List` 适合**头/尾递归**
- 不要把 `List` 当随机访问容器
- 用 `List` 做 **栈**,O(1) push/pop

## 4. Vector 细节

`Vector` 是 32-way 树(从 Scala 2.13 开始):
- 头/尾:O(log32 n) ≈ O(1) 实测
- 随机访问 `apply(i)`:O(log32 n)
- update:O(log32 n)
- append/prepend:O(log32 n)

```scala
val xs = Vector(1, 2, 3, 4, 5)
xs.head               // 1
xs(3)                 // 4
xs :+ 6               // Vector(1,2,3,4,5,6)
xs.updated(2, 99)     // Vector(1,2,99,4,5)
```

**何时用**:
- 频繁随机访问
- 大小未知,需要两端 append
- 替代 `Array` 的不可变版本

## 5. 性能对比表

| 操作 | List | Vector | Array | ArrayBuffer |
|------|------|--------|-------|-------------|
| head | O(1) | O(log32 n) | O(1) | O(1) |
| tail | O(1) | O(log32 n) | O(n) | O(n) |
| apply(i) | O(i) | O(log32 n) | O(1) | O(1) |
| update(i) | O(i) | O(log32 n) | O(1) | O(1) |
| append | O(n) | O(log32 n) | O(n) 拷贝 | O(1) 均摊 |
| prepend | O(1) | O(log32 n) | O(n) 拷贝 | O(n) |
| length | O(n) | O(1) | O(1) | O(1) |
| 内存开销 | 4-8x | 2-4x | 1x | 1.5x |

## 6. Set 与 Map

```scala
val s = Set(1, 2, 3)
s + 4            // Set(1,2,3,4)
s.contains(2)    // true
s & Set(2, 3)    // 交集: Set(2, 3)
s | Set(4, 5)    // 并集: Set(1,2,3,4,5)
s &~ Set(2)      // 差集: Set(1, 3)

val m = Map("a" -> 1, "b" -> 2)
m("a")              // 1
m.get("a")          // Some(1)
m.getOrElse("z", 0) // 0
m.updated("c", 3)   // Map("a"->1, "b"->2, "c"->3)
```

**`HashSet` vs `TreeSet`**:
- `HashSet`:O(1) 查找,无序
- `TreeSet`:O(log n) 查找,有序
- 默认 `HashSet`,需要有序时用 `TreeSet`

**`HashMap` vs `TreeMap`**:同上。

## 7. 视图 (View) 与懒操作

`xs.view` 创建一个**未执行的描述**(类似 Stream),只在被 `force` 或终端操作消费时执行。

```scala
val xs = (1 to 1_000_000).toList
val r = xs.view.map(_ * 2).filter(_ > 100).take(5)
// r 还没执行任何计算

r.toList  // 现在才执行,且只计算到第 5 个
```

**性能影响**:
```scala
// 不使用 view:三次遍历 List,每次都产生中间结果
xs.map(_ * 2).filter(_ > 100).take(5)

// 使用 view:融合成一个遍历
xs.view.map(_ * 2).filter(_ > 100).take(5).toList
```

**何时用 view**:
- 多步融合,避免中间 List 分配
- 大数据集合的"按需"操作
- 不想重复写 fold 的人

**何时不用**:
- 已经用 `Vector`(本来就不太慢)
- 需要在中间结果上做多次操作(每次 view 都会重做)
- 调试时(view 让 stack trace 难读)

## 8. 严格 vs 懒

`List`、`Vector`、`Set`、`Map` 都**严格**(eager)。
`LazyList`、`Stream`(已废弃) 是**懒**的。

```scala
val strict = List(1, 2, 3).map(_ * 2)   // 立即计算
val lazy_  = LazyList.from(1).map(_ * 2) // 第一次访问才计算

lazy_.take(3).toList  // 只计算 3 个
```

**LazyList 用法**:
```scala
// 无限序列
val naturals: LazyList[Int] = LazyList.from(1)
val primes: LazyList[Int] = 2 #:: LazyList.from(3).filter(isPrime)

// 协同递归
def fibs: LazyList[BigInt] =
  0 #:: 1 #:: fibs.zip(fibs.tail).map((a, b) => a + b)
```

**注意**:
- `LazyList` 的 `head` 强制求值,`tail` 不会
- 多个引用同一 `LazyList` 会**共享**已计算的部分(高效)
- 不要把 `LazyList` 用作"队列"——头/尾不是 O(1)

## 9. 集合操作速记

| 操作 | 用途 | 复杂度 |
|------|------|--------|
| `map` | 转换元素 | O(n) |
| `flatMap` | 转换 + 扁平 | O(n) |
| `filter` | 保留满足条件的 | O(n) |
| `foldLeft` / `foldRight` | 累加(从左/右) | O(n) |
| `reduce` | 无初值累加 | O(n) |
| `find` | 找第一个满足 | O(n) 最坏 |
| `exists` | 任一满足 | O(n) 最坏 |
| `forall` | 全部满足 | O(n) 最坏 |
| `groupBy` | 按 K 分组 | O(n) |
| `sortBy` / `sortWith` | 排序 | O(n log n) |
| `distinct` | 去重 | O(n) |
| `take` / `drop` | 前/跳过 | O(k) 或 O(n) |
| `zip` | 拉链 | O(min(n, m)) |
| `partition` | 拆分 | O(n) |
| `span` | 切分 | O(n) |
| `sliding` | 滑动窗口 | O(n) |

## 10. foldLeft vs foldRight

```scala
// foldLeft:从左到右累加,尾递归
List(1, 2, 3).foldLeft(0)((acc, x) => acc + x)
// 等价: ((0 + 1) + 2) + 3

// foldRight:从右到左累加,可能栈溢出
List(1, 2, 3).foldRight(0)((x, acc) => x + acc)
// 等价: 1 + (2 + (3 + 0))
```

**实践**:
- 默认用 `foldLeft`
- 想"对称"地用 `foldMap`(`cats` 提供)
- 大 List 一定要用 `foldLeft`(栈安全)

## 11. Option / Either 也是集合

`Option[A] = Some(a) | None`,可以视作 `0 或 1 个元素的集合`。
`Either[L, R]`,可以视作带错误的"非空集合"。

```scala
Option(1).map(_ * 2)              // Some(2)
Option.empty[Int].map(_ * 2)       // None
Right(1).map(_ * 2)                // Right(2)
Left("err").map(_ * 2)             // Left("err")(不动)
```

**含义**:`Option.flatMap` 和 `List.flatMap` 有同构关系。这就是为什么 `for` 在 `Option` / `Either` / `List` / `Future` 上**完全一致**。

## 12. 实战:用集合写一个 ETL

```scala
case class RawOrder(id: String, items: List[String], total: String)
case class Order(id: Long, items: List[String], total: BigDecimal)
sealed trait ParseError
case object BadId     extends ParseError
case object BadTotal  extends ParseError

def parse(raw: RawOrder): Either[ParseError, Order] =
  for
    id    <- raw.id.toLongOption.toRight(BadId)
    total <- scala.util.Try(BigDecimal(raw.total)).toEither.left.map(_ => BadTotal)
  yield Order(id, raw.items, total)

def load(raws: List[RawOrder]): Either[ParseError, List[Order]] =
  raws.traverse(parse)  // 需要 cats 的 Traverse,或手写 fold
```

## 13. 检查清单

- [ ] 解释 `List` 与 `Vector` 的时间复杂度差异
- [ ] 解释 `view` 的工作原理
- [ ] 解释 `foldLeft` 与 `foldRight` 的差异
- [ ] 写出尾递归的 `foldLeft`
- [ ] 用 `for` 推导在 `Either` / `List` / `Option` 上写 ETL
- [ ] 解释何时用 `mutable.ListBuffer` / `ArrayBuffer`
- [ ] 解释 `LazyList` 与 `List` 的求值模型
