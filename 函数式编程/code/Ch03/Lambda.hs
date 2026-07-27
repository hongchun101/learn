-- Ch03/Lambda.hs
-- λ-演算的 Haskell 演示

-- Church 布尔
trueC :: forall a. a -> a -> a
trueC t _ = t

falseC :: forall a. a -> a -> a
falseC _ f = f

-- Church 数字
type Church = forall a. (a -> a) -> a -> a

c0 :: Church
c0 _ x = x

c1 :: Church
c1 f x = f x

c2 :: Church
c2 f x = f (f x)

c3 :: Church
c3 f x = f (f (f x))

-- 后继
succC :: Church -> Church
succC n f x = f (n f x)

-- 加
addC :: Church -> Church -> Church
addC m n f x = m f (n f x)

-- 乘
mulC :: Church -> Church -> Church
mulC m n f = m (n f)

-- 指数
expC :: Church -> Church -> Church
expC m n = n m

-- Y 组合子
fix :: (a -> a) -> a
fix f = let x = f x in x

-- 用 fix 实现 factorial
fact :: Int -> Int
fact = fix (\rec n -> if n == 0 then 1 else n * rec (n - 1))

-- K 组合子
k :: a -> b -> a
k x _ = x

-- S 组合子
s :: (a -> b -> c) -> (a -> b) -> a -> c
s x y z = x z (y z)

-- I 等价于 S K K
i :: a -> a
i = s k k

-- 测试
main :: IO ()
main = do
  print (fact 5)            -- 120
  print (fact 10)           -- 3628800
  print (i 42)              -- 42
  print (trueC 1 2)         -- 1
  print (falseC 1 2)        -- 2
  -- Church 数字转 Int
  let toInt :: Church -> Int
      toInt c = c (+1) 0
  print (toInt c3)          -- 3
  print (toInt (addC c3 c4))  -- 7
  where
    c4 = succC c3
