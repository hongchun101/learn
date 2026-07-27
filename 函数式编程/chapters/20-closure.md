# 第 20 章  收束:实践指引与学习路径

> 读完本章,你应能:把本教程的理论转化为日常实践,并知道下一步该学什么。

## 20.1 把"理论"嵌入"实践"

### 20.1.1 Functional Core, Imperative Shell

```
                   ┌──────────────────────────────┐
                   │  Imperative Shell (薄)        │
                   │   main, IO, FFI, main loop    │
                   └────────┬─────────────────────┘
                            │
                            ▼
                   ┌──────────────────────────────┐
                   │  Pure Core (尽量大)           │
                   │  业务逻辑、算法、模型          │
                   │  ADT、Functor、Monad          │
                   └──────────────────────────────┘
```

把代码分为两层:
- 内部: 纯函数,完全可推理、可测试、可并行
- 外部: 薄薄的 IO 外壳,负责"读取世界" 与"写回世界"

### 20.1.2 类型驱动

```haskell
-- 1. 设计 ADT
data User = User { name :: String, email :: String, age :: Int }

-- 2. 写"不存在的状态" = Nothing
newtype NonEmpty a = NonEmpty a (NEList a)

-- 3. 写"必填字段" = 类型
data Form = Form { name :: NonEmpty String, age :: Positive }

-- 4. 让非法状态不可表达
```

### 20.1.3 Effect 选型

哪个 monad / effect?

| 场景 | 选择 |
|------|------|
| 失败但不带错误 | Maybe |
| 失败带错误 | Either String |
| 资源受限 | State |
| 读环境 | Reader |
| 写日志 | Writer |
| 真实 IO | IO |
| 异常 | ExceptT |
| 异步 | IO + STM / async |

### 20.1.4 数据流

```haskell
-- 极简管道
process :: [Input] -> [Output]
process = map toOutput . filter valid . map parse
```

### 20.1.5 测试

```haskell
-- 纯函数: QuickCheck
-- 集成: hspec / tasty
-- 性能: criterion
```

## 20.2 学习路径

### 20.2.1 从语言到读书

| 阶段 | 重点 | 推荐内容 |
|------|------|----------|
| 入门 | 语法、基本类型 | Learn You a Haskell / Haskell Programming from First Principles |
| 中级 | 类型类、monad | Haskell Book, Category Theory for Programmers |
| 高级 | 范畴论、辅助、效应 | 范畴论 / Algebraic Effects 论文 |
| 大师 | 自己设计类型 | 自由 / Tagless Final / 异象 / 编译 |

### 20.2.2 推荐书目

- *Learn You a Haskell for Great Good!* — Miran Lipovaca
- *Haskell Programming from First Principles* — Allen & Moronuki
- *Real World Haskell* — O'Sullivan, Stewart, Goerzen
- *Thinking with Types* — Sandy Maguire
- *Category Theory for Programmers* — Bartosz Milewski
- *Algebraic Effects and Handlers* — 论文集
- *Purely Functional Data Structures* — Chris Okasaki
- *Functional Programming in Scala* — Paul Chiusano, Rúnar Bjarnason

### 20.2.3 推荐论文

- Wadler, "Monads for functional programming"
- SPJ, "Tackling the Awkward Squad"
- Odersky, "Continuation-Passing Style"
- Carette, "Finally Tagless, Partially Applied"
- Plotkin & Power, "Algebraic Operations and Generic Effects"
- Paterson, "A new notation for arrows"

### 20.2.4 推荐练习

- 写一个简单的 Lisp 解释器 (Free Monad)
- 写一个简单的数据库 (Monoid + State)
- 写一个类型化 AST 求值器 (GADT)
- 写一个 mini grep (Stream + Conduit)
- 写一个 RSA (纯函数)
- 写一个 1D 元胞自动机 (Comonad)

## 20.3 选语言

| 语言 | 评价 |
|------|------|
| **Haskell** | 理论最纯, monad 鼻祖 |
| **PureScript** | 类型驱动, JS 出 FFI |
| **OCaml** | 工业, too many parens |
| **F#** | .NET 平台, 工业 |
| **Scala 3** | JVM, OOP + FP |
| **Elm** | Web 前端, 简单 |
| **Elixir** | Erlang VM, 动态但 FP 友好 |
| **Clojure** | JVM, Lisp 系 |
| **Roc** | 新生, Rust + FP |
| **Koka** | 代数效应原生 |

### 20.3.1 不要选的语言作为入门

- Idris 2: 依赖类型, 但学习曲线陡
- Coq / Lean: 定理证明, 非通用 FP
- Agda: 依赖类型, 同上

### 20.3.2 入门推荐

- 工业: Scala 3 / F# / PureScript
- 学术: Haskell / OCaml
- Web: Elm / PureScript / ReScript
- 系统: Roc / Rust (借用 FP)

## 20.4 关键观点回顾

### 20.4.1 类型即规约

