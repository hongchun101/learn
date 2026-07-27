-- |
-- = 第六章 — Functor、Applicative 与校验 =
--
-- 三个阶段：`Functor`（单次带效果变换）、
-- `Applicative`（在结构中合并相互独立的效果）、
-- `Monad`（串行化相互依赖的效果）。
--
-- 类层级
--   class Functor f     where fmap              :: (a -> b) -> f a -> f b
--   class Functor f =>  Applicative f where
--                     pure :: a -> f a
--                     (<*>) :: f (a -> b) -> f a -> f b
--
-- 校验是 `Applicative` 的典型甜点场景：
-- "运行所有检查；一次性收集所有错误。"这正是
-- `Validation` / `Either` 的用途。`Monad`（下一章会介绍）在这里
-- 不合适，因为它会在遇到第一个 `Left` 时短路。
module FunctorsApplicatives where

import           Control.Applicative   ((<*), (*>), (<$))
import           Data.List              (zipWith)

-- | 为一个微小的二叉树实现 `Functor` 实例，刻意让定律一目了然：
--   `fmap id = id` 与 `fmap (f . g) = fmap f . fmap g`。
data Tree a = Leaf a | Branch (Tree a) (Tree a)
  deriving (Show, Eq)

instance Functor Tree where
  fmap f (Leaf x)       = Leaf (f x)
  fmap f (Branch l r)   = Branch (fmap f l) (fmap f r)

-- | 本实例同样要满足定律：`pure id <*> v = v` 与
--   `pure (.) <*> u <*> v <*> w = u <*> (v <*> w)`。
instance Applicative Tree where
  pure x                  = Leaf x
  (Leaf f)       <*> t    = fmap f t
  (Branch l r)   <*> t    = Branch (l <*> t) (r <*> t)

-- | 使用 Either 实现的"表单式"校验。每一步都贡献**并行**的失败信息——
--   针对这种模式优先选择 Applicative 而非 Monad，正是教科书上的经典理由。
checkName :: String -> Either [String] String
checkName []   = Left ["name empty"]
checkName s
  | length s < 2  = Left ["name too short"]
  | length s > 30 = Left ["name too long"]
  | otherwise     = Right s

checkAge :: Int -> Either [String] Int
checkAge a
  | a < 0       = Left ["age < 0"]
  | a > 150     = Left ["age > 150"]
  | otherwise   = Right a

data Person = Person String Int deriving (Show)

-- | 合并相互独立的校验：每个 `Either [String]` 都被独立检查——
--   失败信息会**累积**，而不是短路。
validatePerson :: String -> Int -> Either [String] Person
validatePerson n a =
  (\name age -> Person name age) <$> checkName n <*> checkAge a

-- | 将同一操作并行施加到多个值上：
--   `zipWith` 本质上就是列表上的 `liftA2 (-)`，属于 Applicative 行为。
importsFrom :: [String] -> [String] -> [String]
importsFrom mods names = zipWith modThenName mods names
  where
    modThenName m n = m ++ "." ++ n

-- | `replace` 展示了 `(<$) :: a -> f b -> f a` 可以让一个常量
--   填充结构中的每一个位置。
replace :: Functor f => b -> f a -> f b
replace = (<$)

-- | 演示。

functorsApplicatives :: IO ()
functorsApplicatives = do
  putStrLn "-- functor & applicative"
  let t = Branch (Leaf 1) (Branch (Leaf 2) (Leaf 3))
  putStrLn $ "fmap (*10) t        = " <> show (fmap (* 10) t)
  putStrLn $ "pure (+1) <*> t     = " <> show ((pure (+ 1) :: Tree (Int -> Int)) <*> t)
  putStrLn $ "validatePerson \"Bo\" 12 = " <> show (validatePerson "Bo" 12)
  putStrLn $ "validatePerson \"\" 12   = " <> show (validatePerson "" 12)
  putStrLn $ "validatePerson \"Bo\" 200 = " <> show (validatePerson "Bo" 200)
  putStrLn $ "importsFrom [a,b] [c,d]   = " <> show (importsFrom ["a","b"] ["c","d"])
  putStrLn $ "replace 0 (Just \"hi\")    = " <> show (replace (0 :: Int) (Just ("hi" :: String)))
