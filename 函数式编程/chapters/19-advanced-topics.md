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
-- 标准 Free Monad: 由底函子 f 生成的最少 monad
data Free f a
  = Pure a
  | Free (f (Free f a))

-- 它的 Functor / Monad 实例自动满足 monad 律
instance Functor f => Functor (Free f) where
  fmap f (Pure a)   = Pure (f a)
  fmap f (Free fx)  = Free (fmap (fmap f) fx)

instance Functor f => Monad (Free f) where
  Pure a >>= f = f a
  Free fx >>= f = Free (fmap (>>= f) fx)
```

`Free f` 是以 $f$ 为底函子生成的最少 monad,它是 $f$ 在 monad 范畴里的左伴随。

### 19.2.2 DSL 例子(正确形式)

底函子必须把"下一步"作为参数,而不是结果:

```haskell
-- 1. 底函子: next 是"剩余计算"
data TeletypeF next
  = PutStrLn String next
  | GetLine (String -> next)
  deriving Functor

type Teletype = Free TeletypeF

-- 2. liftF 把一层 effect 提升为 monadic 动作
liftF :: Functor f => f a -> Free f a
liftF fa = Free (fmap Pure fa)

-- 3. 构造一个程序
say :: Teletype String
say = do
  liftF (PutStrLn "name?" ())
  liftF (GetLine id)
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
-- 测试用解释器: 不需要真 IO
runPure :: Teletype a -> [String] -> ([String], a)
runPure (Pure a) logs = (reverse logs, a)
runPure (Free (PutStrLn s k)) logs = runPure k (s : logs)
runPure (Free (GetLine k))     logs = runPure (k "Alice") ("<input Alice>" : logs)
```

一份 DSL,多后端,这是 Free Monad 的真正价值。

### 19.2.5 Free Applicative

Free Applicative 用另一组构造子,关键是它不强制顺序,可并行:

```haskell
-- 标准实现来自 free 包
data Ap f a where
  PureA :: a -> Ap f a
  Ap    :: f x -> Ap f (x -> a) -> Ap f a

-- 形式: f 总是出现在"左参数", 右侧累积"还差什么函数"
```

应用示例: 一个验证规则 DSL, 用 Free Applicative 收集所有错误而非短路:

```haskell
data CheckF a
  = LengthGE Int String     -- 字符串长度 ≥ n
  | Matches  String String  -- 正则匹配
  deriving Functor

type Check = Ap CheckF

validName :: String -> Check ()
validName s = Ap (LengthGE 3 s) (PureA (\_ -> ()))
```

**特性**: Free Applicative 可并行执行(f 用 applicative 律合并),而 Free Monad 强制顺序(>>= 串行)。

完整可运行示例见 `code/Ch19/TaglessFinal.hs`。

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
-- 1. 类型类: 描述能力
class Monad m => MonadStore s m where
  get :: m s
  put :: s -> m ()

-- 2. 真实实现 (lift 通过 StateT)
instance Monad m => MonadStore s (StateT s m) where
  get = StateT $ \s -> pure (s, s)
  put s = StateT $ \_ -> pure ((), s)

-- 3. 业务代码: 与具体 monad 解耦
increment :: MonadStore Int m => m ()
increment = do
  n <- get
  put (n + 1)

-- 4. 真实运行
runStore :: StateT Int IO a -> Int -> IO (a, Int)
runStore m s = runStateT m s

-- 5. 测试运行: 用 Identity monad 替代
runStorePure :: StateT Int Identity a -> Int -> (a, Int)
runStorePure m s = runStateT m s
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

### 19.5.4 Profunctor 视角 (van Laarhoven 编码)

最简洁的 optics 形式: 用 Profunctor 的 `dimap` 表达"读 + 改":

```haskell
-- Profunctor: 既是 contravariant 在第一参, covariant 在第二参
class Profunctor p where
  dimap :: (a -> b) -> (c -> d) -> p b c -> p a d

-- Lens 是 Profunctor 的特殊形式
type Lens s t a b = forall p. Profunctor p => p a b -> p s t
type Lens' s a   = Lens s s a a

