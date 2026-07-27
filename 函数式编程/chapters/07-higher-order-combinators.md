# 第 7 章  高阶函数、组合、柯里化、Point-free

> 读完本章,你将理解:函数作为一等公民的真正含义,以及它如何把"控制流"转化为"表达式求值"。

## 7.1 高阶函数

**高阶函数 (higher-order function)**: 接受函数作为参数或返回函数作为值。

```haskell
map  :: (a -> b) -> [a] -> [b]
filter :: (a -> Bool) -> [a] -> [a]
foldr :: (a -> b -> b) -> b -> [a] -> b
(.)   :: (b -> c) -> (a -> b) -> a -> c
```

### 7.1.1 函数作为参数

```haskell
twice :: (a -> a) -> a -> a
twice f x = f (f x)

twice (+1) 5          -- 7
twice reverse [1,2,3] -- [1,2,3]
```

### 7.1.2 函数作为返回值

```haskell
add  :: Int -> Int -> Int
add x = \y -> x + y
-- 部分应用
add5 = add 5
add5 3  -- 8
```

### 7.1.3 闭包

```haskell
makeCounter :: Int -> (Int -> Int)
makeCounter start = \step -> start + step
```

闭包 = 函数 + 捕获的环境。

## 7.2 柯里化 (currying)

### 7.2.1 形式

每个 Haskell 函数"看上去"都只有一个参数:
```haskell
-- 看似两参数
add :: Int -> Int -> Int
add x y = x + y

-- 实际是: 传入 Int, 返回 (Int -> Int)
-- add : Int -> Int -> Int
-- add : Int -> (Int -> Int)
```

### 7.2.2 Curry/Uncurry

```haskell
curry   :: ((a, b) -> c) -> (a -> b -> c)
uncurry :: (a -> b -> c) -> ((a, b) -> c)

curry   f = \x y -> f (x, y)
uncurry f = \(x, y) -> f x y
```

### 7.2.3 与集合同构

```
A × B → C   ≅   A → B → C
```

即 $(A \times B) \to C \cong A \to (B \to C)$。

这在范畴论里是**伴随 (adjunction)** 的一个特例:`- × B` 左伴随于 $- \to B$。

### 7.2.4 部分应用

```haskell
map (+1) [1,2,3]      -- [2,3,4]
filter even [1..6]    -- [2,4,6]
sum . map (+1)        -- 一个函数
```

部分应用 = 提前绑定一些参数,得到新函数。

## 7.3 组合 (composition)

### 7.3.1 (.)

```haskell
(.) :: (b -> c) -> (a -> b) -> a -> c
(.) f g = \x -> f (g x)
```

`(f . g) x = f (g x)`。

### 7.3.2 例子

```haskell
squareSum :: [Int] -> Int
squareSum = sum . map (^2)

lengthOfStrings :: [String] -> Int
lengthOfStrings = sum . map length

isOddSum :: [Int] -> Bool
isOddSum = odd . sum
```

### 7.3.3 单子 (monoid) 视角

- 操作: `(.)`
- 单位: `id`
- 结合律: `(f . g) . h = f . (g . h)`

所以 `(Endo a, ., id)` 构成 monoid!

## 7.4 Point-free 风格

### 7.4.1 定义

**Point-free** = 不用变量标注,函数 = 组合:

```
有变量:  f x = (g . h) x            -- 有 point
无变量:  f = g . h                  -- point-free
```

### 7.4.2 转换

```haskell
-- 有变量
sumSquares xs = sum (map (^2) xs)

-- point-free
sumSquares = sum . map (^2)
```

规则:

```
λx. f x           ===  f
λx. f (g x)       ===  f . g
λx. f x (g x)     ===  f <*> g     -- Applicative
```

### 7.4.3 例子

```haskell
sumPairs :: [(Int, Int)] -> [Int]
sumPairs = map (uncurry (+))

-- 等价于
sumPairs xs = map (\(a, b) -> a + b) xs
```

### 7.4.4 Point-free 的副作用

- **简洁**: 更短
- **可读**: 强调"做什么"而非"对什么"
- **并发**: Point-free 表达更易并行化
- **难点**: 复杂组合可读性下降

### 7.4.5 重命名常用组合

```haskell
foldMap :: Monoid m => (a -> m) -> [a] -> m
foldMap f = foldr (mappend . f) mempty

mconcat :: Monoid m => [m] -> m
mconcat = foldr mappend mempty

any :: (a -> Bool) -> [a] -> Bool
any p = getAny . foldMap (Any . p)

all :: (a -> Bool) -> [a] -> Bool
all p = getAll . foldMap (All . p)
```

每一个都是"小积木"。

## 7.5 关键模式

### 7.5.1 Map / Filter / Fold

```haskell
map    :: (a -> b)   -> [a] -> [b]
filter :: (a -> Bool) -> [a] -> [a]
foldr  :: (a -> b -> b) -> b -> [a] -> b
```

### 7.5.2 Zip / Unzip

```haskell
zip   :: [a] -> [b] -> [(a, b)]
unzip :: [(a, b)] -> ([a], [b])
```

### 7.5.3 管道 (pipe)

```haskell
-- Haskell 用 .
-- F# 用 |>
-- OCaml 用 |>
-- Elixir 用 |>
-- Bash 用 |

addOne :: [Int] -> [Int]
addOne = map (+1) . filter even
```

### 7.5.4 foldl / foldr 不变

```haskell
foldl f z = foldr (flip f) z . reverse
```

右折叠 + reverse + flip = 左折叠。

## 7.6 闭包与状态

闭包是 FP 中"轻状态"载体:

```haskell
makeBank :: Int -> (Int -> Int)
makeBank balance = \delta -> balance + delta

bank = makeBank 100
bank 50   -- 150
bank 30   -- 130
```

返回的函数捕获了 `balance`。这就是 FP 中"模拟可变性"的方式——通过闭包,而非 mutable cells。

### 7.6.1 副作用等价

`makeBank` 加 `IORef` 是同一个模式的 IO 版本:

```haskell
makeBankIO :: Int -> IORef Int -> Int -> IO Int
makeBankIO init ref delta = do
  modifyIORef ref (+ delta)
  readIORef ref
```

## 7.7 思考题

1. 写出 `compose3 :: (c -> d) -> (b -> c) -> (a -> b) -> a -> d`。
2. 证明 `(.)` 满足结合律。
3. 重写 `sum . map (^2) . filter even` 为 point-free 后,验证类型。
4. 写出 `flip` 的定义,说明与 `uncurry` 的关系。
5. 写出 `on :: (b -> b -> c) -> (a -> b) -> a -> a -> c`,这是 `on (/) length  "hello" "world"` = 5 / 5 的关键。

## 7.8 小结

- 高阶函数 = 函数作为值。
- 柯里化 = "看似多参数"实际是"返回一个函数"。
- 组合 `(.)` 是 monoid。
- Point-free 强调"做什么"而非"对什么"。
- 闭包 = FP 模拟状态的廉价工具。

下一章进入 Functor——你的第一个"类型类",这是 FP 抽象的基石。
