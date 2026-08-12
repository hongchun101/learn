# 配套代码示例

本目录提供教程中引用的 Haskell 代码示例,可在 GHC 9.6+ 下运行。

```bash
$ cabal repl
> :l Ch01/Motivation.hs
> main
```

或者使用 `runhaskell`:

```bash
$ runhaskell Ch03/Lambda.hs
```

## 文件

| 章节 | 文件 | 内容 |
|------|------|------|
| Ch01 | `Ch01/Motivation.hs` | 命令式 vs. 函数式对比、闭包 |
| Ch03 | `Ch03/Lambda.hs` | Church 编码、Y 组合子、SKI |
| Ch05 | `Ch05/Recursion.hs` | 递归形式、尾递归、fold、树 fold、fix |
| Ch08 | `Ch08/Functor.hs` | Tree / BST / Wrap 自定义 Functor |
| Ch10 | `Ch10/Monad.hs` | State Monad 自定义实例 |
| Ch11 | `Ch11/FreeMonad.hs` | 最小 Console DSL 与解释器 |
| Ch19 | `Ch19/TaglessFinal.hs` | 编译时类型驱动的 MonadStore DSL |
| Ch20 | `Ch20/Json.hs` | 简易 JSON 解析与序列化 |
| Ch20 | `Ch20/Reducer.hs` | 抽象的 Reducer 模式 |

## 学习方式

教程中所有代码片段都可在 ghci 中亲手运行。这是 FP 学习的最佳方式——在 REPL 中实验比看书有效 10 倍。

```bash
$ cabal repl
ghci> :l Ch08/Functor.hs
ghci> :t fmap
ghci> fmap (+1) (Just 5)
ghci> :m + Test.QuickCheck
ghci> quickCheck prop_id
```

## 外部依赖

- `Ch11/FreeMonad.hs` 不需要外部库 (自带 Free)。
- `Ch20/Reducer.hs` 需要 `containers` (Map)。
- 其余文件只需 `base`。
