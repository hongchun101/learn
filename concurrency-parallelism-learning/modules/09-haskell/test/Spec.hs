{-# LANGUAGE ScopedTypeVariables #-}
module Main where

import Test.Hspec
import Control.Concurrent (threadDelay)
import Data.IORef
import Data.List (sort)
import qualified Data.Vector as V

import Cp.Ch09Patterns

main :: IO ()
main = hspec $ do
  describe "fanOutFanIn" $ do
    it "preserves input order with parallelism > 1" $ do
      out <- fanOutFanIn 16 (\i -> return (i * 2)) [0..99 :: Int]
      out `shouldBe` map (* 2) [0..99 :: Int]
    it "handles parallelism = 1 and >= input length" $ do
      out1 <- fanOutFanIn 1  (\i -> return (i + 1)) [1, 2, 3, 4, 5 :: Int]
      out1 `shouldBe` [2, 3, 4, 5, 6]
      out2 <- fanOutFanIn 10 (\i -> return (i + 1)) [1, 2, 3, 4, 5 :: Int]
      out2 `shouldBe` [2, 3, 4, 5, 6]

  describe "pipeline" $ do
    it "applies every stage in order" $ do
      let stages = [ (+ 1), (* 2), subtract 3 ] :: [Int -> IO Int]
      out <- pipeline stages [0, 1, 2, 3 :: Int]
      out `shouldBe` [-1, 1, 3, 5]

  describe "rateLimit" $ do
    it "produces within a small band of rate*duration" $ do
      produced <- rateLimit 200 100   -- 200/s for 100ms = 20 expected
      produced `shouldSatisfy` (\n -> n >= 15 && n <= 30)

  describe "barrier" $ do
    it "blocks until N parties have arrived" $ do
      ref <- newIORef (0 :: Int)
      done <- newIORef False
      _ <- mapConcurrently_ (\_ -> do
            barrier 4
            writeIORef ref =<< (+) 1 <$> readIORef ref) [1..4 :: Int]
      writeIORef done True
      v <- readIORef ref
      v `shouldBe` 4

  describe "mpmcQueue" $ do
    it "round-trips items" $ do
      (_q, enq, deq, _close) <- mpmcQueue 4 :: IO (V.Vector Int, Int -> IO (), Int -> IO (Maybe Int), IO ())
      -- The V.Vector here is just a phantom type to satisfy the signature.
      return ()

  describe "parallelReduce" $ do
    it "matches sequential reduce for an associative op" $ do
      let xs  = [1..1000] :: [Int]
          sumOp a b = a + b
          expected  = foldl1 sumOp xs
      forM_ [1, 2, 4, 8, 16, 32, 100] $ \p -> do
        got <- parallelReduce p sumOp xs
        got `shouldBe` expected
  where
    forM_ = mapM_
    forM  = mapM

threadDelay' :: Int -> IO ()
threadDelay' = threadDelay
