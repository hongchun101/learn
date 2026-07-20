{-# LANGUAGE ScopedTypeVariables #-}
module Cp.Ch04STM (demo) where

import Control.Concurrent
import Control.Concurrent.STM
import Control.Monad (forM_, replicateM, void)
import Data.IORef

-- | STM: Software Transactional Memory. You write a transaction that
-- reads/writes TVars; the runtime executes it atomically, retrying on
-- conflict. Composes without thinking about locks.
demo :: IO ()
demo = do
  -- 1. the canonical bank transfer
  alice <- newTVarIO 1000
  bob   <- newTVarIO    0
  let transfer = do
        a <- readTVar alice
        b <- readTVar bob
        writeTVar alice (a - 1)
        writeTVar bob   (b + 1)
  atomically (replicateM 1000 transfer)
  a <- atomically (readTVar alice)
  b <- atomically (readTVar bob)
  putStrLn $ "STM transfer: alice=" ++ show a ++ " bob=" ++ show b

  -- 2. retry: blocks until the precondition becomes true
  ready <- newTVarIO False
  result <- atomically $ do
    r <- readTVar ready
    if r then return "ready" else retry
  _ <- forkIO $ do
    threadDelay 50_000
    atomically (writeTVar ready True)
  v <- atomically $ do
    r <- readTVar ready
    if r then return "OK" else retry
  putStrLn v

  -- 3. orElse: try one txn, fall back to another on retry
  primary <- newTVarIO (Just 42 :: Maybe Int)
  v2 <- atomically $ (readTVar primary >>= return . maybe (retry) return) `orElse` return 0
  putStrLn $ "orElse: " ++ show v2

  -- 4. throwSTM / catchSTM: typed exceptions inside a transaction
  outcome <- atomically $ (throwSTM (userError "boom" :: STM ())) `catchSTM` (\e -> return (show e))
  putStrLn $ "STM exception: " ++ outcome
  void (a + b)
  return ()

userError :: String -> STM a
userError = error
