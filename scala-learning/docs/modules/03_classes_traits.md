# M03 类、特质、抽象类型与包对象

## 演示特性

- 主构造器参数 `val`/`var` 直接生成字段
- 抽象类型成员:`type T` 在子类中绑定
- 自身类型 `self: Container =>` 约束混入
- 特质线性化
- 包对象(Scala 2)→ 顶级定义 + 子包 + `export`(Scala 3)
- 抽象类 vs 特质选择

## Scala 2 关键 API

```scala
trait Container { type T; def add(t: T): Unit }
class StringContainer extends Container { type T = String; ... }
trait Persistable { self: Container => def save(): String = ... }
class Service extends TimestampLogged with Audited
```

## Scala 3 关键 API

```scala
trait Container:
  type T
  def add(t: T): Unit

class StringContainer extends Container:
  type T = String
  ...

// 类默认 final,需 open 才能继承
open class Service extends TimestampLogged, Audited
```

## 包对象迁移

| Scala 2 | Scala 3 |
|---------|---------|
| `package object foo { type X = ... }` | 顶级 `type X = ...` + 子包 + `export` |

## 演示文件

- v2: `ClassSystem.scala` + 单独 `package.scala` 演示包对象
- v3: `ClassSystem.scala` + 同文件子包 `package types:`
