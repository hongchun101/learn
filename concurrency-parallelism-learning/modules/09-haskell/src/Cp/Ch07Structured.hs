module Cp.Ch07Structured (demo) where

import Control.Concurrent
import Control.Concurrent.Async
import Control.Exception (bracket, finally, onException, throwIO, try, SomeException)
import Data.IORef

-- | Structured concurrency: lifetime of children ⊆ lifetime of parent.
-- Acquire/release: bracket. Async scope: withAsync. Mask: the fundamental
-- "exception mask" model.
demo :: IO ()
demo = do
  -- 1. bracket: acquire, run, release — even on exception
  let acquire   = return "file handle"
      release _ = putStrLn "releasing"
      work _    = error "work failed"
  outcome <- try (bracket acquire release work) :: IO (Either SomeException String)
  case outcome of
    Left _  -> putStrLn "bracket caught the failure and still released"
    Right _ -> return ()

  -- 2. withAsync: the canonical structured-concurrency primitive
  outcome2 <- try (withAsync (threadDelay 1000 >> error "boom") $ \a ->
                     wait a) :: IO (Either SomeException ())
  case outcome2 of
    Left _  -> putStrLn "withAsync: child died, scope cleaned up"
    Right _ -> return ()

  -- 3. mask: a critical section that cannot be interrupted
  ref <- newIORef False
  let setInBlock = atomicModifyIORef ref (\b -> (True, b))
  _ <- mask_ $ do
    setInBlock
    -- between mask_ and unmask_, async exceptions are deferred
    threadDelay 50_000
  wasSet <- readIORef ref
  putStrLn $ "masked: " ++ show wasSet

  -- 4. onException: a one-off cleanup
  outcome3 <- try (return () `onException` putStrLn "cleanup") :: IO (Either SomeException ())
  case outcome3 of
    Left _  -> return ()
    Right _ -> putStrLn "onException: ran (no exception, no cleanup)"

  return ()
  where
    throwIO' :: SomeException -> IO a
    throwIO' = throwIO
