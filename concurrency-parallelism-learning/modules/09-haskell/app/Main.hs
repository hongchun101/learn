module Main where

import Control.Concurrent (threadDelay)
import Cp.Ch09Patterns

main :: IO ()
main = do
  putStrLn "fanOutFanIn:"
  out <- fanOutFanIn 16 (\i -> return (i * 2)) [0..9 :: Int]
  print out
  putStrLn "pipeline:"
  out2 <- pipeline [(+ 1), (* 2), subtract 3] [0..3 :: Int]
  print out2
  putStrLn "rateLimit 200/s for 100ms:"
  n <- rateLimit 200 100
  print n
  putStrLn "barrier 4:"
  barrier 4
  print "barrier released"
  threadDelay 1000
