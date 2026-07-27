-- Ch10/Monad.hs
-- 自定义 Monad 例子

-- 1. Maybe Monad
safeDiv :: Int -> Int -> Maybe Int
safeDiv _ 0 = Nothing
safeDiv x y = Just (x `div` y)

chain :: Maybe Int
chain = do
  a <- safeDiv 100 5
  b <- safeDiv a 2
  c <- safeDiv b 4
  return c

-- 2. State Monad
newtype State s a = State { runState :: s -> (a, s) }

instance Functor (State s) where
  fmap f (State g) = State $ \s -> let (a, s') = g s in (f a, s')

instance Applicative (State s) where
  pure a = State $ \s -> (a, s)
  State f <*> State x = State $ \s ->
    let (g, s')  = f s
        (a, s'') = x s'
    in (g a, s'')

instance Monad (State s) where
  State g >>= f = State $ \s ->
    let (a, s') = g s
    in runState (f a) s'

get :: State s s
get = State $ \s -> (s, s)

put :: s -> State s ()
put s = State $ \_ -> ((), s)

modify :: (s -> s) -> State s ()
modify f = State $ \s -> ((), f s)

-- 3. 用 State 实现计数
counter :: State Int Int
counter = do
  modify (+1)
  modify (*2)
  get

-- 运行
main :: IO ()
main = do
  print chain  -- Just 2
  print (runState counter 0)  -- (2, 2)
