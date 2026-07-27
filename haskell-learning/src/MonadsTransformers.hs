-- |
-- = 第七章 — Monad、do 记法与转换器 =
--
-- * `Monad` 增加了依赖于*前一步结果*的顺序执行。绑定 `>>=`（以及会解语法糖为它的 `do` 记法）让依赖动作可以像 `;` 一样串联起来。
--
-- * `base` 中的常见 monad：
--     - `Maybe`、`Either e`、`[]`
--     - `IO`（在 `base` 中）
--     - `Reader r`、`State s`，来自
--       `Control.Monad.{State, Reader}`（转换器风格）
--
-- * `Monad` 遇到 `Nothing`/`Left` 会短路；若要收集*所有*错误，优先使用 Applicative（见第 06 章）。
module MonadsTransformers where

import           Control.Monad.State    (State, evalState, execState, modify, get, runState)
import           Control.Monad.Reader   (Reader, runReader, ask)
import           Control.Monad.Maybe    (MaybeT (..))

-- * `Maybe` 作为 monad：`Nothing` 会让依赖链短路。

-- | 安全地串联除法。
safeDivide :: Maybe Double -> Double -> Maybe Double
safeDivide (Just x) y
  | y == 0     = Nothing
  | otherwise  = Just (x / y)

-- | monadic 列表推导式：每个 `x <- ...` 都引入一次依赖迭代。
pairs :: [(Int, Int)]
pairs = do
  x <- [1,2,3]
  y <- [10,20]
  pure (x, y)

-- * `State` monad：纯且确定性的有状态计算。

-- | 计数器副作用。
counter :: State Int Int
counter = do
  modify (+ 1)
  s <- get
  modify (+ 10)
  pure s

-- | 管道：读取当前状态，压入更新后的状态。
push :: a -> State [a] ()
push x = modify (++ [x])

-- | 返回值与最终状态的有状态管道。
pipeline :: [Int] -> (Int, [Int])
pipeline s0 = (flip runState) s0 (do
    push 1
    push 2
    modify (+ 1)
    s <- get
    pure s)


-- * `Reader` 风格：配置只是一次不可变读取。

data Env = Env { envUser :: String, envPerms :: [String] }

greetEnv :: Reader Env String
greetEnv = do
  user <- ask
  pure ("hi, " <> user)

-- * 转换器。

-- | `MaybeT m a` 是外层 `m` *内部*的 `Maybe a`。外层
--   monad 可以是 `IO`、`State`、`Reader` 等。
lookupOrFail :: Int -> [(Int, String)] -> MaybeT IO String
lookupOrFail k alist = MaybeT (pure (lookup k alist))

-- | 将 `IO` 动作提升到 `MaybeT IO` 中。对于 monad 转换器，
--   标准辅助函数是 `lift`/`liftIO`。
liftIO :: IO a -> MaybeT IO a
liftIO = MaybeT . fmap Just

-- * 演示。

monadsTransformers :: IO ()
monadsTransformers = do
  putStrLn "-- monad & transformers"
  putStrLn $ "safeDivide (Just 10) 2   = " <> show (safeDivide (Just 10) 2)
  putStrLn $ "safeDivide (Just 10) 0   = " <> show (safeDivide (Just 10) 0)
  putStrLn $ "pairs (head 4)           = " <> show (take 4 pairs)
  putStrLn $ "evalState counter 0      = " <> show (evalState counter 0)
  putStrLn $ "execState counter 0      = " <> show (execState counter 0)
  putStrLn $ "pipeline []              = " <> show (pipeline ([] :: [Int]))
  putStrLn $ "runReader greetEnv (Env \\\"hs\\\") = "
          <> show (runReader greetEnv (Env "hs" ["rw","r"]))
  -- IO + Maybe 转换器
  res <- runMaybeTIO (lookupOrFail 1 [(1,"alpha"), (2,"beta")])
  putStrLn $ "lookupOrFail 1            = " <> show res
  where
    -- 对于演示，我们将 MaybeT IO 作为 IO 运行。
    runMaybeTIO :: MaybeT IO a -> IO (Maybe a)
    runMaybeTIO (MaybeT m) = m
