{-# LANGUAGE ScopedTypeVariables #-}
module Cp.Ch01MVar (demo) where

import Control.Concurrent
import Control.Concurrent.MVar
import Control.Exception (try, SomeException, evaluate)

-- | MVar is the "box" of Haskell concurrency: empty, or full.
-- A single-cell shared mutable cell. Take/Put is atomic.
demo :: IO ()
demo = do
  -- 1. the simplest critical section
  counter <- newMVar (0 :: Int)
  let bump = modifyMVar_ counter (return . (+ 1))
  replicateConcurrently_ 1000 (bump)
  v <- readMVar counter
  putStrLn $ "counter = " ++ show v
  -- 2. blocking: take blocks if empty; put blocks if full (with fullMVar)
  empty <- newEmptyMVar
  _ <- forkIO $ do
    threadDelay 50_000
    putMVar empty "hello from forked thread"
  msg <- takeMVar empty
  putStrLn msg
  -- 3. mask: exception safety
  resource <- newMVar "shared"
  result <- try (mask_ $ do
                   a <- takeMVar resource
                   -- even if the work between take and put throws,
                   -- the put will run because of mask_.
                   error "simulated failure"
                   putMVar resource a) :: IO (Either SomeException ())
  case result of
    Left _  -> putStrLn "exception caught; resource state: "
    Right _ -> return ()
  -- 4. fairness: the runtime avoids starving a thread blocked on MVar
  --    in the common case; the user need not think about ordering.
  return ()
