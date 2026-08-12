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

### 11.3.5 转型器必须满足的律

任何 `MonadTrans t` 满足两条律:

1. **`lift . return = return`**: `lift` 不能改变 `return` 行为
2. **`lift (m >>= k) = lift m >>= (lift . k)`**: `lift` 与 `>>=` 兼容

对 `Monad m => Monad (t m)` 实例, 需满足 Monad 律 + transformer 律。

```haskell
-- 验证 StateT 的 transformer 律
prop_stateT_lift :: IO Int -> Bool
prop_stateT_lift m = runStateT (lift m) s == (m >>= \a -> return (a, s))
  where s = 0
```

违反律的常见错误: `lift` 内部偷偷塞了状态变化。

## 11.4 组合栈

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

能否把"做出 effect" 与"执行 effect"分开?Free Monad 正是这种工具。

```haskell
-- 1. 底函子: 一层 effect 的形状
data ConsoleF next
  = PutStrLn String next
  | GetLine (String -> next)
  deriving Functor

-- 2. 自由 monad: 把底函子"提升"为 monad
type ConsoleM = Free ConsoleF
```

`Free f a` 是一个"在 $f$ 之上的最小 monad":

```haskell
data Free f a
  = Pure a
  | Free (f (Free f a))
```

关键观察: 我们的 `ConsoleF` 是 `next`-参数化,而不是 `a`-参数化。这让 `Free ConsoleF a` 中的递归层正确接续。GHC 提供 `liftF` 把 `f a` 提升到 `Free f a`:

```haskell
-- liftF 来自 Data.Free
liftF :: Functor f => f a -> Free f a
liftF fa = Free (fmap Pure fa)
```

### 11.6.2 用法

```haskell
import Data.Free (Free, liftF, MonadFree)

program :: Free ConsoleF ()
program = do
  liftF (PutStrLn "What is your name?" ())
  name <- liftF (GetLine id)
  liftF (PutStrLn ("Hello, " ++ name) ())
```

或者使用更底层的形式(显式 `Pure` / `Free`):

```haskell
program' :: ConsoleM ()
program' =
  Free (PutStrLn "What is your name?" (Pure ()))
  `bind` \() ->
  Free (GetLine (\name ->
    Free (PutStrLn ("Hello, " ++ name) (Pure ()))))
```

### 11.6.3 解释器

```haskell
runConsole :: ConsoleM a -> IO a
runConsole (Pure a) = return a
runConsole (Free c) = case c of
  PutStrLn s k -> putStrLn s >> runConsole k
  GetLine    k -> getLine >>= runConsole . k
```

这是"折叠"底函子层: `Pure` 给结果,`Free` 跑一层 effect 再递归。

### 11.6.4 多后端

```haskell
-- 假后端: 收集所有输出
runPure :: ConsoleM a -> ([String], a)
runPure (Pure a) = ([], a)
runPure (Free c) = case c of
  PutStrLn s k -> let (logs, a) = runPure k in (s : logs, a)
  GetLine    k -> let fakeName = "Alice"
                      (logs, a) = runPure (k fakeName)
                  in ("<input:" ++ fakeName ++ ">" : logs, a)
```

### 11.6.5 优势

- **可测试**: 提供 fake interpreter,无需真 IO。
- **可多后端**: 同一份 DSL 在 IO / 测试 / 日志收集器上都能跑。
## 11.7 实战: 并发原语 + Effect 系统对比

### 11.7.1 并发原语

Haskell 的并发模型在 STM (Software Transactional Memory) 与 async 上做了 FP 化的封装:

```haskell
import Control.Concurrent.STM
import Control.Concurrent.Async

-- 1. TVar: STM 变量
counter :: TVar Int
counter <- newTVarIO 0

-- 2. 事务: 原子读-改-写
atomically $ do
  modifyTVar' counter (+ 1)
  v <- readTVar counter
  when (v > 100) retry  -- 等待条件

-- 3. async: 轻量线程
res <- mapConcurrently (download . url) urls
-- res :: [Response] 并行下载

-- 4. MVar: 同步通道
putMVar mv "hello"
takeMVar mv  -- 阻塞直到可读
```

**核心思想**: 不共享可变状态,只通过 STM 事务"协商"——这正是 FP 不可变性 + 事务原子性的完美结合。

### 11.7.2 Effect 系统对比

真实 Haskell 项目有多种 effect 抽象:

| 系统 | 风格 | 优点 | 缺点 |
|------|------|------|------|
| **mtl** | type class | 简洁, 编译时类型 | instance 膨胀 |
| **RIO** | Record-of-functions | 显式, 易追踪, 工业级 | 需 discipline |
| **polysemy** | Free 变体 | 自由组合 | 性能开销 |
| **effectful** | type class + 优化 | 现代, 高性能 | 学习曲线 |

```haskell
-- mtl 风格
processOrder :: (MonadReader Cfg m, MonadState Db m, MonadError String m) => Order -> m Receipt

-- RIO 风格
processOrder :: (Has Cfg env, Has Db env) => Order -> RIO env Receipt
```

**生产建议**: 中小项目用 `mtl`,大型项目用 `RIO`(Twitter/Standard Chartered 风格)。

### 11.7.3 实战: STM 实现的并发 Map

```haskell
import qualified Data.Map.Strict as Map

newtype ConcurrentMap k v = ConcurrentMap (TVar (Map.Map k v))

insert :: (Ord k) => k -> v -> ConcurrentMap k v -> STM ()
insert k v (ConcurrentMap tvar) = modifyTVar' tvar (Map.insert k v)

lookup :: (Ord k) => k -> ConcurrentMap k v -> STM (Maybe v)
lookup k (ConcurrentMap tvar) = Map.lookup k <$> readTVar tvar
```

这是 `Control.Concurrent.Map` 的简化版: 跨线程无锁,自动处理一致性。

## 11.8 思考题

1. 写出 `StateT s Maybe a` 的 `instance Monad`。
2. 写出 `MonadState` 的 `mtl` 风格代码。
3. 用 `Free` 设计一个 `Logger` DSL,支持 `Info`, `Warn`, `Error`(可运行代码见 `code/Ch11/FreeMonad.hs`)。
4. 解释: 为什么 `lift :: m a -> t m a` 不同于 `pure :: a -> t m a`?
5. 举出三个 MTL 风格的好处,并验证 "代码与具体 transformer 无关"。
6. 用 STM 实现一个"账户转账"事务(读两账户, 验证余额, 写两账户)。
7. 对比 `mtl` 与 `RIO` 在"添加新 effect"时的改动量。

## 11.9 小结

- Monad Transformer = 让 monad 叠加。
- 类型顺序 = 嵌套;`lift` 跨层。
- MTL 风格 = type class 接口,与具体 transformer 解耦。
- Free Monad = 最抽象的"DSL → monad" 工具。
- **并发**: STM + async = 工业级 Haskell 并发。
- **Effect 系统**: mtl / RIO / polysemy 各有所长,选型要看项目规模。

下一章是 Foldable / Traversable——列表抽象的更高阶。

