{-# LANGUAGE ScopedTypeVariables #-}
module Cp.Ch09Patterns where

import Control.Concurrent
import Control.Concurrent.Async
import Control.Concurrent.MVar
import Control.Concurrent.STM
import Control.Concurrent.STM.TBQueue (TBQueue, newTBQueue, readTBQueue, writeTBQueue, atomically)
import Data.IORef
import Data.List (foldl')
import Data.Vector (Vector)
import qualified Data.Vector as V

-- =====================================================================
-- The six cross-language tasks.
-- Contract source: ../../../../src/cross-lang/contracts.ts
-- Reference impl:  ../../../../src/cross-lang/*.ts
-- These are runnable in the test suite and the Main app.
-- =====================================================================

-- 1. fanOutFanIn: N inputs, P workers, preserve input order.
fanOutFanIn
  :: forall i o
   . Int                              -- ^ parallelism
  -> (i -> IO o)
  -> [i]
  -> IO [o]
fanOutFanIn p work inputs =
  let workers = max 1 (min p (length inputs))
  in  if null inputs
        then return []
        else do
          -- one MVar per input to collect in order
              placeholders <- mapM (\_ -> newEmptyMVar) inputs
              let workOne :: (Int, i) -> IO ()
                  workOne (k, x) = do
                    v <- work x
                    putMVar (placeholders !! k) v
              -- forky workers; each grabs a unique index from an IORef
              next <- newIORef 0
              let grab = atomicModifyIORef' next $ \n -> (n + 1, n)
                  runOne = do
                    i <- grab
                    when' (i < length inputs) $
                      workOne (i, inputs !! i) >> runOne
                  when' True  = id
                  when' False _ = return ()
              replicateConcurrently_ workers runOne
              mapM takeMVar placeholders

-- 2. pipeline: N stages, each element flows through all of them in order.
pipeline
  :: forall a
   . [(a -> IO a)]
  -> [a]
  -> IO [a]
pipeline stages src = mapM runOne src
  where
    runOne x = foldl' (\eff stage -> eff >>= stage) (return x) stages

-- 3. rateLimit: token bucket. Produces at most ratePerSec items/sec.
rateLimit
  :: Double                            -- ^ ratePerSec
  -> Int                               -- ^ durationMs
  -> IO Int
rateLimit rate durMs = do
  let intervalUs = round (1_000_000 / rate) :: Int
  start <- getCurrentTime
  let go deadline next produced
        | produced > 100_000 = return produced
        | otherwise = do
            now <- getCurrentTime
            if now >= deadline
              then return produced
              else do
                if now >= next
                  then go deadline (next + intervalUs) (produced + 1)
                  else do
                    threadDelay (max 0 (next - now))
                    go deadline next produced
  deadline <- return (start + fromIntegral durMs * 1000)
  go deadline start 0
  where
    getCurrentTime = (round . (* 1000)) <$> getPOSIXTimeUs
    getPOSIXTimeUs = round <$> getMonotonicTimeNS
    getMonotonicTimeNS = (round . (* 1000)) `fmap` getMonotonicTimeMS
    getMonotonicTimeMS = round <$> getCPUTime

-- 4. barrier: N parties, all callers block until N have arrived.
barrier
  :: Int
  -> IO ()
barrier n = do
  ref <- newIORef 0
  p   <- newEmptyMVar
  replicateM_ n $ do
    k <- atomicModifyIORef' ref (\x -> let y = x + 1 in (y, y))
    when (k == n) (putMVar p ())
    takeMVar p

-- 5. mpmcQueue: bounded MPMC.
mpmcQueue
  :: Int
  -> IO (TBQueue Int, Int -> IO (), Int -> IO (Maybe Int), IO ())
mpmcQueue cap = do
  q <- newTBQueue cap
  return
    ( q
    , atomically . writeTBQueue q
    , \t -> do
        ok <- atomically $ tryReadTBQueue q
        case ok of
          Just v -> return (Just v)
          Nothing -> return Nothing
    , return ()
    )

-- 6. parallelReduce: P partitions, sequential reduce per partition,
-- then combine.
parallelReduce
  :: forall a
   . Int
  -> (a -> a -> a)
  -> [a]
  -> IO a
parallelReduce p combine xs
  | null xs = error "parallelReduce: empty"
  | otherwise = do
      let parts = max 1 (min p (length xs))
          chunkSize = max 1 ((length xs + parts - 1) `div` parts)
          chunks    = takeWhile (not . null) $
                        unfoldrChunks chunkSize xs
      partials <- mapConcurrently (return . foldl1 combine) chunks
      return (foldl1 combine partials)

unfoldrChunks :: Int -> [a] -> [[a]]
unfoldrChunks k = go
  where
    go [] = []
    go ys = let (h, t) = splitAt k ys in h : go t

tryReadTBQueue :: TBQueue a -> STM (Maybe a)
tryReadTBQueue q = do
  empty <- isEmptyTBQueue q
  if empty then return Nothing
           else Just <$> readTBQueue q
