-- |
-- = Chapter 04 — Type classes, data, newtype, type
--
-- * `data` introduces an **algebraic data type** — a sum of product types.
-- * `newtype` is a zero-cost wrapper: at runtime it is just the inner type.
-- * `type` is a pure synonym — no new type, no new runtime.
-- * `deriving` calls GHC's stock machinery to write instances for you.
-- * The `class` / `instance` pair is the *type-class* system — Haskell's
--   ad-hoc polymorphism.
module TypesClasses where

-- * A custom datatype with two constructors.
data Shape
  = Circle Double
  | Rectangle Double Double
  deriving (Show, Eq)

-- | Polymorphic function: works for whatever `Show`s.
showShape :: Shape -> String
showShape s = "Shape = " <> show s

-- | Pattern-matching the `data` constructors.
area :: Shape -> Double
area (Circle r)        = pi * r * r
area (Rectangle w h)   = w * h

-- * `newtype` hides the wrapper at runtime. Use it to attach class
--   instances to types that don't have them (e.g. `newtype Age = Age Int`).
newtype Age = Age Int deriving (Show, Eq, Ord)

age :: Int -> Age
age n | n < 0     = error "age must be non-negative"
      | otherwise = Age n

-- * A type-class with two methods.
class Describable a where
  describe :: a -> String

-- * A manual instance.
instance Describable Shape where
  describe (Circle r)      = "circle r=" ++ show r
  describe (Rectangle w h) = "rect " ++ show w ++ "x" ++ show h

instance Describable Age where
  describe (Age n) = "age " ++ show n

-- * `type` is a synonym. No new type at runtime.
type Person = (String, Age)     -- e.g. ("Alice", Age 30)

describePerson :: Person -> String
describePerson (name, ag) = name ++ " (" ++ describe ag ++ ")"

-- | A small data-type generic over the type of a "label" so the
-- caller chooses `String` or `T.Text` etc.
data Item label = Item { labelOf :: label, itemQty :: Int }
  deriving (Show, Eq)

mkItem :: label -> Int -> Item label
mkItem = Item

-- * Recursive algebraic data type.
data Tree a
  = Leaf a
  | Branch (Tree a) (Tree a)
  deriving (Show, Eq)

treeDepth :: Tree a -> Int
treeDepth (Leaf _)         = 1
treeDepth (Branch l r)     = 1 + max (treeDepth l) (treeDepth r)

-- | The demo.

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
