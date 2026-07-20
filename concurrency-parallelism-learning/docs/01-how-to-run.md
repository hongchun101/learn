# How to run each module

| Module | Toolchain required (host has it?) | How to run the contract tests |
|---|---|---|
| `modules/01-rust/` | `cargo` (1.96 ✓) | `cd modules/01-rust && cargo test --workspace` |
| `modules/02-go/` | `go` 1.22 (✗) | `cd modules/02-go && go test -race ./...` |
| `modules/03-java/` | `mvn` or `javac`+`junit-4.13.2.jar` (javac 1.8 ✓) | `cd modules/03-java && mvn test` |
| `modules/04-csharp/` | `dotnet` SDK 8 (✗) | `cd modules/04-csharp && dotnet test` |
| `modules/05-python/` | `python` 3.12 (✓ at `D:\env\anaconda3\python.exe`) | `cd modules/05-python && python -m pip install -e .[dev] && python -m pytest` |
| `modules/06-javascript/` | `node` 24 (✓) | `cd modules/06-javascript && npm install && npm test` |
| `modules/07-typescript/` | `node` 24 (✓) | `cd modules/07-typescript && npm install && npm run typecheck && npm test` |
| `modules/08-scala/` | `scala` 3 + `sbt` (✗) | `cd modules/08-scala && sbt test` |
| `modules/09-haskell/` | `ghc` + `cabal` (✗) | `cd modules/09-haskell && cabal test` |
| `modules/10-erlang/` | `erl`/`rebar3` (✗) | `cd modules/10-erlang && rebar3 eunit` |
| `modules/11-elixir/` | `elixir`/`mix` (✗) | `cd modules/11-elixir && mix test` |
| `modules/12-c/` | `gcc` (✗) | `cd modules/12-c && make test` |
| `modules/13-cpp/` | `g++` C++20 (✗) | `cd modules/13-cpp && cmake -B build && cmake --build build && ctest --test-dir build` |

Top-level cross-language tests (TypeScript, runnable here):

```bash
cd <project root>  # directory containing package.json
npm install
npm test            # runs tests/cross-lang.test.ts (7 tests)
npm run typecheck
```

Each language module's own test file is a local re-implementation of the
same seven scenarios. The TS reference is the *contract*; each language is
