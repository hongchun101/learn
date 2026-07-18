-- |
-- = Chapter 09 — Parser combinators
--
-- Real Haskell codebases use `megaparsec`, `parsec`, or
-- `attoparsec`. We build a **minimal** combinator library to
-- demystify what those libraries do:
--
--    newtype Parser a = Parser { runParser :: String -> Maybe (a, String) }
--
-- A parser is a function from remaining input to either "didn't
-- consume / no result" or "(matched value, what's left)". Combinators
-- let us compose small parsers into big ones.
--
-- Production-ready parsers replace `Maybe` with `Either ParseError`
-- (megaparsec) or accumulate diagnostic positions; we keep it
-- pedagogical.
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

-- * Primitive parsers.

-- | Succeed only if the next char matches a predicate.
satisfy :: (Char -> Bool) -> Parser Char
satisfy p = Parser $ \s -> case s of
  (x:xs) | p x -> Just (x, xs)
  _            -> Nothing

-- | Match a literal string.
string :: String -> Parser String
string []      = pure []
string (c:cs)  = satisfy (== c) >>= \x -> (x :) <$> string cs

-- | Map a function over the result.
(<$$>) :: (a -> b) -> Parser a -> Parser b
f <$$> p = fmap f p

-- | Take a digit. Forms a basic integer parser.
digit :: Parser Int
digit = (\c -> fromIntegral (fromEnum c - fromEnum '0'))
     <$$> satisfy isDigit

-- | A natural number.
natural :: Parser Int
natural = foldl (\n d -> 10*n + d) 0 <$> (some digit)

-- | Skip whitespace.
skipSpaces :: Parser ()
skipSpaces = () <$ many (satisfy isSpace)

-- * Result type with diagnostic info.

data ParseErr = ParseErr { errMsg :: String }
  deriving (Show)

runParser' :: Parser a -> String -> Either ParseErr (a, String)
runParser' p s =
  case runParser p s of
    Just r               -> Right r
    Nothing              -> Left (ParseErr "parse failed")

-- * A demo parser: parse `123` followed by optional spaces, capture
-- the number.

parseGreeting :: Parser Int
parseGreeting = do
  skipSpaces
  natural

-- | Higher-level: parse a positive integer and produce its cube.
parseCube :: Parser Int
parseCube = do
  skipSpaces
  n <- natural
  pure (n*n*n)

-- * Combine optional and required.

-- | `optional p` succeeds even if `p` fails, yielding `Nothing`.
-- | `between open close p` parses `p` between two brackets.
between :: Parser a -> Parser b -> Parser c -> Parser c
between open close p = open *> p <* close

-- | A simple K/V style parse.
parseKV :: Parser (String, Int)
parseKV = do
  k <- some (satisfy (\c -> c /= '=' && not (isSpace c)))
  skipSpaces
  _ <- string "="
  skipSpaces
  v <- natural
  pure (k, v)

-- | The exported demo.

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
