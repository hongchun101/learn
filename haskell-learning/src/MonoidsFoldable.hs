-- |
-- = 第五章 — Semigroup、Monoid、Foldable、Map、Set =
--
-- * `Semigroup a` 表示：存在一个 `<>` 用来合并两个 `a`。
-- * `Monoid a` 表示：除了 `<>` 之外，还有一个空值 `mempty`。
--   这两个类让你能用同一种组合子归约**任意**数据——日志行、分数、
--   配置项、**任何形式的输入**——只需一个 combinator。
-- * `Foldable` 是"可以归约的容器"类型类。
--   列表、Map、Set、Maybe、Either——都是 `Foldable`。
-- * `Data.Map.Strict` 是首选的有序 Map；`Data.Set` 是首选的有序 Set。
--   两者都保持有序，单键操作 O(log n)。
module MonoidsFoldable where

import           Data.Map.Strict (Map)
import qualified Data.Map.Strict as Map
import           Data.Set        (Set)
import qualified Data.Set        as Set
import           Data.Monoid     (Sum(..), Product(..), All(..), Any(..))
import           Data.List       (foldl')

-- | 带有非标准 Monoid 的 newtype。
newtype Avg = Avg { unAvg :: Double }
  deriving (Show, Eq)

-- | 用求和方式合并 `Avg`。注意：这并不是真正的平均值，但对于"我们想
--   分别汇报的多个平均值"来说，它是一个完全合法的 `Semigroup`。
instance Semigroup Avg where
  (Avg a) <> (Avg b) = Avg (a + b)

instance Monoid Avg where
  mempty = Avg 0

-- | 使用 Foldable 的通用求大小：可用于列表、Map、Set 以及任何可折叠容器。
size :: Foldable t => t a -> Int
size = foldl' (\_ n -> n + 1 :: Int -> Int) 0

-- | 利用 Monoid 实例的 Foldable。
sumF :: (Foldable t, Num a) => t a -> a
sumF = getSum . foldMap Sum

-- | 常见的 Map 操作。
seedMap :: Map String Int
seedMap = Map.fromList [("apples", 3), ("oranges", 5), ("pears", 2)]

countTotal :: Map String Int -> Int
countTotal = sumF

countOf :: String -> Map String Int -> Int
countOf k m = Map.findWithDefault 0 k m

-- | 统计列表中各唯一值出现的次数。
countUnique :: (Ord a) => [a] -> Map a Int
countUnique = foldl' step Map.empty
  where
    step m x = Map.insertWith (+) x 1 m

-- | 用 Semigroup 演示 Set 的并集与交集。
unionF :: (Ord a) => Set a -> Set a -> Set a
unionF = (<>)

-- | 通过 `Foldable` + `Foldable` 取最大的 k 个元素。
topK :: (Ord a) => Int -> [a] -> [a]
topK k xs = take k (Set.toAscList (Set.fromList xs))

-- | 布尔值上的 `Any` / `All` Monoid。
allPositive :: [Int] -> Bool
allPositive = getAll . foldMap (All . (> 0))

-- | 对 `Maybe` 使用 `Foldable`，以便围绕可选数据编写程序。
fromMaybe :: a -> Maybe a -> a
fromMaybe _ (Just x) = x
fromMaybe d Nothing   = d

-- | 演示。

monoidsFoldable :: IO ()
monoidsFoldable = do
  putStrLn "-- monoid & foldable"
  putStrLn $ "size [1..10]            = " <> show (size [1..10 :: Int])
  putStrLn $ "sumF [1..10]            = " <> show (sumF [1..10 :: Int])
  putStrLn $ "countTotal seedMap      = " <> show (countTotal seedMap)
  putStrLn $ "countOf \\\"apples\\\" m     = " <> show (countOf "apples" seedMap)
  putStrLn $ "countUnique \\\"abacaba\\\"  = "
          <> show (countUnique "abacaba")
  putStrLn $ "topK 3 [5,2,1,4,3,2]     = " <> show (topK 3 [5,2,1,4,3,2 :: Int])
  putStrLn $ "allPositive [-1,0,1]     = " <> show (allPositive [-1,0,1 :: Int])
  putStrLn $ "Avg 4.0 <> Avg 1.0       = " <> show (Avg 4.0 <> Avg 1.0)
