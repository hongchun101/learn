-- | Demo runner that walks every chapter.
--
-- Run with `stack run haskell-learning-demo` (or `cabal v2-run
-- haskell-learning-demo`). The output is intentionally short so it
-- reads as a tour rather than a wall of logs.
--
-- For deeper experiments use `stack ghci src/Basics.hs` and poke at
-- the bindings interactively.

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

-- A wrapper that swallows *expected* async / runtime exceptions so the
-- tour never aborts on first misconfiguration. Real applications should
-- catch specific exception types — never `SomeException` blindly.
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
  -- Concurrency is opt-in: it forks threads and may print parallelly
  -- — run when curious. safeRun keeps the menu alive if any
  -- interactive callback blows up.
  chapter "10. Concurrency"           (safeRun "10. Concurrency" concurrency)
  chapter "12. Advanced (GADTs/...)"  Adv.advanced
  chapter "13. Expert (ST/FFI/TH)"    Exp.expert
