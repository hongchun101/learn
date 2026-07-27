# 第 18 章  基于性质的测试 (Property-Based Testing)

> 读完本章,你将理解 QuickCheck 的思想:不是写测试用例,而是写"性质"。

## 18.1 动机

### 18.1.1 单元测试的问题

```haskell
test1 = length [1,2,3] == 3
test2 = length [1,2,3,4] == 4
-- ...
```

- 测试用例是有限的
- 漏掉的情况可能成为 bug
- 写测试用例是手工劳动

### 18.1.2 性质测试的假设

*"代码应该满足某些代数律, 不管具体输入"*

```haskell
-- 性质: reverse 是 involution
prop_reverse xs = reverse (reverse xs) == xs
```

让我给 QuickCheck 一份生成器和性质, 自动化测试。

## 18.2 QuickCheck 基础

### 18.2.1 性质

```haskell
import Test.QuickCheck

prop_reverse :: [Int] -> Bool
prop_reverse xs = reverse (reverse xs) == xs
```

```bash
$ runhaskell Test.hs
+++ OK, passed 100 tests.
```

### 18.2.2 Arbitrary

```haskell
class Arbitrary a where
  arbitrary :: Gen a
  shrink :: a -> [a]
```

`Int` 等内置类型已实现 `Arbitrary`。

### 18.2.3 自定义

```haskell
data Color = Red | Green | Blue
instance Arbitrary Color where
  arbitrary = elements [Red, Green, Blue]
  shrink Red = []; shrink Green = []; shrink Blue = []
```

## 18.3 性质模式

### 18.3.1 圆-逆元

```haskell
prop_addInverse :: Int -> Bool
prop_addInverse n = n + (-n) == 0
```

### 18.3.2 幂等

```haskell
prop_sortIdempotent :: [Int] -> Bool
prop_sortIdempotent xs = sort (sort xs) == sort xs
```

### 18.3.3 round-trip

```haskell
prop_parseShow :: String -> Bool
prop_parseShow s = read (show s) == s
```

### 18.3.4 关系修改

```haskell
prop_sortLength :: [Int] -> Bool
prop_sortLength xs = length (sort xs) == length xs
```

### 18.3.5 Monad 律

```haskell
prop_leftUnit :: Int -> (Int -> Maybe Int) -> Bool
prop_leftUnit a f = (return a >>= f) == f a
```

## 18.4 复杂性质

### 18.4.1 有前提

```haskell
prop_divide :: Int -> Int -> Property
prop_divide a b = b /= 0 ==> a `div` b * b + a `mod` b == a
```

`==>` 拒绝非法输入。

### 18.4.2 等价类

```haskell
prop_evenDouble :: Int -> Property
prop_evenDouble n = even n ==> n * 2 `mod` 2 == 0
```

### 18.4.3 分类

```haskell
prop_valid :: String -> Property
prop_valid s = forAll (resize 10 arbitrary) $ \len ->
  length (take len s) <= length s
```

## 18.5 缩小

```haskell
-- QuickCheck 找到反例 会尝试缩小
-- prop: shrink a -> [a]
-- 标准实现:
-- Int: 缩小到 0
-- List: 缩小到 [], 短 list
```

### 18.5.1 自定义 shrink

```haskell
data Tree a = Leaf a | Branch (Tree a) (Tree a)
    deriving (Show)

instance Arbitrary a => Arbitrary (Tree a) where
  arbitrary = frequency
    [ (1, Leaf <$> arbitrary)
    , (3, Branch <$> arbitrary <*> arbitrary)
    ]
  shrink (Leaf x)     = [Leaf x']
    where x' = shrink x
  shrink (Branch l r) = [l, r] ++ [Branch l' r | l' <- shrink l]
                                    ++ [Branch l r' | r' <- shrink r]
```

## 18.6 类型驱动性质

```haskell
prop_functor :: Functor f => (a -> b) -> f a -> Bool
prop_functor f x = fmap f x == fmap f x
-- 太弱
prop_functorId :: Functor f => f Int -> Bool
prop_functorId x = fmap id x == x
prop_functorComp :: Functor f => f Int -> Bool
prop_functorComp f g x = fmap (f . g) x == (fmap f . fmap g) x
```

## 18.7 Hedgehog (alternatives)

```haskell
-- Haskell
import Hedgehog

prop_reverse :: Property
prop_reverse = property $ do
  xs <- forAll Gen.list
  reverse (reverse xs) === xs
```

Hedgehog 的 shrink 更稳定,取值更细。

## 18.8 测试 monad 律

```haskell
-- Monad law verification
class Monad m => MonadLaw m where
  leftIdentity :: a -> (a -> m b) -> m b -> Bool
  rightIdentity :: m a -> (a -> m a) -> m b -> Bool
  associativity :: m a -> (a -> m b) -> (b -> m c) -> m c -> Bool
```

## 18.9 思考题

1. 写一个 `Ord a => [a] -> Bool` 的性质,验证 `sort . sort = sort`。
2. 写一个 `QuickCheck` 验证 `Maybe` 的 Monad 律。
3. 写一个自定义 `Arbitrary` 给 `data Formula = Lit Int | Add Formula Formula`(可生成 50 个节点)。
4. 写一个 `Tree a` 的 `prop_map` 性质。
5. 写一个 `prop_mapMaybe` 验证 `fromList . toList = id`。

## 18.10 小结

- QuickCheck: 写性质,生成器自动化测试。
- 性质: 圆逆、幂等、round-trip、关系。
- 缩小子: 找到最小反例。
- 类型类性质: 泛化律,Foldable / Functor / Monad 的实测。
- 在工程里,性质测试与单元测试互补。

下一章:进阶主题 — CPS、Free Monad、Tagless Final、反应式。
