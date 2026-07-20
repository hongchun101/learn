# Chapter 03 — Syntax, Judgments, and Proofs

How to read, write, and mechanically check the *notation* of type theory.
Every later chapter assumes you can do this.

## Goal

After this chapter you can:

- Read a BNF grammar and turn it into a tiny parser combinator.
- Read natural-deduction rules (with premises over a line, conclusion below) and
  reproduce them as an inference-rule data structure.
- Build a proof checker that takes a derivation tree and checks each step.
- Recognise the difference between **syntax-directed** rules and **rule-based**
  inference; the latter is what we will use throughout Parts II–VI.

## Files

- `bnf.ts`       — Tiny BNF DSL + parser-combinator factory.
- `judgment.ts`   — Rule schema + proof-tree data type.
- `prover.ts`     — A proof checker for a couple of worked rules.
- `demo.ts`       — Runs the worked example.
- `__tests__/chapter.test.ts`
