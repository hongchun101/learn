-- Ch19/TaglessFinal.hs
-- Tagless Final 编码: 编译时类型驱动的 DSL

-- 1. 能力类型类
class Monad m => MonadStore s m where
  get :: m s
  put :: s -> m ()

-- 2. 业务代码: 与具体 monad 解耦
increment :: MonadStore Int m => m ()
increment = do
  n <- get
  put (n + 1)

double :: MonadStore Int m => m ()
double = do
  n <- get
  put (n * 2)

-- 3. StateT 实现
newtype StateT s m a = StateT { runStateT :: s -> m (a, s) }

instance Monad m => Functor (StateT s m) where
  fmap f (StateT g) = StateT $ \s -> fmap (\(a, s') -> (f a, s')) (g s)

instance Monad m => Applicative (StateT s m) where
  pure a = StateT $ \s -> return (a, s)
  StateT mf <*> StateT mx = StateT $ \s -> do
    (f, s')  <- mf s
    (x, s'') <- mx s'
    return (f x, s'')

instance Monad m => Monad (StateT s m) where
  StateT mx >>= f = StateT $ \s -> do
    (a, s') <- mx s
    runStateT (f a) s'

instance Monad m => MonadStore s (StateT s m) where
  get   = StateT $ \s -> return (s, s)
  put s' = StateT $ \_ -> return ((), s')

-- 4. 真实运行
runStore :: StateT Int IO a -> Int -> IO (a, Int)
runStore m s = runStateT m s

-- 5. 演示
main :: IO ()
main = do
  let prog :: StateT Int IO ()
      prog = do
        increment
        double
        increment
  ((), finalState) <- runStore prog 0
  putStrLn ("Final state: " ++ show finalState)
  -- 0 -> increment -> 1 -> double -> 2 -> increment -> 3
