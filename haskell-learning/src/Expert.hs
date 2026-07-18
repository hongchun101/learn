-- |
-- = Chapter 13 — ST, FFI sketch, TemplateHaskell sketch
--
-- Three "expert" topics:
--
-- 1. ST monad: in-place, *purely visible* algorithms. `runST`
--    leverages parametricity to guarantee the state stays local.
--
-- 2. FFI: how `foreign import` lines look. We show a *sketch*
--    because actually calling libc from a learning repo complicates
--    the build.
--
-- 3. TemplateHaskell: staged meta-programming. We do **not** enable
--    TH by default in the library (so the build doesn't need the
--    `template-haskell` package). Uncomment the LANGUAGE pragma
--    block below locally to experiment.
--
-- `runST` is the canonical "ST is a strictly-scoped version of
-- `STRef`". Its return type:
--
--     runST :: (forall s. ST s a) -> a
--
import           Data.Array.ST                (STArray, newListArray, readArray, writeArray, getElems)
  -- Foreign syntax is shown inline, no actual import needed for the
  -- sketch.
import qualified Data.ByteString              as B
import qualified Data.ByteString.Char8        as BC

-- * ST-based in-place.

-- | Sum a list by mutation under the hood; result is pure.
sumArrayPure :: [Int] -> Int
sumArrayPure xs = runST $ do
  ref <- newSTRef 0
  mapM_ (\x -> modifySTRef' ref (+ x)) xs
  readSTRef ref

-- | Run an in-place `STArray` mutation and read back the contents.
--   Demonstrates `runST` makes the mutation invisible.
reverseInPlace :: [Int] -> [Int]
reverseInPlace xs = runST $ do
  arr <- newListArray (0 :: Int, length xs - 1) xs
  let n = length xs
  walk arr 0 (n `div` 2) n
  getElems arr
  where
    walk :: STArray s Int Int -> Int -> Int -> Int -> ST s ()
    walk _   _      _   0     = pure ()
    walk _   _      _   1     = pure ()
    walk arr i      mid n =
      if i >= mid
        then pure ()
        else do
          a <- readArray arr i
          let j = n - 1 - i
          b <- readArray arr j
          writeArray arr i b
          writeArray arr j a
          walk arr (i + 1) mid n

-- * FFI sketch.

-- | We do NOT import `foreign import ccall` here in a way that
-- links to libc. Instead, just show the syntax with a *fictional*
-- symbol so the build is portable. To actually link, add
-- `template-haskell` etc. and uncomment:
--
--   foreign import ccall unsafe "my_c_getpid"
--     c_getpid :: CInt -> CInt
--
-- Run `stack ghci Expert.hs` to load and inspect types.

-- | A Type-shaped sketch of the FFI signature.
ffiSketchType :: String
ffiSketchType = "foreign import ccall unsafe \"...\" :: CInt -> CInt"

-- * TemplateHaskell — disabled by default. When enabled, you'd write:
--
--   {-# LANGUAGE TemplateHaskell #-}
--   import Language.Haskell.TH
--   -- $(someTH) splices a generated AST.
--
-- The build keeps `Expert` TH-free so `stack build` never needs
-- the `template-haskell` package. Re-enable locally to explore.

-- * ByteString internals.

-- | Cheap length count (illustrative, identical to `B.length`).
bsLen :: B.ByteString -> Int
bsLen = B.length

-- | First N bytes of a ByteString as a String.
bsPrefix :: B.ByteString -> String
bsPrefix = BC.unpack . BC.take 4

-- * The exported demo.

expert :: IO ()
expert = do
  putStrLn "-- expert"
  putStrLn $ "sumArrayPure [1..10]        = " <> show (sumArrayPure [1..10])
  putStrLn $ "reverseInPlace [1..5]       = " <> show (reverseInPlace [1..5 :: Int])
  putStrLn $ "bsLen \"haskell\"            = " <> show (bsLen (BC.pack "haskell"))
  putStrLn $ "bsPrefix \"haskell\"         = " <> show (bsPrefix (BC.pack "haskell"))
  putStrLn $ "ffiSketchType               = " <> ffiSketchType
