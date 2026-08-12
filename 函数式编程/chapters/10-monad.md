# 第 10 章  Monad:可被链接的计算

> 读完本章,你将理解 Monad 的本质、Monad 律,以及 6 种最常见的 Monad: `Maybe`, `Either`, `IO`, `State`, `Reader`, `Writer`。这是 FP 抽象的高潮。

## 10.1 引子

Applicative 解决了"装着函数 的 functor 应用到装着值 的 functor"。但还有一类问题 Applicative 解决不了:

```haskell
-- 我们想要: 根据 a 是否 Just 决定是否读 b
maybeAdd :: Maybe Int -> Maybe Int -> Maybe Int
maybeAdd a b = do
  x <- a
  y <- b  -- 这里派发依赖于 a 的结果
  return (x + y)
```

这正是 Monad 解决的问题:**链式派发(a 的值决定了下一步做什么)**。

## 10.2 定义

```haskell
class Applicative m => Monad m where
  (>>=) :: m a -> (a -> m b) -> m b
```

**`>>=` 是 "bind"**: 从 $m\ a$ 取值 $a$,送给函数 $a \to m\ b$,得到 $m\ b$。

### 10.2.1 `do` 语法

```haskell
-- do
--   x <- mx
--   y <- my
--   return (f x y)
-- ==
-- mx >>= \x -> my >>= \y -> return (f x y)
```

`do` 是"`>>=` 的语法糖"。

## 10.3 例子

### 10.3.1 Maybe

```haskell
instance Monad Maybe where
  return = pure
  Nothing >>= _ = Nothing
  Just x  >>= f = f x
```

`Nothing` 短路,`Just x` 把 $x$ 递给 $f$。

```haskell
divBy :: Int -> Int -> Maybe Int
divBy _ 0 = Nothing
divBy x y = Just (x `div` y)

safeDiv :: Int -> Int -> Int -> Maybe Int
safeDiv x y z = do
  a <- divBy x y
  b <- divBy a z
  return b
```

### 10.3.2 Either

```haskell
instance Monad (Either e) where
  return = pure
  Left e  >>= _ = Left e
  Right a >>= f = f a
```

与 Applicative 一致: 任一 Left 短路。

### 10.3.3 `[]`

```haskell
instance Monad [] where
  return x = [x]
  xs >>= f = [y | x <- xs, y <- f x]
```

这是理解 **非确定性**:

```haskell
-- 1+2 的可能结果
[1, 2] >>= \x -> [x, x*10]
-- [1, 10, 2, 20]
```

### 10.3.4 IO

```haskell
instance Monad IO where
  return = pure
  mx >>= f = joinIO (fmap f mx)
  -- 实际: 先执行 mx, 得到 x, 然后执行 f x
```

```haskell
main :: IO ()
main = do
  putStrLn "What's your name?"
  name <- getLine
  putStrLn ("Hello, " ++ name)
```

### 10.3.5 State

```haskell
newtype State s a = State { runState :: s -> (a, s) }

instance Monad (State s) where
  return a = State $ \s -> (a, s)
  State g >>= f = State $ \s ->
    let (a, s') = g s
    in runState (f a) s'

get :: State s s
get = State $ \s -> (s, s)

put :: s -> State s ()
put s = State $ \_ -> ((), s)
```

State 是"读-改-写"的代数化。

### 10.3.6 Reader

```haskell
newtype Reader r a = Reader { runReader :: r -> a }

instance Monad (Reader r) where
  return a = Reader $ \_ -> a
  Reader g >>= f = Reader $ \r -> runReader (f (g r)) r

ask :: Reader r r
ask = Reader id

local :: (r -> r) -> Reader r a -> Reader r a
local f (Reader g) = Reader (g . f)
```

Reader 是"环境只读"的计算。

### 10.3.7 Writer

```haskell
newtype Writer w a = Writer { runWriter :: (a, w) }

instance (Monoid w) => Monad (Writer w) where
  return a = Writer (a, mempty)
  Writer (a, w) >>= f = let Writer (b, w') = f a in Writer (b, w `mappend` w')

tell :: w -> Writer w ()
tell w = Writer ((), w)
```

