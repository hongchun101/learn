# 第 2 章  数学基础:集合、代数结构与范畴论预备

> 读完本章,你将掌握阅读本教程后续所有章节所需的数学骨架:集合与函数、偏序、积与和、单子(monoid)与同构等代数结构,以及范畴论最核心的"对象/态射/函子"框架。

## 2.1 集合与函数

### 2.1.1 集合

**集合 (set)** 是无序、无重复元素的整体。记号:

- $A = \{1, 2, 3\}$
- $x \in A$ 表示 $x$ 是 $A$ 的元素
- $\emptyset$ 是空集
- $A \subseteq B$ 是子集
- $A \cup B$ 并,$A \cap B$ 交,$A \setminus B$ 差

### 2.1.2 函数

函数 $f: A \to B$ 是从 $A$ 到 $B$ 的映射,记 $f(x) \in B$ 表示 $x \in A$ 在 $f$ 下的像。

- **定义域**: $A$
- **值域**: $B$(有时也指 $f$ 的实际像集 $\text{im}(f) \subseteq B$)
- **满射 (surjective)**: $\forall b \in B, \exists a, f(a) = b$
- **单射 (injective)**: $f(a) = f(b) \Rightarrow a = b$
- **双射 (bijective)**: 既满又单,记 $f: A \xleftrightarrow{\sim} B$

### 2.1.3 集合运算

- **积 (product)**: $A \times B = \{(a,b) \mid a \in A, b \in B\}$,元素用 $(a, b)$ 投影。
- **和 (sum / disjoint union)**: $A + B = \{ \text{inl}(a) \mid a \in A \} \cup \{ \text{inr}(b) \mid b \in B \}$
- **指称**: $A^B = \{ f \mid f: B \to A \}$,函数构成的集合。
- **幂集**: $\mathcal{P}(A) = \{ B \mid B \subseteq A \}$

> **关键**: $A \times B$ 与 $B \times A$ 不同但 $\cong$ 同构;$A + B$ 与 $B + A$ 同构。
> 同样,$A^{B \times C} \cong (A^B)^C$ 是后面柯里化的数学根据。

### 2.1.4 偏序与格

**偏序集 (poset)** $(P, \leq)$: 自反、传递、反对称。

- **上界**: $u$ 使得 $\forall x \in P, x \leq u$
- **最小上界 (join)**: $x \sqcup y = \inf\{u \mid x \leq u, y \leq u\}$
- **最大下界 (meet)**: $x \sqcap y = \sup\{l \mid l \leq x, l \leq y\}$

**格 (lattice)**: 同时存在 $\sqcup$ 和 $\sqcap$ 的偏序集。
**完备格**: 每个子集都有交和并。`Bool` 与 `Set A` 是完备格。

## 2.2 代数结构

### 2.2.1 什么是代数结构

**代数结构 = 集合 + 操作 + 律**。

接下来我们要反复见到的"半群 / 单子 / 群 / 环"都是这种结构的命名。

### 2.2.2 半群 (semigroup)

集合 $S$ + 二元运算 $\star: S \times S \to S$ + 一条律:

- **结合律**: $(a \star b) \star c = a \star (b \star c)$

**例**: 字符串拼接 (`+`)、列表拼接 (`++`)、整数加法。

### 2.2.3 单子 (monoid)

半群 + 单位元素 $e$ + 一条律:

- **左单位**: $e \star a = a$
- **右单位**: $a \star e = a$

**例**: 整数加法(单位元素 0)、整数乘法(单位元素 1)、列表拼接(单位元素 `[]`)、字符串拼接(单位元素 `""`)、函数复合(单位元素 `id`)。

**Haskell**:
```haskell
class Semigroup a where
  (<>) :: a -> a -> a
class Semigroup a => Monoid a where
  mempty :: a
```

> **判断 monoid 的关键**: 关联 + 恒等。"结合"是关于"能否重排",恒等是关于"无操作"。

### 2.2.4 群 (group)

monoid + 每元素有逆: $\forall a, \exists a^{-1}, a \star a^{-1} = e$。

**例**: 整数加法、置换矩阵。**反例**: 整数乘法(0 没有逆)。

### 2.2.5 同构 (isomorphism)

两个代数结构 $A, B$ 之间有可逆映射 $f: A \to B$,且 $f$ 和 $f^{-1}$ 都是同态(保运算)。

