# M16 Scala 2 vs Scala 3 同题双解

## 题目

定义:
1. JSON 值类型
2. `Show` 类型类
3. `Monoid` 类型类
4. 把 `List[A]` 转换为 `Json.Arr` 的函数
5. `combineAll` 把 `List[A]` 用 Monoid 折叠为单一值

## 关键对照

| 项 | Scala 2 (`v2/User.scala`) | Scala 3 (`v3/User.scala`) |
|---|---|---|
| ADT | `sealed trait Json` + case class | `enum Json:` |
| 类型类 | `implicit val showJson: Show[Json]` | `given showJson: Show[Json]` |
| 隐式解析 | `implicitly[Show[Json]]` | `summon[Show[Json]]` |
| Monoid 派生 | `implicit def listMonoid[A]: Monoid[List[A]] = ...` | `given listMonoid[A]: Monoid[List[A]] with ...` |
| 扩展方法 | 隐式 class | 顶级 `extension` |
| 上下文实例 | companion object | companion object |

## 完整对照

```scala
// Scala 2
sealed trait Json
case object JNull extends Json
case class JStr(s: String) extends Json
// ...

implicit val showJson: Show[Json] = (j: Json) => j match {
  case JNull => "null"
  case JStr(s) => "\"" + s + "\""
  // ...
}
```

```scala
// Scala 3
enum Json:
  case JNull
  case JStr(s: String)
  // ...

given showJson: Show[Json] = (j: Json) => j match
  case Json.JNull => "null"
  case Json.JStr(s) => "\"" + s + "\""
  // ...
```

## 解读

- 同样的抽象,代码量几乎相同
- Scala 3 的 enum 让 ADT 表达更紧凑
- Scala 3 的 given 表达隐式更显式
- Scala 3 的 extension 比 implicit class 更强大

## 测试

- `UserSpec` 覆盖嵌套 JSON 渲染、Int/List[String] Monoid 折叠、`toJsonList`
- v3 额外演示顶级 `extension` 的 `renderJsonArray`
