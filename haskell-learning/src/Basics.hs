-- |
-- = 第一章 — 基础 =
--
-- 本章建立你在后续所有内容中都需要的心智模型：
--
-- * Haskell 是**基于表达式**的语言：每一行都是一个表达式，
--   而函数体就是一个表达式，其值*就是*结果。
-- * 函数是**一等公民**。
-- * 递归是最主要的控制结构。在值的世界里没有
--   `while` 循环；你通过对数据的递归来代替它。
--
-- 以下五种机制承载了日常 Haskell 中约 90% 的场景：函数
-- 定义的多个等式、守卫、where/let 绑定、
-- 模式匹配以及对列表的递归。
--
-- 本文件中的每个定义都被导出，并被各个演示使用。
module Basics where

-- * 每个 Haskell 文件都隐含 `import Prelude`，它带来
--   `Show`、`Eq`、`Num`、函数组合运算符、
--   `putStrLn`、`Int`、`Bool` 等基础内容。

-- | 一个平凡的函数。注意顺序：参数在前，
-- 返回类型在后。
plusOne :: Int -> Int
plusOne n = n + 1

-- | 带守卫的等式：`|` 引入一个布尔前置条件。
-- 第一个匹配成功的守卫胜出。
absInt :: Int -> Int
absInt n
  | n <  0   = -n
  | n == 0   = 0
  | otherwise = n

-- | 用模式匹配表达同样的逻辑。
isZero :: Int -> Bool
isZero 0 = True
isZero _ = False

-- | 当模式匹配必须出现在函数体*内部*时，就要用
-- `case`。对嵌套数据很有用。
lastChar :: String -> Char
lastChar s = case reverse s of
  []     -> '\0'
  (x:_)  -> x

-- | `where` 用来附加作用域覆盖整个等式的绑定。
-- 用于在单个函数定义内部共享辅助函数。
volume :: Double -> Double -> Double -> Double
volume l w h = box l w h
  where
    box a b c = a * b * c

-- | 对列表进行模式匹配递归。这是“列表求和”的
-- 经典写法，可以翻译到任何语言。
sumList :: [Int] -> Int
sumList []            = 0
sumList (x:xs)        = x + sumList xs

-- | 尾递归版本。大 O 复杂度相同，但不会像
-- `foldl` 的同类函数那样有爆栈风险。
sumListTR :: [Int] -> Int
sumListTR = go 0
  where
    go !acc []     = acc
    go !acc (y:ys) = go (acc + y) ys

-- | 斐波那契函数，三种实现，按教材标准由低到高：
--
-- 1. 朴素递归 —— 指数级，体现冗余
--    重复计算的开销。
-- 2. 朴素但尾递归的版本。
-- 3. 用累加元组承载的“快速”迭代版本。
fibNaive :: Int -> Int
fibNaive 0 = 0
fibNaive 1 = 1
fibNaive n = fibNaive (n - 1) + fibNaive (n - 2)

fibFast :: Int -> Int
fibFast = go (0, 1)
  where
    go (a, _) 0 = a
    go (a, b) n = go (b, a + b)
    --         ^ 这就是它能做到 O(n) 的原因：每一步都“消耗”
    --           一个 `b`（也就是下一个斐波那契数），而 `a + b`
    --           成为新的状态。

-- | 一个经典的高阶示例：接受一个函数的 map。
map' :: (a -> b) -> [a] -> [b]
map' _ []       = []
map' f (x:xs)   = f x : map' f xs

-- | 同一思路的 eta 化简版本 —— 完全等价。
mapEta :: (a -> b) -> [a] -> [b]
mapEta f = \xs -> case xs of
  []     -> []
  (z:zs) -> f z : mapEta f zs

-- | 遮蔽会发生 —— do 块里的 let 是一个新的绑定。
-- 初学者常把 `where` 和 `let` 混为一谈；区别在于
-- 它们出现的位置和分组方式：
--
-- * `where` 依附于单个等式。
-- * `let` 本身是一个表达式，可以出现在任何
--   表达式*内部*。
nestedLet :: Int -> Int
nestedLet n =
  let twice    = n * 2
      plusOne' = twice + 1
  in plusOne' * 3

-- * 第一章的导出演示。把 IO 留在边界 —— 上面所有的
-- 纯函数保持不变，方便我们对它们做单元测试。

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
