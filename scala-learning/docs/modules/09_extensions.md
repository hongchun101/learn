# M09 扩展方法

## Scala 2: `implicit class`

```scala
implicit class IntOps(val self: Int) extends AnyVal {
  def times(f: Int => Unit): Unit = ...
}
```

限制:
- 必须单个 `val` 构造参数
- 必须 `extends AnyVal` 才零成本
- 不能用于类已有同名方法时

## Scala 3: `extension` 顶级关键字

```scala
extension (self: Int)
  def times(f: Int => Unit): Unit = ...

extension [A](xs: List[A])
  def second: Option[A] = xs.drop(1).headOption
  def secondOr[B >: A](default: B): B = xs.drop(1).headOption.getOrElse(default)

extension [A](xs: List[A])(using ord: Ordering[A])
  def isSorted: Boolean = ...
```

优势:
- 多个参数 / 类型参数 / 上下文参数都直接写
- 无 `AnyVal` 包装要求,编译器自动优化
- 顶级定义,无需 import
- 可以为 `opaque type` 添加扩展方法

## 演示

- v2: `Int.times`、`String.toSnake/words/isEmail`、`List.second/secondOr`
- v3: 同上 + `String.takeRight`、`List.isSorted`(带 using)

## 迁移提示

- 几乎所有 `implicit class` 可直接迁移到 `extension`
- 没有构造参数单值限制后,扩展更自由
