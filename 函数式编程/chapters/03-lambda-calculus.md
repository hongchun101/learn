# 第 3 章  λ-演算:函数式编程的源头

> 读完本章,你将理解:λ-演算的语法、归约机制、Church 编码、组合子与不动点。本章是 FP 理论的心脏——理解它,你就理解了 Haskell / PureScript / Scheme / Lisp / ML 共同根。

## 3.1 三个 syntactic 形式

λ-演算的语法只有三条:

$$
\begin{aligned}
e \quad ::= \quad & x                  & \text{— 变量} \\
                  \mid\ & \lambda x.\, e& \text{— 抽象} \\
                  \mid\ & e \ e          & \text{— 应用}
\end{aligned}
$$

仅此而已。其他一切——布尔、整数、列表、递归、类型——都通过这三种形式表达。

### 3.1.1 约定

- **结合**: $a\ b\ c$ 等于 $(a\ b)\ c$(左结合)
- **作用域**: $\lambda x. e$ 中 $x$ 存在于 $e$ 内部

**变量绑定**:
- `λx. x` 中的 `x` 是被绑定的
- `λx. λy. x y` 中 `x` 在外层被绑定,在内层被引用

**自由变量**: $FV(e)$ 是 $e$ 中不被任何 $\lambda$ 绑定的变量。闭项 (closed term) 即 $FV(e) = \emptyset$,也叫**组合子**。

### 3.1.2 第一个例子

```
identity  ≡ λx. x
apply     ≡ λf. λx. f x
```

## 3.2 归约

### 3.2.1 β-归约(β-reduction)

$$
(\lambda x.\, e_1)\ e_2 \ \ \longrightarrow_\beta \ \ e_1[x \mapsto e_2]
$$

即"用 $e_2$ 替换 $e_1$ 中所有 $x$ 的自由出现"。

```
(λx. x) 5   ──β──►  5
(λx. x + 1) 2 ──►  2 + 1 ──► 3
```

### 3.2.2 α-等价(α-equivalence)

绑定变量可以重命名,不影响语义:

$$
\lambda x.\, x \equiv_\alpha \lambda y.\, y
$$

### 3.2.3 η-归约(η-reduction)

$$
\lambda x.\, f\ x \ \ \longrightarrow_\eta \ \ f
$$

如果函数 $f$ 作用于 $x$ 之后再外层 $\lambda x$,这个 $\lambda$ 是冗余的。η-归约是**外延性**的核心。

### 3.2.4 归约策略

| 策略 | 何时归约 | 是否一定终止? |
|------|---------|--------------|
| **全 β-归约 (full β-reduction)** | 任何 redex | 否 |
| **正则序 (normal order)** | 最左最外 | 是(对类型化) |
| **应用序 (applicative order)** | 最左最内 | 否 |

**关键定理**([Barendregt 1984]):

- **Confluence (Church–Rosser)**: 若 $e \twoheadrightarrow e_1$ 且 $e \twoheadrightarrow e_2$,则存在 $e_3$ 使得 $e_1 \twoheadrightarrow e_3$ 且 $e_2 \twoheadrightarrow e_3$。
- **Normalisation (强/弱)**: 是否一定终止 取决于类型系统。

**Haskell 用**: 惰性求值 = 最左最外(正则序近似)。

### 3.2.5 实际情况

```haskell
fst (1+2, 3+4)        -- 1+2 ≈ 3, 3+4 ≈ 7, fst 取前者
-- 严格 (应用序) 仍需计算 3+4
-- 惰性 (正则序)   只算 1+2
```

## 3.3 编码

### 3.3.1 Church 布尔

```
true  ≡ λt. λf. t      -- 接受两个参数,返回第一个
false ≡ λt. λf. f      -- 接受两个参数,返回第二个
```

`if-then-else` 也是函数:

```
if-then-else ≡ λp. λx. λy. p x y
```

于是 `if true then a else b` 是 `true a b` = `(λt. λf. t) a b` = `a`。

**布尔运算**:

```
and = λp. λq. p q p
or  = λp. λq. p p q
not = λp. λa. λb. p b a
```

### 3.3.2 Church 数字

```
c0 = λf. λx. x                    -- 0 次 f
c1 = λf. λx. f x                  -- 1 次 f
c2 = λf. λx. f (f x)              -- 2 次 f
c3 = λf. λx. f (f (f x))          -- 3 次 f
cn = λf. λx. fⁿ(x)
```

> **注意**: 这里的 `c_n` 不是"纸面上的数字 3",而是"把 $f$ 应用 $n$ 次"的算法。

