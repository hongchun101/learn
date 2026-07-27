-- | 走查每一章的演示运行器。
--
-- 通过 `stack run haskell-learning-demo`（或 `cabal v2-run
-- haskell-learning-demo`）运行。输出故意保持简短，
-- 看起来更像是一份走查，而不是大段日志。
--
-- 如果想做更深入的实验，可以使用 `stack ghci src/Basics.hs` 并
-- 交互式地探查各个绑定。

module Main (main) where

import           Basics                 (basics)
import           ListsStrings           (listsStrings)
import           HigherOrder            (higherOrder)
import           TypesClasses           (typesClasses)
import           MonoidsFoldable        (monoidsFoldable)
import           FunctorsApplicatives   (functorsApplicatives)
import           MonadsTransformers     (monadsTransformers)
import           IOChapter             (ioChapter)
import           Parsing                (parsing)
import           Concurrency            (concurrency)
import qualified Advanced               as Adv
import qualified Expert                 as Exp

import           Control.Exception      (SomeException, catch)
import           System.IO              (hPutStrLn, stderr)

chapter :: String -> IO () -> IO ()
chapter tag body = do
  putStrLn ("\n=== " <> tag <> " ===")
  body

-- 一个用于吞掉*预期*异步 / 运行时异常的包裹器，使得走查
-- 不会因为首次配置错误而中止。真实的应用应该
-- 捕获具体的异常类型 —— 不要盲目地捕获 `SomeException`。
safeRun :: String -> IO () -> IO ()
safeRun label act =
  catch act handler
  where
    handler :: SomeException -> IO ()
    handler e = hPutStrLn stderr ("(" <> label <> " suppressed: " <> show e <> ")")

main :: IO ()
main = do
  chapter "01. Basics"                basics
  chapter "02. Lists & Strings"       listsStrings
  chapter "03. Higher Order"          higherOrder
  chapter "04. Type classes"          typesClasses
  chapter "05. Monoid & Foldable"     monoidsFoldable
  chapter "06. Functor & Applicative" functorsApplicatives
  chapter "07. Monad & Transformers"  monadsTransformers
  chapter "08. IO"                    (safeRun "08. IO" ioChapter)
  chapter "09. Parsing"               parsing
  -- 并发是可选的：它会派生线程并可能并行打印，
  -- 当你好奇时再运行。如果任何
  -- 交互回调抛出异常，safeRun 会保持菜单继续运行。
  chapter "10. Concurrency"           (safeRun "10. Concurrency" concurrency)
  chapter "12. Advanced (GADTs/...)"  Adv.advanced
  chapter "13. Expert (ST/FFI/TH)"    Exp.expert