```haskell
-- 编译期保证:
processOrder :: Order -> Either String Receipt
-- 不会抛异常, 不会单侧失败, 不会漏掉某些 edge case
```

### 20.4.2 律即正确性

```haskell
-- Monad 律: 写代码前的设计契约
-- 业务律: 业务逻辑的不变量
-- QuickCheck: 机械验证
```

### 20.4.3 抽象 = 形式

```haskell
-- Functor:  "可被映射"
-- Applicative: "可被应用"
-- Monad: "可被链式"
-- Algebraic Effect: "可被处理"
```

每一个抽象都对应一组"常见需求",但形式上可被代数地描述。

## 20.5 实战项目

### 20.5.1 S-expression 解析器

```haskell
import Data.Char (isDigit, isSpace)

data SExp = Atom String | List [SExp]
  deriving (Show, Eq)

parse :: String -> SExp
parse = fst . head . parseTop

parseTop :: String -> [(SExp, String)]
parseTop = parseSExp . dropSpaces

parseSExp :: String -> [(SExp, String)]
parseSExp s@('(':cs) = case parseList cs of
  (xs, rest) -> [(List xs, rest)]
parseSExp s = let (a, rest) = span (not . isSpace) s
              in [(Atom a, rest)]

parseList :: String -> ([SExp], String)
parseList s = case dropSpaces s of
  (')':rest) -> ([], rest)
  s' -> let (e, rest) = parseSExp s'
            (es, rest') = parseList rest
        in (e:es, rest')

dropSpaces = dropWhile isSpace
```

### 20.5.2 简易 JSON

```haskell
data Json = JNull
          | JBool Bool
          | JNum Double
          | JStr String
          | JArr [Json]
          | JObj [(String, Json)]
  deriving (Show, Eq)

-- 写: showJSON
-- 读: parseJSON
```

### 20.5.3 简易 Reducer

```haskell
foldl' :: (b -> a -> b) -> b -> [a] -> b
foldl' f z []     = z
foldl' f z (x:xs) = foldl' f (f z x) xs

-- 自定义 reducer
data Reduce m a = Reduce { initState :: m, step :: m -> a -> m, done :: m -> a }
```

## 20.6 思考题

1. 你所在的项目用什么样"不存在的状态"? 用 ADT 替代。
2. 你最近写的算法, 能否使用 `foldMap` 简化?
3. 你能否用 QuickCheck 找到你现有代码的一个 bug?
4. 设计一个 Free Monad DSL, 解决你日常的一个小问题。

## 20.7 反模式

### 20.7.1 过度抽象

```haskell
-- 错误: 都在变得很抽象
class Monad m => MonadMonad m where
  bindMonad :: m a -> (a -> m b) -> m b
```

### 20.7.2 性能陷阱

```haskell
-- 错误: 用 list 做 10^9 项
sum [1..10^9]  -- 慢

-- 改成 vector
import qualified Data.Vector.Unboxed as VU
VU.sum $ VU.enumFromTo 1 (10^9 :: Int)
```

### 20.7.3 String vs. Text

```haskell
-- 错误: String 处理 1GB
length "..."  -- [Char], 慢

-- 正确: Text
T.length "..."
```

## 20.8 教程地图(回顾)

```
Foundation          (Ch1-3)
   λ-演算 + 类型 + 代数结构
      │
      ▼
Core ABstractions (Ch4-7)
   纯函数 + 递归 + ADT + 高阶
      │
      ▼
Type Classes       (Ch8-12)
   Functor → Applicative → Monad → Trans → Fold/Traverse
      │
      ▼
Advanced Theory    (Ch13-16)
   范畴论 → Comonad → 效应 → 高级类型
      │
      ▼
Engineering       (Ch17-19)
   性能 + QuickCheck + CPS / Free / Tagless
      │
      ▼
Closure (Ch20)
   实践 + 学习路径
```

## 20.9 下一步

1. **选一个项目**: 用 FP 重新写一个以前写过的小项目。
2. **进入社区**: Haskell Reddit, FP Discord, r/ProgrammingLanguages。
3. **写一篇博客**: 把你的理解输出。
4. **读论文**: Wadler / SPJ / Odersky 选一篇精读。
5. **回到**: 写一个 free monad DSL, 一个 GADT 求值器, 一个 category-theoretic 库。

## 20.10 最后一句话

> *函数式编程不是关于 lambda calculus 或 monad,而是关于一种思维方式:程序是数学结构,不是动作序列。理解这一点,你就不是从命令式迁移,你已经站在了另一个范式里。*

到这里,本教程的 20 章全部完成。你可以:

- ✅ 写纯函数式程序
- ✅ 读 Haskell / PureScript / Scala 3 源码
- ✅ 用 QuickCheck 验证性质
- ✅ 理解类型类与律的关系
- ✅ 解释范畴论的核心概念
- ✅ 设计 DSL(Free Monad / Tagless Final)
- ✅ 选择 monad 表达 effect
- ✅ 优化性能(惰性/严格/融合)
- ✅ 阅读 FP 论文

欢迎进入 FP 的世界。