**运算**:

```
succ = λn. λf. λx. f (n f x)
add  = λm. λn. λf. λx. m f (n f x)
mul  = λm. λn. λf. m (n f)        -- 注意区分乘和加的形状
exp  = λm. λn. n m                -- 指数: m^n = n m
isZero = λn. n (λ_. false) true
```

### 3.3.3 Church 对(pair)

```
pair   = λa. λb. λs. s a b       -- 构造
fst    = λp. p true               -- 取出第一个
snd    = λp. p false
```

### 3.3.4 Church 列表

```
nil  = λc. λn. n
cons = λh. λt. λc. λn. c h (t c n)
head = λl. l true (λx. λ_. x)     -- 头部
tail = λl. (λc. λn. λx. ...)     -- 复杂,需要找到正确算法
```

实际工程不直接用 Church 列表,它是 CPU 模拟器,不是日常 FP 工具。

## 3.4 组合子

**组合子** (combinator) = 闭项(无自由变量)。很多历史上的著名组合子:

### 3.4.1 SKI 组合子

```
S = λx. λy. λz. x z (y z)
K = λx. λy. x
I = λx. x
```

**S、K 即可表达一切**:`I = S K K`。

### 3.4.2 Y 组合子 — 不动点

**Y combinator** 是发现递归的关键:

$$
Y\ f = f\ (Y\ f)
$$

最简形式:

```
Y = λf. (λx. f (x x)) (λx. f (x x))
```

**验证**:
```
Y g
= (λf. (λx. f (x x)) (λx. f (x x))) g
= (λx. g (x x)) (λx. g (x x))
= g ((λx. g (x x)) (λx. g (x x)))
= g (Y g)
```

也就是说,在 λ-演算里,**不需要 `rec` / `function` 关键字,递归自然存在**。

**Haskell 里的 Y**:
```haskell
fix :: (a -> a) -> a
fix f = let x = f x in x
```

这是递归的全部"不纯"之源: `let x = f x` 创造一个循环引用,从而让递归合法。

### 3.4.3 其它著名组合子

```
B   = λf. λg. λx. f (g x)         -- composition
C   = λf. λy. λx. f x y           -- flip
W   = λf. λx. f x x               -- dup
S'  = λx. λy. λz. y (x z)         -- bind-sortof
```

## 3.5 λ-演算的等价物

| 命令式 | 函数式 / λ |
|--------|-----------|
| 变量 | 绑定 |
| 循环 | 递归 = Y 组合子 |
| 条件 | Church 布尔 |
| 元组 | Church pair |
| 数组 | Church list / encoded list |
| 异常 | Continuation |
| 状态 | State monad / encodable |
| I/O | Realizability / monad |

## 3.6 算术 vs. 思维

Church 数字是**算法的内嵌**:
- `c_n` 不是"3",而是"应用 3 次 $f$"
- `add` 不是"把两个数字相加",而是"两个 $n$-fold 应用的串接"

这个思维方式就是 FP 的核心:
**程序 = 变换的描述,不是过程的描述**。

## 3.7 把 λ-演算作为通用计算

```haskell
-- 一个最简单的 Haskell λ-演算解释器
data Tm = Var String
        | Lam String Tm
        | App Tm Tm
        deriving (Show, Eq)

fresh :: [String] -> String
fresh used = head ([s | s <- names, s `notElem` used])
  where names = [c:[] | c <- ['a'..'z']] ++ [c:show n | n <- [1..], c <- ['a'..'z']]

-- 省略: substitution, evaluation, normal form
```

## 3.8 思考题

1. 证明 $\alpha$-等价的传递性。
2. 给出 `pred (3)` 的归约序列(假设你实现了 Church 数字的前驱)。
3. 推导 `Y` 组合子。
4. 用 `S` 和 `K` 实现 `I`、`B`、`C`、`W`。
5. 不用 `fix`,只使用纯 λ-演算,实现 `factorial : Int -> Int`(用 Church 数字)。

## 3.9 小结

- λ-演算是 FP 的同义语言。
- 三个 syntactic 形式 + 两条归约 = 全部计算。
- Church 编码揭示"数字 = 迭代", "pair = 标签化二选一"。
- Y 组合子让你无需原生递归就得到递归。
- λ-演算的"思维"延展到类型化版本时,就是 Haskell / ML / Idris 的内核。

下一章开始,我们就从这个元语言升级到"真正的程序语言",把不可变性、纯函数、ADT 一个个钉到工具箱里。
