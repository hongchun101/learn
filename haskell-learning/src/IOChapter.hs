-- |
-- = 第八章 — IO、Text、ByteString 与异常 =
--
-- * `IO a` 是“描述与世界交互的计算”的类型。
-- * `getArgs` 返回命令行参数。
-- * `withFile` 打开文件并在句柄上运行动作，通过 bracket 在每条退出路径（包括异常）上释放句柄。
-- * `Text` 用于人类可读的 Unicode；`ByteString` 用于原始字节。
module IOChapter (withFileText, withFileBytes, argc, main', selfWrite,
                  TooBig(..), ensureSmall, tryTooBig, transcode, ioChapter) where

import qualified Data.Text          as T
import qualified Data.Text.IO       as TIO
import qualified Data.ByteString    as B
import qualified Data.ByteString.Char8 as BC
import           System.IO          (withFile, IOMode(..))
import           System.Environment (getArgs)
import           Control.Exception  (IOException, try, evaluate, throwIO, Exception)

-- | 通过 `withFile` 读取文件内容。`withFile` 本身是专用于句柄的
--   内置 bracket，因此所有提前退出（包括异步异常）都会释放句柄。
withFileText :: FilePath -> (T.Text -> IO a) -> IO a
withFileText path k =
  withFile path ReadMode $ \h -> do
    contents <- TIO.hGetContents h
    k contents

-- | 二进制版本。
withFileBytes :: FilePath -> (B.ByteString -> IO a) -> IO a
withFileBytes path k =
  withFile path ReadMode $ \h -> do
    contents <- BC.hGetContents h
    k contents

-- | 命令行参数数量。
argc :: IO Int
argc = length <$> getArgs

-- | 问候世界命令行程序：使用 `main'`，而不是 `main`。保留用于教学。
main' :: IO ()
main' = do
  xs <- getArgs
  case xs of
    [name] -> putStrLn ("hi, " ++ name)
    []     -> putStrLn "hi, mysterious stranger"
    _      -> do
      putStrLn ("got " ++ show (length xs) ++ " args")
      mapM_ (\a -> putStrLn (" -> " ++ a)) xs

-- | 安全写入示例文件（折叠到其自身作用域中）。
selfWrite :: IO ()
selfWrite = do
  let f = "data/sample-output.txt"
  e <- try (TIO.writeFile f (T.pack "hello from IO chapter\n")
              :: IO ())
  case (e :: Either IOException ()) of
    Right () -> TIO.putStrLn ("wrote: " <> T.pack f)
    Left err -> TIO.putStrLn ("could not write: " <> T.pack (show err))

-- | 一个我们将有意抛出的类型化异常。
newtype TooBig = TooBig { howBig :: Int }
  deriving (Show)

instance Exception TooBig where
  -- 使用默认方法（toException、fromException）。

-- | 将值强制到 WHNF，若超过限制则抛出异常。
ensureSmall :: Int -> Int -> IO ()
ensureSmall max n = do
  v <- evaluate n           -- 将 `n` 强制为其值
  case compare v max of
    LT -> pure ()
    _  -> throwIO (TooBig v)

-- | 捕获 TooBig 并返回 Either。
tryTooBig :: IO a -> IO (Either TooBig a)
tryTooBig = try

-- | 对 Text 执行简单的美化打印。
transcode :: T.Text -> T.Text
transcode = T.toLower . T.replace (T.pack ":q") (T.pack "")

-- | 导出的演示。
ioChapter :: IO ()
ioChapter = do
  putStrLn "-- io"
  argc' <- argc
  putStrLn $ "argc = " <> show argc'
  putStrLn $ "transcode \"Hello:q\" = " <> show (transcode (T.pack "Hello:q"))
  putStrLn $ "ensureSmall 5 3 = " <> show (tryTooBig (ensureSmall 5 3))
  putStrLn $ "ensureSmall 5 7 = " <> show (tryTooBig (ensureSmall 5 7))
  -- `selfWrite` 写入示例文件；即使目录为只读也很安全。
  selfWrite

