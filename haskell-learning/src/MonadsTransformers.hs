-- |
-- = Chapter 07 — Monad, do-notation, transformers
--
-- * `Monad` adds sequencing that *depends on the result of the
--   previous step*. The bind `>>=` (and `do`-notation, which desugars
--   to it) is what gives you `;`-like chaining of dependent actions.
--
-- * Common monads in `base`:
--     - `Maybe`, `Either e`, `[]`
--     - `IO` (in `base`)
--     - `Reader r`, `State s` from
--       `Control.Monad.{State, Reader}` (transformers-style)
--
-- * `Monad` short-circuits on `Nothing`/`Left`; for collecting *all*
--   errors, prefer Applicative (see chapter 06).
module MonadsTransformers where

import           Control.Monad.State    (State, evalState, execState, modify, get, runState)
import           Control.Monad.Reader   (Reader, runReader, ask)
import           Control.Monad.Maybe    (MaybeT (..))

-- * `Maybe`-as-monad: `Nothing` short-circuits dependent chains.

-- | Chain division safely.
safeDivide :: Maybe Double -> Double -> Maybe Double
safeDivide (Just x) y
  | y == 0     = Nothing
  | otherwise  = Just (x / y)

-- | Monadic list-comprehension: each `x <- ...` introduces a
--   dependent iteration.
pairs :: [(Int, Int)]
pairs = do
  x <- [1,2,3]
  y <- [10,20]
  pure (x, y)

-- * `State` monad: pure, deterministic stateful computation.

-- | Counter effect.
counter :: State Int Int
counter = do
  modify (+ 1)
  s <- get
  modify (+ 10)
  pure s

-- | A pipeline: read current state, push an updated one.
push :: a -> State [a] ()
push x = modify (++ [x])

-- | A stateful pipeline returning both value and final state.
pipeline :: [Int] -> (Int, [Int])
pipeline s0 = (flip runState) s0 (do
    push 1
    push 2
    modify (+ 1)
    s <- get
    pure s)


-- * `Reader` style: configuration is just an immutable read.

data Env = Env { envUser :: String, envPerms :: [String] }

greetEnv :: Reader Env String
greetEnv = do
  user <- ask
  pure ("hi, " <> user)

-- * Transformers.

-- | `MaybeT m a` is a `Maybe a` *inside* an outer `m`. The outer
--   monad can be `IO`, `State`, `Reader` etc.
lookupOrFail :: Int -> [(Int, String)] -> MaybeT IO String
lookupOrFail k alist = MaybeT (pure (lookup k alist))

-- | Lift an `IO` action into `MaybeT IO`. For monad transformers
--   the canonical helper is `lift`/`liftIO`.
liftIO :: IO a -> MaybeT IO a
liftIO = MaybeT . fmap Just

-- * The demo.

monadsTransformers :: IO ()
monadsTransformers = do
  putStrLn "-- monad & transformers"
  putStrLn $ "safeDivide (Just 10) 2   = " <> show (safeDivide (Just 10) 2)
  putStrLn $ "safeDivide (Just 10) 0   = " <> show (safeDivide (Just 10) 0)
  putStrLn $ "pairs (head 4)           = " <> show (take 4 pairs)
  putStrLn $ "evalState counter 0      = " <> show (evalState counter 0)
  putStrLn $ "execState counter 0      = " <> show (execState counter 0)
  putStrLn $ "pipeline []              = " <> show (pipeline ([] :: [Int]))
  putStrLn $ "runReader greetEnv (Env \\\"hs\\\") = "
          <> show (runReader greetEnv (Env "hs" ["rw","r"]))
  -- IO + Maybe transformer
  res <- runMaybeTIO (lookupOrFail 1 [(1,"alpha"), (2,"beta")])
  putStrLn $ "lookupOrFail 1            = " <> show res
  where
    -- For the demo we run the MaybeT IO as IO.
    runMaybeTIO :: MaybeT IO a -> IO (Maybe a)
    runMaybeTIO (MaybeT m) = m
