# 第 8 章  Functor:可被映射的容器

> 读完本章,你将理解 FP 第一个"类型类"——Functor,它的两条律,以及它在范畴论里的对应物(态射间的映射)。

## 8.1 引子

我们已经见过 `map`:

```haskell
map :: (a -> b) -> [a] -> [b]
map f []     = []
map f (x:xs) = f x : map f xs
```

把 "对 list 中的元素应用 $f$" 抽象出来,得到什么呢?

```haskell
class Functor f where
  fmap :: (a -> b) -> f a -> f b
```

任何**类型构造子** $f$,只要能"在保持结构的前提下对内部值做变换",就是 Functor。

## 8.2 定义

```haskell
class Functor f where
  fmap :: (a -> b) -> f a -> f b
```

`f` 是"取一个类型作为参数" 的类型构造子。例:

- `[]` (List)
- `Maybe`
- `Either e`
- `IO`
- `(->) r` (reader)
- `Tree`
- 自己定义的 ADT

### 8.2.1 例子

```haskell
instance Functor Maybe where
  fmap _ Nothing  = Nothing
  fmap f (Just x) = Just (f x)

instance Functor (Either e) where
  fmap _ (Left e)  = Left e
  fmap f (Right a) = Right (f a)
```

### 8.2.2 infix 语法

```haskell
infixl 4 <$>
(<$>) :: Functor f => (a -> b) -> f a -> f b
(<$>) = fmap
```

`fmap f x ≡ f <$> x`。在 Haskell 里,`<$>` 是 "fmap 隐藏在 中缀"。

## 8.3 Functor 律

**Functor 必须满足两条律**:

1. **同一律**: `fmap id x = x`
2. **复合律**: `fmap (f . g) = fmap f . fmap g`

这两条律是**为什么 Functor 名字里带 "Functor"** 的原因——它与范畴论里的函子同构。

### 8.3.1 律在工程中的意义

> "律"是接口的"约束"。编译器/IDE/linter 都能基于律检查实现。

```haskell
-- 错的实现: 在 fmap 里偷偷加东西
instance Functor Maybe where
  fmap _ Nothing  = Nothing
  fmap f (Just x) = Just (f x, x)   -- 偷偷加了一个旧值
-- 编译通过, 但 quickCheck 立即找到反例(identity 律)
```

QuickCheck 测试:

```haskell
prop_id x    = fmap id x == (x :: Maybe Int)
prop_comp f g x = fmap (f . g) x == (fmap f . fmap g) x
```

## 8.4 范畴论视角

### 8.4.1 函子 (functor)

**范畴 $\mathcal{C}$ 和 $\mathcal{D}$ 之间的函子** $F$ 是:

- 对象层: $F: \text{Ob}(\mathcal{C}) \to \text{Ob}(\mathcal{D})$
- 态射层: $F: \text{Hom}(A, B) \to \text{Hom}(F(A), F(B))$
- 保持单位: $F(\text{id}) = \text{id}$
- 保持复合: $F(g \circ f) = F(g) \circ F(f)$

### 8.4.2 Haskell 的 Functor

Haskell 的 `Functor` 是 $\text{End}(\textbf{Hask})$ 上的函子:

- 对象 = 类型构造子 $\text{F}$
- 态射 = `fmap`: $A \to B \mapsto F\ A \to F\ B$
- 保持单位: `fmap id = id`
- 保持复合: `fmap (g . f) = fmap g . fmap f`

**关键**: 这就是"为什么 Functor 律必须是那两条"——它们就是"函子是个态射保持器"的形态。

### 8.4.3 函子的图

```
     f
A ──────► B
│          │
│ F        │ F
▼          ▼
F A ───────► F B
      F f
```

## 8.5 常见 Functor

### 8.5.1 `[]`

```haskell
instance Functor [] where
  fmap = map

-- 等价
fmapEvenDoubler :: [Int] -> [Int]
fmapEvenDoubler = map (*2) . filter even
```

### 8.5.2 `Maybe`

```haskell
fmap (+1) (Just 3)   -- Just 4
fmap (+1) Nothing    -- Nothing
```

### 8.5.3 `Either e`

```haskell
fmap (+1) (Right 3)  -- Right 4
fmap (+1) (Left "err") -- Left "err"
```

### 8.5.4 `(->) r` (Reader)

```haskell
instance Functor ((->) r) where
  fmap = (.)

-- 等价于
-- fmap f g = \r -> f (g r) = f . g
```

这是"函数也是 container"的根基: $A^R$ 是"接受 $R$ 返回 $A$" 的状态机集合。`fmap` 就是在结果上做映射。

### 8.5.5 `IO`

```haskell
instance Functor IO where
  fmap f io = io >>= \x -> return (f x)
```

`IO a` 是"产生 $a$ 的程序"。`fmap f` 是在程序运行后对结果做 $f$。

### 8.5.6 自己的类型

```haskell
data Tree a = Leaf a | Branch (Tree a) (Tree a)
    deriving (Show)

instance Functor Tree where
  fmap f (Leaf x)     = Leaf (f x)
  fmap f (Branch l r) = Branch (fmap f l) (fmap f r)
```

## 8.6 思考题

1. 证明 `Option<T>` (Rust/Scala) 是 Functor。
2. 为什么 `data Foo a = Foo (a -> a)` 不能成为 Functor?
3. 实现 `data Pair a = Pair a a` 的 Functor。
4. 证明 `fmap id = id` 是必要的——否则 `fmap f . fmap id ≠ fmap (f . id) = fmap f`。
5. 用 `<$>` 表达 `map (+1) [1,2,3]`,`map id []` 等。

## 8.7 常见错误与陷阱

### 8.7.1 别名型 vs. 构造子型

```haskell
type Foo = Maybe  -- 别名,不工作
data Bar a = Bar (Maybe a)  -- 构造子,可以
```

`Functor` 实例化的是**类型构造子**(`Maybe`、`Either e`),不是类型。

### 8.7.2 固定类型变量

```haskell
data F = F Int  -- 没有类型参数, 无法做 Functor
```

### 8.7.3 违反律
```haskell
-- 错误: 偷偷丢弃信息
instance Functor Maybe where
  fmap _ Nothing  = Nothing
  fmap f (Just _) = Nothing   -- 把值丢了!违反 identity 律
-- 编译通过, 但 quickCheck 立即找到反例
```

**律是 hard constraint**——违反律的类型不应是 Functor。

## 8.8 实用技巧

```haskell
-- 1. 翻转 fmap
($>) :: Functor f => f a -> b -> f b
xs $> y = fmap (const y) xs

-- 2. 取所有元素
void :: Functor f => f a -> f ()
void = fmap (const ())

-- 3. 替换 funtor 内的 a
(<$) :: Functor f => a -> f b -> f a
(<$) = fmap . const
```

## 8.9 Lawful Functor 的层次

我们后面会看到,Functor 之上还有 Applicative / Monad / MonadFix 等,但 Functor 是基础。

```
Functor      ─ 保映射
Applicative  ─ 保应用
Monad        ─ 保绑定
```


## 8.10 小结

- 两条律 (`fmap id = id`, `fmap (f . g) = fmap f . fmap g`) 是 definitional。
- 范畴论里,Functor 是保持结构和复合的态射。
- 实践里,`<$>` 是 `fmap` 的中缀语法糖。

下一章进入 Applicative——它把"被映射函数" 提升为"被映射函数"本身也能在 functor 内部做应用。
