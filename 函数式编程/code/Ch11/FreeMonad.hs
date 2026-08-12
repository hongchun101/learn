-- Ch11/FreeMonad.hs
-- Free Monad 示例: 一个最小 Console DSL
-- 需要: cabal install free (或者把 Free 自己实现)

{-# LANGUAGE FlexibleInstances #-}
{-# LANGUAGE DeriveFunctor #-}

-- 1. 标准 Free Monad
data Free f a
  = Pure a
  | Free (f (Free f a))

instance Functor f => Functor (Free f) where
  fmap f (Pure a)  = Pure (f a)
  fmap f (Free fx) = Free (fmap (fmap f) fx)

instance Functor f => Monad (Free f) where
  return = Pure
  Pure a >>= f = f a
  Free fx >>= f = Free (fmap (>>= f) fx)

liftF :: Functor f => f a -> Free f a
liftF fa = Free (fmap Pure fa)

-- 2. Console DSL
data ConsoleF next
  = PutStrLn String next
  | GetLine (String -> next)
  deriving Functor

type ConsoleM = Free ConsoleF

putStrLn' :: String -> ConsoleM ()
putStrLn' s = liftF (PutStrLn s ())

getLine' :: ConsoleM String
getLine' = liftF (GetLine id)

-- 3. 程序
program :: ConsoleM ()
program = do
  putStrLn' "What is your name?"
  name <- getLine'
  putStrLn' ("Hello, " ++ name ++ "!")

-- 4. 解释器: 真 IO
runIO :: ConsoleM a -> IO a
runIO (Pure a) = return a
runIO (Free (PutStrLn s k)) = putStrLn s >> runIO k
runIO (Free (GetLine k))    = getLine >>= runIO . k

-- 5. 解释器: 测试用, 不需要真 IO
runPure :: ConsoleM a -> [String] -> ([String], a)
runPure (Pure a) logs = (reverse logs, a)
runPure (Free (PutStrLn s k)) logs = runPure k (s : logs)
runPure (Free (GetLine k))     logs =
  let fakeName = "TestAlice"
      (ls, a) = runPure (k fakeName) ("<input:" ++ fakeName ++ ">" : logs)
  in (ls, a)

-- 6. 演示
main :: IO ()
main = do
  let (logs, ()) = runPure program []
  putStrLn "Pure (test) run logs:"
  mapM_ putStrLn logs
  -- runIO program
