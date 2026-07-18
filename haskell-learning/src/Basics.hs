-- |
-- = Chapter 01 — Basics
--
-- This chapter establishes the mental model you need for everything else:
--
-- * Haskell is **expression-based**: every line is an expression, and
--   a function body is one expression whose value *is* the result.
-- * Functions are **first-class**.
-- * Recursion is the dominant control structure. There is no
--   `while`-loop in the value world; instead you recurse over data.
--
-- These five mechanisms carry ~90% of everyday Haskell: function
-- definitions with multiple equations, guards, where/let-bindings,
-- pattern matching, and recursion over lists.
--
-- Every definition in this file is exported and used by the demos.
module Basics where

-- * Everything in a Haskell file is implied as `import Prelude`, which
--   gives us `Show`, `Eq`, `Num`, the function-composition operator,
--   `putStrLn`, `Int`, `Bool`, and so forth.

-- | A trivial function. Note the order: arguments first, return
-- type last.
plusOne :: Int -> Int
plusOne n = n + 1

-- | Guarded equations: `|` introduces a Boolean precondition. The
-- first matching guard wins.
absInt :: Int -> Int
absInt n
  | n <  0   = -n
  | n == 0   = 0
  | otherwise = n

-- | The same idea, written with pattern matching.
isZero :: Int -> Bool
isZero 0 = True
isZero _ = False

-- | `case` is the alternative when pattern matching must happen
-- *inside* a body expression. Useful for nested data.
lastChar :: String -> Char
lastChar s = case reverse s of
  []     -> '\0'
  (x:_)  -> x

-- | `where` attaches bindings whose scope is the whole equation.
-- Use it for shared helpers inside a single function definition.
volume :: Double -> Double -> Double -> Double
volume l w h = box l w h
  where
    box a b c = a * b * c

-- | Pattern-matched recursion over a list. This is the canonical
-- "sum of a list" you can translate to any language.
sumList :: [Int] -> Int
sumList []            = 0
sumList (x:xs)        = x + sumList xs

-- | Tail-recursive variant. Identical big-O, no risk of blowing the
-- stack on `foldl` cousins.
sumListTR :: [Int] -> Int
sumListTR = go 0
  where
    go !acc []     = acc
    go !acc (y:ys) = go (acc + y) ys

-- | fibonacci, three implementations of increasing textbook-grade:
--
-- 1. Naive recursion — exponential, shows the cost of redundant
--    recomputation.
-- 2. Naïve yet tail-recursive.
-- 3. The “fast” iterative version carried in an accumulating tuple.
fibNaive :: Int -> Int
fibNaive 0 = 0
fibNaive 1 = 1
fibNaive n = fibNaive (n - 1) + fibNaive (n - 2)

fibFast :: Int -> Int
fibFast = go (0, 1)
  where
    go (a, _) 0 = a
    go (a, b) n = go (b, a + b)
    --         ^ this is what makes it O(n): each step *consumes*
    --           one `b`, which is the next fib; `a + b` becomes the
    --           next state.

-- | A classic higher-order example: map that takes a function.
map' :: (a -> b) -> [a] -> [b]
map' _ []       = []
map' f (x:xs)   = f x : map' f xs

-- | eta-reduced version of the same — exactly equivalent.
mapEta :: (a -> b) -> [a] -> [b]
mapEta f = \xs -> case xs of
  []     -> []
  (z:zs) -> f z : mapEta f zs

-- | Shadowing happens — let inside a do is a new binding.
-- Beginners often confuse `where` with `let`; the difference is
-- placement and grouping:
--
-- * `where` attaches to a single equation.
-- * `let` is itself an expression and can appear *inside* any
--   expression.
nestedLet :: Int -> Int
nestedLet n =
  let twice    = n * 2
      plusOne' = twice + 1
  in plusOne' * 3

-- * The exported demo for Chapter 01. Keeps IO at the edge — every
-- pure helper above stays untouched, so we can unit-test it.

basics :: IO ()
basics = do
  putStrLn "-- basics"
  putStrLn $ "plusOne 41            = "   <> show (plusOne 41)
  putStrLn $ "absInt (-9)           = "   <> show (absInt (-9))
  putStrLn $ "isZero 0              = "   <> show (isZero 0)
  putStrLn $ "lastChar \"eureka\"    = "   <> show (lastChar "eureka")
  putStrLn $ "sumList [1..10]       = "   <> show (sumList [1..10 :: Int])
  putStrLn $ "fibFast 20            = "   <> show (fibFast 20)
  putStrLn $ "map' (+10) [1..3]     = "   <> show (map' (+ 10) ([1..3 :: Int]))
  putStrLn $ "nestedLet 5           = "   <> show (nestedLet 5)
