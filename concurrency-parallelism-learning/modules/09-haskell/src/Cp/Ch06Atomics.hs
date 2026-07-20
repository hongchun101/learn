{-# LANGUAGE BangPatterns #-}
module Cp.Ch06Atomics (demo) where

import Control.Concurrent
import Data.Atomics
import Data.IORef
import Data.Vector.Unboxed (Vector)
import qualified Data.Vector.Unboxed as V
import Data.Word (Word64)

-- | Low-level atomic primitives. Most code should prefer STM; these
-- are the building blocks of lock-free structures and interop with C.
demo :: IO ()
demo = do
  -- 1. atomicModifyIORef' — CAS loop on an IORef
  counter <- newIORef (0 :: Int)
  let bump = atomicModifyIORef' counter (\n -> let n' = n + 1 in (n', ()))
  replicateConcurrently_ 1000 bump
  n <- readIORef counter
  putStrLn $ "atomic IORef: " ++ show n

  -- 2. fetchAddIntAddr: raw CAS on a mutable ByteArray
  ba <- newByteArray 8
  writeIntArray ba 0 0
  _ <- forM_ [1..1000 :: Int] $ \_ ->
    atomicModifyByteArray ba 0 (\x -> (x + 1, ()))
  v <- readIntArray ba 0
  putStrLn $ "raw CAS counter: " ++ show v

  -- 3. memory fence
  writeBarrier  -- full memory barrier
  putStrLn "fence done"

  return ()
  where
    forM_ = mapM_
    forM  = mapM
