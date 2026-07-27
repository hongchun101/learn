-- |
-- = 第十三章 — ST、FFI 速记与 TemplateHaskell 速记 =
--
-- 三个“专家级”主题：
--
-- 1. ST Monad：原地修改、外部表现仍为纯的算法。`runST`
--    利用参数化性保证状态始终局限于内部。
--
-- 2. FFI：`foreign import` 行的写法。这里仅展示一个“速记”，
--    因为在学习项目中实际调用 libc 会让构建复杂化。
--
-- 3. TemplateHaskell：分阶段元编程。库中默认**不**启用
--    TH（这样构建就不需要 `template-haskell` 包）。可在本地
--    取消下方 LANGUAGE pragma 块的注释进行试验。
--
-- `runST` 是“ST 是严格限定作用域的 `STRef` 版本”的经典范例。
-- 它的返回类型：
--
--     runST :: (forall s. ST s a) -> a
--
import           Data.Array.ST                (STArray, newListArray, readArray, writeArray, getElems)
  -- Foreign 语法以内联方式展示，速记无需实际导入。
import qualified Data.ByteString              as B
import qualified Data.ByteString.Char8        as BC

-- * 基于 ST 的原地修改。

-- | 底层通过变更来求列表之和；结果是纯的。
sumArrayPure :: [Int] -> Int
sumArrayPure xs = runST $ do
  ref <- newSTRef 0
  mapM_ (\x -> modifySTRef' ref (+ x)) xs
  readSTRef ref

-- | 运行一次原地 `STArray` 变更并读回内容。
--   演示 `runST` 如何隐藏变更。
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

-- * FFI 速记。

-- | 这里**不**以链接到 libc 的方式导入 `foreign import ccall`，
-- 取而代之，只用一个“虚构的”符号展示语法，以保证构建可移植。
-- 若要实际链接，请添加 `template-haskell` 等并取消以下注释：
--
--   foreign import ccall unsafe "my_c_getpid"
--     c_getpid :: CInt -> CInt
--
-- 运行 `stack ghci Expert.hs` 以加载并检查类型。

-- | FFI 类型签名的 Type 形态速记。
ffiSketchType :: String
ffiSketchType = "foreign import ccall unsafe \"...\" :: CInt -> CInt"

-- * TemplateHaskell — 默认禁用。启用后可以这样写：
--
--   {-# LANGUAGE TemplateHaskell #-}
--   import Language.Haskell.TH
--   -- $(someTH) 会拼接一个生成的 AST。
--
-- 构建保持 `Expert` 不含 TH，因此 `stack build` 永远不需要
-- `template-haskell` 包。可在本地重新启用以进行探索。

-- * ByteString 内部机制。

-- | 低成本的长度计数（用于说明，与 `B.length` 相同）。
bsLen :: B.ByteString -> Int
bsLen = B.length

-- | ByteString 前 N 个字节，以 String 返回。
bsPrefix :: B.ByteString -> String
bsPrefix = BC.unpack . BC.take 4

-- * 导出的演示。

expert :: IO ()
expert = do
  putStrLn "-- expert"
  putStrLn $ "sumArrayPure [1..10]        = " <> show (sumArrayPure [1..10])
  putStrLn $ "reverseInPlace [1..5]       = " <> show (reverseInPlace [1..5 :: Int])
  putStrLn $ "bsLen \"haskell\"            = " <> show (bsLen (BC.pack "haskell"))
  putStrLn $ "bsPrefix \"haskell\"         = " <> show (bsPrefix (BC.pack "haskell"))
  putStrLn $ "ffiSketchType               = " <> ffiSketchType
