-- |
-- = Chapter 08 — IO, text, ByteString, exceptions
--
-- * `IO a` is the type of "computations that describe interaction
--   with the world."
-- * `getArgs` returns the command-line arguments.
-- * `withFile` opens a file and runs an action on the handle, freeing
--   it on every exit path (including exceptions) via bracket.
-- * `Text` for human-readable Unicode; `ByteString` for raw bytes.
module IOChapter (withFileText, withFileBytes, argc, main', selfWrite,
                  TooBig(..), ensureSmall, tryTooBig, transcode, ioChapter) where

import qualified Data.Text          as T
import qualified Data.Text.IO       as TIO
import qualified Data.ByteString    as B
import qualified Data.ByteString.Char8 as BC
import           System.IO          (withFile, IOMode(..))
import           System.Environment (getArgs)
import           Control.Exception  (IOException, try, evaluate, throwIO, Exception)

-- | Read a file's body via `withFile`. `withFile` itself is the
--   built-in bracket specialised to handles, so all early exits
--   (including async exceptions) free the handle.
withFileText :: FilePath -> (T.Text -> IO a) -> IO a
withFileText path k =
  withFile path ReadMode $ \h -> do
    contents <- TIO.hGetContents h
    k contents

-- | Same for binary.
withFileBytes :: FilePath -> (B.ByteString -> IO a) -> IO a
withFileBytes path k =
  withFile path ReadMode $ \h -> do
    contents <- BC.hGetContents h
    k contents

-- | Number of command-line arguments.
argc :: IO Int
argc = length <$> getArgs

-- | Hello-world CLI: uses `main'`, not `main`. Kept educational.
main' :: IO ()
main' = do
  xs <- getArgs
  case xs of
    [name] -> putStrLn ("hi, " ++ name)
    []     -> putStrLn "hi, mysterious stranger"
    _      -> do
      putStrLn ("got " ++ show (length xs) ++ " args")
      mapM_ (\a -> putStrLn (" -> " ++ a)) xs

-- | Safe write to a sample file (folded into its own scope).
selfWrite :: IO ()
selfWrite = do
  let f = "data/sample-output.txt"
  e <- try (TIO.writeFile f (T.pack "hello from IO chapter\n")
              :: IO ())
  case (e :: Either IOException ()) of
    Right () -> TIO.putStrLn ("wrote: " <> T.pack f)
    Left err -> TIO.putStrLn ("could not write: " <> T.pack (show err))

-- | A typed exception we'll deliberately throw.
newtype TooBig = TooBig { howBig :: Int }
  deriving (Show)

instance Exception TooBig where
  -- Use default methods (toException, fromException).

-- | Force a value to WHNF and throw if it is over the limit.
ensureSmall :: Int -> Int -> IO ()
ensureSmall max n = do
  v <- evaluate n           -- forces `n` to its value
  case compare v max of
    LT -> pure ()
    _  -> throwIO (TooBig v)

-- | Helper: catch TooBig and return Either.
tryTooBig :: IO a -> IO (Either TooBig a)
tryTooBig = try

-- | A simple pretty-printer over Text.
transcode :: T.Text -> T.Text
transcode = T.toLower . T.replace (T.pack ":q") (T.pack "")

-- | The exported demo.
ioChapter :: IO ()
ioChapter = do
  putStrLn "-- io"
  argc' <- argc
  putStrLn $ "argc = " <> show argc'
  putStrLn $ "transcode \"Hello:q\" = " <> show (transcode (T.pack "Hello:q"))
  putStrLn $ "ensureSmall 5 3 = " <> show (tryTooBig (ensureSmall 5 3))
  putStrLn $ "ensureSmall 5 7 = " <> show (tryTooBig (ensureSmall 5 7))
  -- `selfWrite` writes a sample file; safe even if the directory
  -- is read-only.
  selfWrite

