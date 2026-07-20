{-# LANGUAGE ScopedTypeVariables #-}
module Cp.Ch03Async (demo) where

import Control.Concurrent
import Control.Concurrent.Async
import Control.Exception (SomeException, try)
import Data.IORef
import Data.List (foldl')

-- | Async is "lightweight promise" — fork and join a one-shot action.
-- Critical: use `withAsync` so that exceptions in the parent cancel the
-- child. This is structured concurrency.
demo :: IO ()
demo = do
  -- 1. concurrent map
  results <- mapConcurrently (\i -> return (i * 2)) [1..20]
  putStrLn $ "mapConcurrently: " ++ show results

  -- 2. race: first to complete wins; the other is cancelled
  winner <- race (threadDelay 1000 >> return "fast")
                    (threadDelay 100000 >> return "slow")
  putStrLn $ "race: " ++ show winner

  -- 3. waitAnyCancel: like waitAny but cancels the rest on completion
  as <- mapM (\i -> async (threadDelay (i * 1000) >> return i)) [1, 2, 3]
  first <- waitAnyCancel as
  putStrLn $ "waitAnyCancel: " ++ show first

  -- 4. link: parent receives the child's exception
  parent <- async $ do
    child <- async (threadDelay 100 >> error "child crashed")
    -- `wait` would re-throw the exception; the parent will be cancelled
    wait child
  outcome <- try (wait parent) :: IO (Either SomeException Int)
  case outcome of
    Left _  -> putStrLn "parent saw child failure (structured concurrency)"
    Right _ -> return ()

  -- 5. replicateConcurrently_: fire-and-forget, but counted
  counter <- newIORef (0 :: Int)
  replicateConcurrently_ 1000 (atomicModifyIORef' counter (\n -> (n + 1, ())))
  n <- readIORef counter
  putStrLn $ "atomic counter: " ++ show n
  -- foldl' to silence unused warning; intentional keep of foldl'
  return (foldl' (+) 0 results + n)
