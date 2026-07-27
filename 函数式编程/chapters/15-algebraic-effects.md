# 第 15 章  代数效应与 Effect 系统

> 读完本章,你将理解:effect 是如何被代数化抽象的;与 monad 的对比;以及 Eff、Koka、Unison 等语言如何利用代数效应。

## 15.1 动机

Monad 让 effect 有"形状"。但 Monad 的语义是"绑定",有些 effect 难以表达:

- **Throw + Catch**: dynamic control flow
- **Non-determinism**: 多个结果
- **Cooperative yield**: 主动让出调度
- **External state**: 外部世界

代数效应提供另一种抽象:**handler 调用影响,handler 解释如何响应**。

## 15.2 形式

### 15.2.1 操作签名

```haskell
effect Choose a where
  choose :: [a] -> a

effect Throw e where
  throw :: e -> a

effect State s where
  get :: s
  put :: s -> ()
```

### 15.2.2 effectful 计算

```haskell
prog :: (Choose Int, Throw String) ()
prog = do
  x <- choose [1, 2, 3]
  if even x
    then throw "even"
    else return ()
```

### 15.2.3 handler

```haskell
handleProg :: ()
handleProg = handle prog
  { choose xs = k (head xs)  -- 取第一个
  , throw e  = k ()          -- 吞掉错误
  }
```

Handler 决定 effect 的"语义"。

## 15.3 与 Monad 的对比

| 维度 | Monad | Algebraic Effect |
|------|-------|------------------|
| 抽象方式 | 链式计算 | 操作调用 + handler |
| 副作用 | 隐式 | 显式 |
| 错误处理 | `throw/catch` | 通用 handler |
| 并发 | monad stack | deep/shallow handlers |
| 语言支持 | Haskell, Scala | Eff, Koka, Unison |

### 15.3.1 多 result 与 deep handler

```haskell
-- deep handler: 重启上下文
handleAll :: [a]
handleAll = handle prog
  { choose xs = mapM (\x -> k x) xs  -- 取所有
  }
-- 但每个 choose 都是重启点
```

### 15.3.2 shallow handler

```haskell
-- shallow handler: 仅当前 effect
chooseFirst xs = handleShallow prog
  { choose xs = head xs
  }
```

## 15.4 Eff 语言示例

```haskell
-- Eff
let greet name =
  print ("Hello, " ^ name ^ "!")

let main = greet "world"
```

### 15.4.1 状态 handler

```haskell
let incr = ref 0
let bump =
  v <- get incr;
  put incr (v + 1);
  pure v

handle
  (bump >> bump)
  (fun () -> pure ())
  (ref_init 0)
```

## 15.5 自由 Monad 与 algebraic effect

```haskell
data ChooseF a
  = Choose [a] (a -> ChooseM a)

data ChooseM a = Pure a | ChooseF [a] (a -> ChooseM a)
```

这就是 `Free (ChooseF) a`。这就是 algebraic effect 在 Haskell 中常见的实现。

```haskell
interpNonDet :: ChooseM a -> [[a]]
interpNonDet (Pure a)    = [[a]]
interpNonDet (ChooseF xs k) = concat [interpNonDet (k x) | x <- xs]
```

## 15.6 类型驱动的安全

Koka 强调 effect types:

```haskell
fun foo() : int
  bar()
fun bar() : <read,write> int
  ...
```

`foo` 不抛 effect,`bar` 抛 read+write。调用图清晰。

## 15.7 思考题

1. 实现 `Free` 上的 `Choose` effect,非 deterministic interpreter。
2. 写出 `State` 的 algebraic effect handler。
3. 对比 `MonadCatch` 与 `throw/catch` algebraic effect 的差异。
4. 解释 `tail-resumptive` handler 的含义。
5. 列举 algebraic effect 优于 monad 的三个场景。

## 15.8 关键文献

- Plotkin & Power 2001, "Algebraic Operations and Generic Effects"
- Plotkin & Pretnar 2009, "Handlers of Algebraic Effects"
- Bauer & Pretnar 2015, "Programming with Algebraic Effects and Handlers"

## 15.9 小结

- 代数效应 = "操作调用 + handler 解释"。
- 比 monad 更灵活(支持 deep handler, 非确定, retry)。
- 已在 Eff / Koka / Unison / OCaml 5 等语言实现。
- 仍与 monad 兼容(algebraic effect 可编码为 free monad 或 monad transformer)。

下一章:高级类型 — GADT、Type Family、Rank-N、HKT。
