# 第 13 章  范畴论:从对象到 Yoneda

> 读完本章,你将完整理解范畴论的核心:对象、态射、函子、自然变换、极限、伴随、Yoneda 引理。这是 FP 抽象的"母语"。

## 13.1 范畴 (Category)

### 13.1.1 公理

1. 一族对象 $\text{Ob}(\mathcal{C})$
2. 对象之间的态射 $\text{Hom}(A, B)$
3. 复合 $\circ: \text{Hom}(B, C) \to \text{Hom}(A, C) \to \text{Hom}(A, C)$
4. 每对象 $A$ 有恒等态射 $\text{id}_A: A \to A$

律:
- 结合律: $(f \circ g) \circ h = f \circ (g \circ h)$
- 单位律: $f \circ \text{id}_A = f = \text{id}_B \circ f$

### 13.1.2 例子

| 范畴 | 对象 | 态射 |
|------|------|------|
| **Set** | 集合 | 函数 |
| **Hask** | 类型 | Haskell 函数 |
| **Mon** | monoid | 保运算映射 |
| **Grp** | 群 | 群同态 |
| **Pos** | 偏序集 | 单调函数 |
| **Vect_k** | k-向量空间 | 线性映射 |
| **Top** | 拓扑空间 | 连续函数 |
| **Cat** | 范畴 | 函子 |

### 13.1.3 性质

- $f: A \to B$, 若存在 $g: B \to A$ 使 $g \circ f = \text{id}$ 且 $f \circ g = \text{id}$,则 $f$ 是**同构**。
- **monic**(单射范畴化):$f \circ h_1 = f \circ h_2 \Rightarrow h_1 = h_2$
- **epic**(满射范畴化):$h_1 \circ f = h_2 \circ f \Rightarrow h_1 = h_2$

## 13.2 函子 (Functor)

### 13.2.1 定义

**协变函子** $F: \mathcal{C} \to \mathcal{D}$:

- 对象层: $F: \text{Ob}(\mathcal{C}) \to \text{Ob}(\mathcal{D})$
- 态射层: $F: \text{Hom}(A, B) \to \text{Hom}(F(A), F(B))$
- 保单位: $F(\text{id}_A) = \text{id}_{F(A)}$
- 保复合: $F(g \circ f) = F(g) \circ F(f)$

### 13.2.2 逆变函子

逆变函子把箭头反向:

- $F: \text{Hom}(A, B) \to \text{Hom}(F(B), F(A))$
- $F(g \circ f) = F(f) \circ F(g)$

Haskell 中 `Op` 类比 `Contravariant`:

```haskell
class Contravariant f where
  contramap :: (a -> b) -> f b -> f a
```

### 13.2.3 双函子 / 函子应用

函子可以取多个参数:

```haskell
class Bifunctor p where
  bimap :: (a -> b) -> (c -> d) -> p a c -> p b d
```

`Either`, `Tuple2` 是 Bifunctor。

## 13.3 自然变换 (Natural Transformation)

### 13.3.1 定义

两个函子 $F, G: \mathcal{C} \to \mathcal{D}$ 之间的**自然变换** $\eta$:

- 对每个 $A \in \mathcal{C}$,有 $\eta_A: F(A) \to G(A)$(**分量**)
- 自然性: $G(f) \circ \eta_A = \eta_B \circ F(f)$(对每个 $f: A \to B$)

```
F A   ──────► F B
 │ η_A          │ η_B
 ▼              ▼
G A   ──────► G B
       G f
```

### 13.3.2 Haskell 视角

```haskell
class (Functor f, Functor g) => Nat f g where
  eta :: forall a. f a -> g a
```

例: `length :: [a] -> Int`, `null :: [a] -> Bool` 不行,因为 `Int` 不参数化,但:

```haskell
maybeToList :: Maybe a -> [a]  -- 自然变换
```

### 13.3.3 重要的自然变换

- `maybeToList :: Maybe a -> [a]`
- `eitherToList :: Either a b -> [b]`
- `Const` 与 `Identity`
- `free :: Monad m => f a -> Free f a`
- `lower :: Monad m => Free f a -> f a`(从 free 到底 functor)

## 13.4 Monad 在范畴论中

### 13.4.1 三个等价定义

**定义 1 (自函子+单位+乘法)**:
- $T: \mathcal{C} \to \mathcal{C}$ 函子
- $\eta: 1 \Rightarrow T$ 单位
- $\mu: T^2 \Rightarrow T$ 乘法
- $\mu \circ T\mu = \mu \circ \mu T$
- $\mu \circ T\eta = \mu \circ \eta T = \text{id}$

