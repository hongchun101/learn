# M05 类型类与隐式/given

## 类型类三件套

1. **类型类定义**:`trait Show[A] { def show(a: A): String }`
2. **隐式实例**:`implicit val intShow: Show[Int] = ...` / `given intShow: Show[Int] = ...`
3. **泛型接口**:`def show[A](a: A)(implicit ev: Show[A]): String`

## Scala 2 vs Scala 3

| 项 | Scala 2 | Scala 3 |
|---|---|---|
| 隐式值 | `implicit val x: T = ...` | `given x: T = ...` |
| 隐式参数 | `(implicit ev: T)` | `(using ev: T)` |
| 隐式解析 | `implicitly[T]` | `summon[T]` |
| 隐式转换 | `implicit def aToB(a: A): B` | `given Conversion[A, B]` |
| 选择性 import | `import obj.{_ , given}` | `import obj.given` |

## 关键演示

- v2: `implicit val` + `implicit def` 派生 + `implicit class` 扩展方法
- v3: `given` + `using` + `summon` + `given` selective import

## 类型类派生

通过 `implicit def` / `given ... as` 为复合类型自动派生类型类实例:
- v2: `implicit def tuple2Show[A: Show, B: Show]: Show[(A, B)]`
- v3: `given tuple2Show[A: Show, B: Show] as Show[(A, B)]` 或 `with ...`

## 最佳实践

- 把类型类实例放在 companion object 中,自动进入隐式作用域
- 大型项目的类型类实例用 `given` + 显式 `import given` 控制可见性
- 避免 implicit conversion,优先用扩展方法
