{-# LANGUAGE BangPatterns #-}
module Cp.Ch05Parallel (demo) where

import Control.Concurrent
import Control.DeepSeq
import Control.Parallel
import Control.Parallel.Strategies
import Data.List (foldl')
import Data.Vector (Vector)
import qualified Data.Vector as V
import System.Random

-- | par/pseq Strategies: a *hint* to the runtime to evaluate this
-- expression in parallel. The semantics are unchanged — `par x y` is
-- just `x `seq` y` if `x` is in WHNF, but the runtime can spawn
-- another thread to do the work.
demo :: IO ()
demo = do
  -- 1. the canonical "par-map" pattern
  let xs  = [1..1000] :: [Int]
      f i = sum [1..i]    -- intentionally expensive
      slow = map f xs
      fast = parMap rpar f xs
  evaluate (length fast)  -- force the spine
  putStrLn $ "len = " ++ show (length fast)

  -- 2. sparks: a counted experiment
  let n = 100000
  let xs2 = [1..n] :: [Int]
  evaluate $ runEval $ do
    mapM_ (\x -> rpar (x + 1)) xs2
    return ()
  putStrLn "sparks evaluated"

  -- 3. withStrategy: a *traversal strategy* over a data structure
  let m = ([1..1000] :: [Int], [1..1000] :: [Int], [1..1000] :: [Int])
  let m' = m `using` parTuple3 rpar rpar rpar
  evaluate (foldl' (+) 0 (map (\(a, b, c) -> a + b + c) [m']))
  putStrLn "tuple strategy"

  -- 4. Vector with -threaded -N — true data parallelism
  n <- randomRIO (100000, 1000000)
  let v  = V.enumFromTo 1 (n :: Int)
      v' = V.map (`div` 2) v
  evaluate (V.sum v')
  putStrLn "vector parallel"
  return ()
