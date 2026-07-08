# Scala 2 vs Scala 3 综合示例:订单处理

一个端到端的小型"订单处理"系统,演示以下特性的协同使用:

- `sealed trait` + `case class` / `enum` ADT
- 自定义值类 / `opaque type`
- 隐式 / `given` 类型类
- for 推导在 `Either` 上的 short-circuit
- 模式匹配 + 提取器
- 操作符重载
- 扩展方法

本目录下提供两个版本:
- `v2/OrderProcessing.scala` —— Scala 2 完整可运行实现
- `v3/OrderProcessing.scala` —— Scala 3 同等实现

两个版本解决同一业务问题:**接受一批订单,验证、计算折扣、转换货币,聚合输出**。

## 业务流程

```
List[RawOrder]
  → validate
  → apply discount
  → convert currency
  → group by status
  → render as JSON
```

## 运行

把对应文件编译即可,具体见顶层 `README.md` 的运行说明。
