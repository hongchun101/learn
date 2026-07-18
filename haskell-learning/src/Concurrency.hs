-- |
-- = Chapter 10 — forkIO, MVar, STM, async
--
-- Three layers of concurrency:
--
-- 1. Threads: `forkIO :: IO () -> IO ThreadId` lets you fork a
--    lightweight Haskell thread. They are not OS threads; GHC's
--    runtime multiplexes many Haskell threads onto a few OS threads.
--
-- 2. Shared mutable boxes:
--    * `MVar a` — a mutable cell with one-writer-one-reader
--      semantics; great as a mailbox/queue.
--    * `IORef a` — plain mutable cell. Unsafe across threads unless
--      paired with atomic operations.
--    * `STM` and `TVar a` — composable atomic transactions. Use
--      this when you need invariants across multiple vars.
--
-- 3. Structured concurrency via `Control.Concurrent.Async`:
--    `async`/`wait`, `race`, `withAsync`.
module Concurrency where

import           Control.Concurrent          (forkIO, threadDelay, ThreadId)
import           Control.Concurrent.MVar     (MVar, newEmptyMVar, putMVar, takeMVar, newMVar)
import qualified Control.Concurrent.MVar     as MVar
import           Control.Concurrent.STM      (atomically)
import           Control.Concurrent.STM.TVar (TVar, newTVar, readTVar, writeTVar, modifyTVar)
import           Control.Concurrent.Async    (race, wait, withAsync)
import           Control.Monad               (forM_, replicateM_)
import           Data.IORef                  (IORef, newIORef, readIORef, writeIORef)

-- * A trivial worker: write its ID and a sentinel value via an MVar.

-- | Spawn a worker that sleeps N microseconds, then puts `n` on
-- the MVar.
worker :: MVar Int -> Int -> IO ThreadId
worker mv n = forkIO $ do
  threadDelay (n * 1000)
  putMVar mv n

-- * An STM-based counter.

counterSTM :: IO (TVar Int)
counterSTM = atomically (newTVar 0)

incSTM :: TVar Int -> IO ()
incSTM t = atomically (modifyTVar t (+ 1))

readSTM :: TVar Int -> IO Int
readSTM t = atomically (readTVar t)

-- * IORef used from a single thread; not thread-safe by itself.

pollIORef :: IORef Int -> IO ()
pollIORef r = do
  v <- readIORef r
  writeIORef r (v + 1)

-- * Async helpers.

-- | Race two IOs; the first wins.
firstOf :: IO a -> IO a -> IO (Either a a)
firstOf a b = race a b

-- | `withAsync` runs both and waits, even if one errors.
slotMachine :: Int -> IO (Int, Int)
slotMachine n =
  withAsync (pure (n * 2)) $ \a ->
    withAsync (pure (n * 3)) $ \b -> do
      a' <- wait a
      b' <- wait b
      pure (a', b')

-- * The exported demo.

concurrency :: IO ()
concurrency = do
  putStrLn "-- concurrency"

  -- MVar roundtrip
  mv <- MVar.newEmptyMVar
  forM_ [10, 5, 1, 20] (worker mv)
  results <- mapM (\_ -> takeMVar mv) [1::Int .. 4]
  putStrLn $ "MVar workers finished in order: " <> show results

  -- STM counter
  t <- counterSTM
  replicateM_ 100 (incSTM t)
  n <- readSTM t
  putStrLn $ "STM counter increments: " <> show n

  -- IORef polling from a single thread
  r <- newIORef 0
  replicateM_ 5 (pollIORef r)
  rv <- readIORef r
  putStrLn $ "IORef after 5 single-thread increments: " <> show rv

  -- withAsync double
  (a', b') <- slotMachine 7
  putStrLn $ "slotMachine (withAsync) two results: " <> show (a', b')

  -- race
  e <- firstOf (threadDelay 50000 >> pure ("slow" :: String))
               (pure "fast")
  putStrLn $ "race result: " <> show e
