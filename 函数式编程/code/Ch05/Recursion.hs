-- Ch05/Recursion.hs
-- 递归: 列表 / 树 / 折叠

-- 1. 结构递归: 对每个子结构递归
length' :: [a] -> Int
length' []     = 0
length' (_:xs) = 1 + length' xs

-- 2. 原始递归: 参数严格减小
factorial :: Int -> Int
factorial 0 = 1
factorial n = n * factorial (n - 1)

-- 3. 互递归
isEven :: Int -> Bool
isEven 0 = True
isEven n = isOdd (n - 1)

isOdd :: Int -> Bool
isOdd 0 = False
isOdd n = isEven (n - 1)

-- 4. 尾递归
sumListTR :: [Int] -> Int
sumListTR = go 0
  where
    go !acc []     = acc
    go !acc (x:xs) = go (acc + x) xs

-- 5. 折叠 (foldr / foldl')
foldr' :: (a -> b -> b) -> b -> [a] -> b
foldr' _ z []     = z
foldr' f z (x:xs) = f x (foldr' f z xs)

foldl'' :: (b -> a -> b) -> b -> [a] -> b
foldl'' _ z []     = z
foldl'' f z (x:xs) = foldl'' f (f z x) xs

-- 6. 树上的 fold (catamorphism)
data Tree a = Leaf a | Branch (Tree a) (Tree a)
  deriving (Show, Functor, Foldable)

foldTree :: (a -> b) -> (b -> b -> b) -> Tree a -> b
foldTree f _ (Leaf x)     = f x
foldTree f g (Branch l r) = g (foldTree f g l) (foldTree f g r)

-- size = foldTree (const 1) (+)
sizeTree :: Tree a -> Int
sizeTree = foldTree (const 1) (+)

-- 7. fix: 通用不动点
fix :: (a -> a) -> a
fix f = let x = f x in x

factorialFix :: Int -> Int
factorialFix = fix (\rec n -> if n == 0 then 1 else n * rec (n - 1))

-- 8. 演示
main :: IO ()
main = do
  print (length' [1..10])                 -- 10
  print (factorial 6)                     -- 720
  print (isEven 4, isOdd 4)               -- (True, False)
  print (sumListTR [1..1000])             -- 500500

  let t = Branch (Leaf 1) (Branch (Leaf 2) (Leaf 3))
  print (sizeTree t)                      -- 3
  print (foldr' (+) 0 [1..5])             -- 15
  print (foldl'' (+) 0 [1..5])            -- 15
  print (factorialFix 5)                  -- 120
