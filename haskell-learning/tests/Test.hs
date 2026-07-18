-- | Test entrypoint. Run with `stack test` or `cabal v2-test`.
--
-- We keep this minimal: the richest property-based tests are
-- shipped in `src/Testing.hs` (Chapter 11) since that module
-- exists *because* of the testing techniques.
--
-- Other chapters are exercised through the demo executable in
-- `src/Main.hs`. Add a property here only when a particular
-- invariant from a chapter is worth pinning down.
module Main where

import           Test.Tasty
import           Testing  (tastyTests)

main :: IO ()
main = defaultMain $ testGroup "haskell-learning"
  [ testGroup "Chapter 11 — Testing" [ tastyTests ]
  ]
