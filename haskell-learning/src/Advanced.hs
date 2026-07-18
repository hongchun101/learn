-- |
-- = Chapter 12 — GADTs, Type Families, Rank-NTypes, existentials
--
-- Three steps of "leveling up":
--
-- * GADT: locally-quantified constructors (refining the return type
--   of `T`).
-- * Type families: type-level functions.
-- * Existentials: hiding a type variable.
--
-- This chapter is *reference-y* by design — read it once to know
-- the shapes, then refer back when you see them in libraries.
module Advanced where

import           Data.Type.Equality  ((:~:)(..), gcastWith)
import           Data.List.NonEmpty  (NonEmpty(..))
import qualified Data.List.NonEmpty  as NE

-- * GADT.

-- | A naive typed AST.
data Exp a where
  EInt :: Int                    -> Exp Int
  EBool :: Bool                  -> Exp Bool
  EPlus :: Exp Int -> Exp Int    -> Exp Int
  EIf :: Exp Bool -> Exp a -> Exp a -> Exp a

-- | Add two well-typed expressions.
eval :: Exp a -> a
eval (EInt n)        = n
eval (EBool b)       = b
eval (EPlus a b)     = eval a + eval b
eval (EIf c t e)     = if eval c then eval t else eval e

-- | The same with simple predicates — leverage the GADT.
isInt :: Exp a -> Maybe Int
isInt e = case e of
  EInt n  -> Just n
  _       -> Nothing

-- * Existentials.

-- | A non-empty list whose element type is hidden inside the
-- `Pretty` interface. Used a lot in source-rewriting compilers.
data AnyShow = forall a. (Show a) => AnyShow a

showAny :: [AnyShow] -> String
showAny xs = unwords (map (\(AnyShow a) -> show a) xs)

-- | `NonEmpty a` is a textbook "existential with `a` exposed".
-- | It's `data NonEmpty a = NonEmpty a (NonEmpty' a)`, where the
-- | tail type is hidden when treating the package as just "some a".

-- * Type families.

-- | A normal family: `Repr Bool = Char`, `Repr Int = Bool` (the
-- | matrix). Pedagogical — uses `TypeFamilies` extension.
type family Repr a where
  Repr Bool = Char
  Repr Int  = Int
  Repr a    = a

-- | A class indexed by a type family.
class ShowRepr a where
  showRepr :: a -> Repr a

instance ShowRepr Bool where
  showRepr b = if b then 'T' else 'F'

instance ShowRepr Int where
  showRepr = show

-- * Rank-N types: putting `forall` inside the type.

-- | A function that works for *any* `a`, for some `a` it picks
-- | earlier — but the caller may pick a different one. The
-- | Rank-2 polymorphism shows up in the ST-related code.
rank2 :: (forall a. a -> a) -> (Bool, Int)
rank2 f = (f True, f (3 :: Int))

-- | `id` has the Rank-2 in its type. Use it as a witness that the
-- | higher-rank polymorphism is required.

-- | `(:~:) :: a :~: b`: a runtime witness that two types are equal.
castInt :: (a :~: Int) -> a -> Int
castInt = gcastWith

-- | The exported demo uses prints for a few primitives.
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
