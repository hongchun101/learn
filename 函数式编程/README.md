# 函数式编程教程:从0到专家

> **理论为主,实践为辅**。学完本教程,你将具备从λ-演算到范畴论、从类型论到代数效应的完整理论视野,能够阅读 Haskell / PureScript / Scala 3 / OCaml / F# / Elm 等主流 FP 语言的源码,设计类型驱动的程序,并将 FP 思想迁移到任意非 FP 语言。

## 教程定位

- **读者**: 已经会用至少一门命令式语言(JS/Java/Python/C++ 等),希望系统掌握函数式编程理论与实践。
- **目标**: 从"会用 `map`/`filter`"提升到"能用 Free Monad 设计 DSL,理解律(monad law)在证明中的角色,能用 Tagless Final 编码业务规则,能阅读 Wadler / SPJ / Carette 论文"。
- **主语言**: Haskell(理论最 canonical)。次要例子会用 PureScript / Scala 3。
- **实践路线**: 每章末尾 2-5 个小练习,集中在 `code/` 目录,所有代码可在 GHC 9.6+ 下运行。

## 章节地图

```
Ch1-2   Foundation     动机 / 数学基础(集合、代数结构、范畴预备)
Ch3-7   Core           λ-演算 / 纯函数 / 递归 / ADT / 高阶
Ch8-12  Type Classes   Functor → Applicative → Monad → Trans → Fold/Traverse
Ch13-16 Advanced      范畴论 → Comonad → 代数效应 → 高级类型
Ch17-19 Engineering   性能 / QuickCheck / CPS / Free / Tagless / Optics
Ch20    Closure        实践指引与学习路径
```

每章末尾的 *思考题* 是教程的有机组成部分——FP 理论只有在 REPL 中亲手跑过 `>>=` 和 `pure` 之后才会变成直觉。

## 阅读次序

1. **Foundation**: 不读 Ch2 数学基础也可以读 Ch3,但 Ch13 范畴论假设你已掌握 Ch2。
2. **Type Classes**: Ch8-Functor → Ch9-Applicative → Ch10-Monad → Ch11-Trans 是单线性依赖,必须依次阅读。
3. **Advanced Theory**: Ch13 范畴论是 Ch14/15 的前置;Ch16 高级类型可独立。
4. **Engineering**: Ch19 依赖 Ch10;Ch17/18 可独立。

## 配套代码

`code/` 目录提供 Haskell 代码示例,完整列表见 `code/README.md`。要点:

```bash
$ cabal repl
> :l Ch03/Lambda.hs
> main
```

| 章节 | 文件 | 重点 |
|------|------|------|
| Ch01 | `Ch01/Motivation.hs` | 命令式 vs. 函数式, 闭包 |
| Ch03 | `Ch03/Lambda.hs` | Church 编码, Y 组合子, SKI |
| Ch05 | `Ch05/Recursion.hs` | 递归形式, 折叠, 树 fold, fix |
| Ch08 | `Ch08/Functor.hs` | Tree / BST 自定义 Functor |
| Ch10 | `Ch10/Monad.hs` | State Monad 实例 |
| Ch11 | `Ch11/FreeMonad.hs` | 最小 Console DSL + 多解释器 |
| Ch19 | `Ch19/TaglessFinal.hs` | 编译时类型驱动 DSL |
| Ch20 | `Ch20/Json.hs` | JSON 解析与序列化 |
| Ch20 | `Ch20/Reducer.hs` | 抽象 Reducer 模式 |

## 推荐工具

- **GHCup**: 安装 Haskell 工具链(GHC + cabal + stack)。
- **ghci**: 交互式 REPL,所有章节边读边敲。
- **stack** 或 **cabal**: 工程管理。
- **hlint**: 代码风格建议。

## 教程成熟度

- **理论深度**: Ch13 范畴论覆盖对象/态射/函子/自然变换/极限/伴随/Yoneda + F-代数;Ch10/Ch11 给出 Monad 律与 transformer 律的证明与反例;Ch19 给出 Optics 的 Profunctor 编码与 Lens 律。
- **工程能力**: Ch17 性能(strictness、unboxed、fusion、Pragmas、GHC Core);Ch18 QuickCheck 性质测试;Ch19 CPS / Free / Tagless / Optics 完整范式。
- **代码量**: 9 个独立可运行示例,涵盖 Church 编码、自定义 Functor/Monad、Free Monad、Tagless Final、Reducer、JSON 解析。


## 5 个"行家必学"高阶章节(分布如下)

| 章节 | 主题 | 工业价值 |
|------|------|----------|
| Ch6 6.5A | Parse, don't validate + PatternSynonyms | 让非法状态不可表达,Smart Constructor 是工业级 API 设计的核心 |
| Ch11 11.7 | STM / async / RIO / effectful | 工业 Haskell 并发模型与 effect 系统选型 |
| Ch16 16.6-16.8 | DataKinds / DerivingVia / GNTD / ConstraintKinds | 类型级编程与 newtype 模式,生产代码必备 |
| Ch17 17.11 | INLINE / SPECIALIZE / RULES / CAF | GHC 调优三件套,从"能用"到"用好" |
| Ch20 20.8A | cabal/stack/RIO/错误处理/partial 函数 | 第一周入职 FP 公司的工程清单 |

学完这 5 个高阶专题,具备 50K RMB 级别 Haskell / FP 工程师岗位的工程能力。

