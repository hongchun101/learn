# 第 17 章  性能与严格性

> 读完本章,你将理解 Haskell / PureScript / OCaml 中性能的关键点:惰性 vs. 严格、thunk、融合、尾递归与 unfolding。

## 17.1 惰性 vs. 严格

### 17.1.1 严格语言

```haskell
-- 严格语言: 参数立即求值
f x y = x + 1
f (1/0) 5  -- 立即报错
```

### 17.1.2 惰性语言

```haskell
-- Haskell: thunk 在用到时才求值
fst (1/0, 5) -- 不报错,因为 1/0 没被用
```

惰性 = "能少算就少算",带来:
- 无限结构 `[1..]`
- 短路优化
- 模块化组合

代价:
- thunk 内存开销
- 难以预测

## 17.2 thunk

```haskell
-- 表达式未求值时是 thunk
xs :: [Int]
xs = [1..10^9]  -- 不会分配 10^9 个 node, 只是一个 generator

take 5 xs  -- 只取 5 个
```

### 17.2.1 thunk 链

```haskell
-- 越长,内存越大
-- sum [1..n] 中的 thunk 链
```

### 17.2.2 WHNF (Weak Head Normal Form)

```haskell
-- :sprint 在 ghci 中看 thunk
let x = 1 + 2
:sprint x   -- x = _       (thunk)
let y = x * 3
:sprint x   -- x = 3       (因为内部用到了)
```

## 17.3 严格性

### 17.3.1 seq

```haskell
seq :: a -> b -> b
seq x y = case x of _ -> y
```

强制求 $x$ 到 WHNF,但不返回它的值。

### 17.3.2 $!

```haskell
-- x `seq` y 的中缀
f $! x y = x `seq` (f x y)
```

强制求 $x$ 后传给 $f$。

### 17.3.3 bang pattern

```haskell
{-# LANGUAGE BangPatterns #-}

sumList :: Num a => [a] -> a
sumList = go 0
  where
    go !acc []     = acc
    go !acc (x:xs) = go (acc + x) xs
```

强制 `acc` 立即求值,避免 thunk 累积。

### 17.3.4 strict data

```haskell
data SPair a b = SPair !a !b
```

构造时强制求值字段。

## 17.4 常用的严格版本

```haskell
-- Data.List
foldl'    -- 严格左折叠, 防止 thunk 累积

-- Control.DeepSeq
deepseq   -- 求到 NF (normal form)
force     -- :: NFData a => a -> a
```

### 17.4.1 NFData

```haskell
class NFData a where
  rnf :: a -> ()
  -- 求 a 到 normal form

instance NFData Int where
  rnf x = x `seq` ()
```

```haskell
import Control.DeepSeq
force $ sum [1..10^6]  -- 求到 NF
```

## 17.5 折叠方向

```haskell
foldr f z [1,2,3] = f 1 (f 2 (f 3 z))   -- 右边起来
foldl f z [1,2,3] = f (f (f z 1) 2) 3   -- 左边起来
```

- `foldr` 在很多结构上更自然
- `foldl'` 后向, 严格、增量

```haskell
sum    = foldl' (+) 0
length = foldl' (\a _ -> a + 1) 0
```

### 17.5.1 尾递归

```haskell
-- 尾递归
sumAcc :: Num a => [a] -> a -> [a] -> a
sumAcc !acc []     !_ = acc
sumAcc !acc (x:xs) !ys = sumAcc (acc + x) xs ys
```

GHC 编译为 `while` 循环,空间 O(1)。

## 17.6 融合 (Deforestation)

### 17.6.1 思想

```haskell
map f (map g xs) = map (f . g) xs
```

但并不是所有中间结构都能被消除。

### 17.6.2 stream fusion

```haskell
-- Data.List 用了 build / foldr fusion
-- 但仍然有限制

-- vector 的 stream fusion 更快
import qualified Data.Vector as V
import qualified Data.Vector.Generic as VG

VG.map f (VG.map g xs) = VG.map (f . g) xs  -- 实际上还能融合
```

### 17.6.3 链式 fold

```haskell
sum . map (+1) . filter even
```

如果中间结构是双向指针或 thunk,中间层可以省。

### 17.6.4 unfoldr / build

```haskell
build :: (forall b. (a -> b -> b) -> b -> b) -> [a]
build g = g (:) []

-- GHC 用 build+fuse 优化
-- 比如 map f . map g = map (f.g)
```

## 17.7 数组 vs. 列表

```haskell
-- 列表: cons 单链表,O(1) head, O(n) 随机
-- Vector: 32-way trie, O(log n) 随机
-- Seq: finger tree, O(log n)
-- Array: 字节数组
```

| 容器 | 长度 | 索引 | cons | update |
|------|------|------|------|--------|
| [] | O(n) | O(n) | O(1) | O(n) |
| Vector | O(1) | O(1) | O(log n) | O(log n) |
| Seq | O(1) | O(log n) | O(log n) | O(log n) |
| Array | O(1) | O(1) | O(n) | O(n) |

## 17.8 Boxed vs. Unboxed

```haskell
-- boxed: 任何 Haskell 值
data Box = Box Int

-- unboxed: 不带 thunk
data U = MkU Int#  -- 注意后缀 #

-- 数字 unboxed: Int#, Word#, Double#
```

`Int#` 是机器字,`Int` 是 boxed,可 thunk 可 heap。

## 17.9 性能分析

### 17.9.1 ghc profiling

```bash
+RTS -p -RTS
+ ghc-profiteur
```

### 17.9.2 严格性分析

GHC 用 demand analysis 推断严格性:

```haskell
-- strictness 类型: S = strict, L = lazy
-- f :: (S, S) -> S
```

### 17.9.3 GHC 优化开关

```
-O0    -- none
-O1    -- basic
-O2    -- more
-O2 -fllvm
```

## 17.10 实战 Tips

### 17.10.1 列表 + strict

```haskell
import Data.List (foldl')

sumList :: Num a => [a] -> a
sumList = foldl' (+) 0
```

### 17.10.2 Text vs. String

```haskell
import qualified Data.Text as T
import qualified Data.Text.IO as TIO

-- Text 是字节数组
-- String 是 [Char]
-- Text 性能好数十倍
```

### 17.10.3 ByteString

```haskell
import qualified Data.ByteString as BS
import qualified Data.ByteString.Char8 as BS8

-- 原始字节
```

### 17.10.4 vector

```haskell
import qualified Data.Vector as V
import qualified Data.Vector.Unboxed as VU

-- 大量数值计算用 Vector
```

## 17.11 思考题

1. 解释 `1 + 2 : _` 在 ghci 中 `:sprint` 后是 `3 : _`。
2. 写一个 `foldl'` 比 `foldl` 快 10x 的例子。
3. 解释 `seq` 与 `$!` 的区别。
4. 写一个 Stream Fusion 的等价 `build` 例子。
5. 解释 Text 处理为何比 String 快。

## 17.12 小结

- 惰性是 FP 的核心;严格是工具。
- `seq`, `$!`, `BangPatterns`, `strict data` 强制求值。
- `foldl'` 严格, `foldr` 惰性。
- 数组、Vector、Text 比 列表 / String 性能高一个量级。
- 融合: GHC 会自动消除某些中间结构。

下一章:基于性质的测试。
