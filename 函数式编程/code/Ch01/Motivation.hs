-- Ch01/Motivation.hs
-- 函数式编程的"味道": 把命令式与函数式对比
-- 建议在 ghci 中 :l 加载后逐行尝试

-- 1. 命令式风格: 维护一个状态
sumImperative :: Int -> Int
sumImperative n = go 0 1
  where
    go !acc !i
      | i > n     = acc
      | otherwise = go (acc + i) (i + 1)

-- 2. 函数式风格: 递归 + 不可变
sumFunctional :: Int -> Int
sumFunctional 0 = 0
sumFunctional n = n + sumFunctional (n - 1)

-- 3. 函数式 + 尾递归 (空间 O(1))
sumTailRec :: Int -> Int
sumTailRec n = go 0 n
  where
    go !acc 0 = acc
    go !acc k = go (acc + k) (k - 1)

-- 4. 标准库的 foldl'
sumFold :: Int -> Int
sumFold n = foldl' (+) 0 [1..n]

-- 5. 闭包: FP 中的"轻状态"
makeCounter :: Int -> (Int -> Int)
makeCounter start = \step -> start + step

-- 6. 演示
main :: IO ()
main = do
  print (sumImperative 100)    -- 5050
  print (sumFunctional 100)    -- 5050
  print (sumTailRec 100)       -- 5050
  print (sumFold 100)          -- 5050

  let c10 = makeCounter 10
  print (c10 5)                -- 15
  print (c10 100)              -- 110

  -- 关键观察: 后 4 个表达"做什么", 不关心"怎么做"
