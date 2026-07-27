# 第 19 章  进阶主题:CPS / Free Monad / Tagless Final / 反应式

> 读完本章,你将掌握当前 FP 工业实践中的几个热点技术,以及它们背后的共同模式。

## 19.1 CPS (Continuation-Passing Style)

### 19.1.1 形式

```haskell
-- 直接
add :: Int -> Int -> Int
add x y = x + y

-- CPS
addC :: Int -> Int -> (Int -> r) -> r
addC x y k = k (x + y)
```

每个函数都额外接收一个 "接下来做什么"。

### 19.1.2 在哪用

- 异步编程(JavaScript / Scheme)
- 异常/跳出(async/await)
- 编译器(`call/cc`)
- `Cont` monad (Ch10)

### 19.1.3 CPS 转换

```haskell
-- 直接
fact :: Int -> Int
fact 0 = 1
fact n = n * fact (n - 1)

-- CPS
factC :: Int -> (Int -> r) -> r
factC 0 k = k 1
factC n k = factC (n - 1) (\v -> k (n * v))
```

CPS 转换(compilation)会让递归总是尾递归。

## 19.2 Free Monad

### 19.2.1 形式

```haskell
data Free f a
  = Pure a
  | Free (f (Free f a))
```

`Free f` 是以 $f$ 为底函子生成的最少 monad。

### 19.2.2 DSL 例子

```haskell
data TeletypeF next
  = PutStrLn String next
  | GetLine (String -> next)
  deriving (Functor)

type Teletype = Free TeletypeF

say :: Teletype ()
say = do
  Free (PutStrLn "name?" (Pure ()))
  Pure ()  -- 简化
```

### 19.2.3 解释器

```haskell
runTeletype :: Teletype a -> IO a
runTeletype (Pure a) = pure a
runTeletype (Free (PutStrLn s k)) = putStrLn s >> runTeletype k
runTeletype (Free (GetLine k))     = getLine >>= runTeletype . k
```

### 19.2.4 多后端

```haskell
runPure :: Teletype a -> [String]
runPure = ...
-- 同一份代码, 多后端
```

### 19.2.5 Free Applicative

```haskell
data Ap f a where
  Pure :: a -> Ap f a
  Ap   :: f a -> Ap f b -> Maybe (a -> b, Ap f b)
```

尤其对**并行**场景好用。

## 19.3 Tagless Final

### 19.3.1 思路

不用 `Free` 数据结构,而用**类型类**描述能力:

```haskell
class Monad m => MonadLog m where
  log :: String -> m ()

class Monad m => MonadState s m where
  get :: m s
  put :: s -> m ()
```

DSL = type class 集合;解释 = 给一个具体 `m`。

### 19.3.2 vs. Free Monad

| 维度 | Free Monad | Tagless Final |
|------|------------|---------------|
| 表达 | 数据 | 类型 |
| 优化 | 难(中间结构) | 易(直接融合) |
| 测试 | 简单(foldMap) | 简单(传 m) |
| 错误 | 运行时 | 编译期 |
| 多后端 | 1 个解释器 | 每个后端实现 type class |

### 19.3.3 例子

```haskell
class Monad m => MonadStore s m where
  get :: m s
  put :: s -> m ()

instance Monad m => MonadStore s (StateT s m) where
  get = StateT $ \s -> pure (s, s)
  put = ... -- 用 lift

-- 解释器
runStore :: StateT s m a -> s -> m (a, s)
runStore m s = runStateT m s

-- 测试
runStoreM :: (s -> [s]) -> StateT s [] a -> [a]
runStoreM _ = ...
```

## 19.4 Reactive 编程

### 19.4.1 概念

**Reactive** = "随时间变化的值"。在 FP 中,反应式 = Applicative / Arrow over time。

```haskell
-- 信号(Signal) = 时间到值的连续函数
type Signal a = Time -> a

-- 事件流(Event)
data Event a = Event (Time -> Maybe a)
```

### 19.4.2 FRP (Functional Reactive Programming)

```haskell
-- 假设的"理想" FRP
fileSize :: Behavior Int
fileSize = length <$> fileContent

-- 当文件改变, fileSize 自动更新
```

### 19.4.3 Elm / Reflex / Sodium

这些库实现 FRP:

```haskell
-- Reflex-DOM
counter :: Widget WidgetData (Event t Int)
counter = do
  rec btn <- button "Click me"
      count <- holdDyn 0 (btn -: 1)
  dynText (display <$> count)
```

```elm
-- Elm
type Msg = Increment | Decrement

update : Msg -> Model -> Model
update msg model =
  case msg of
    Increment -> { model | count = model.count + 1 }
    Decrement -> { model | count = model.count - 1 }
```

### 19.4.4 与 Monadic Stream / Conduit

```haskell
-- conduit
runConduit :: ConduitT () String IO ()
runConduit = ... -- 流处理

-- streaming
data Stream :: Effect f => f a -> ()
```

反应式 ≠ 流处理。但两者经常混淆。

## 19.5 Optics: Lens / Prism / Iso

### 19.5.1 动机

```haskell
-- 修改嵌套结构
updatePerson :: Person -> Person
updatePerson p = p { address = (address p) { city = "LA" } }
```

受益于 lens:

```haskell
data Address = Address { city :: String, ... }
data Person = Person { address :: Address, ... }

cityL :: Lens' Person String
cityL = lens city (\p c -> p { address = (address p) { city = c } })

modifyPerson :: Person -> Person
modifyPerson = cityL .~ "LA"
```

### 19.5.2 Optics Hierarchy

```
Iso   ── A ≅ B
Lens  ── A内有 B 的"字段"
Prism ── A 可以是 B 或 不是
Getter ── A 投影出 B
Setter ── A 设定 B
Affine ── Lens + Maybe
Traversal ── zero or more
```

### 19.5.3 例子

```haskell
-- 等价
person ^. cityL                -- 读
person & cityL .~ "LA"         -- 写
person & cityL %~ toUpper      -- 改
over cityL toUpper person      -- 同上
```

## 19.6 思考题

1. 把 `map f [1,2,3]` 写成 CPS 形式。
2. 写一个 `Free` 上的 `Counter` DSL,提供 `incr`, `decr`, `get`。
3. 用 Tagless Final 写一个 `MonadStack m => push :: a -> m ()` 类型类。
4. 解释为什么 Lens 比 record syntax 更通用。
5. 列出三种 stream 处理库 (conduit / pipes / streaming),它们的差异。

## 19.7 关键文献

- **FP**: *Purely Functional Data Structures* (Okasaki)
- **CPS**: Appel, *Compiling with Continuations*
- **Free Monad**: Swierstra, "Data types à la carte"
- **Tagless Final**: Carette et al., "Finally Tagless"
- **FRP**: Elliott & Hudak, "Functional Reactive Animation"

## 19.8 小结

- CPS: 控制流显式化。
- Free Monad: DSL 与解释器分离。
- Tagless Final: 编译时类型驱动 DSL。
- 反应式: 随时间变化的值。
- Optics: 嵌套修改的代数。

最后一章:收束与学习路径。
