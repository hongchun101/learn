# type-theory-learning

A complete, code-first curriculum on **type theory**: from lambda calculus to Cubical Type Theory.
Thirty focused chapters. Each is a runnable TypeScript module with unit tests. Reading them
back-to-back takes a learner from "I know how to write `let x: number = 1`" to "I can read a
modern dependent-type / effect / linearity paper and write the proofs in code."

## Goal

After finishing all 30 chapters, exercises, and tests, you should be able to:

- Read and write formal type rules in BNF / natural deduction / operational semantics style.
- Implement, by hand, type checkers for STLC, System F, Hindley-Milner, dependently typed
  lambda calculus, bidirectional elaboration, row-polymorphic record inference.
- Reason about polymorphism, variance, subtyping, higher-kinded types, kind isomorphisms,
  GADTs, refinement types, session types, HoTT, Cubical TT.
- Translate an industry type system — Rust traits, Scala 3 opaque types, Haskell HKT, Haskell type families, OCaml modules — into formal rules and vice versa.
- Use theorem provers (Lean 4 / Coq) on the same formal rules you implemented by hand.

## How to read this repo

```
type-theory-learning/
├── src/
│   ├── 01-untyped-lambda/      CH01 ... CH30 — one chapter per directory
│   │   ├── ...
│   │   └── __tests__/              per-chapter vitest spec
│   ├── 02-stlc/
│   ├── ...
│   └── 30-theorem-provers/
├── tests/                         cross-chapter invariants / snapshots
├── scripts/run-all-demos.ts       runs every chapter demo
├── docs/                          long-form notes
└── README.md
```

Each chapter has the shape:

```
src/NN-topic/
├── README.md                      # the chapter as a paper: goal, formal rules, exercise
├── ast.ts                         # AST of the object language being studied
├── semantics.ts                   # typing / evaluation / printer
├── demo.ts                        # runnable, prints results
└── __tests__/
    └── chapter.test.ts            # every claim from README.md is asserted
```

## Tech stack

- **Language of implementation**: TypeScript (strict).
  Rationale: ergonomic enough to express AST and proofs without ceremony; close enough
  to OCaml/Haskell that the textbook Racket/Ocaml code ports 1:1.
- **Tests**: Vitest. Every judgment / every rule is asserted as a test.
- **External languages for reference**: Lean 4 / Coq snippets in `docs/` and chapter
  READMEs. They are not part of the build; reading them is recommended.

## Quality gates

```bash
npm install
npm run typecheck    # tsc --noEmit strict   (currently passing clean)
npm test             # vitest run, all 30 chapters, 116 specs (currently passing clean)
npm run lint         # eslint                 (currently passing clean)
npm run demo         # runs every chapter demo that ships one
```

## Curriculum (30 chapters)

### Part I — Foundations (Ch01–Ch05)

| #   | Chapter                                | What you can do after                                                            |
| --- | -------------------------------------- | -------------------------------------------------------------------------------- |
| 01  | Untyped Lambda Calculus                | Church numerals, normal-order evaluator, α-equivalence. |
| 02  | Simply Typed Lambda Calculus (STLC)    | Bidirectional type checker; preservation/progress tests. |
| 03  | Syntax, Judgments, and Proofs          | Read/write BNF; rule schema + proof-tree checker. |
| 04  | Product, Sum, Record, Variant          | ADT introduction/elimination. |
| 05  | Recursive Types, Induction, Productivity | Size-change termination, codata streams. |

### Part II — Polymorphism (Ch06–Ch10)

| #   | Chapter                                | What you can do after                                                            |
| --- | -------------------------------------- | -------------------------------------------------------------------------------- |
| 06  | System F                               | Impredicative encoding of ∃. |
| 07  | Hindley-Milner (Algorithm W)           | Full HM inference, let-polymorphism. |
| 08  | Variance and Phantom Types             | Co/contra/invariance; compile-time units. |
| 09  | Row Polymorphism                       | Open-row records. |
| 10  | Higher-Kinded Types                    | Natural transformations and F-algebras. |

### Part III — Dependent Types (Ch11–Ch14)

| #   | Chapter                                | What you can do after                                                            |
| --- | -------------------------------------- | -------------------------------------------------------------------------------- |
| 11  | Pi and Sigma                           | Dependent function/pair, witnessed. |
| 12  | Inductive Families and GADTs           | `Vec(n)`, length-preserving append. |
| 13  | Equality and J                         | Martin-Löf equality, runtime transport. |
| 14  | Refinement Types                       | Liquid-style predicate refinement. |

### Part IV — Effects and Control (Ch15–Ch20)

| #   | Chapter                                | What you can do after                                                            |
| --- | -------------------------------------- | -------------------------------------------------------------------------------- |
| 15  | Type Classes and Dictionary Passing    | Haskell-style `class` via records. |
| 16  | Mutable References and Regions         | ST monad + branded regions. |
| 17  | Classical Control                      | `call/cc`, `reset`/`shift`. |
| 18  | Algebraic Effects and Handlers         | Free-monad structure for handlers. |
| 19  | Effect Rows and Inference              | Open rows of effects. |
| 20  | Linear and Affine Types                | Usage-mode checker. |

### Part V — Industry Type Systems (Ch21–Ch25)

| #   | Chapter                                | What you can do after                                                            |
| --- | -------------------------------------- | -------------------------------------------------------------------------------- |
| 21  | Subtyping: Nominal vs Structural       | Both reconciliation styles. |
| 22  | Rust's Trait System                    | Vtables + coherence rules. |
| 23  | Scala 3 Advanced Types                 | Opaque brand types. |
| 24  | Haskell HKT + Type Families            | Peano naturals as types. |
| 25  | Existential Types and OO Encodings     | First-class ∃ in TypeScript. |

### Part VI — Frontier (Ch26–Ch30)

| #   | Chapter                                | What you can do after                                                            |
| --- | -------------------------------------- | -------------------------------------------------------------------------------- |
| 26  | Homotopy Type Theory                   | Path transports. |
| 27  | Cubical Type Theory                    | Path types + product cone. |
| 28  | Session Types and π-calculus           | Tiny protocol runtime. |
| 29  | Metatheory                             | SN + CR tests against Ch01 evaluator. |
| 30  | Theorem Provers in Practice            | Lean 4 / Coq reference strings + tiny tactic pipeline. |

## Verified

```
npm run typecheck   ✅  0 errors
npm test            ✅  30 test files, 116 tests, all green
npm run lint        ✅  clean
```
