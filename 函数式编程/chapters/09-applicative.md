# 第 9 章  Applicative:可被"提着"的应用

> 读完本章,你将理解:Applicative 是 Functor 的升维——它能把"装着函数的容器"应用到"装着值的容器".

## 9.1 引子

Functor 让我们 `fmap f fa`,但 $f$ 必须**不**在 functor 内。

```haskell
-- 可以
addThree :: Maybe Int -> Maybe Int
addThree = fmap (+3)

-- 想要: f 和 a 都在 functor 内
Just (+3) <*> Just 5  -- 想要 Just 8
```

Applicative 解决: 让"装着函子的容器"也能被"应用"。

## 9.2 定义

```haskell
class Functor f => Applicative f where
  pure :: a -> f a
  (<*>) :: f (a -> b) -> f a -> f b
```

两个操作:

- `pure x`: 把纯值 $x$ 装进 functor 里
- `f <*> x`: 把"装着函数 的 functor" 应用到"装着值的 functor"

### 9.2.1 infix 形式

```haskell
infixl 4 <*>

-- 习惯
fmap g x = g <$> x
g <$> x <*> y <*> z = ...   -- 类似 function call
```

## 9.3 例子

### 9.3.1 Maybe

```haskell
instance Applicative Maybe where
  pure = Just
  Nothing <*> _ = Nothing
  (Just f) <*> x = fmap f x
```

使用:
```haskell
Just (+3) <*> Just 4      -- Just 7
Just (+) <*> Just 1 <*> Just 2  -- Just 3
Nothing <*> Just 4        -- Nothing
```

### 9.3.2 Either

```haskell
instance Applicative (Either e) where
  pure = Right
  Left  e <*> _ = Left e
  Right f <*> x = fmap f x
```

Either 的 Applicative **短路**: 任何 Left 都能让整个流失败。

### 9.3.3 `[]`

```haskell
instance Applicative [] where
  pure x = [x]
  fs <*> xs = [f x | f <- fs, x <- xs]
```

这是**笛卡儿积扩展**!

```haskell
[(+1), (*2)] <*> [1, 2, 3]
-- [2, 3, 4, 2, 4, 6]
```

### 9.3.4 IO

```haskell
instance Applicative IO where
  pure = return
  ff <*> fx = do
    f <- ff
    x <- fx
    return (f x)
```

`IO` 的 Applicative 是"有顺序的 IO"。

### 9.3.5 `(->) r` (Reader)

```haskell
instance Applicative ((->) r) where
  pure x = \_ -> x
  f <*> g = \r -> f r (g r)
```

这是**环境传递**——函数组合器。

```haskell
(+) <$> readInt <*> readInt  -- 一次读两个 int 再相加
-- 等价于
\r -> (readInt r) + (readInt r)
```

### 9.3.6 ZipList

```haskell
newtype ZipList a = ZipList [a]

instance Functor ZipList where
  fmap f (ZipList xs) = ZipList (map f xs)

instance Applicative ZipList where
  pure x = ZipList (repeat x)
  ZipList fs <*> ZipList xs = ZipList (zipWith ($) fs xs)
```

`ZipList` 让 `<*>` 是 **zip**(并行)而非笛卡儿乘积。

## 9.4 Applicative 律

四条律:

1. **同一律**: `pure id <*> v = v`
2. **复合律**: `pure (.) <*> u <*> v <*> w = u <*> (v <*> w)`
3. **左单位**: `pure f <*> pure x = pure (f x)`
4. **右单位**: `u <*> pure y = pure ($ y) <*> u`

可以简化为:

1. `pure id <*> v = v`
2. `pure (.) <*> u <*> v <*> w = u <*> (v <*> w)`
3. `pure f <*> pure x = pure (f x)`

### 9.4.1 工程意义

- `(.)` 律保证"Applicative 复合有意义"
- 单位律保证"`pure` 是真正的单位"
- 任何应用 `f <$> x = pure f <*> x`

## 9.5 由 Applicative 推出的操作

```haskell
-- liftA2: applicative 版的二元函数
liftA2 :: Applicative f => (a -> b -> c) -> f a -> f b -> f c
liftA2 f x = (<*>) (fmap f x)

-- 例子
liftA2 (+) (Just 1) (Just 2)  -- Just 3
liftA2 (+) [1, 2] [10, 20]    -- [11, 21, 12, 22]

-- sequenceA: 把 functor 列表编成 functor
sequenceA :: Applicative f => [f a] -> f [a]
sequenceA []     = pure []
sequenceA (x:xs) = (:) <$> x <*> sequenceA xs
```