Writer 是"附带日志"的计算。

## 10.4 Monad 律

三条律:

1. **左单位**: `return a >>= f = f a`
2. **右单位**: `m >>= return = m`
3. **结合律**: `(m >>= f) >>= g = m >>= (\x -> f x >>= g)`

### 10.4.1 工程意义

- **左单位**: `return a` 是"单纯装一个值",派发后得 $f a$
- **右单位**: 拿 $m$ 派发到 `return`, 还是 $m$
- **结合律**: `do` 块的 group 方式不影响结果

### 10.4.2 验证

```haskell
-- QuickCheck
prop_leftUnit a f = return a >>= f == f a
prop_rightUnit m = m >>= return == m
prop_assoc m f g = ((m >>= f) >>= g) == (m >>= (\x -> f x >>= g))
```

### 10.4.3 律的证明草图(以 `Maybe` 为例)

**左单位**: `return a >>= f = Just a >>= f = f a` ✓

**右单位**: 分两种情况
- `Nothing >>= return = Nothing` ✓
- `Just x >>= return = Just x` ✓

**结合律**:
- `Nothing` 分支两侧都到 `Nothing` ✓
- `Just x` 分支:
  - 左: `(Just x >>= f) >>= g = f x >>= g`
  - 右: `Just x >>= (\y -> f y >>= g) = (\y -> f y >>= g) x = f x >>= g` ✓

### 10.4.4 非律实例的反例

**反例 1: 顺序错乱的列表 Monad**:
```haskell
-- 错误: 改变顺序的 Monad 实例
instance Monad [] where
  return x = [x]
  xs >>= f = reverse [y | x <- xs, y <- f x]  -- 加了 reverse
-- 验证: [1, 2] >>= (\x -> [x, -x]) = [-1, 1, -2, 2]
-- 但 [(1, 2)] >>= (\x -> [x, -x]) = [1, -1, 2, -2]
-- 结合律: ([1] >>= const [1,2]) >>= const [3,4] = [1, 2, 3, 4]
--       != [1] >>= (\x -> const [1,2] x >>= const [3,4]) = [3, 4, 1, 2]
-- 破坏结合律!
```

**反例 2: 偷偷"忘记忆"的 Monad**:
```haskell
-- 错误: Monad 律要求保留信息
newtype Forgetful a = Forgetful Int
instance Monad Forgetful where
  return _ = Forgetful 0
  Forgetful x >>= _ = Forgetful (x + 1)  -- 每次都加 1
-- return 1 >>= id = Forgetful 0, 但 id 1 = Forgetful 1, 不等
-- 破坏左单位!
```

这些反例说明: 律不是"自然"的,需要小心验证。QuickCheck 是发现这类 bug 的最佳工具。


## 10.5 推导 Monad 应有

```haskell
-- return ≡ pure
-- >>= 等价于 flip (.)

-- fmap ≡ liftM
liftM :: Monad m => (a -> b) -> m a -> m b
liftM f m = m >>= return . f

-- (<*>) ≡ ap
ap :: Monad m => m (a -> b) -> m a -> m b
ap mf mx = do
  f <- mf
  x <- mx
  return (f x)
```

## 10.6 常见 Monad 的"语义"

| Monad | 语义 | 关键操作 |
|-------|------|----------|
| `Maybe` | 可能失败 | `Just` / `Nothing` |
| `Either e` | 失败 + 错误 | `Left` / `Right` |
| `[]` | 非确定性 | 一列可能性 |
| `IO` | 真实世界 | `getLine`, `putStrLn` |
| `State s` | 携带状态 | `get`, `put` |
| `Reader r` | 携带环境 | `ask`, `local` |
| `Writer w` | 携带日志 | `tell` |
| `Cont r` | 续延(control) | `callCC` |
| `RWS` | 读+写+状态 | three-layer |

## 10.7 例子:三个 Monad 的协作

