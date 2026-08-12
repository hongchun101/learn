# 第 6 章  类型与代数数据类型

> 读完本章,你将理解:Hindley-Milner 类型推导、代数数据类型(ADT)的两种形式(和类型与积类型)、模式匹配,以及"类型即规约"。

## 6.1 类型即规约

### 6.1.1 类型是集合

类型 = 一组值的集合。
- `Bool` = {True, False}
- `Int` = {..., -1, 0, 1, 2, ...}
- `Maybe Int` = {Just n | n ∈ Int} ∪ {Nothing}

### 6.1.2 类型即证明维度

`f : A → B` 意味着: $f$ 的实现蕴含了"对 $A$ 中任意值产生 $B$ 中值"。这是强承诺。

```haskell
-- 编译器看到 : Int -> Int
-- 知道: 这是确定性函数,没有 IO/exc/state
```

### 6.1.3 类型即文档

```haskell
readFile :: FilePath -> IO String
map     :: (a -> b) -> [a] -> [b]
filter  :: (a -> Bool) -> [a] -> [a]
```

类型即"函数能做什么"。运行时再不必看注释。

## 6.2 Hindley-Milner 类型系统

### 6.2.1 形式

H-M 在 Haskell / ML / OCaml 中使用:

```
Γ ⊢ e : τ
```

环境 $\Gamma$ 下 $e$ 的类型是 $\tau$。

### 6.2.2 推导规则

```
                   Γ, x : σ ⊢ x : σ
Γ ⊢ e₁ : σ → τ    Γ ⊢ e₂ : σ
-----------------------------------  (应用)
            Γ ⊢ e₁ e₂ : τ

      Γ, x : α ⊢ e : β    α ∉ FV(Γ)
--------------------------------------  (泛化)
          Γ ⊢ λx. e : ∀α. β

Γ ⊢ e : ∀α. σ
-----------------  (特化)
   Γ ⊢ e : σ[α := τ]
```

### 6.2.3 推导算法

1. 生成约束(unification)
2. 求解约束
3. 量化自由的类型变量

```
\x -> x + 1
─── (literal) ───> x : 'a, (+) : Int -> Int -> Int, 1 : Int
─── (apply) ───> x : 'a, (+) : 'a -> 'a -> 'a, 1 : 'a
─── (unify) ───> 'a := Int
─── (gen) ───> Int -> Int
```

### 6.2.4 类型变量的几种写

```haskell
-- 没有写 forall, 但编译器知道
id :: a -> a
id x = x

-- 等价写法
id :: forall a. a -> a
id x = x
```

## 6.3 代数数据类型 (ADT)

### 6.3.1 积类型 (product)

```haskell
data Point = Point Double Double
    deriving (Show, Eq)

-- (Double, Double)
-- 构造方式: Point x y
-- 元素数: |Double| * |Double| = ∞
```

```haskell
data Pair a b = Pair a b
fst :: Pair a b -> a
snd :: Pair a b -> b
```

### 6.3.2 和类型 (sum)

```haskell
data Bool = True | False
    deriving (Show, Eq)

-- 只能取 两 种形态之一
```

```haskell
data Maybe a = Nothing | Just a
data Either a b = Left a | Right b
```

和类型 = "判断 + 访问"。

### 6.3.3 用代数视角看 ADT

```
类型 = (常数 × 字段₁ × 字段₂ × ...) + (常数 × 字段₁ × ...) + ...
```

```
Maybe a = 1 + a
Either a b = a + b
Bool = 2 = 1 + 1
[a] = 1 + a × [a]   -- 注意: 递归!
```

列表是递归 ADT。这种"代数"性质让我们可以用代数法则推导。

### 6.3.4 ADT 与 OOP 的对比

| OOP | FP (ADT) |
|-----|----------|
| 类 + 继承 | 类型 + 模式匹配 |
| 子类扩展父类 | 多 case 处理 |
| 内部可变性 | 默认不可变 |
| 开放扩展 | 封闭构造子 |

