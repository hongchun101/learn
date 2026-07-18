-- |
-- = Chapter 03 — Higher-order Functions
--
-- Haskell's syntax for *first-class functions* is so light that you
-- use it without thinking. This chapter is about the *grammar*:
--
-- * Lambdas: `\\x -> body`.
-- * Sections: `(+1)`, `(2^)`, `(!!3)`.
-- * Currying and partial application: every function is *partially*
--   applied until its final argument; you can supply some args
--   early and pass the resulting function around.
-- * Composition: `(.)` builds pipelines.
-- * Point-free style: drop explicit inputs when last call is just
--   `(f . g . h)`.
module HigherOrder where

import           Data.Function         ((&))
import qualified Data.List             as L

-- | A simple predicate, lifted to use inside pipelines.
isLong :: String -> Bool
isLong = (> 10) . length

-- | Section style: `(1:) :: a -> [a] -> [a]`. Note the way we lift
--   the cons out of the equation.
prefixOne :: [Int] -> [Int]
prefixOne xs = (1 :) xs

-- | Function composition: `negate . sum . take 5` reads like a
--   pipeline.
top5SumNeg :: [Int] -> Int
top5SumNeg = negate . sum . take 5

-- | `filter . not . p` is a classic combinator: “elements that fail
--   `p`”. We bake it into a one-liner.
notEls :: (a -> Bool) -> [a] -> [a]
notEls p = filter (not . p)

-- | Forward-application operator. Reads as data-first pipelines.
--
-- > xs & length
--
-- same as `length xs` but it composes well visually.
lengthOf :: [a] -> Int
lengthOf xs = xs & length

-- | A function-with-environment. `makeAdder n` is a function waiting
--   for a single argument — this is currying + partial application.
makeAdder :: Int -> (Int -> Int)
makeAdder n m = n + m

add5 :: Int -> Int
add5 = makeAdder 5         -- point-free; reads as “partially applied
                            -- `5` to the makeAdder function.”

-- | A *correct* classical pipeline that performs a fold after
--   filtering. The signature is `[Int] -> Int`; the body is a
--   pipeline of *data operations* chained with `(.)`.
pipeline :: [Int] -> Int
pipeline =
  L.foldl' (+) 0
  . map    (subtract 1)
  . filter even
  . L.sort
  -- NB: composition order is "right-to-left" in terms of data flow.
  --     Read as: "(1)x sorted, (2)x even kept, (3)each decremented,
  --     (4)summed".

-- | A real example of point-free vs. explicit lambda.
without :: (Eq a) => a -> [a] -> [a]
without = filter . (/=)

-- * The exported demo.

higherOrder :: IO ()
higherOrder = do

  putStrLn "-- higher-order"
  putStrLn $ "isLong \"helloworld\"      = " <> show (isLong "helloworld")
  putStrLn $ "prefixOne [2,3]          = " <> show (prefixOne [2, 3])
  putStrLn $ "top5SumNeg [1..20]       = " <> show (top5SumNeg [1..20 :: Int])
  putStrLn $ "add5 7                   = " <> show (add5 7)
  putStrLn $ "notEls even [1,2,3,4]    = "
          <> show (notEls even [1, 2, 3, 4 :: Int])
  putStrLn $ "without 3 [1,2,3,4]      = "
          <> show (without 3 [1, 2, 3, 4 :: Int])
  putStrLn $ "compose (+1) . (*2) \\$ 3 = "
          <> show (((+ 1) . (* 2) $ (3 :: Int)))
  putStrLn $ "pipeline [4,2,1,3,5]      = "
          <> show (pipeline [4, 2, 1, 3, 5 :: Int])
