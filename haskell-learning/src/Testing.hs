-- |
-- = 第十一章 — 用 Tasty、HUnit 与 QuickCheck 进行测试 =
--
-- Tasty 允许混合单元规格（HUnit）与基于属性的测试
--（QuickCheck）。该库暴露给测试可执行文件；本模块提供属性和
-- HUnit 风格的用例，由 `tests/Test.hs` 加载。
--
-- QuickCheck 的重要性：手写测试只覆盖少数用例；QuickCheck
-- 可以覆盖数千种情况，而且更重要的是，它定义了类型/库所依赖的
-- *不变量*——即前面章节讨论的定律。
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

-- * HUnit 风格：具体的输入/输出对。

sumListTR_matches :: TestTree
sumListTR_matches =
  testCase "sumListTR agrees with Prelude sum" $
    sumListTR [1, 2, 3, 4, 5 :: Int] @?= 15

-- * QuickCheck 属性。

-- | `sumListTR` 与 `Prelude.sum` 得到相同的总和。
prop_sumListTR_same :: [Int] -> Bool
prop_sumListTR_same xs = sumListTR xs == L.foldl' (+) 0 xs

-- | 对于非负 n，`fibFast` 返回非负值。
prop_fibFast_nonneg :: Int -> Bool
prop_fibFast_nonneg n = n >= 0 ==> fibFast n >= 0

-- | 对于不相交的输入集合，其并集的 `countUnique` 与
--   `unionWith (+) mx my` 一致。
prop_countUnique_additive :: [Int] -> [Int] -> Bool
prop_countUnique_additive xs ys =
  L.null [x | x <- xs, x `L.elem` ys] ==>
    let mx = countUnique xs :: Map Int Int
        my = countUnique ys :: Map Int Int
        mu = countUnique (xs ++ ys)
    in mu == Map.unionWith (+) mx my

-- | `topK` 生成一个子集，其长度以 k 为上界。
prop_topK_length :: [Int] -> Bool
prop_topK_length xs = L.length (topK 3 xs) <= 3

-- | Cube 解析器能精确解析正整数字面形式。
parseCube_ok :: TestTree
parseCube_ok =
  testCase "parseCube \" 5 \" gives 125" $
    case runParser' parseCube " 5 " of
      Right (125, _) -> pure ()
      Right (v,  _)  -> error ("unexpected value: " <> show v)
      Left  e         -> error (show e)

-- | 测试可执行文件导入的完整 Tasty 测试组。
tastyTests :: TestTree
tastyTests = testGroup "Testing chapter"
  [ sumListTR_matches
  , testProperty "sumListTR == L.foldl' (+) 0" prop_sumListTR_same
  , testProperty "fibFast nonneg" prop_fibFast_nonneg
  , testProperty "countUnique disjoint additive" prop_countUnique_additive
  , testProperty "topK length <= k" prop_topK_length
  , parseCube_ok
  ]