-- 修改与读取
(^.) :: ((a -> Const a a) -> s -> Const a s) -> s -> a
infixl 8 ^.
get l s = getConst (l Const s)

(.~) :: ((a -> Identity a) -> s -> Identity s) -> a -> s -> s
infixr 4 .~
set l a s = runIdentity (l (Identity . const a) s)
```

### 19.5.5 Lens 律

任何 Lens 必须满足:

1. **view-set 律**: `set l (view l s) s = s` — 读到啥设回去不变。
2. **set-set 律**: `set l a' (set l a s) = set l a' s` — 多次设同字段等价一次。
3. **set-view 律**: `view l (set l a s) = a` — 设后读到的是新值。

这三条律保证 lens 行为"像字段"。

```haskell
-- 一个 lens 是否满足律,可用 quickcheck-lens 库自动验证
prop_viewSet :: Eq s => Lens' s a -> s -> Property
prop_viewSet l s = let a = view l s in set l a s === s

prop_setView :: Eq a => Lens' s a -> a -> s -> Property
prop_setView l a s = view l (set l a s) === a
```

### 19.5.6 Prism: sum 类型的 lens

```haskell
-- Prism: 关注和类型的一个分支
type Prism s t a b = forall p. Choice p => p a b -> p s t
-- Choice: 同时支持 Profunctor + 可分支
```

### 19.5.7 Traversal: 多元素

```haskell
-- Traversal: 0+ 元素
type Traversal s t a b = forall p. Applicative p => p a b -> p s t

-- list 的 traversal
traverseList :: Traversal [a] [b] a b
traverseList f []     = pure []
traverseList f (x:xs) = (:) <$> f x <*> traverseList f xs
```

### 19.5.8 关键库与对应

| 库 | 编码 | 特点 |
|----|------|------|
| `lens` | van Laarhoven | 类型驱动, 历史最久 |
| `optics` (MonoFoldable) | 等价 | 统一多 optic |
| Scala Monocle | 类似 | 工业应用 |
| PureScript psa | 类似 | 编译时 |

### 19.5.9 用 lens 简化代码

```haskell
-- 不用 lens
update p = p { address = (address p) { city = "LA" } }

-- 用 lens
update p = cityL .~ "LA" $ p
-- 或者
update p = p & cityL .~ "LA"
```

Optics 让你用**组合**方式表达嵌套修改,在大型 codebase 中可读性大幅提升。

## 19.6 思考题

1. 把 `map f [1,2,3]` 写成 CPS 形式。
2. 写一个 `Free` 上的 `Counter` DSL,提供 `incr`, `decr`, `get`,并实现一个测试解释器。
3. 用 Tagless Final 写一个 `MonadStack m => push :: a -> m ()` 类型类,并实现其 StateT 实例。
4. 解释 Lens 律(view-set / set-set / set-view)为何是"字段语义"的精确刻画。
5. 列出三种 stream 处理库 (conduit / pipes / streaming),它们的差异。
6. 推导 cata / ana / hylo 的融合律。

## 19.7 关键文献

- **FP**: *Purely Functional Data Structures* (Okasaki)
- **CPS**: Appel, *Compiling with Continuations*
- **Free Monad**: Swierstra, "Data types à la carte"
- **Tagless Final**: Carette, Kmett, "Finally Tagless, Partially Applied"
- **FRP**: Elliott & Hudak, "Functional Reactive Animation"
- **Optics**: Pickering, Érdi, "Profunctor Optics"; Kmett, "lens" library
- **Recursion Schemes**: Meijer, Fokkinga, Paterson, "Functional Programming with Bananas, Lenses, Envelopes and Barbed Wire"

## 19.8 小结

- **CPS**: 控制流显式化。
- **Free Monad**: DSL 与解释器分离。
- **Tagless Final**: 编译时类型驱动 DSL。
- **反应式**: 随时间变化的值。
- **Optics**: 嵌套修改的代数,van Laarhoven 编码统一 Iso/Lens/Prism/Traversal。

最后一章:收束与学习路径。

