# M14 宏 / 内联元编程

## Scala 2: 宏系统

- 白盒宏(Whitebox)、黑盒宏(Blackbox)、注解宏(Annotation)
- 真实宏编写需要 scala-reflect + macro paradise 插件
- quasiquotes 提供 AST 构造 DSL
- `@BeanProperty`、`@compileTimeOnly` 是内置注解宏例子

Scala 2.13 起,`inline` 关键字未真正支持(留作 3.x 标记)。

本项目 v2 演示"宏景观":不写完整 macro(避免引入 macro paradise 依赖),但展示:
- `@BeanProperty` 自动 getter/setter
- `@implicitNotFound` 编译期诊断
- `@nowarn` 静默警告
- `@showAsInfix` 中缀展示类型
- quasiquote 写法

## Scala 3: 内联元编程

- `inline def` —— 编译期展开
- `transparent inline def` —— 展开 + 暴露精确类型
- `inline if` —— 编译期分支
- `compiletime.error` —— 编译期错误
- `compiletime.constValue` —— 编译期常量求值
- `compiletime.summonFrom` —— 多层隐式分派
- `compiletime.erasedValue` —— 类型擦除值

## 演示

- v2: 注解宏景观 + quasiquote 写法
- v3: `twice`、`defaultValue`、`assertPositive`、`tupleSize`、`sumOf`、`requireOrdering` 等

## Scala 3 关键差异

- 不需要任何插件
- `inline` 强制参数在调用点为字面量才能展开
- `transparent inline` 让函数返回更精确的类型给调用方

## 何时用

- 编译期已知值的优化:常量传播、死代码消除
- 类型级别的编程:Peano 数、Tuple 计算
- 编译期断言:验证配置、字面量范围
