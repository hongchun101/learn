# C# — concurrency & parallelism (Ch04)

C# 12 on .NET 8. TPL, async/await, `Channel<T>`, the lock-free primitives
in `System.Threading`, and the parallel `IAsyncEnumerable<T>` story.

## What an expert can do after this module

- Read the C# memory model (ECMA-335 §I.12.6) by heart; know the
  difference between the `volatile` keyword and `Volatile.Read`/`Write`.
- Use `async/await` correctly: never `.Wait()` / `.Result` in async code;
  always honour `CancellationToken`; understand the state machine the
  compiler generates.
- Pick the right primitive: `Task` for one-shot async work, `Channel<T>`
  for producer/consumer with backpressure, `IAsyncEnumerable<T>` for
  streaming, `SemaphoreSlim` for resource limits, `Parallel.ForEachAsync`
  for data-parallel async work.
- Build a lock-free primitive using `Interlocked`, `Volatile`, `SpinLock`,
  `SpinWait` — with safety comments.
- Write `IProgress<T>` and `IAsyncDisposable` correctly; integrate
  with `CancellationTokenSource.CreateLinkedTokenSource` for composite
  cancellation.
- Use `System.Threading.Channels` with `BoundedChannelOptions` and
  `FullMode` to control backpressure semantics.
- Implement an async coordination primitive (e.g. `AsyncManualResetEvent`,
  `AsyncLock`) without blocking the thread pool.

## Layout

```
modules/04-csharp/
├── README.md
├── global.json
├── concurrency-parallelism.sln
├── docs/
│   ├── memory-model.md
│   ├── async-await-state-machine.md
│   ├── tpl-dataflow.md
│   ├── channels-vs-tpl.md
│   ├── sync-over-async-pitfalls.md
│   └── cancellation.md
├── src/
│   └── Cp.Core/
│       ├── Cp.Core.csproj
│       ├── Contracts.cs           — ICrossLang mirroring contracts.ts
│       ├── CrossLang.cs           — six-task implementation
│       ├── Ch01Threads.cs
│       ├── Ch02AsyncAwait.cs
│       ├── Ch03ParallelStl.cs
│       ├── Ch04Channels.cs
│       ├── Ch05Locking.cs
│       ├── Ch06LockFree.cs
│       ├── Ch07Structured.cs
│       ├── Ch08AsyncIter.cs
│       ├── Ch09Patterns.cs
│       └── Locking/
│           ├── AsyncLock.cs
│           ├── AsyncManualResetEvent.cs
│           └── SemaphoreSlimEx.cs
└── tests/
    └── Cp.Core.Tests/
        ├── Cp.Core.Tests.csproj
        ├── Ch01-Ch09*.cs
        └── CrossLangTests.cs     — the seven cross-language scenarios
```

## How to run

```bash
cd modules/04-csharp
dotnet test                       # 80+ tests across 9 chapters + cross-lang
dotnet run --project src/Cp.Core
```

The local build host has the .NET 8 **runtime** but no **SDK**.
Install the SDK from <https://dotnet.microsoft.com/download/dotnet/8.0>.
The code is reviewed by inspection; targets C# 12 / .NET 8.

## Cross-language task implementations

`src/Cp.Core/CrossLang.cs` re-implements the six tasks using modern
C# primitives. `tests/Cp.Core.Tests/CrossLangTests.cs` asserts the
same properties as the TypeScript reference.

## Memory model

The C# memory model is the ECMA-335 §I.12.6 specification. Key rules:

- A lock release on monitor `m` happens-before a subsequent lock
  acquisition on `m` from any thread.
- A read of a `volatile` field has acquire semantics; a write has
  release semantics.
- `Interlocked` operations are atomic with full memory barriers.
- The `Volatile.Read`/`Volatile.Write` methods give you acquire/release
  semantics on plain fields, but the `volatile` keyword is the more
  common choice for fields.
