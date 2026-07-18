-- |
-- = Chapter 11 — Testing with Tasty, HUnit, QuickCheck
--
-- Tasty lets you mix unit specs (HUnit) and property-based tests
-- (QuickCheck). The library is exposed to the test executable; this
-- module ships properties and HUnit-style cases that `tests/Test.hs`
-- picks up.
--
-- Why QuickCheck matters: hand-written tests cover a few cases;
-- QuickCheck covers thousands and (more importantly) defines the
-- *invariants the type/library relies on* — the laws discussed in
-- earlier chapters.
module Testing where

import           Test.Tasty
import           Test.Tasty.HUnit       (testCase, (@?=))
import           Test.Tasty.QuickCheck  (testProperty)
import           Test.QuickCheck        ((==>))
import qualified Data.List              as L
import           Data.Map.Strict        (Map)
import qualified Data.Map.Strict        as Map

import           Basics                 (sumListTR, fibFast)
import           MonoidsFoldable        (countUnique, topK)
import           Parsing                (parseCube, runParser')

-- * HUnit-style: concrete input/output pairs.

sumListTR_matches :: TestTree
sumListTR_matches =
  testCase "sumListTR agrees with Prelude sum" $
    sumListTR [1, 2, 3, 4, 5 :: Int] @?= 15

-- * QuickCheck properties.

-- | `sumListTR` and `Prelude.sum` give the same total.
prop_sumListTR_same :: [Int] -> Bool
prop_sumListTR_same xs = sumListTR xs == L.foldl' (+) 0 xs

-- | `fibFast` for nonneg n returns nonneg.
prop_fibFast_nonneg :: Int -> Bool
prop_fibFast_nonneg n = n >= 0 ==> fibFast n >= 0

-- | For disjoint input sets, `countUnique` of a union matches
--   `unionWith (+) mx my`.
prop_countUnique_additive :: [Int] -> [Int] -> Bool
prop_countUnique_additive xs ys =
  L.null [x | x <- xs, x `L.elem` ys] ==>
    let mx = countUnique xs :: Map Int Int
        my = countUnique ys :: Map Int Int
        mu = countUnique (xs ++ ys)
    in mu == Map.unionWith (+) mx my

-- | `topK` produces a subset whose length is bounded by k.
prop_topK_length :: [Int] -> Bool
prop_topK_length xs = L.length (topK 3 xs) <= 3

-- | Cube parser is exact on positive integer spells.
parseCube_ok :: TestTree
parseCube_ok =
  testCase "parseCube \" 5 \" gives 125" $
    case runParser' parseCube " 5 " of
      Right (125, _) -> pure ()
      Right (v,  _)  -> error ("unexpected value: " <> show v)
      Left  e         -> error (show e)

-- | The full Tasty group the test executable imports.
tastyTests :: TestTree
tastyTests = testGroup "Testing chapter"
  [ sumListTR_matches
  , testProperty "sumListTR == L.foldl' (+) 0" prop_sumListTR_same
  , testProperty "fibFast nonneg" prop_fibFast_nonneg
  , testProperty "countUnique disjoint additive" prop_countUnique_additive
  , testProperty "topK length <= k" prop_topK_length
  , parseCube_ok
  ]
