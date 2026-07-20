{-# LANGUAGE ScopedTypeVariables #-}
module Cp.Ch02Chan (demo) where

import Control.Concurrent
import Control.Concurrent.Chan
import Control.Concurrent.STM.TBQueue (TBQueue, newTBQueue, readTBQueue, writeTBQueue, atomically)

-- | Chan is unbounded FIFO. TBQueue (from STM) is bounded.
demo :: IO ()
demo = do
  -- 1. producer / consumer with Chan
  ch <- newChan
  _ <- forkIO $ mapM_ (writeChan ch) [1..10]
  xs <- mapM (\_ -> readChan ch) [1..10]
  putStrLn $ "from chan: " ++ show xs

  -- 2. bounded with TBQueue — the principled backpressure primitive
  q :: TBQueue Int <- newTBQueue 4
  _ <- forkIO $ mapM_ (atomically . writeTBQueue q) [1..100]
  ys <- mapM (\_ -> atomically (readTBQueue q)) [1..100]
  putStrLn $ "from tbqueue: " ++ show (take 10 ys)

  -- 3. dupChan / dupTQueue for fan-in: multiple readers see the same stream
  c1 <- newChan
  c2 <- dupChan c1
  _ <- forkIO $ writeChan c1 'A' >> writeChan c1 'B' >> writeChan c1 'C'
  x <- readChan c2
  putStrLn $ "dup read: " ++ show [x]
  return ()
