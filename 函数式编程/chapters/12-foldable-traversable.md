# 第 12 章  Foldable 与 Traversable

> 读完本章,你将理解:两个最重要的"容器类型类"——Foldable(可折叠)与 Traversable(可遍历),以及它们在 Applicative 协同下的强大抽象。

## 12.1 Foldable

### 12.1.1 定义

```haskell
class Foldable t where
  foldr :: (a -> b -> b) -> b -> t a -> b
  foldMap :: Monoid m => (a -> m) -> t a -> m
```

`foldMap` 是核心。为何核心?

```haskell
foldr f z = foldr1 f . foldMap (\x -> [x])  -- 典型实现
```

`foldMap` = "先映射为 monoid,后折叠"。

### 12.1.2 例子

```haskell
instance Foldable [] where
  foldr = Prelude.foldr
  foldMap f = foldMap (fmap f) . pure . id
  -- 实际: foldMap f = foldr (mappend . f) mempty

instance Foldable Maybe where
  foldMap _ Nothing  = mempty
  foldMap f (Just x) = f x

instance Foldable (Either e) where
  foldMap _ (Left _)  = mempty
  foldMap f (Right x) = f x

instance Foldable Tree where
  foldMap f (Leaf x)     = f x
  foldMap f (Branch l r) = foldMap f l `mappend` foldMap f r
```

### 12.1.3 归纳得到的函数

```haskell
sum     = foldMap sum   -- 代: foldMap Sum
product = foldMap Product
length  = foldMap (\_ -> Sum 1)
all     = foldMap All
any     = foldMap Any
```

`foldMap` 是一个 "monoid hom from `(t a, ...)` to ..."。

### 12.1.4 折叠方向

```haskell
-- foldr: 右折叠 = recursive
foldr :: (a -> b -> b) -> b -> t a -> b

-- foldl': 左折叠 = 严格
foldl' :: (b -> a -> b) -> b -> t a -> b
```

## 12.2 Traversable

### 12.2.1 定义

```haskell
class (Functor t, Foldable t) => Traversable t where
  traverse  :: Applicative f => (a -> f b) -> t a -> f (t b)
  sequenceA :: Applicative f => t (f a) -> f (t a)
```

`traverse`: 把映射动作放到 Applicative 里,得到的是"包裹后结构的容器"。
`sequenceA`: 把"包裹元素的容器" 翻转为"容器的包裹"。

### 12.2.2 例子

```haskell
instance Traversable [] where
  traverse f = foldr consF (pure [])
    where
      consF x ys = (:) <$> f x <*> ys

instance Traversable Maybe where
  traverse _ Nothing  = pure Nothing
  traverse f (Just x) = Just <$> f x

instance Traversable (Either e) where
  traverse _ (Left e)  = pure (Left e)
  traverse f (Right a) = Right <$> f a
```

### 12.2.3 例子

```haskell
-- 1. 总和
sumTraverse :: (Traversable t, Num a) => t a -> a
sumTraverse = getSum . traverse Sum

-- 2. 记录错误
validate :: String -> [String] -> Either [String] Int
validate name age = do
  n <- if null name then Left ["name empty"] else Right name
  a <- if null age  then Left ["age empty"]  else Right (read age)
  return (n, a)

processUsers :: [String] -> [String] -> Either [String] [(String, Int)]
processUsers names ages = traverse (uncurry validate) (zip names ages)
-- 任何错误都会给出 *所有* 错误
```

### 12.2.4 律

两条律:

1. **自然性**: `t . traverse f = traverse (t . f)`
2. **同一性**: `traverse Identity = Identity`

## 12.3 形式 B: Free Applicative

```haskell
data Ap f a where
  Pure :: a -> Ap f a
  Ap   :: f a -> Ap (f x) -> Maybe (a, Ap f x)
```

让一个 applicative 反过来分解(reifiable)成结构,以后可以优化(structural fusion)。

## 12.4 思考题

1. 证明 `Foldable` 实例 `Tree` 满足律。
2. 实现 `foldr` 在 `Either e` 上的版本。
3. 解释为何 `traverse` 是 `sequenceA` 的"pre" 操作。
4. 写 `data Rose a = Node a [Rose a]` 的 `Foldable` / `Traversable`。
5. 用 `traverse` 写 `mapMaybe :: (a -> Maybe b) -> [a] -> [b]`。

## 12.5 折叠与遍历的"图"

```
foldMap
   │
   ▼
foldr / foldl'
   │
   ▼
  reduce
```

```
traverse
   │
   ▼
sequenceA
   │
   ▼
(被 f 包裹的) functor
```

## 12.6 实践:事务性代码

```haskell
-- 拉日志
data Log = Log [String] deriving (Show, Monoid)

processItem :: Item -> Writer Log Output
processItem item = do
  tell [show item]
  pure (toOutput item)

processAll :: [Item] -> Writer Log [Output]
processAll = traverse processItem

-- 测试
runWriter (processAll [i1, i2, i3])
-- ([o1, o2, o3], Log ["i1", "i2", "i3"])
```

或:

```haskell
processAllE :: [Item] -> Either String [Output]
processAllE = traverse validateItem
-- 任何错误立即失败
```

或:
```haskell
processAllIO :: [Item] -> IO [Output]
processAllIO = traverse processItemIO
```

**应用多变, 接口一致**。

## 12.7 小结

- `Foldable` = "可折叠为 monoid"。
- `Traversable` = "可与 Applicative 配合做遍历"。
- 两类给我们"容器 + 内容" 完整的代数。
- 应用:日志、错误处理、并行 IO、统一接口。

下一章进入 Advanced Theory: 范畴论。
