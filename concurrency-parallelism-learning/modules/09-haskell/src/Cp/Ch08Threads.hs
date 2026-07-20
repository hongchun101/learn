module Cp.Ch08Threads (demo) where

import Control.Concurrent
import Control.Exception (SomeException, throwTo, try)
import Data.IORef
import Data.List (foldl')

-- | Threads in GHC are *very* cheap (~1KB each); the runtime
-- multiplexes them onto a small pool of OS threads. You can have
-- millions.
demo :: IO ()
demo = do
  -- 1. forkIO is fire-and-forget; myThreadId identifies the thread
  tid <- forkIO $ do
    myTid <- myThreadId
    putStrLn $ "I am " ++ show myTid
    threadDelay 10_000
  threadDelay 50_000
  putStrLn "parent continues"

  -- 2. killThread: forcibly stop another thread
  victim <- forkIO $ do
    let loop = threadDelay 1000 >> loop
    loop
  threadDelay 5_000
  killThread victim
  putStrLn "victim killed"

  -- 3. throwTo: send an exception to a specific thread
  target <- forkIO $ threadDelay 1_000_000
  threadDelay 5_000
  outcome <- try (throwTo target (userError "send")) :: IO (Either SomeException ())
  case outcome of
    Left _  -> putStrLn "throwTo target already dead"
    Right _ -> putStrLn "throwTo delivered"
  threadDelay 10_000

  -- 4. yield: voluntarily give up the CPU
  _ <- forkIO $ mapM_ (\_ -> yield >> threadDelay 1000) [1..3 :: Int]
  threadDelay 10_000

  -- 5. threadStatus: peek at a thread's state
  t <- forkIO $ threadDelay 100_000
  threadDelay 1_000
  s <- threadStatus t
  putStrLn $ "thread status: " ++ show s
  killThread t
  putStrLn $ "done"
  return (foldl' (+) 0 [1..10] :: Int)
  where
    userError :: String -> SomeException
    userError = toException . ErrorCall
    ErrorCall = errorCall
    errorCall s = error s
    toException = id
