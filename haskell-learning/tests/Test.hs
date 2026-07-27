-- | 测试入口。通过 `stack test` 或 `cabal v2-test` 运行。
--
-- 我们保持这里最小：最丰富的基于属性的测试放在
-- `src/Testing.hs`（第 11 章）中，因为该模块的存在
-- *正是*为了演示各种测试技术。
--
-- 其它章节通过 `src/Main.hs` 中的演示可执行文件
-- 进行演练。只有当某章的某个不变式
-- 值得钉死时，才在此处添加一个属性。
module Main where

import           Test.Tasty
import           Testing  (tastyTests)

main :: IO ()
main = defaultMain $ testGroup "haskell-learning"
  [ testGroup "Chapter 11 — Testing" [ tastyTests ]
  ]