### 9.5.1 例子:`sequenceA`

```haskell
-- IO
sequenceA [getLine, getLine, getLine] :: IO [String]

-- Maybe
sequenceA [Just 1, Just 2, Just 3]  -- Just [1, 2, 3]
sequenceA [Just 1, Nothing]          -- Nothing

-- [] (笛卡儿积)
sequenceA [[1, 2], [10, 20]]
-- [[1, 10], [1, 20], [2, 10], [2, 20]]
```

## 9.6 范畴论视角

### 9.6.1 Applicative = 强单子(strong monad) / 笛卡儿函子

Applicative 在范畴论里可视为 **applicative functor** 或 **lax monoidal functor**:

- 类型操作: $F: \mathcal{C} \to \mathcal{C}$
- 乘法: $\otimes: F(A) \otimes F(B) \to F(A \otimes B)$
- 单位: $I \to F(I)$,其中 $I$ 是范畴里 monoidal product 的单位

**Haskell 中**:

- `pure`: $A \to F(A)$ 是单位映射
- `<*>`: $F(A \to B) \times F(A) \to F(B)$ 是 fused-map

### 9.6.2 简化版图

```
        fmap
Functor ─────► Applicative
                 │
                 ▼
              Monad
```

Applicative 提供"携带函数的应用",Monad 提供"携带值的运算"。

## 9.7 与 Monad 的关系

后一个章节我们专门讲 Monad。读者暂时记住:

- Applicative 不能"在 functor 里生成新的 functor value"
- Monad 可以

```haskell
-- Applicative 可以
mkAddr :: Maybe Int -> Maybe Int -> Maybe Int
mkAddr a b = (+) <$> a <*> b

-- Monad 必须
maybeAdd :: Maybe Int -> Maybe Int -> Maybe Int
maybeAdd a b = do
  x <- a
  y <- b
  return (x + y)
-- 当前看起来一样, 但 Monad 获得从 a "派发"出 b 的能力
```

### 9.7.1 派发能力

```haskell
-- Monad 可以
maybeApply :: Maybe Int -> Maybe (Int -> Int) -> Maybe Int
maybeApply a f = do
  x <- a
  g <- f
  return (g x)

-- Applicative 也可
maybeApply' :: Maybe Int -> Maybe (Int -> Int) -> Maybe Int
maybeApply' a f = ($) <$> f <*> a
```

实际看 Monad 还可以做:
```haskell
-- 实战: 拿一个 Maybe Int, 如果 Just 就读二行, 否则 None
-- 它需要根据 a 是否存在派发(fmap 不能)
```

## 9.8 思考题

1. 证明 `Maybe` 满足 Applicative 律。
2. 证明 `[]` 的 Applicative 是笛卡儿积。
3. 写出 `liftA2` 的 `pure` 与 `<*>` 的表达,并说明这是 Applicative 的"乘法"。
4. 实现一个 `Apply` 小工具,简化一个 Applicative 的二元流水线。
5. 用 Applicative 实现 `sequenceA`。

## 9.9 实用模式

### 9.9.1 配置块

```haskell
data Config = Config
  { user :: String
  , port :: Int
  , host :: String
  } deriving (Show)

readConfig :: IO Config
readConfig = Config
  <$> getLine          -- user
  <*> readLn           -- port
  <*> getLine          -- host
```

### 9.9.2 校验

```haskell
data User = User String Int deriving (Show)

mkUser :: String -> Int -> Either String User
mkUser name age
  | null name = Left "name empty"
  | age < 0   = Left "age negative"
  | otherwise = Right (User name age)

-- 链式校验
fromForm :: String -> Int -> Either String User
fromForm = liftA2 (curry mkUser . fst) -- 等价
```

### 9.9.3 ZipList 风格

```haskell
-- 用 ZipList 做 "pair" 对齐
getZipList $ (+) <$> ZipList [1,2,3] <*> ZipList [10,20,30]
-- [11, 22, 33]
```

## 9.10 小结

- Applicative = "装着函子的 functor"。
- 接受"携带函数"的 functor,并把它应用到"携带值"的 functor。
- 4 条律保证 Applicative 是 monoidal functor。
- 实用: `liftA2`, `sequenceA`, `(<*>)`, `pure`。

下一章是 Monad——Applicative 的"派发能力"完整版。
