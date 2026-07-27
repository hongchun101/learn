# 第 11 章  Monad Transformer 与 MTL 风格

> 读完本章,你将理解:现实程序同时需要多维"效果",如何把它们"叠加"到一个 monad 里;以及 MTL/mtl 库的 type class 抽象。

## 11.1 引子

10 章里我们见到 `State s a`, `Maybe a`, `Reader r a`, `Writer w a`。现实程序往往需要:

- 读环境(R)
- 写日志(W)
- 维护状态(S)
- 错误处理(M)

你要 "S + M + R + W" 一起,这就要 Monad Transformer。

## 11.2 Monad Transformer 基础

### 11.2.1 形式

```haskell
newtype StateT s m a = StateT { runStateT :: s -> m (a, s) }
```

`StateT s m a` 是"在 $m$ 内是 State,但 $m$ 又可以是 Reader 等"。

### 11.2.2 关键观察

```
基底 monad:        Maybe
State + Maybe:     StateT s Maybe
Reader + Maybe:    ReaderT r Maybe
Writer + Maybe:    WriterT w Maybe
```

每个 `MT m` 提升 `m` 的能力,加上"基 monad" 的能力。

## 11.3 转型器实例

### 11.3.1 StateT

```haskell
newtype StateT s m a = StateT { runStateT :: s -> m (a, s) }

instance Monad m => Monad (StateT s m) where
  return a = StateT $ \s -> return (a, s)
  StateT g >>= f = StateT $ \s -> do
    (a, s') <- g s
    runStateT (f a) s'

instance MonadTrans (StateT s) where
  lift m = StateT $ \s -> do
    a <- m
    return (a, s)
```

### 11.3.2 ReaderT

```haskell
newtype ReaderT r m a = ReaderT { runReaderT :: r -> m a }

instance Monad m => Monad (ReaderT r m) where
  return a = ReaderT $ \_ -> return a
  ReaderT g >>= f = ReaderT $ \r -> do
    a <- g r
    runReaderT (f a) r

instance MonadTrans (ReaderT r) where
  lift m = ReaderT $ \_ -> m
```

### 11.3.3 ExceptT (Either 的 transformer)

```haskell
newtype ExceptT e m a = ExceptT { runExceptT :: m (Either e a) }

instance Monad m => Monad (ExceptT e m) where
  return a = ExceptT (return (Right a))
  ExceptT m >>= f = ExceptT $ do
    v <- m
    case v of
      Left e  -> return (Left e)
      Right a -> runExceptT (f a)
```

### 11.3.4 WriterT

```haskell
newtype WriterT w m a = WriterT { runWriterT :: m (a, w) }

instance (Monoid w, Monad m) => Monad (WriterT w m) where
  return a = WriterT (return (a, mempty))
  WriterT m >>= f = WriterT $ do
    (a, w) <- m
    (b, w') <- runWriterT (f a)
    return (b, w `mappend` w')
```

## 11.4 组合栈

```haskell
-- 栈式声明
type AppM = ReaderT Cfg (StateT AppState (ExceptT String IO))
```

执行顺序由内向外:

```
io -> ExceptT -> StateT -> ReaderT
```

每个 lift 跨过一层:

```haskell
do
  cfg <- ask                 -- 顶 Reader
  s <- get                   -- 第二 State
  liftIO $ putStrLn "..."    -- 底层 IO
  throwError "失败"          -- 底层 Except
```

### 11.4.1 实战:订单处理

```haskell
type AppM = ReaderT Cfg (StateT Db (ExceptT String IO))

processOrder :: Order -> AppM Receipt
processOrder o = do
  cfg <- ask
  s <- get
  if orderTotal o > cfg.maxOrder
    then throwError "too large"
    else do
      modify (\db -> db { processed = o : processed db })
      return (Receipt o)
```

清晰。

## 11.5 MTL 风格

### 11.5.1 动机

直接用 transformer 写 `do` 块会出现很多 `lift`,即便你只想发日志。

MTL 用 type class 解耦:

```haskell
class Monad m => MonadReader r m where
  ask :: m r
  local :: (r -> r) -> m a -> m a

class Monad m => MonadState s m where
  get :: m s
  put :: s -> m ()
  modify :: (s -> s) -> m ()

class Monad m => MonadWriter w m where
  tell :: w -> m ()
  pass :: m (a, w -> w) -> m a

class Monad m => MonadError e m where
  throwError :: e -> m a
  catchError :: m a -> (e -> m a) -> m a
```

### 11.5.2 好处

- 函数不依赖具体 transformer 结构
- 同类 effect 可以"换实现"
- 测试时用一个 `State` 替另一个

```haskell
processOrder :: MonadReader Cfg m
             => MonadState Db m
             => MonadError String m
             => Order
             -> m Receipt
processOrder o = do
  cfg <- ask
  modify (\db -> db { processed = o : processed db })
  if orderTotal o > cfg.maxOrder
    then throwError "too large"
    else return (Receipt o)
```

可重用,可组合,可测试。

### 11.5.3 这里隐含的原理

`{-# OVERLAPPABLE #-}` 与 `QuantifiedConstraints` 让 transformer 自己实现这些 type class 实例:

```haskell
instance Monad m => MonadReader r (ReaderT r m) where
  ask = ReaderT return
  ...
```

## 11.6 Free Monad

### 11.6.1 思路

能否把"做出 effect" 与"执行 effect"分开?

```haskell
data Console a
  = PutStrLn String a
  | GetLine (String -> a)

-- 描述程序
type ConsoleM = Free Console
```

`Free f a` 是一个"在 $f$ 之上的最小 monad":

```haskell
data Free f a
  = Pure a
  | Free (f (Free f a))
```

### 11.6.2 用法

```haskell
program :: ConsoleM ()
program = do
  Free (PutStrLn "What is your name?" (Pure ()))
  name <- Free (GetLine Pure)
  Free (PutStrLn ("Hello, " ++ name) (Pure ()))
```

### 11.6.3 解释器

```haskell
runConsole :: ConsoleM a -> IO a
runConsole (Pure a)   = return a
runConsole (Free c) = case c of
  PutStrLn s k -> putStrLn s >> runConsole k
  GetLine    k -> getLine >>= runConsole . k
```

### 11.6.4 优势

- 可测试: 提供一个 fake interpreter
- 可多后端: 写一次,可在 IO/State 上跑
- **可重组**: 把多个 DSL 叠起来

## 11.7 思考题

1. 写出 `StateT s Maybe a` 的 `instance Monad`。
2. 写出 `MonadState` 的 `mtl` 风格代码。
3. 用 `Free` 设计一个 `Logger` DSL,支持 `Info`, `Warn`, `Error`。
4. 解释: 为什么 `Monad` 转 `MonadTrans` 时 `lift` 是**而不是** `pure`?
5. 举出三个 MTL 风格的好处,并验证 "代码与具体 transformer 无关"。

## 11.8 小结

- Monad Transformer = 让 monad 叠加。
- 类型顺序 = 嵌套;`lift` 跨层。
- MTL 风格 = type class 接口,与具体 transformer 解耦。
- Free Monad = 最抽象的"DSL → monad" 工具。

下一章是 Foldable / Traversable——列表抽象的更高阶。