```haskell
-- OOP 风格: 给 Shape 加新形状需要继承
class Shape { area(); }
class Circle extends Shape { ... }

-- FP/ADT: 给 Expr 加新形态需要修改类型
data Expr = Lit Int | Add Expr Expr | Mul Expr Expr
eval :: Expr -> Int
eval (Lit n) = n
eval (Add a b) = eval a + eval b
eval (Mul a b) = eval a * eval b
```

注意:Lisp-Op 模式需要在每个 case 写 `eval`,而 OOP 是开闭原则(OCP)。这不是 FP 的缺陷,而是 FP 的"封闭世界"假设: 编译器可以**穷尽性检查**(exhaustiveness)。

```haskell
data Expr = Lit Int | Add Expr Expr
eval :: Expr -> Int
eval (Lit n) = n
-- 警告: pattern match(es) are non-exhaustive
```

### 6.3.5 递归 ADT 与折叠

```haskell
data List a = Nil | Cons a (List a)
foldList :: b -> (a -> List a -> b) -> List a -> b
foldList n _ Nil         = n
foldList n c (Cons x xs) = c x xs
```

问题是:`foldList` 与 Haskell 的 `foldr` 不一样——后者不写 cons cell 的结构,而是写"右折叠"。

```haskell
-- Haskell 的 foldr 与 List ADT 的关系
foldr :: (a -> b -> b) -> b -> [a] -> b
foldr f z []     = z
foldr f z (x:xs) = f x (foldr f z xs)
-- 这里的 x:xs = Cons x xs
```

### 6.3.6 标签字段 (record syntax)

```haskell
data Person = Person
  { name :: String
  , age  :: Int
  , addr :: String
  } deriving (Show, Eq)

-- 创建
alice = Person { name = "Alice", age = 30, addr = "Earth" }
-- 字段访问
alice.name  -- "Alice"
-- 不可变 update
alice' = alice { age = 31 }
```

Haskell 的 record syntax 还有"字段冲突"问题,工程上常用 `OverloadedRecordDot` (GHC 9.2+) 解决。

### 6.3.7 多态 ADT

```haskell
data Tree a = Leaf a | Node (Tree a) (Tree a)

data Maybe a = Nothing | Just a

data Map k v = Empty | Entry k v (Map k v) (Map k v)
```

参数 `a` / `k` `v` 是类型变量,这是**参数化多态**。

## 6.4 模式匹配

### 6.4.1 形式

```haskell
length :: [a] -> Int
length []     = 0
length (_:xs) = 1 + length xs
```

### 6.4.2 模式匹配 vs. if-else

```haskell
-- 模式匹配
length []     = 0
length (_:xs) = 1 + length xs

-- if-else
length xs = if null xs then 0 else 1 + length (tail xs)
```

模式匹配更接近"形状分析",if-else 退化为"只判断一个布尔"。

### 6.4.3 嵌套模式

```haskell
data BST k v = Empty | Node k v (BST k v) (BST k v)

lookup :: Ord k => k -> BST k v -> Maybe v
lookup _ Empty = Nothing
lookup k (Node k' v l r)
  | k < k'     = lookup k l
  | k > k'     = lookup k r
  | k == k'    = Just v
```

### 6.4.4 as-pattern

```haskell
-- 复制再保留
duplicate :: [a] -> [a]
duplicate xs@(_:_) = xs ++ xs
duplicate []       = []
```

### 6.4.5 视图模式 (view pattern)

```haskell
-- GHC 扩展
{-# LANGUAGE ViewPatterns #-}

sortDesc :: Ord a => [a] -> [a]
sortDesc (sort -> xs) = reverse xs
```

## 6.5 穷尽性检查

```haskell
data Color = Red | Green | Blue
toString :: Color -> String
toString Red = "red"
toString Green = "green"
-- 警告: pattern match(es) are non-exhaustive
-- In an equation for 'toString': Blue not matched
```