**定义 2 (Kleisli 三元组)**:
- `return` 嵌入
- `bind` 链式
- 满足 Monad 律

**定义 3 (join 风格)**:

```haskell
class Monad m where
  join :: m (m a) -> m a
```

`join` 是"展平两层"。

### 13.4.2 用自然变换表示

```haskell
class (Applicative m, Monad m) where
  eta :: a -> m a
  mu :: m (m a) -> m a
```

## 13.5 极限 / 余极限 (Limit / Colimit)

### 13.5.1 积 (Product)

$A \times B$ 是范畴里的极限:

```
A ──► A × B
B ──► A × B
```

唯一上游的"对"。

```haskell
data (a, b) = (a, b)
fst :: (a, b) -> a
snd :: (a, b) -> b
```

### 13.5.2 余积 (Coproduct)

$A + B$ 是范畴里的余极限:

```
A + B ──► A
A + B ──► B
```

唯一下游的"分叉"。

```haskell
data Either a b = Left a | Right b
```

### 13.5.3 等式子 / 余等式子

```
Eq(A, B) = max {Z | Z → A ≅ Z → B}  -- 极限
Coeq(A, B) = min {Z | A / ≅ = B → Z}  -- 余极限
```

Haskell 中对应 `Coalesceable` / `Coerce` 类。

### 13.5.4 终对象 / 起对象

- 终对象 $1$: 每个对象到它有唯一态射
- 起对象 $0$: 它到每个对象有唯一态射

`()` 是终对象,`Void` 是起对象。

### 13.5.5 指数 (Exponential)

$A^B$ 在 $\mathcal{C}$ 里若存在,要求 $\mathcal{C}$ 是笛卡儿闭的:

$$C \times A \cong B \iff C \cong A^B$$

Hask 是笛卡儿闭的: `(b -> a)`。

## 13.6 伴随 (Adjunction)

### 13.6.1 定义

两个函子 $F \dashv G$ ($\mathcal{C} \to \mathcal{D}$, $\mathcal{D} \to \mathcal{C}$) 构成伴随,如果存在双射

$$\text{Hom}_{\mathcal{D}}(F(A), B) \cong \text{Hom}_{\mathcal{C}}(A, G(B))$$

自然地在 $A, B$ 中。

### 13.6.2 重要伴随

- **Free ⊣ Forget**: $F(X) = \text{自由代数}$, $G$ = 遗忘
- **Product ⊣ Exponential**: $-\times B \dashv (-)^B$
- **Initial ⊣ Terminal**: $0 \dashv \text{Id}$
- **Lift ⊣ Lower**: `ListT` 之类的
- **Curry ⊣ Uncurry**: 双射

### 13.6.3 单位与余单位

- 单位 $\eta: \text{Id}_\mathcal{C} \Rightarrow G \circ F$
- 余单位 $\varepsilon: F \circ G \Rightarrow \text{Id}_\mathcal{D}$
- 三角恒等式:

```
F ──Fη──► F G F ──εF──► F
G ──ηG──► G F G ──Gε──► G
```

### 13.6.4 Haskell 中的形式

```haskell
class Adjunction f u | f -> u, u -> f where
  unit   :: a -> u (f a)
  counit :: f (u a) -> a
```

例: `free : f a -> Free f a` 是 unit, `retract :: Free f a -> f a` 是 counit。

## 13.7 Yoneda 引理

### 13.7.1 定理

**Yoneda**: 对任意 $\mathcal{C}$ 的对象 $C$ 和函子 $F: \mathcal{C} \to \textbf{Set}$,

$$\text{Nat}(\text{Hom}(C, -), F) \cong F(C)$$

即"每个自然变换 $\alpha: \text{Hom}(C, -) \Rightarrow F$ 唯一由 $\alpha_C(\text{id}_C) \in F(C)$ 决定"。

### 13.7.2 协同 Yoneda

$$\text{Nat}(F, \text{Hom}(-, C)) \cong F(C)$$

### 13.7.3 Haskell 视角

```haskell
-- co-Yoneda 形式
data CoYo f a = forall b. CoYo (b -> a) (f b)

-- 任何函子 f 都同构于 CoYo f
liftCoYo :: Functor f => f a -> CoYo f a
liftCoYo fa = CoYo id fa

lowerCoYo :: Functor f => CoYo f a -> f a
lowerCoYo (CoYo f fa) = fmap f fa
```

**CoYoneda 让"任何 functor" 都能转成 `Functor f => (b -> a, f b)`, 这时 `fmap` 非常简单**。