在 FP 里,我们经常通过同构把问题变形,把一种"已知解法"搬过去。

**例如**: $A \times B \cong B \times A$,所以交换律 `swap` 是双射。

## 2.3 有限域与类型

虽然 FP 大部分不需要域(field)层面的代数,但**布尔代数** 很重要:

```
∧  (and)   ─  单位元 True,  零元 False
∨  (or)    ─  单位元 False, 零元 True
¬  (not)   ─  满足 De Morgan: ¬(a ∧ b) = (¬a) ∨ (¬b)
```

这告诉我们 FP 的 `Bool` 与 `Maybe` 用同一套过滤逻辑。

## 2.4 范畴论 — 起手式

> 范畴论是**代数结构的元语言**。它本身只关心"对象之间的关系",而不是"对象内部是什么"。

### 2.4.1 定义

**范畴 (category) $\mathcal{C}$** 由以下组成:

1. 一族对象 $\text{Ob}(\mathcal{C})$
2. 一族态射 $\text{Hom}(A, B)$,元素 $f: A \to B$
3. 复合 $\circ : \text{Hom}(B, C) \times \text{Hom}(A, B) \to \text{Hom}(A, C)$
4. 每对象有恒等态射 $\text{id}_A: A \to A$

满足:

- **结合律**: $(f \circ g) \circ h = f \circ (g \circ h)$
- **单位律**: $f \circ \text{id}_A = f = \text{id}_B \circ f$

### 2.4.2 几个最重要的例子

```
Set          ─ 对象 = 集合,  态射 = 函数
Hask         ─ 对象 = 类型,  态射 = Haskell 函数
Mon          ─ 对象 = monoid, 态射 = 保运算函数 (monoid homomorphism)
Grp          ─ 对象 = 群,    态射 = 群同态
Pos          ─ 对象 = poset, 态射 = 单调函数
Vect_k       ─ 对象 = 线性空间, 态射 = 线性映射
```

> **Hask 是范畴最大的特例**,但有技术细节(prelude 不安全、底类型),本书用 `Hask` 时仅指"理想情况"。

### 2.4.3 范畴论的语言优势

- **抽象出共性**: "集合"、"类型"、"群"在做"加法/复合"时,遵循同一套律。
- **迁移算法**: 群同态的核可以"原封不动"地映射到 free monoid 上的"形式幂级数"上。
- **给出可构造性证明**: Cat 是发现 monad / comonad / adjunction 的天然场所。

### 2.4.4 几个图形记号

```
                 f
        A ────────────► B
        │              │
        │ g            │ h
        ▼              ▼
        C ────────────► D
                 k
```

交换图: $h \circ f = k \circ g$(沿两条路径的复合相等)。

这是**律**的图形化表达。我们后面证明 Functor law / Monad law / Adjunction 都会用上。

## 2.5 函数式范式与这些对象的关系

```
集合 ─┐
类型 ─┤       (Set / Hask)
代数 ─┼──►  对象(Object)
范畴 ─┘
函数 ─┐
同态 ─┤       (Hom)
态射 ─┘
```

**FP 程序的每个概念都能在这些数学对象上有对应**:

| FP 概念 | 数学对应 |
|---------|----------|
| 类型 | 集合 / 范畴对象 |
| 函数 | 态射 |
| 类型参数 | 函子范畴 $C^D$ |
| Monad | 幺半范畴里的自函子 |
| Functor | 函子 |
| Free Monad | 函子的左伴随 |
| 递归(类型) | 不动点 |

## 2.6 思考题

1. 证明: 若 $f: A \xleftrightarrow{\sim} B$, 则 $f^{-1} \circ f = \text{id}_A$ 且 $f \circ f^{-1} = \text{id}_B$。
2. 证明: $(\text{List}, ++, [])$ 构成 monoid。
3. 写出 `String` 上的 monoid 同态 `length :: String -> Int`,加入 `mempty` 和 `(<>)`。
4. 描出范畴 $\mathcal{C}$ 里有 3 个对象、6 个态射的最小非平凡例子。

## 2.7 小结

- 集合论是 FP 类型论的几何基础。
- 单子(monoid)与结合律是 FP 折叠(`foldMap`)的核心。
- 范畴论是 FP 抽象的母语——第 13 章会深入。
- 律(law)比操作更重要: 律让"为什么这样"成为可论证的命题。