编译器保证: 模式匹配必须覆盖所有构造子。**这是 FP 类型驱动编程的关键收益**。

## 6.5A Parse, don't validate

FP 工程的"圣杯模式": **不在运行时检查,在解析时保证**。

```haskell
-- 反例: 验证后扔掉信息
processAge :: Int -> Either String Int
processAge n
  | n < 0     = Left "age negative"
  | n > 150   = Left "age too large"
  | otherwise = Right n

-- 之后: 总要重新 validate
-- renderAge :: Int -> String  -- 不知道是不是合法

-- 正例: 用类型"记住"已验证
newtype Age = Age Int
  deriving (Show, Eq, Ord)

mkAge :: Int -> Maybe Age
mkAge n
  | n < 0 || n > 150 = Nothing
  | otherwise         = Just (Age n)

-- 之后: Age 永远合法, 无需再检查
renderAge :: Age -> String
renderAge (Age n) = show n
```

**核心**: 解析函数返回的不是 `Int`,而是 `Age`。非法值在类型层就不可表达。

### 6.5A.1 实战: NonEmpty / Positive / MkEmail

```haskell
-- 1. NonEmpty: 编译期保证至少一个
import Data.List.NonEmpty (NonEmpty(..))

head' :: NonEmpty a -> a
head' (x :| _) = x
-- head' :: [a] -> a 做不到! (空列表无 head)

-- 2. Positive: 拒绝非正数
newtype Positive = Positive Int
  deriving (Show)

mkPositive :: Int -> Maybe Positive
mkPositive n | n > 0 = Just (Positive n)
              | otherwise = Nothing

-- 3. Email: 解析后保证格式合法
newtype Email = Email String

mkEmail :: String -> Maybe Email
mkEmail s
  | '@' `elem` s && not (null before) && not (null after) = Just (Email s)
  | otherwise = Nothing
  where (before, after) = break (== '@') s
```

### 6.5A.2 PatternSynonyms: 模式同义词

```haskell
{-# LANGUAGE PatternSynonyms #-}

data Color = RGB Int Int Int | Named String

-- 给一个清晰模式
pattern Red   :: Color
pattern Green :: Color
pattern Blue  :: Color
pattern Red   = RGB 255   0   0
pattern Green = RGB 0   255   0
pattern Blue  = RGB 0     0 255

-- 双向:
-- Red   = ... 作为值
-- case x of Red -> ...  作为模式
isPrimary :: Color -> Bool
isPrimary Red   = True
isPrimary Green = True
isPrimary Blue  = True
isPrimary _     = False
```

PatternSynonyms 是把"复杂 ADT"包装成"用户友好 API"的标准工具。

## 6.6 思考题

1. 写一个 ADT `Shape = Circle Double | Rectangle Double Double | Triangle Double Double Double`,并写出 `area :: Shape -> Double`。
2. 用 Algebra 视角推导 `Either a (b, c) ≅ (a, b) + (a, c)`(在范畴论里它们同构)。
3. 写一个 `BinTree a` 的 ADT,实现 `size`、`height`、`mapTree`。
4. 证明 `data List a = Nil | Cons a (List a)` 满足的同构: `List a ≅ 1 + a × List a`,因此 `|[a]|` 满足递归 $L = 1 + aL$,解得 $L = 1/(1-a)$(无 size 限制时)。
5. 用 parse-don't-validate 写一个 `PhoneNumber` 类型,保证格式合法。
6. 用 PatternSynonyms 简化 Ch3 的 Church 布尔。

## 6.7 小结

- 类型 = 集合 + 规约 + 文档。
- H-M 类型系统让你无需写类型,即可获得强类型。
- ADT = 代数视角建模。积类型 = 笛卡儿积, 和类型 = 标记联合。
- 模式匹配 + 穷尽性检查 = 类型驱动编程的护航。
- **Parse, don't validate**: 让非法状态在类型层不可表达。
- **PatternSynonyms**: 给复杂 ADT 友好 API。

