-- |
-- = 第十二章 — GADT、类型族、RankNTypes 与存在类型 =
--
-- 三个“进阶”步骤：
--
-- * GADT：局部量化的构造子（细化 `T` 的返回类型）。
-- * 类型族：类型层函数。
-- * 存在类型：隐藏一个类型变量。
--
-- 本章故意采用参考手册的风格——先通读一遍以熟悉
-- 各种形式，之后在库中遇到它们时再回来查阅。
module Advanced where

import           Data.Type.Equality  ((:~:)(..), gcastWith)
import           Data.List.NonEmpty  (NonEmpty(..))
import qualified Data.List.NonEmpty  as NE

-- * GADT。

-- | 一个简单的类型化 AST。
data Exp a where
  EInt :: Int                    -> Exp Int
  EBool :: Bool                  -> Exp Bool
  EPlus :: Exp Int -> Exp Int    -> Exp Int
  EIf :: Exp Bool -> Exp a -> Exp a -> Exp a

-- | 对两个类型良好的表达式求和。
eval :: Exp a -> a
eval (EInt n)        = n
eval (EBool b)       = b
eval (EPlus a b)     = eval a + eval b
eval (EIf c t e)     = if eval c then eval t else eval e

-- | 使用简单谓词完成同样的操作——利用 GADT。
isInt :: Exp a -> Maybe Int
isInt e = case e of
  EInt n  -> Just n
  _       -> Nothing

-- * 存在类型。

-- | 一个非空列表，其元素类型隐藏在 `Pretty` 接口内。
-- 常用于源码重写编译器。
data AnyShow = forall a. (Show a) => AnyShow a

showAny :: [AnyShow] -> String
showAny xs = unwords (map (\(AnyShow a) -> show a) xs)

-- | `NonEmpty a` 是“暴露 `a` 的存在类型”的经典示例。
-- | 它定义为 `data NonEmpty a = NonEmpty a (NonEmpty' a)`，
-- | 当我们只把它当作“某个 a”时，尾部类型会被隐藏。

-- * 类型族。

-- | 一个普通类型族：`Repr Bool = Char`、`Repr Int = Bool`（对应
-- | 矩阵）。用于教学——使用 `TypeFamilies` 扩展。
type family Repr a where
  Repr Bool = Char
  Repr Int  = Int
  Repr a    = a

-- | 一个由类型族索引的类。
class ShowRepr a where
  showRepr :: a -> Repr a

instance ShowRepr Bool where
  showRepr b = if b then 'T' else 'F'

instance ShowRepr Int where
  showRepr = show

-- * Rank-N 类型：将 `forall` 放入类型内部。

-- | 一个对任意 `a` 都有效的函数；它先选取某个 `a`——但调用者
-- | 可以选择另一个。Rank-2 多态会出现在 ST 相关代码中。
rank2 :: (forall a. a -> a) -> (Bool, Int)
rank2 f = (f True, f (3 :: Int))

-- | `id` 的类型中含有 Rank-2。用它作为需要高阶多态的
-- | 见证。

-- | `(:~:) :: a :~: b`：两个类型相等的运行时见证。
castInt :: (a :~: Int) -> a -> Int
castInt = gcastWith

-- | 导出的演示会打印几个原语的结果。
advanced :: IO ()
advanced = do
  putStrLn "-- advanced"
  let _42 = EInt 42
      _tt = EBool True
  putStrLn $ "eval (EInt 42)                = " <> show (eval (EInt 42))
  putStrLn $ "eval (EPlus (EInt 1) (EInt 2)) = " <> show (eval (EPlus (EInt 1) (EInt 2)))
  putStrLn $ "eval (EIf c 1 0)               = " <> show (eval (EIf (EBool True) (EInt 1) (EInt 0)))
  putStrLn $ "isInt (EInt 7)                = " <> show (isInt (EInt 7))
  putStrLn $ "isInt (EBool True)            = " <> show (isInt (EBool True))
  putStrLn $ "showRepr True                 = " <> show (showRepr (True :: Bool))
  putStrLn $ "showRepr (7 :: Int)           = " <> show (showRepr (7 :: Int))
  putStrLn $ "rank2 id                       = " <> show (rank2 id)
