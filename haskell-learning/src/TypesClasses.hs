-- |
-- = 第四章 — 类型类、data、newtype、type =
--
-- * `data` 用于引入一个**代数数据类型**——由乘积类型组成的求和。
-- * `newtype` 是一个零成本包装：在运行时它就是内部类型本身。
-- * `type` 是纯粹的同义别名——既不产生新类型，也不增加运行时开销。
-- * `deriving` 调用 GHC 内置机制，自动为你生成实例。
-- * `class` / `instance` 这一对是**类型类**系统——Haskell 的特设多态。
module TypesClasses where

-- * 一个带有两个构造子的自定义数据类型。
data Shape
  = Circle Double
  | Rectangle Double Double
  deriving (Show, Eq)

-- | 多态函数：对任意 `Show` 实例都适用。
showShape :: Shape -> String
showShape s = "Shape = " <> show s

-- | 对 `data` 构造子进行模式匹配。
area :: Shape -> Double
area (Circle r)        = pi * r * r
area (Rectangle w h)   = w * h

-- * `newtype` 在运行时隐藏外层包装。常用于给那些没有所需实例的类型
--   挂上类型类实例（例如 `newtype Age = Age Int`）。
newtype Age = Age Int deriving (Show, Eq, Ord)

age :: Int -> Age
age n | n < 0     = error "age must be non-negative"
      | otherwise = Age n

-- * 一个带有两个方法的类型类。
class Describable a where
  describe :: a -> String

-- * 一个手写的实例。
instance Describable Shape where
  describe (Circle r)      = "circle r=" ++ show r
  describe (Rectangle w h) = "rect " ++ show w ++ "x" ++ show h

instance Describable Age where
  describe (Age n) = "age " ++ show n

-- * `type` 是同义别名。运行时不会产生新类型。
type Person = (String, Age)     -- 例如 ("Alice", Age 30)

describePerson :: Person -> String
describePerson (name, ag) = name ++ " (" ++ describe ag ++ ")"

-- | 一个对"标签"类型泛化的小数据类型，便于调用方自行选择
--   `String` 或 `T.Text` 等。
data Item label = Item { labelOf :: label, itemQty :: Int }
  deriving (Show, Eq)

mkItem :: label -> Int -> Item label
mkItem = Item

-- * 递归的代数数据类型。
data Tree a
  = Leaf a
  | Branch (Tree a) (Tree a)
  deriving (Show, Eq)

treeDepth :: Tree a -> Int
treeDepth (Leaf _)         = 1
treeDepth (Branch l r)     = 1 + max (treeDepth l) (treeDepth r)

-- | 演示。

typesClasses :: IO ()
typesClasses = do
  putStrLn "-- type classes"
  let s = Circle 2.0
  putStrLn $ "showShape (Circle 2)   = " <> showShape s
  putStrLn $ "area s                 = " <> show (area s)
  putStrLn $ "describe (Rectangle 1 2) = " <> describe (Rectangle 1 2)
  putStrLn $ "describe (Age 30)       = " <> describe (Age 30)
  putStrLn $ "describePerson (\\\"Alice\\\", Age 30) = "
          <> describePerson ("Alice", Age 30)
  putStrLn $ "treeDepth (1/2/3)      = "
          <> show (treeDepth (Branch (Leaf 1) (Branch (Leaf 2) (Leaf 3))))
