# Cangjie → Haskell Notes

If you're coming from Cangjie (or Rust / Swift / TypeScript), here's
the side-by-side mental model.

## Mental shifts

| Cangjie / familiar language       | Haskell                                                |
| -------------------------------- | ------------------------------------------------------ |
| `var x = 5`                      | `let x = 5` or `x <- return 5` inside `do`            |
| `if (cond) { ... } else { ... }` | `if cond then ... else ...` (expression, not statement) |
| `for (x in xs) ...`              | `forM_ xs $ \x -> ...` *or* `do { x <- ...; ... }`    |
| `switch (x) { ... }`             | `case x of ...` (expression)                           |
| trait / interface                 | `class` + `instance`                                   |
| struct / class                    | `data Some = ...` *or* `newtype Some = ...`            |
| `Option<i32>`                    | `Maybe Int`                                            |
| `Result<T, E>`                   | `Either E T`                                           |
| function (multiple args)          | curried: `a -> b -> c`                                 |
| generic function                 | parameterized `a`                                      |
| struct with bundled state        | `State s` / `Reader r` / `Writer w`                    |

## Syntactic shortcuts

* **Function definition**

  Cangjie:

  ```cangjie
  func area(width: Float64, height: Float64): Float64 {
      return width * height
  }
  ```

  Haskell:

  ```haskell
  area :: Double -> Double -> Double
  area w h = w * h
  ```

* **Pattern matching**

  Cangjie:

  ```cangjie
  func describe(x: Int64) {
      match (x) {
          case 0 => "zero"
          case n where n > 0 => "positive"
          case _ => "negative"
      }
  }
  ```

  Haskell:

  ```haskell
  describe :: Int -> String
  describe 0         = "zero"
  describe n | n > 0 = "positive"
  describe _         = "negative"
  ```

* **Algebraic data types** — there's no direct Cangjie analog.
  The closest is "enum + nested struct":

  ```haskell
  data Shape = Circle Double | Rectangle Double Double

  area :: Shape -> Double
  area (Circle r)     = pi * r * r
  area (Rectangle w h) = w * h
  ```

* **Type classes**

  ```haskell
  class Greet a where
      greet :: a -> String

  instance Greet String where
      greet s = "hi, " ++ s
  ```

  This is roughly: "implement the `greet` method for each type that
  opts in."

* **do-notation** is Haskell's "threaded effects" pattern.

  ```haskell
  main :: IO ()
  main = do
      putStrLn "what is your name?"
      name <- getLine
      putStrLn ("hi, " ++ name)
  ```

  Each `<-` extracts a *result* from a previous effect; the overall
  program remains `IO ()`.

## Performance highlights

* Lists are lazy. `Data.Map.Strict` and `Data.Set` give you O(log n)
  ordered containers.
* `foldl' (+) 0 xs` is faster than `foldr (+) 0 xs` for big inputs.
* For I/O-heavy code, prefer `Data.ByteString` and `Data.Text` over
  `String`.

## Where to look first

* `src/Basics.hs` — patterns, recursion, guards.
* `src/MonadsTransformers.hs` — the single most important chapter.
* `docs/cangjie_for_haskellers.md` — this file.
