# 第 16 章  高级类型:GADT / Type Family / Rank-N / HKT

> 读完本章,你将理解 Haskell 高级类型扩展,以及它们如何让你"写不出 bug"。

## 16.1 GADT (Generalized ADT)

### 16.1.1 形式

普通 ADT:
```haskell
data Expr
  = Lit Int
  | Add Expr Expr
  | IsZero Expr
```

GADT:
```haskell
data Expr a where
  Lit  :: Int -> Expr Int
  Add  :: Expr Int -> Expr Int -> Expr Int
  IsZero :: Expr Int -> Expr Bool
  If    :: Expr Bool -> Expr a -> Expr a -> Expr a

eval :: Expr a -> a
eval (Lit n)         = n
eval (Add x y)       = eval x + eval y
eval (IsZero x)      = eval x == 0
eval (If b t e)      = if eval b then eval t else eval e
```

### 16.1.2 关键点

每个构造子可以**指定"结果类型与参数 $a$ 的关系"**——这给编译器更多约束。

### 16.1.3 例子:类型化 AST

```haskell
data Term a where
  TmInt  :: Int -> Term Int
  TmBool :: Bool -> Term Bool
  TmAdd  :: Term Int -> Term Int -> Term Int
  TmEq   :: Term Int -> Term Int -> Term Bool
  TmIf   :: Term Bool -> Term a -> Term a -> Term a

-- 类型驱动: TmAdd TmInt ... 类型 = Term Int
```

不允许 `TmAdd TmBool ...` 编译。

### 16.1.4 高级:Existential

```haskell
data Expr where
  LitInt  :: Int -> Expr
  LitStr  :: String -> Expr
  Add     :: Expr -> Expr -> Expr
  ShowIt  :: Show a => a -> Expr  -- 存在量化

showExpr :: Expr -> String
showExpr (LitInt n)    = show n
showExpr (LitStr s)    = s
showExpr (Add x y)     = showExpr x ++ "+" ++ showExpr y
showExpr (ShowIt x)    = show x
```

GADT 里使用 existential type。

## 16.2 Type Family (类型族)

### 16.2.1 形式

```haskell
type family Elem c x :: *
type instance Elem [] x = x
type instance Elem (Map k v) k = v
```

类型级函数——把类型当作值。

### 16.2.2 例子:关联类型

```haskell
class Collection c where
  type Elem c
  empty :: c
  insert :: Elem c -> c -> c
  toList :: c -> [Elem c]
instance Collection [a] where
  type Elem [a] = a
  empty = []
  insert x xs = x : xs
  toList = id
```

关联类型是 GHC 友好的"类型族"。

### 16.2.3 实用:Vector 等

```haskell
import Data.Vector.Sized
import Data.Singletons

-- 类型级 Nat
data Vec (n :: Nat) a = Vec (a, a, ...)  -- 长度编码
```

例如 `Vec 3 Int` = 长度 3 的向量, 长度不可变。

## 16.3 Rank-N Polymorphism

### 16.3.1 形式

```haskell
{-# LANGUAGE RankNTypes #-}

-- rank 1: forall a. a -> a
-- rank 2: (forall a. a -> a) -> Int
```

```haskell
runST :: (forall s. ST s a) -> a
```

这是 ST monad 的核心: `runST` 不让 `s` 逃逸。

### 16.3.2 例子:可控的可变性

```haskell
import Control.Monad.ST
import Data.STRef

example :: Int
example = runST $ do
  ref <- newSTRef 0
  modifySTRef ref (+1)
  readSTRef ref
-- 1
```

`runST` 假装 mutable,但必须"使用完即终止"。

### 16.3.3 类型层级

```
rank 0:    Int -> Int
rank 1:    forall a. a -> a
rank 2:    (forall a. a -> a) -> Int
rank 3:    ((forall a. a -> a) -> Int) -> ...
```

## 16.4 Higher-Kinded Types (HKT)

### 16.4.1 形式

类型构造子也可以"参数化":

```haskell
class Functor f where
  fmap :: (a -> b) -> f a -> f b
```

这里 `f :: * -> *`——它接受类型,产生类型。

### 16.4.2 例子

- `Maybe :: * -> *`
- `Either e :: * -> *`
- `[] :: * -> *`
- `(->) r :: * -> *`

### 16.4.3 GHC 的 HKT 限制

GHC 直到 9.0 一直不能直接表达 HKT——它需要 `* -> *` 这种"类型构造子的 kind"。

```haskell
{-# LANGUAGE KindSignatures #-}

class Functor (f :: * -> *) where
  fmap :: (a -> b) -> f a -> f b
```

缺省 KindSignatures 时 GHC 默认把 `f` 视为 `* -> *`,所以基本用例不需要。

### 16.4.4 PureScript / OCaml 的 HKT

```purescript
class Functor f where
  map :: forall a b. (a -> b) -> f a -> f b
```

OCaml 通过 mod 或 first-class modules 支持。

## 16.5 类型级 λ / 依赖类型

```haskell
-- GHC 类型级 λ
type family Apply (f :: k -> l) (x :: k) :: l
```

### 16.5.1 依赖类型

Idris / Agda / Coq 中,类型可以依赖值:

```idris
data Vect : Nat -> Type -> Type where
  Nil  : Vect Z a
  Cons : a -> Vect n a -> Vect (S n) a

-- v1 : Vect 3 Int
```

在编译期证明"长度对得上"。

### 16.5.2 Dependent Haskell

Singletons 库让 GHC 也能部分支持:

```haskell
-- 关联类型 sng
-- 模式匹配 toSing 间接作出值相关断言
```

## 16.6 思考题

1. 用 GADT 写一个"类型化链表",元素类型由构造子决定。
2. 写出类型族 `Eithers :: [Type] -> Type`, 把类型列表 fold 成 Either 的嵌套。
3. 解释 `runST :: (forall s. ST s a) -> a` 为何需要 `forall s` 在参数内。
4. `Proxy :: Proxy a` 是什么用法?
5. 写出 list 上 `foldr :: (a -> b -> b) -> b -> [a] -> b` 的 foldl 形式。

## 16.7 关键扩展

```
GADTs            Generalised ADT
TypeFamilies     类型级函数
RankNTypes       rank-2+ 多态
KindSignatures   注解 * -> *
ConstraintKinds  类型类约束作为 kind
QuantifiedConstraints  等价约束
```

## 16.8 小结

- GADT: 构造子可自由指定结果类型。
- Type Family: 类型级函数。
- Rank-N: 多态函数嵌套。
- HKT: 类型构造子的参数化。
- 依赖类型: 类型依赖值,Agda/Idris 完备支持。

下一章:性能与严格性。
