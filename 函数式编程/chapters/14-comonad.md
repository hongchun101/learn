# 第 14 章  Comonad 与对偶性

> 读完本章,你将理解:Comonad 是 Monad 的"对偶",以及它在 stream、cellular automaton、UI 编程中的角色。

## 14.1 范畴对偶

### 14.1.1 对偶范畴

**对偶范畴** $\mathcal{C}^{op}$: 同一对象,所有态射反向。

- 如果 $f: A \to B$ 在 $\mathcal{C}$,则在 $\mathcal{C}^{op}$ 是 $f^{op}: B \to A$。

Haskell 不直接用 $\mathcal{C}^{op}$, 但**对偶类比**到处可见:

- Product / Sum
- Limit / Colimit
- Initial / Terminal
- Functor / Contravariant
- Monad / Comonad

## 14.2 Comonad

### 14.2.1 定义

```haskell
class Functor w => Comonad w where
  extract :: w a -> a
  duplicate :: w a -> w (w a)
```

满足律:
- `extract . duplicate = id`
- `fmap extract . duplicate = id`
- `duplicate . duplicate = fmap duplicate . duplicate`

### 14.2.2 与 Monad 的对偶

| Monad | Comonad |
|-------|---------|
| `return :: a -> m a` | `extract :: w a -> a` |
| `bind :: m a -> (a -> m b) -> m b` | `extend :: w a -> (w a -> b) -> w b` |
| `join :: m (m a) -> m a` | `duplicate :: w a -> w (w a)` |

```haskell
extend :: Comonad w => w a -> (w a -> b) -> w b
extend w f = fmap f (duplicate w)
```

### 14.2.3 经典 Comonad

```haskell
-- 1. Env (Reader 的对偶)
newtype Env e a = Env { runEnv :: (e, a) }
instance Comonad (Env e) where
  extract (Env (_, a)) = a
  duplicate (Env (e, a)) = Env (e, Env (e, a))

-- 2. Store (State 的对偶)
newtype Store s a = Store { runStore :: (s -> a, s) }
instance Comonad (Store s) where
  extract (Store (f, s)) = f s
  duplicate (Store (f, s)) = Store (\s' -> Store (f, s'), s)

-- 3. Stream (无限列表)
data Stream a = Cons a (Stream a)
instance Comonad Stream where
  extract (Cons x _) = x
  duplicate s@(Cons _ rest) = Cons s (duplicate rest)
```

### 14.2.4 Comonad 律

```haskell
class Functor w => Comonad w where
  extract   :: w a -> a
  duplicate :: w a -> w (w a)

extend :: Comonad w => w a -> (w a -> b) -> w b
extend w f = fmap f (duplicate w)
```

满足律:

1. **左单位**: `extract . duplicate = id`
2. **右单位**: `fmap extract . duplicate = id`
3. **结合律**: `duplicate . duplicate = fmap duplicate . duplicate`

第四个常被忽略但等价的形式:
4. **extend-extract 律**: `extend extract = id`

```haskell
-- 用 QuickCheck 验证 Store 的 Comonad 律
prop_store :: (s -> Int) -> s -> Int
prop_store f s =
  extract (duplicate (Store (f, s))) == f s
```

### 14.2.5 derive Comonad (GHC 9.4+)

```haskell
{-# LANGUAGE DeriveComonad #-}

data Stream a = Cons a (Stream a)
  deriving (Functor, Comonad)
```

## 14.3 Comonad 的"语境"

Comonad 表示"有结构 + 当前焦点"的计算。`extract` 拿到当前焦点,`duplicate` 展开成"结构中的所有子结构"。

### 14.3.1 1D Cellular Automaton

把"一维邻居" 看作 Store Comonad 的视角: 当前焦点 + 周围邻居:

```haskell
type Cellular = Store Int  -- 焦点位置

-- 邻居: 当前位置与左邻
neighbors :: Cellular Int -> (Int, Int, Int)
neighbors (Store (g, pos)) = (g (pos - 1), g pos, g (pos + 1))

-- 用 Rule 30 规则: a XOR (b OR c)
rule30 :: (Int, Int, Int) -> Int
rule30 (a, b, c) = a `xor` (b .|. c)
  where xor x y = (x + y) `mod` 2
        (.|.) x y = (x + y) `mod` 2

-- 单步: 在每个位置应用 rule30
step :: Cellular Int -> Cellular Int
step s = extend (rule30 . neighbors) s
```

### 14.3.2 Stream processing

```haskell
window :: Int -> Stream a -> [a]
window n = take n . iterate (drop 1) . extractDup
  where
    extractDup :: Stream a -> [a]
    extractDup s@(Cons x xs) = x : extractDup xs
```

### 14.3.3 UI / Reactive

UI Comonad = Store Comonad + 当前 state。结构上与 `Store` 相同:

```haskell
-- Store s a = 当前 state + "从 state 读 a" 的读函数
newtype UI s a = UI { runUI :: (s, s -> a) }

instance Functor (UI s) where
  fmap f (UI (s, g)) = UI (s, f . g)

instance Comonad (UI s) where
  extract   (UI (s, g)) = g s
  duplicate (UI (s, g)) = UI (s, \s' -> UI (s', g))
```

-- `extract` 拿到当前 state 的视图,`duplicate` 把每个可能的 state 都铺成"所有 UI"。

Tailwind / React 思想 = "UI 是 state 的函数 + 当前 state"。

## 14.4 对偶性原则

### 14.4.1 乘积 / 余积

```haskell
data (a, b) = (a, b)        -- product
data Either a b = Left a | Right b  -- sum
```

### 14.4.2 Algebra / Coalgebra

```haskell
-- 代数: fold cata F B -> A
cata :: Functor f => (f a -> a) -> Fix f -> a

-- 余代数: unfold ana A -> F B
ana :: Functor f => (a -> f a) -> a -> Fix f
```

### 14.4.3 列表的反演

```haskell
-- Producer: build a list
produce :: Int -> [Int]
produce n = [1..n]

-- Consumer: consume a list
consume :: [Int] -> Int
consume = sum

-- 它们互相是对方的对偶
```

## 14.5 实践:Roshan Ghafour

```haskell
class Monad m => MonadLogger m where
  log :: String -> m ()
```

其对偶:

```haskell
class Comonad w => ComonadTrace w where
  trace :: w a -> String
```

设计模式如"cross-cutting concern" 在 FP 中体现为 monad / comonad。

## 14.6 思考题

1. 证明 `Env e` 满足 Comonad 律。
2. 实现 `Store s` 的 `extend`。
3. 写一个简单的 1D Conway's Game of Life Comonad 实现。
4. 解释 `Stream` 如何用于"无限列表的 prefix 窗口"。
5. 列出 Monad / Comonad 的对偶表格。

## 14.7 小结

- Comonad = Monad 的对偶,通过箭头反向得到。
- 实际用于 stream、UI、cellular automaton。
- 范畴论的对偶原则让我们免费拿到"成对" 的概念。
- 实务:熟悉 Functor / Monad × Comonad 是 FP 的关键。

下一章是代数效应——一种更现代的 effect 抽象。
