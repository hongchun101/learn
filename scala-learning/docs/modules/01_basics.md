# M01 基础类型与值类

## Scala 2 要点

- `class X(val v: T) extends AnyVal` —— 值类,运行时零包装
- `@specialized` —— 泛型方法对原始类型去装箱
- 字符串插值 `s""` / `f""` / `raw""` 三种
- 数值字面量下划线分隔(2.13+):`1_000_000L`
- `Nothing` / `Null` / `Unit` 是底类型

## Scala 3 要点

- `opaque type UserId = Long` —— 在**同文件内**与 `Long` 等价(零成本),在**文件外**是独立类型
- `transparent inline` —— 编译期消除抽象,并暴露精确类型
- `inline if` —— 编译期分支,生成死代码
- `Matchable` —— 默认混入具体类型,提供"可被 match"的可见父类
- 顶级定义不再需要包对象

## 演示

- `modules-v2/.../01_basics/v2/ValueClass.scala` —— 值类 `UserId`、`@specialized`、implicit class
- `modules-v3/.../01_basics/v3/OpaqueTypes.scala` —— `opaque type`、`transparent inline`、`inline if`
- 对应测试分别位于 `.../v2/ValueClassSpec.scala` 与 `.../v3/OpaqueTypesSpec.scala`

## 对比要点

| 场景 | Scala 2 | Scala 3 |
|------|---------|---------|
| 包装类型零成本 | `final class X(val v: T) extends AnyVal` | `opaque type X = T` + companion |
| 内联展开 | 不支持 | `inline def` / `transparent inline def` |
| 字符串插值 | `s/f/raw` | 兼容;Scala 3 可省略 `s` 前缀的少量情况 |
| 数值分隔符 | 1_000_000 | 1_000_000 |

## 何时用什么

- **值类 vs opaque type**:值类只支持单参数 `val` 构造;opaque type 任意底层类型
- **`@specialized`** 仍是 Scala 3 中通过 `@specialized` 注解可用(未变)
- **opaque type 局限**:仅在定义文件内可与底层互换;文件外必须通过 companion 转换
