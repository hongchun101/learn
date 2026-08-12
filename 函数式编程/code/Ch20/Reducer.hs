-- Ch20/Reducer.hs
-- Reducer 模式: 抽象的 fold

import qualified Data.Map.Strict as Map
import Data.Map.Strict (Map)
import Data.List (foldl')

-- 1. 抽象 Reducer
data Reduce m a b = Reduce
  { initState :: m            -- 初始状态
  , step      :: m -> a -> m  -- 单步更新
  , done      :: m -> b       -- 终止到结果
  }

-- 2. 把 fold 看作 reducer
asReduce :: Monoid m => Reduce m a m
asReduce = Reduce
  { initState = mempty
  , step      = mappend
  , done      = id
  }

-- 3. 跑 reducer
runReduce :: Reduce m a b -> [a] -> b
runReduce r xs = done r (foldl' (step r) (initState r) xs)

-- 4. 词频统计 reducer
wordCount :: Reduce (Map String Int) String (Map String Int)
wordCount = Reduce
  { initState = Map.empty
  , step      = \m w -> Map.insertWith (+) w 1 m
  , done      = id
  }

-- 5. 平均数 reducer
average :: Reduce (Int, Int) Double Double
average = Reduce
  { initState = (0, 0)
  , step      = \(s, n) x -> (s + x, n + 1)
  , done      = \(s, n) -> fromIntegral s / fromIntegral n
  }

-- 6. 用 Reducer 做并发: reducer 是 monoid hom, 可并行
-- 关键定理: 任何 Reduce 都可拆成段并行计算再合并
parallelReduce :: Monoid m
               => Reduce m a m
               -> [a]
               -> m
parallelReduce r = mconcat . map (runReduce r) . chunks 1000
  where
    chunks n = takeWhile (not . null) . map (take n) . iterate (drop n)

-- 7. 演示
main :: IO ()
main = do
  -- 词频
  let text = ["hello", "world", "hello", "haskell", "world", "hello"]
  print (runReduce wordCount text)
  -- fromList [("haskell",1),("hello",3),("world",2)]

  -- 平均数
  print (runReduce average [1.0, 2.0, 3.0, 4.0, 5.0])
  -- 3.0

  -- fold 形式
  print (runReduce asReduce [1 :: Int, 2, 3, 4, 5])
  -- 15
