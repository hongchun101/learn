-- | A small, end-to-end Haskell program that puts several chapters
-- together. Intentionally simple — production grade would use
-- `optparse-applicative` or `megaparsec`.
--
--   * Command-line args (Chapter 08)
--   * Pure data processing over rows (Chapters 02 + 05)
--   * Either-based error handling (Chapter 07)
--
-- Build with `stack ghci examples/Cli.hs`, or compile via the same
-- `stack build` flow.
module Main where

import           System.Environment (getArgs)
import qualified Data.Map.Strict    as Map

-- | Tiny CSV row: a list of *unquoted* fields split by comma.
type Row = [String]

-- | Naïve line-and-comma splitter. Not industrial strength.
parseCsv :: String -> [Row]
parseCsv = map splitComma . lines

splitComma :: String -> Row
splitComma s =
  let (h, t) = break (== ',') s
  in case t of
       []       -> [h]
       (_:rest) -> h : splitComma rest

-- | Sum the integer in column `c` over each row.
columnSum :: Int -> [Row] -> Int
columnSum c = sum . map (\row -> read (row !! c) :: Int)

-- | Frequency map of column `c` values.
columnFreq :: Int -> [Row] -> Map.Map String Int
columnFreq c rows =
  Map.fromListWith (+) (map (\row -> (row !! c, 1)) rows)

-- | Either-based runner.
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

-- | Demo entrypoint.
main :: IO ()
main = runCli
