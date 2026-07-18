-- |
-- = Chapter 02 — Lists, Strings, Laziness, Folding
--
-- In Haskell:
--
-- * `[a]` is a singly-linked list of @a@s, defined recursively as
--   `[]` (nil) and `x : xs` (cons).
-- * `String = [Char]`. It's fine for toys; for real code we use
--   `Data.Text.Text` for Unicode-aware text and `Data.ByteString.ByteString`
--   for binary I/O. We cover both.
-- * `null :: [a] -> Bool` runs in O(1). `length` walks the spine.
-- * The spine is lazy; using `null xs` instead of `xs == []` is
--   a recognised idiom.
module ListsStrings where

import qualified Data.Text            as T
import qualified Data.Text.IO         as TIO
import qualified Data.ByteString      as B
import qualified Data.ByteString.Char8 as BC

import           Data.List            (foldl', foldr, sort, sortOn, group)
import           Data.Function        (on)
import           Data.Char            (toLower, toUpper)

-- * Sectioned fold patterns.
--
-- `foldr` and `foldl'` differ in **direction** and **strictness**:
--
-- * `foldr f z (x:xs) = x `f` (foldr f z xs)` — right-associative,
--   lazy in the spine.
-- * `foldl'` (with an apostrophe!) is left-associative and
--   *strict* in the accumulator; almost always preferable for
--   arithmetic reductions.
--
-- `nullabilityOr` uses `foldr` deliberately: `(:) vs []` is cheap
-- because it never forces the tail of the input.
nullabilityOr :: [[a]] -> Bool
nullabilityOr = foldr (\_ b -> True) False  -- give up the moment we
                                              -- see any element
allEven :: [Int] -> Bool
allEven = and . map even

-- * Working with `String` versus `Text`:

-- | Inefficient: rebuilds with ++ in O(n) repeatedly.
greetString :: String -> String
greetString name = "Hello, " ++ name ++ "!"

-- | Fast: uses `OverloadedStrings` to fold with O(1) snoc.
greetText :: T.Text -> T.Text
greetText name = T.concat ["Hello, ", name, "!"]

-- | Lowercase, drop dupes, reverse.
normalise :: String -> String
normalise = reverse . map toLower . dedup . sort
  where
    dedup []       = []
    dedup [x]      = [x]
    dedup (x:y:xs)
      | x == y    = dedup (y:xs)
      | otherwise = x : dedup (y:xs)

-- | A pipeline that uses Data.List combinators.
-- `frequency` builds a tiny histogram.
frequency :: (Ord a) => [a] -> [(a, Int)]
frequency =
  map (\xs@((k,_):_) -> (k, length xs))
    . group
    . sort

-- | Stable sort by length, breaking ties by alphabetical.
wordsByLen :: [String] -> [String]
wordsByLen = sortOn (\w -> (length w, map toUpper w))

-- | The lazy `Data.List.intercalate` analog on Text.
joinText :: [T.Text] -> T.Text
joinText = T.intercalate (T.pack ", ")

-- | `ByteString` read/write the strict, low-level way. Use this for
-- sockets, network protocols, binary files.
bWrite :: FilePath -> B.ByteString -> IO ()
bWrite fp = BC.writeFile fp

bRead :: FilePath -> IO B.ByteString
bRead = BC.readFile

-- | `Text` for human-readable content. UTF-8 by default.
tWrite :: FilePath -> T.Text -> IO ()
tWrite fp = TIO.writeFile fp

tRead :: FilePath -> IO T.Text
tRead = TIO.readFile

-- | Laziness demo: an infinite list that we never actually walk in
-- full. `zipWith` stops at the shorter input, so this terminates.
naturals :: [Integer]
naturals = [0..]

squareSum :: Integer -> Integer
squareSum n = sum (take (fromIntegral n) (map (^ 2) naturals))

-- * `foldl'` vs `foldr`: notice how each corresponds to a rewrite of
-- `sumList` from chapter 1.
sumViaFoldr :: [Int] -> Int
sumViaFoldr = foldr (+) 0

sumViaFoldl :: [Int] -> Int
sumViaFoldl = foldl' (+) 0

-- * The exported demo.

listsStrings :: IO ()
listsStrings = do
  putStrLn "-- lists & strings"
  putStrLn $ "frequency \"hello world\"   = "
          <> show (frequency "hello world")
  putStrLn $ "wordsByLen [\"Ice\",\"Tea\"]  = "
          <> show (wordsByLen ["Ice","Tea","Sugar","Lemon"])
  putStrLn $ "joinText hello           = "
          <> show (joinText [T.pack "Hello", T.pack "wörld"])
  putStrLn $ "nullabilityOr [1..]      = "
          <> show (nullabilityOr [1..])
  putStrLn $ "squareSum 5              = " <> show (squareSum 5)
  putStrLn $ "sumViaFoldl [1..10]      = " <> show (sumViaFoldl [1..10])
  putStrLn $ "greetText (Text \"Haskell\") = "
          <> show (greetText (T.pack "Haskell"))