```haskell
-- 读写 状态 + 错误
data AppState = AppState
  { asUser :: String
  , asCount :: Int
  } deriving (Show)

incr :: StateT AppState Maybe ()
incr = do
  AppState u c <- get
  put (AppState u (c + 1))

run :: Maybe (AppState, Int)
run = runStateT incr (AppState "alice" 0)
```

(状态 + 错误) = `StateT s Maybe`。Ch11 我们专门讲 transformer。

## 10.8 续延 Monad (Cont)

```haskell
newtype Cont r a = Cont { runCont :: (a -> r) -> r }

instance Monad (Cont r) where
  return a = Cont ($ a)
  Cont c >>= f = Cont $ \k -> c (\a -> runCont (f a) k)
```

**含义**: 程序的"未来"是一个函数 $k: a \to r$。`>>=` 把"下一步"插到 $k$ 之前。

`callCC` 是控制流的 super-power:

```haskell
callCC :: ((a -> Cont r b) -> Cont r a) -> Cont r a
callCC f = Cont $ \k -> runCont (f (\a -> Cont $ \_ -> k a)) k
```

实战: 提前退出(模拟 break)

```haskell
import Control.Monad.Cont

-- 用 callCC 跳出循环
firstPositive :: [Int] -> Cont r (Maybe Int)
firstPositive xs = callCC $ \break -> do
  forM_ xs $ \x ->
    when (x > 0) $ break (Just x)   -- 跳到 break
  return Nothing

-- 经典例子: 异常
safeDivC :: Int -> Int -> Cont r (Either String Int)
safeDivC _ 0 = callCC $ \throw -> throw (Left "div by zero")
```

## 10.9 范畴论视角

### 10.9.1 Monad = 幺半范畴里的自函子

**Monad** 是:
- 函子 $M: \mathcal{C} \to \mathcal{C}$
- 单位 $\eta: \text{Id} \Rightarrow M$(对应 `return`)
- 乘法 $\mu: M \circ M \Rightarrow M$(对应 `join`)

满足律:
- $\mu \circ M\mu = \mu \circ \mu M$
- $\mu \circ M\eta = \mu \circ \eta M = \text{id}$

### 10.9.2 与 Haskell 的关系

```haskell
return :: a -> m a
join :: m (m a) -> m a
m >>= f = join (fmap f m)
```

`join` 是 `>>=` 的核心。

### 10.9.3 Kleisli 范畴

**Kleisli 范畴** $\mathcal{C}_M$ 由 $M$ 构造:

- 对象 = $\mathcal{C}$ 的对象
- 态射 $A \to_M B$ = $A \to M(B)$(Kleisli arrow)
- 复合 = `(>=>)`:

```haskell
(>=>) :: Monad m => (a -> m b) -> (b -> m c) -> a -> m c
f >=> g = \x -> f x >>= g
```

Monad 律 = `return` 是 Kleisli 范畴恒等, `(>=>)` 满足结合律。

这是 Wadler 的关键洞察(1992): "Monads for functional programming"。

## 10.10 思考题

1. 实现 `safeHead :: [a] -> Maybe a` 然后写 `safeTail :: [a] -> Maybe [a]`,并 `do` 起来实现 `safeInit :: [a] -> Maybe [a]`。
2. 证明 `Maybe` 满足 Monad 律。
3. 实现 `State s` 上的 `modify :: (s -> s) -> State s ()`。
4. 用 `State` 实现一个简化版 ATM: 一连串 `Deposit Int` / `Withdraw Int` 操作,返回最终余额。
5. 推导 `join :: m (m a) -> m a` 与 `>>=` 的关系。
6. 解释 `Writer` 中 `mempty` / `mappend` 的作用。

## 10.11 小结

- Monad = "可链式派发"的计算抽象。
- 三条律保证"`return` 与 `>>=` 行为合理"。
- 7 种常见 Monad 覆盖 90% 日常 FP 需求。
- 范畴论:Monad = 幺半范畴里的自函子, Kleisli 范畴是其代数视图。

下一章:Monad Transformer——把多个 Monad 叠起来。
