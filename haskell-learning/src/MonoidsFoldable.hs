-- |
-- = Chapter 05 — Semigroup, Monoid, Foldable, Map, Set
--
-- * `Semigroup a` says: there's a `<>` to combine two `a`s.
-- * `Monoid a` says: there's `<>` plus an empty value `mempty`.
--   These two classes let you fold *anything* — log lines, scores,
--   configurations, *inputs of any kind* — with one combinator.
-- * `Foldable` is the "containers you can fold over" class.
--   Lists, Maps, Sets, Maybes, Eithers — all `Foldable`.
-- * `Data.Map.Strict` is the go-to ordered map; `Data.Set` the go-to
--   ordered set. Both are ordered & O(log n) per key.
module MonoidsFoldable where

import           Data.Map.Strict (Map)
import qualified Data.Map.Strict as Map
import           Data.Set        (Set)
import qualified Data.Set        as Set
import           Data.Monoid     (Sum(..), Product(..), All(..), Any(..))
import           Data.List       (foldl')

-- | A newtype with a non-standard monoid.
newtype Avg = Avg { unAvg :: Double }
  deriving (Show, Eq)

-- | Sum-merge an `Avg`. Note: this is *not* a true average, but it's a
--   perfectly valid `Semigroup` for "many averages we wanted to
--   separately report."
instance Semigroup Avg where
  (Avg a) <> (Avg b) = Avg (a + b)

instance Monoid Avg where
  mempty = Avg 0

-- | Generic sum using Foldable: works on lists, maps, sets, anything.
size :: Foldable t => t a -> Int
size = foldl' (\_ n -> n + 1 :: Int -> Int) 0

-- | A Foldable that uses monoid instance.
sumF :: (Foldable t, Num a) => t a -> a
sumF = getSum . foldMap Sum

-- | Common Map ops.
seedMap :: Map String Int
seedMap = Map.fromList [("apples", 3), ("oranges", 5), ("pears", 2)]

countTotal :: Map String Int -> Int
countTotal = sumF

countOf :: String -> Map String Int -> Int
countOf k m = Map.findWithDefault 0 k m

-- | Count unique values across a list.
countUnique :: (Ord a) => [a] -> Map a Int
countUnique = foldl' step Map.empty
  where
    step m x = Map.insertWith (+) x 1 m

-- | Set union & intersection demoed using semigroups.
unionF :: (Ord a) => Set a -> Set a -> Set a
unionF = (<>)

-- | Largest k elements via `Foldable` + `Foldable`.
topK :: (Ord a) => Int -> [a] -> [a]
topK k xs = take k (Set.toAscList (Set.fromList xs))

-- | The `Any`/`All` monoids of booleans.
allPositive :: [Int] -> Bool
allPositive = getAll . foldMap (All . (> 0))

-- | Use `Foldable` over `Maybe` to write a program over optional data.
fromMaybe :: a -> Maybe a -> a
fromMaybe _ (Just x) = x
fromMaybe d Nothing   = d

-- | The demo.

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
