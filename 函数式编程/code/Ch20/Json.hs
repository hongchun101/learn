-- Ch20/Json.hs
-- 简易 JSON: 教程 Ch20 实战

module Json where

import Data.List (intercalate)

data Json = JNull
          | JBool Bool
          | JNum Double
          | JStr String
          | JArr [Json]
          | JObj [(String, Json)]
  deriving (Show, Eq)

-- 显示
showJson :: Json -> String
showJson JNull         = "null"
showJson (JBool b)     = if b then "true" else "false"
showJson (JNum n)      = show n
showJson (JStr s)      = show s
showJson (JArr xs)     = "[" ++ intercalate "," (map showJson xs) ++ "]"
showJson (JObj kvs)    = "{" ++ intercalate "," (map showKV kvs) ++ "}"
  where
    showKV (k, v) = show k ++ ":" ++ showJson v

-- 简单解析
parseJson :: String -> Maybe Json
parseJson s = case parseTop s of
  ((j, rest):_) | all isSpace rest -> Just j
  _ -> Nothing

parseTop :: String -> [(Json, String)]
parseTop ('n':'u':'l':'l':rest) = [(JNull, rest)]
parseTop ('t':'r':'u':'e':rest) = [(JBool True, rest)]
parseTop ('f':'a':'l':'s':'e':rest) = [(JBool False, rest)]
parseTop ('"':rest) = let (s, rest') = parseStr rest in [(JStr s, rest')]
parseTop ('[':rest) = parseArr rest
parseTop ('{':rest) = parseObj rest
parseTop s = case readNum s of
  Just (n, rest') -> [(JNum n, rest')]
  Nothing -> []

parseArr :: String -> [(Json, String)]
parseArr s = case dropSpaces s of
  (']':rest) -> [(JArr [], rest)]
  s' -> case parseTop s' of
    ((x, s''):_) -> case dropSpaces s'' of
      (',':s''') -> let (xs, rest) = parseArr s''' in [(JArr (x:xs), rest)]
      (']':rest)  -> [(JArr [x], rest)]
      _ -> []
    [] -> []

parseObj :: String -> [(Json, String)]
parseObj s = case dropSpaces s of
  ('}':rest) -> [(JObj [], rest)]
  s' -> case parseTop s' of
    ((JStr k, s''):_) -> case dropSpaces s'' of
      (':':s''') -> case parseTop s''' of
        ((v, s''''):_) -> case dropSpaces s'''' of
          (',':s''''') -> let (kvs, rest) = parseObj s''''' in [(JObj ((k, v):kvs), rest)]
          ('}':rest)   -> [(JObj [(k, v)], rest)]
          _ -> []
        [] -> []
      _ -> []
    _ -> []

parseStr :: String -> (String, String)
parseStr s = case break (== '"') s of
  (body, '"':rest) -> (body, rest)
  _ -> ("", s)

readNum :: String -> Maybe (Double, String)
readNum s = case reads s of
  [(n, rest)] -> Just (n, rest)
  _ -> Nothing

dropSpaces :: String -> String
dropSpaces = dropWhile (== ' ')

isSpace :: Char -> Bool
isSpace c = c == ' ' || c == '\n' || c == '\t'

all :: (a -> Bool) -> [a] -> Bool
all _ [] = True
all p (x:xs) = p x && all p xs

-- 测试
main :: IO ()
main = do
  let json = JObj [("name", JStr "Alice"), ("age", JNum 30), ("scores", JArr [JNum 90, JNum 85])]
  putStrLn (showJson json)
  -- {"name":"Alice","age":30,"scores":[90,85]}
