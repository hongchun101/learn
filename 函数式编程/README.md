# 函数式编程教程:从0到专家

> **理论为主,实践为辅**。学完本教程,你将具备从λ-演算到范畴论、从类型论到代数效应的完整理论视野,能够阅读 Haskell / PureScript / Scala 3 / OCaml / F# / Elm 等主流 FP 语言的源码,设计类型驱动的程序,并将 FP 思想迁移到任意非 FP 语言。

## 教程定位

- **读者**: 已经会用至少一门命令式语言(JS/Java/Python/C++ 等),希望系统掌握函数式编程理论与实践。
- **目标**: 从"会用 `map`/`filter`"提升到"能用 Free Monad 设计 DSL,理解律(monad law)在证明中的角色,能阅读 Wadler / SPJ 论文"。
- **主语言**: Haskell(理论最 canonical)。次要例子会用 PureScript / Scala 3。
- **实践路线**: 每章末尾 2-4 个小练习,集中在 `code/` 目录。

## 章节地图

```
Foundation        基础  ─ λ-演算、类型、Hindley-Milner
Core ABstractions 核心  ─ 纯函数、递归、ADT、高阶函数
Type Classes      类型类 ─ Functor / Applicative / Monad / Trans
Advanced Theory   高级  ─ 范畴论 / Comonad / 效应 / 高级类型
Engineering      工程  ─ 性能 / QuickCheck / CPS / Free / Tagless
```

## 阅读次序

1. **Foundation**: 不读 Ch2 数学基础也可以读 Ch3,但 Ch13 范畴论假设你已掌握 Ch2。
2. **Type Classes**: Ch8-Functor → Ch9-Applicative → Ch10-Monad 是单线性依赖,必须依次阅读。
3. **Advanced Theory**: Ch13 范畴论是 Ch14/15 的前置;Ch16 高级类型可独立。
4. **Engineering**: Ch19 依赖 Ch10;Ch17/18 可独立。

## 配套代码

`code/` 目录提供 Haskell 代码示例,可在 GHC 9.6+ 下直接运行。`make` 进入 `code/` 子目录后:

```bash
$ cabal repl
> :l Ch03/Lambda.hs
```

## 推荐工具

- **GHCup**: 安装 Haskell 工具链。
- **ghci**: 交互式 REPL,所有章节边读边敲。
- **stack** 或 **cabal**: 工程管理。

## 思考方式

每一章末尾都会有一组 *思考题*。这不是装饰,而是教程的重要组成部分——函数式编程的理论只有在你的指尖流过`(>>=)`和`pure`的时候,才会真正变成直觉。

## 许可

本教程以 CC BY-SA 4.0 发布。
