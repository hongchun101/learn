-- |
-- = 第二章 — 列表、字符串、惰性、折叠 =
--
-- 在 Haskell 中：
--
-- * `[a]` 是 @a@ 的单向链表，递归地定义为
--   `[]`（nil）和 `x : xs`（cons）。
-- * `String = [Char]`。在小代码里还行；正式代码中我们用
--   `Data.Text.Text` 处理 Unicode 文本，用 `Data.ByteString.ByteString`
--   处理二进制 I/O。本章会同时介绍两者。
-- * `null :: [a] -> Bool` 是 O(1) 的；`length` 需要遍历 spine。
-- * spine 是惰性的；用 `null xs` 而不是 `xs == []`
--   是一个公认的惯用法。
module ListsStrings where

import qualified Data.Text            as T
import qualified Data.Text.IO         as TIO
import qualified Data.ByteString      as B
import qualified Data.ByteString.Char8 as BC

import           Data.List            (foldl', foldr, sort, sortOn, group)
import           Data.Function        (on)
import           Data.Char            (toLower, toUpper)

-- * 分段折叠模式。
--
-- `foldr` 和 `foldl'` 在**方向**和**严格性**上不同：
--
-- * `foldr f z (x:xs) = x `f` (foldr f z xs)` —— 右结合，
--   在 spine 上是惰性的。
-- * `foldl'`（带撇号！）是左结合并且
--   在累加器上*严格*；对于算术归约几乎总是首选它。
--
-- `nullabilityOr` 故意使用 `foldr`：因为 `(:) vs []` 这一比较
-- 廉价，它不会强制求值输入列表的尾部。
nullabilityOr :: [[a]] -> Bool
nullabilityOr = foldr (\_ b -> True) False  -- 一旦看到任意元素
                                              -- 就立刻放弃
allEven :: [Int] -> Bool
 allEven = and . map even


-- * 使用 `String` 还是 `Text`：

-- | 效率较低：反复用 ++ 拼接，每次都是 O(n)。
greetString :: String -> String
greetString name = "Hello, " ++ name ++ "!"
greetText :: T.Text -> T.Text
greetText name = T.concat ["Hello, ", name, "!"]

-- | 转小写、去重、倒序。
normalise :: String -> String
normalise = reverse . map toLower . dedup . sort
  where
    dedup []       = []
    dedup [x]      = [x]
    dedup (x:y:xs)
      | x == y    = dedup (y:xs)
      | otherwise = x : dedup (y:xs)

-- | 一个使用 Data.List 组合子的管道。
-- `frequency` 构造一个小型直方图。
frequency :: (Ord a) => [a] -> [(a, Int)]
frequency =
  map (\xs@((k,_):_) -> (k, length xs))
    . group
    . sort

-- | 按长度稳定排序，长度相同再按字母序。
wordsByLen :: [String] -> [String]
wordsByLen = sortOn (\w -> (length w, map toUpper w))

-- | 在 Text 上对应的惰性 `Data.List.intercalate`。
joinText :: [T.Text] -> T.Text
joinText = T.intercalate (T.pack ", ")

-- | 以严格、低层级方式读写 `ByteString`。可用于
-- 套接字、网络协议、二进制文件。
bWrite :: FilePath -> B.ByteString -> IO ()
bWrite fp = BC.writeFile fp

bRead :: FilePath -> IO B.ByteString
bRead = BC.readFile

-- | 用 `Text` 处理人类可读的内容，默认 UTF-8 编码。
tWrite :: FilePath -> T.Text -> IO ()
tWrite fp = TIO.writeFile fp

tRead :: FilePath -> IO T.Text
tRead = TIO.readFile

-- | 惰性演示：一个我们其实并不会完整遍历的
-- 无限列表。`zipWith` 在较短的输入结束时停止，所以能正常终止。
naturals :: [Integer]
naturals = [0..]

squareSum :: Integer -> Integer
squareSum n = sum (take (fromIntegral n) (map (^ 2) naturals))

-- * `foldl'` vs `foldr`：注意它们各自对应第一章中
-- `sumList` 的一种改写。
sumViaFoldr :: [Int] -> Int
sumViaFoldr = foldr (+) 0

sumViaFoldl :: [Int] -> Int
sumViaFoldl = foldl' (+) 0

-- * 导出演示。

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
