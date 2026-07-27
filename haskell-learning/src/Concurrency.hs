-- |
-- = 第十章 — forkIO、MVar、STM 与 async =
--
-- 三层并发机制：
--
-- 1. 线程：`forkIO :: IO () -> IO ThreadId` 可创建一个
--    轻量级 Haskell 线程。它们不是操作系统线程；GHC 的
--    运行时将许多 Haskell 线程多路复用到少量操作系统线程上。
--
-- 2. 共享可变容器：
--    * `MVar a` — 具有单写者单读者语义的可变单元；
--      很适合作为邮箱/队列。
--    * `IORef a` — 普通可变单元。跨线程使用并不安全，除非
--      搭配原子操作。
--    * `STM` 和 `TVar a` — 可组合的原子事务。当你需要维护
--      多个变量之间的不变量时使用它。
--
-- 3. 通过 `Control.Concurrent.Async` 实现结构化并发：
--    `async`/`wait`、`race`、`withAsync`。
module Concurrency where

import           Control.Concurrent          (forkIO, threadDelay, ThreadId)
import           Control.Concurrent.MVar     (MVar, newEmptyMVar, putMVar, takeMVar, newMVar)
import qualified Control.Concurrent.MVar     as MVar
import           Control.Concurrent.STM      (atomically)
import           Control.Concurrent.STM.TVar (TVar, newTVar, readTVar, writeTVar, modifyTVar)
import           Control.Concurrent.Async    (race, wait, withAsync)
import           Control.Monad               (forM_, replicateM_)
import           Data.IORef                  (IORef, newIORef, readIORef, writeIORef)

-- * 一个简单的工作线程：通过 MVar 写入其 ID 和一个哨兵值。

-- | 创建一个休眠 N 微秒的工作线程，然后将 `n` 放入
-- MVar。
worker :: MVar Int -> Int -> IO ThreadId
worker mv n = forkIO $ do
  threadDelay (n * 1000)
  putMVar mv n

-- * 基于 STM 的计数器。

counterSTM :: IO (TVar Int)
counterSTM = atomically (newTVar 0)

incSTM :: TVar Int -> IO ()
incSTM t = atomically (modifyTVar t (+ 1))

readSTM :: TVar Int -> IO Int
readSTM t = atomically (readTVar t)

-- * 在单线程中使用 IORef；其本身并非线程安全。

pollIORef :: IORef Int -> IO ()
pollIORef r = do
  v <- readIORef r
  writeIORef r (v + 1)

-- * Async 辅助函数。

-- | 对两个 IO 动作执行 race；先完成者获胜。
firstOf :: IO a -> IO a -> IO (Either a a)
firstOf a b = race a b

-- | `withAsync` 运行两者并等待，即使其中一个出错。
slotMachine :: Int -> IO (Int, Int)
slotMachine n =
  withAsync (pure (n * 2)) $ \a ->
    withAsync (pure (n * 3)) $ \b -> do
      a' <- wait a
      b' <- wait b
      pure (a', b')

-- * 导出的演示。

concurrency :: IO ()
concurrency = do
  putStrLn "-- concurrency"

  -- MVar 往返传递
  mv <- MVar.newEmptyMVar
  forM_ [10, 5, 1, 20] (worker mv)
  results <- mapM (\_ -> takeMVar mv) [1::Int .. 4]
  putStrLn $ "MVar workers finished in order: " <> show results

  -- STM 计数器
  t <- counterSTM
  replicateM_ 100 (incSTM t)
  n <- readSTM t
  putStrLn $ "STM counter increments: " <> show n

  -- 从单线程轮询 IORef
  r <- newIORef 0
  replicateM_ 5 (pollIORef r)
  rv <- readIORef r
  putStrLn $ "IORef after 5 single-thread increments: " <> show rv

  -- withAsync 双结果
  (a', b') <- slotMachine 7
  putStrLn $ "slotMachine (withAsync) two results: " <> show (a', b')

  -- race
  e <- firstOf (threadDelay 50000 >> pure ("slow" :: String))
               (pure "fast")
  putStrLn $ "race result: " <> show e
