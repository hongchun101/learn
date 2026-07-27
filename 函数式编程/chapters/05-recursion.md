# 第 5 章  递归:计算的形状

> 读完本章,你将理解:为什么 FP 中没有 for/while;递归的三种形式(structural/general/mutual);尾递归与折叠;以及"递归即不动点"。

## 5.1 为什么 FP 没有循环

```c
// 命令式
for (int i = 0; i < n; i++) sum += i;
```

`for` 隐含了"计数器"状态。FP 默认无状态,所以用**递归**显式地把"状态"转化为"参数":

```haskell
sumTo :: Int -> Int
sumTo 0 = 0
sumTo n = n + sumTo (n - 1)
```

这就是 LSP 的核心思想: **迭代 = 递归 + 累加器参数**。

## 5.2 递归的三种形式

### 5.2.1 结构递归 (structural recursion)

对递归数据结构的每个子结构递归调用:

```haskell
length :: [a] -> Int
length []     = 0
length (_:xs) = 1 + length xs
```

递归终止 = 递归数据结构的"最小"情况。

### 5.2.2 原始递归 (primitive recursion)

只调用"更小参数",保证终止:

```haskell
-- factorial
fact :: Int -> Int
fact 0 = 1
fact n = n * fact (n - 1)
```

### 5.2.3 互递归 (mutual recursion)

```haskell
isEven :: Int -> Bool
isEven 0 = True
isEven n = isOdd (n - 1)

isOdd :: Int -> Bool
isOdd 0 = False
isOdd n = isEven (n - 1)
```

### 5.2.4 一般递归 (general recursion)

不保证终止: $\mu$ 算子 / Y combinator / `fix`。

```haskell
loop :: a
loop = loop
```

Haskell 提供这种能力,但需要 Ctrl-C 终止。许多类型系统(Agda/Coq)拒绝非终止。

## 5.3 尾递归

### 5.3.1 什么尾递归

调用自己是**最后**一个动作:

```haskell
-- 尾递归
sumTo :: Int -> Int -> Int -> Int
sumTo 0 acc _ = acc
sumTo n acc k = sumTo (n - 1) (acc + (k - n + 1)) k

-- 不是尾递归
sumTo1 :: Int -> Int
sumTo1 0 = 0
sumTo1 n = n + sumTo1 (n - 1)  -- 之后还需 + n
```

### 5.3.2 尾递归 = 循环

尾递归本质上就是 goto。本次递归调用之后什么都不需要记住。GHC 会自动检测并优化成 while loop:

```haskell
-- 编译出等价的 C:
int sumTo(int n, int acc, int k) {
  while (n > 0) {
    acc = acc + (k - n + 1);
    n = n - 1;
  }
  return acc;
}
```

### 5.3.3 strict left fold = 循环

```haskell
foldl' :: (b -> a -> b) -> b -> [a] -> b
foldl' f acc []     = acc
foldl' f acc (x:xs) = foldl' f (f acc x) xs
```

这就是 while。`Data.List.foldl'` 等价于 `reduce` 在 Python/JS 中。

### 5.3.4 栈空间问题

```haskell
-- 看似尾递归,实际不是
sumTo :: Int -> Int
sumTo = go 0
  where
    go :: Int -> Int -> Int
    go acc 0 = acc
    go acc n = go (acc + n) (n - 1)
```

这是真尾递归,GHC 编译成 while,空间 O(1)。

## 5.4 折叠(fold) — 递归的通用形式

### 5.4.1 右折叠

```haskell
foldr :: (a -> b -> b) -> b -> [a] -> b
foldr f z []     = z
foldr f z (x:xs) = f x (foldr f z xs)
```

`foldr (:) [] xs = xs`。`foldr (+) 0 [1,2,3] = 1 + (2 + (3 + 0))`。

### 5.4.2 左折叠

```haskell
foldl :: (b -> a -> b) -> b -> [a] -> b
foldl f z []     = z
foldl f z (x:xs) = foldl f (f z x) xs
```

`foldl (+) 0 [1,2,3] = ((0 + 1) + 2) + 3`。

### 5.4.3 折叠与函数

