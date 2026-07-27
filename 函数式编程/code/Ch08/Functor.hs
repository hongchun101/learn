-- Ch08/Functor.hs
-- 自定义 Functor 例子

-- 1. Tree as Functor
data Tree a = Leaf a | Branch (Tree a) (Tree a)
  deriving (Show)

instance Functor Tree where
  fmap f (Leaf x)     = Leaf (f x)
  fmap f (Branch l r) = Branch (fmap f l) (fmap f r)

-- 2. 二叉搜索树 (Maybe Functor)
data BST k v = Empty | Node k v (BST k v) (BST k v)
  deriving (Show)

instance Functor (BST k) where
  fmap _ Empty = Empty
  fmap f (Node k v l r) = Node k (f v) (fmap f l) (fmap f r)

-- 3. 复合 Functor
newtype Wrap f a = Wrap { unWrap :: f a }
  deriving (Show)

instance Functor f => Functor (Wrap f) where
  fmap f (Wrap fa) = Wrap (fmap f fa)

-- 4. 看看 fmap 律
main :: IO ()
main = do
  let t1 = Branch (Leaf 1) (Branch (Leaf 2) (Leaf 3))
  print (fmap (+1) t1)  -- Branch (Leaf 2) (Branch (Leaf 3) (Leaf 4))

  let bst = Node "a" 1 Empty (Node "b" 2 Empty Empty)
  print (fmap (*10) bst)

  -- 律的 sanity check
  print (fmap id t1 == id t1)  -- True
  print (fmap (+1) (fmap (*2) t1) == fmap ((+1) . (*2)) t1)  -- True
