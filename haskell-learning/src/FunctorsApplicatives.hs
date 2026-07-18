-- |
-- = Chapter 06 — Functor, Applicative, validation
--
-- Three stages: `Functor` (a single effectful transformation),
-- `Applicative` (combining independent effects in a structure),
-- `Monad` (sequencing dependent effects).
--
-- The class hierarchy
--   class Functor f     where fmap              :: (a -> b) -> f a -> f b
--   class Functor f =>  Applicative f where
--                     pure :: a -> f a
--                     (<*>) :: f (a -> b) -> f a -> f b
--
-- Validation is the canonical `Applicative` sweet spot:
-- "run all checks; collect all errors at once." That's
-- `Validation` / `Either`. `Monad` (which we'll see next chapter) is
-- wrong here because it short-circuits on the first `Left`.
module FunctorsApplicatives where

import           Control.Applicative   ((<*), (*>), (<$))
import           Data.List              (zipWith)

-- | A `Functor` instance for a tiny binary tree to make the laws
--   visibly hold: `fmap id = id` and `fmap (f . g) = fmap f . fmap g`.
data Tree a = Leaf a | Branch (Tree a) (Tree a)
  deriving (Show, Eq)

instance Functor Tree where
  fmap f (Leaf x)       = Leaf (f x)
  fmap f (Branch l r)   = Branch (fmap f l) (fmap f r)

-- | Same laws apply here: `pure id <*> v = v` and
--   `pure (.) <*> u <*> v <*> w = u <*> (v <*> w)`.
instance Applicative Tree where
  pure x                  = Leaf x
  (Leaf f)       <*> t    = fmap f t
  (Branch l r)   <*> t    = Branch (l <*> t) (r <*> t)

-- | Form-style validation using Either. Each step contributes
--   *parallel* failure messages — favouring Applicative over Monad for
--   this exact pattern is the textbook reason.
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

-- | Combine independent validations: each `Either [String]` is
--   inspected independently — failures *accumulate*, not short-circuit.
validatePerson :: String -> Int -> Either [String] Person
validatePerson n a =
  (\name age -> Person name age) <$> checkName n <*> checkAge a

-- | Application of the same op across multiple values:
--   `zipWith` is essentially `liftA2 (-)` for lists, which is
--   Applicative behaviour.
importsFrom :: [String] -> [String] -> [String]
importsFrom mods names = zipWith modThenName mods names
  where
    modThenName m n = m ++ "." ++ n

-- | `replace` shows that `(<$) :: a -> f b -> f a` lets a constant
--   fill every slot of the structure.
replace :: Functor f => b -> f a -> f b
replace = (<$)

-- | The demo.

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