### 13.7.4 Yoneda 的工程意义

- **预设表达**: 如果一个 API 接受 `forall a. (a -> b) -> f a`,我们可以"自由构造"它。
- **重构**: 任何函子都可视为 `CoYo`, `fmap` 就是 Map 的 `(b -> a)` 应用于 `(b -> a)`。
- **同构**: "什么等同于 $X$" 经常用 Yoneda 判断。

## 13.8 极限的复杂度

### 13.8.1 极限的存在

- $\mathcal{C}$ 有所有小极限 $\Rightarrow$ $\mathcal{C}$ 完整
- Hask 是 local cartesian closed,但有底类型问题

### 13.8.2 极限 = generalized ADT

```haskell
-- 自然数 Nat = 自然极限
data Nat = Zero | Succ Nat
-- 这是初代数 (initial algebra)
```

```haskell
-- 列表 = 1 + a × [a]
data List a = Nil | Cons a (List a)
```

ADT = 初代数(余极限的特例)。

### 13.8.3 F-Algebra: 把递归写为范畴论对象

对函子 $F$, **F-代数**是 pair $(A, f: F(A) \to A)$。直观: $F$ 是"一层结构", $f$ 是"折叠一层结构"的方式。

**初始代数**是**唯一一个**从 $1$ 出发到所有 F-代数的态射:

$$
\text{Init}(F) = (Fix\ F, \text{in}) \quad \text{其中} \quad \text{in}: F(\text{Fix}\ F) \to \text{Fix}\ F
$$

Haskell 实现:

```haskell
newtype Fix f = Fix { unFix :: f (Fix f) }

-- 初始代数的同构
inF :: Functor f => f (Fix f) -> Fix f
inF = Fix

outF :: Functor f => Fix f -> f (Fix f)
outF = unFix
```

**catamorphism** = 初始代数到任意 F-代数的唯一态射:

```haskell
cata :: Functor f => (f a -> a) -> Fix f -> a
cata alg = alg . fmap (cata alg) . outF
```

### 13.8.4 Lambek 引理

>**Lambek 引理**: 初始代数的 $\text{in}$ 是同构。
即 $\text{out} \circ \text{in} = \text{id}_{F(\text{Fix}\ F)}$。

这给递归类型一种**"自指同构"** 的语义: 展开 + 折叠 = 自己。

### 13.8.5 F-Coalgebra

对偶地, **F-余代数**是 $(A, f: A \to F(A))$。"展开"一步。

**最终余代数**对应"无限展开" (如 `Stream`):

```haskell
data StreamF a r = ConsF a r
  deriving Functor

-- Stream a = Fix (StreamF a) 是初始代数
-- 但"无限 stream"是 StreamF a 的最终余代数 (coinductive)
```

**anamorphism** = 任意 F-余代数到最终余代数的态射:

```haskell
ana :: Functor f => (a -> f a) -> a -> Fix f
ana coalg = inF . fmap (ana coalg) . coalg
```

### 13.8.6 Hylomorphism

hylo = cata + ana: 展开 + 折叠 = 编译器

```haskell
hylo :: Functor f => (f b -> b) -> (a -> f a) -> a -> b
hylo alg coalg = cata alg . ana coalg
```

**fusion law**: hylo 内的中间结构可被消除(如果 alg 与 coalg 配合):

$$
\text{cata}\ alg \circ \text{ana}\ coalg = \text{cata}\ alg' \quad \text{当 alg 与 coalg 配对时}
$$

这是 deforestation 优化的理论基础。

## 13.9 思考题

1. 证明 $(\textbf{Set}, \times, 1)$ 是对称幺半范畴。
2. 证明 `Maybe` 在 `Hask` 上是 monad。
3. 写出 `free : Identity a -> Free f a` 与 `retract :: Free f a -> f a` 的形式,验证伴随律。
4. 解释 "- × B ⊣ (-)^B" 的具体含义(在 Hask 中如何实例化)。
5. 用 CoYoneda 重写 `fmap` 证明 Functor 律很简单。

## 13.10 小结

- 范畴: 对象 + 态射 + 复合 + 单位。
- 函子: 范畴之间的映射,保结构。
- 自然变换: 函子之间的态射,保分量。
- 极限/余极限: 通用结构(积/余积/指数/初代数)。
- F-代数 / F-余代数: 递归与共递归的代数化(cata / ana / hylo)。
- 伴随: 两个函子之间的"等价"。
- Yoneda: 函子由其"可命态射" 决定。

下一章是 Comonad 和对偶性。