```
foldr f z [a,b,c] = f a (f b (f c z))
foldl f z [a,b,c] = f (f (f z a) b) c
```

任意函数对列表的"指称" = 一个 fold。**这是 FP 的强化版"for"**。

### 5.4.4 折叠是 monoid hom

```haskell
foldMap :: Monoid m => (a -> m) -> [a] -> m
foldMap f = foldr (mappend . f) mempty
```

它把"每个元素的 monoid 折叠起来"。

## 5.5 复合类型上的递归

### 5.5.1 树

```haskell
data Tree a = Leaf a | Branch (Tree a) (Tree a)
    deriving (Show, Functor, Foldable)

size :: Tree a -> Int
size (Leaf _)        = 1
size (Branch l r)    = size l + size r

sumTree :: Num a => Tree a -> a
sumTree (Leaf x)     = x
sumTree (Branch l r) = sumTree l + sumTree r
```

### 5.5.2 map 与 foldRec

```haskell
mapTree :: (a -> b) -> Tree a -> Tree b
mapTree f (Leaf x)     = Leaf (f x)
mapTree f (Branch l r) = Branch (mapTree f l) (mapTree f r)

foldTree :: (a -> b) -> (b -> b -> b) -> Tree a -> b
foldTree f _ (Leaf x)     = f x
foldTree f g (Branch l r) = g (foldTree f g l) (foldTree f g r)
```

`foldTree` 是所有树运算的母函数,这意味着 `size = foldTree (const 1) (+)` 等。

### 5.5.3 不动点(recursion = fix)

```haskell
fix :: (a -> a) -> a
fix f = let x = f x in x

length :: [a] -> Int
length = fix $ \rec xs -> case xs of
               []     -> 0
               (_:xs) -> 1 + rec xs
```

`fix` 把"递归调用"参数化,得到"可能非终止"的递归。

## 5.6 递归方案 (recursion schemes)

> 高级话题:把递归抽象成"在 fold / unfold / hylomorphism 上的形态"。

```haskell
cata :: Functor f => (f a -> a) -> Fix f -> a
cata alg (Fix f) = alg (fmap (cata alg) f)

ana :: Functor f => (a -> f a) -> a -> Fix f
ana coalg a = Fix (fmap (ana coalg) (coalg a))

hylo :: Functor f => (f b -> b) -> (a -> f a) -> a -> b
hylo alg coalg = cata alg . ana coalg
```

- **cata (catamorphism)**: 折叠
- **ana (anamorphism)**: 展开
- **hylo (hylomorphism)**: 展开后折叠 = 函数式编译器

这一族抽象是 FP+cat theory 一致性的精彩展示。

## 5.7 实践:几个递归的"练手"

```haskell
-- 1. 反转列表
reverse' :: [a] -> [a]
reverse' = foldl (flip (:)) []

-- 2. 快速排序
qsort :: Ord a => [a] -> [a]
qsort []     = []
qsort (x:xs) = qsort [a | a <- xs, a <= x]
            ++ [x]
            ++ qsort [a | a <- xs, a > x]

-- 3. 树深度
depth :: Tree a -> Int
depth (Leaf _)     = 1
depth (Branch l r) = 1 + max (depth l) (depth r)
```

## 5.8 思考题

1. 把 `map f [1,2,3]` 写成 foldr。
2. 证明 `foldr (:) [] xs = xs`。
3. 解释为什么 `sum = foldl' (+) 0`,`product = foldl' (*) 1`,`length = foldl' (\_ x -> x + 1) 0`。
4. 用 `fix` 写 `factorial`。
5. 写出二叉树的 `foldTree`,证明 `size = foldTree (const 1) (+)`。

## 5.9 小结

- 递归是 FP 的"循环"。
- 折叠(右/左)是递归的通用形式。
- 尾递归 = 循环,空间 O(1)。
- 递归模式(结构/原始/互/一般)对应不同的"何时终止"语义。
- 递归方案(recursion schemes)是高阶递归的代数学。

下章,我们把数据类型 ADT 补完,把"递归"和"类型"绑定到 Mulberry / Rose / Linked List / Tree 上。
