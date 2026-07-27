-- |
-- = 第三章 — 高阶函数 =
--
-- Haskell 的*一等函数*语法非常轻量，以至于你无意识就会用到。
-- 本章关注的是这套*语法*：
--
-- * Lambda 表达式：`\\x -> body`。
-- * Section 形式：`(+1)`、`(2^)`、`(!!3)`。
-- * 柯里化与部分应用：每个函数都会*部分应用*到
--   它的最后一个参数；你可以先传入部分参数，
--   再把得到的函数传来传去。
-- * 函数组合：`(.)` 用来搭建数据流。
-- * 无参风格（point-free）：当最后一步只是
--   `(f . g . h)` 时，可以省略显式参数。
module HigherOrder where

import           Data.Function         ((&))
import qualified Data.List             as L

-- | 一个简单的谓词，被提升后在管道中使用。
isLong :: String -> Bool
isLong = (> 10) . length

-- | Section 风格：`(1:) :: a -> [a] -> [a]`。注意我们把 cons
-- 从等式中提出来的方式。
prefixOne :: [Int] -> [Int]
prefixOne xs = (1 :) xs

-- | 函数组合：`negate . sum . take 5` 读起来就像
-- 一条数据流。
top5SumNeg :: [Int] -> Int
top5SumNeg = negate . sum . take 5

-- | `filter . not . p` 是一个经典组合子：“不满足 `p` 的元素”。
-- 我们把它写成一行。
notEls :: (a -> Bool) -> [a] -> [a]
notEls p = filter (not . p)

-- | 正向应用运算符。读起来是数据在前的管道。
--
-- > xs & length
--
-- 等价于 `length xs`，但视觉上更易于组合。
lengthOf :: [a] -> Int
lengthOf xs = xs & length

-- | 带环境的函数。`makeAdder n` 是一个等待
-- 接收单个参数的函数 —— 这就是柯里化加部分应用。
makeAdder :: Int -> (Int -> Int)
makeAdder n m = n + m

add5 :: Int -> Int
add5 = makeAdder 5         -- 无参风格；读作“把 5 部分应用
                            -- 到 makeAdder 函数”。

-- | 一个*正确*的经典管道：在过滤之后做一次折叠。
-- 类型签名是 `[Int] -> Int`；函数体是用 `(.)` 串联
-- 起来的*数据操作*管道。
pipeline :: [Int] -> Int
pipeline =
  L.foldl' (+) 0
  . map    (subtract 1)
  . filter even
  . L.sort
  -- 注意：组合顺序在数据流上是“从右到左”。
  --     读作：“(1) 对 x 排序，(2) 保留偶数，(3) 逐个减一，
  --     (4) 求和”。

-- | 一个无参风格 vs. 显式 lambda 的真实例子。
without :: (Eq a) => a -> [a] -> [a]
without = filter . (/=)

-- * 导出演示。

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
