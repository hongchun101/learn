-- |
-- = 第九章 — 解析器组合子 =
--
-- 实际的 Haskell 代码库使用 `megaparsec`、`parsec` 或
-- `attoparsec`。我们构建一个**最小**的组合子库，来
-- 揭示这些库的工作方式：
--
--    newtype Parser a = Parser { runParser :: String -> Maybe (a, String) }
--
-- 解析器是一个函数：从剩余输入出发，结果要么是“未消费输入 / 无结果”，
-- 要么是“（匹配的值，剩余部分）”。组合子让我们可以将小解析器组合成大解析器。
--
-- 生产级解析器会用 `Either ParseError`（megaparsec）替换 `Maybe`，
-- 或累积诊断位置；我们保持其教学性质。
module Parsing where

import           Control.Applicative  ((*>), (<*), (<$))
import           Data.Char            (isDigit, isSpace, isLetter)

newtype Parser a = Parser
  { runParser :: String -> Maybe (a, String)
  } deriving (Functor)

instance Applicative Parser where
  pure a = Parser $ \s -> Just (a, s)
  Parser f <*> Parser xa =
    Parser $ \s ->
      do (g, s1)  <- f s
         (a,  s2) <- xa s1
         pure (g a, s2)

instance Monad Parser where
  return = pure
  Parser m >>= k = Parser $ \s ->
    do (a, s1) <- m s
       runParser (k a) s1

instance Alternative Parser where
  empty   = Parser (const Nothing)
  Parser p <|> Parser q =
    Parser $ \s -> p s <|> q s

-- * 基础解析器。

-- | 仅当下一个字符匹配谓词时成功。
satisfy :: (Char -> Bool) -> Parser Char
satisfy p = Parser $ \s -> case s of
  (x:xs) | p x -> Just (x, xs)
  _            -> Nothing

-- | 匹配字面字符串。
string :: String -> Parser String
string []      = pure []
string (c:cs)  = satisfy (== c) >>= \x -> (x :) <$> string cs

-- | 将函数映射到结果上。
(<$$>) :: (a -> b) -> Parser a -> Parser b
f <$$> p = fmap f p

-- | 读取一个数字。构成基础整数解析器。
digit :: Parser Int
digit = (\c -> fromIntegral (fromEnum c - fromEnum '0'))
     <$$> satisfy isDigit

-- | 自然数。
natural :: Parser Int
natural = foldl (\n d -> 10*n + d) 0 <$> (some digit)

-- | 跳过空白字符。
skipSpaces :: Parser ()
skipSpaces = () <$ many (satisfy isSpace)

-- * 带诊断信息的结果类型。

data ParseErr = ParseErr { errMsg :: String }
  deriving (Show)

runParser' :: Parser a -> String -> Either ParseErr (a, String)
runParser' p s =
  case runParser p s of
    Just r               -> Right r
    Nothing              -> Left (ParseErr "parse failed")

-- * 一个演示解析器：解析 `123`，后面跟着可选空格，
--   捕获该数字。

parseGreeting :: Parser Int
parseGreeting = do
  skipSpaces
  natural

-- | 更高层：解析正整数并生成其立方。
parseCube :: Parser Int
parseCube = do
  skipSpaces
  n <- natural
  pure (n*n*n)

-- * 组合可选与必需项。

-- | `optional p` 即使 `p` 失败也会成功，并产生 `Nothing`。
-- | `between open close p` 解析位于两个括号之间的 `p`。
between :: Parser a -> Parser b -> Parser c -> Parser c
between open close p = open *> p <* close

-- | 简单的 K/V 风格解析。
parseKV :: Parser (String, Int)
parseKV = do
  k <- some (satisfy (\c -> c /= '=' && not (isSpace c)))
  skipSpaces
  _ <- string "="
  skipSpaces
  v <- natural
  pure (k, v)

-- | 导出的演示。

parsing :: IO ()
parsing = do
  putStrLn "-- parsing"
  putStrLn $ "digit '5'         = "
          <> show (runParser' digit "5xyz")
  putStrLn $ "natural 123       = "
          <> show (runParser' natural "123xy")
  putStrLn $ "cube 5            = "
          <> show (runParser' parseCube " 5 ")
  putStrLn $ "kv name=7         = "
          <> show (runParser' parseKV "name=7")
