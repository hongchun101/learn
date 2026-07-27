-- | 一个小型、端到端的 Haskell 程序，把几章的内容
-- 组合在一起。故意保持简单 —— 生产级通常会使用
-- `optparse-applicative` 或 `megaparsec`。
--
--   * 命令行参数（第 08 章）
--   * 对行进行纯数据处理（第 02 + 05 章）
--   * 基于 Either 的错误处理（第 07 章）
--
-- 通过 `stack ghci examples/Cli.hs` 构建，或者走相同的
-- `stack build` 流程进行编译。
module Main where

import           System.Environment (getArgs)
import qualified Data.Map.Strict    as Map

-- | 简易 CSV 行：按逗号切分的*未加引号的*字段列表。
type Row = [String]

-- | 朴素的一行一逗号切分器。并非工业级。
parseCsv :: String -> [Row]
parseCsv = map splitComma . lines

splitComma :: String -> Row
splitComma s =
  let (h, t) = break (== ',') s
  in case t of
       []       -> [h]
       (_:rest) -> h : splitComma rest

-- | 对每行第 `c` 列的整数求和。
columnSum :: Int -> [Row] -> Int
columnSum c = sum . map (\row -> read (row !! c) :: Int)

-- | 第 `c` 列取值的频次映射。
columnFreq :: Int -> [Row] -> Map.Map String Int
columnFreq c rows =
  Map.fromListWith (+) (map (\row -> (row !! c, 1)) rows)

-- | 基于 Either 的运行器。
runCli :: IO ()
runCli = do
  args <- getArgs
  case args of
    [mode, n, src] -> case runCmd mode (read n) src of
      Left  e    -> putStrLn ("error: "  <> e)
      Right out  -> putStrLn out
    _ -> putStrLn "usage: cli {sum|freq} <colIndex> <csv-string>"

runCmd :: String -> Int -> String -> Either String String
runCmd "sum"  c s = Right (show (columnSum  c (parseCsv s)))
runCmd "freq" c s = Right (unlines
                       [ k <> "\t" <> show v
                       | (k, v) <- Map.toList (columnFreq c (parseCsv s))
                       ])
runCmd m    _ _  = Left ("unknown command: " <> m)

-- | 演示入口。
main :: IO ()
main = runCli
