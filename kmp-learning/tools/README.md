# tools/

Toolchain-free verification.

## verify.mjs

A static verifier that does not need a Kotlin compiler. It:

1. Walks `src/`, checks every `.kt` file's `package` declaration matches
   its directory.
2. Pairs every `expect` with at least one `actual`.
3. Confirms every test class has at least one `@Test` method.
4. Confirms every README-listed chapter has source and test files.
5. Confirms `docs/00-taxonomy.md`, `01-how-to-run.md`, and
   `02-idioms.md` exist.
6. Maps the README "What an expert can do" checklist to real files.
7. Writes `tools/chapter-coverage-matrix.md` with a per-chapter
   summary of public API and tests.

Requires Node 18+. Run:

```bash
node tools/verify.mjs
```

Expected output (truncated):

```
verifying kmp-learning...
  found 40 Kotlin files
  package/directory: OK
  expect/actual pairing: OK
  test classes have tests: OK
  chapter files present: OK
  docs exist: OK
  expert skill mapping: OK
  coverage matrix: wrote tools/chapter-coverage-matrix.md

BUILD OK
```

The verifier is the curriculum's **fallback ground truth** when
you don't have a Kotlin compiler locally. CI should run it after
`./gradlew jvmTest`.
