# C# memory model

The C# memory model is defined in ECMA-335 §I.12.6 (Partition I,
12.6.6 "Memory model"). It is an *acquire/release* model: each
synchronisation primitive establishes a partial order between
operations on different threads.

## The five rules

### 1. `lock` and `Monitor.Exit` synchronise with `Monitor.Enter`

A thread's `Monitor.Exit` (or `lock` statement exit) happens-before
any subsequent thread's `Monitor.Enter` (or `lock` statement entry)
on the *same* monitor. This is the rule that makes locks safe.

### 2. `volatile` is acquire on read, release on write

Reading a `volatile` field has acquire semantics (no read or write
after can be reordered before it). Writing has release semantics (no
read or write before can be reordered after it). The runtime inserts
the appropriate CPU fence on architectures that need it (ARM, Itanium,
weak x86).

### 3. `Interlocked` operations are atomic with full barriers

`Interlocked.Increment`, `CompareExchange`, `Exchange`, `Add`, etc.
all have acquire/release semantics and are atomic. The runtime uses
the strongest barrier needed on each architecture.

### 4. Thread start and join

`Thread.Start()` happens-before the new thread's first instruction.
`Thread.Join()` happens-after the thread's last instruction.

### 5. `Task` continuations

A `Task<T>`'s continuation runs after the task completes; the
completion establishes a happens-before edge with the continuation.

## `volatile` vs `Volatile.Read`/`Write`

Both are acquire/release on plain field accesses. The difference:

- `volatile` is a *keyword* on a field declaration. Compiler enforces
  it; every access to that field uses the volatile semantics.
- `Volatile.Read(ref x)` / `Volatile.Write(ref x, v)` are *static
  method calls* that work on any field. Useful for one-off
  acquire/release on a non-volatile field, or for atomic access to
  struct fields.

For most code, prefer the `volatile` keyword. Reach for `Volatile.*`
when the field is in a struct and you can't add `volatile` to the
field declaration.

## What the model does NOT say

- Reads/writes to a non-volatile, non-locked, non-Interlocked
  shared field are *racy*. The runtime can do anything (including
  tearing for long/double).
- `int`, `float`, etc. are not guaranteed atomic on 32-bit platforms.
  Use `Interlocked` or `volatile`.
- `Interlocked` reads/writes are atomic but not all of them are
  acquire/release; the docs say which is which.

## The pragmatic rules

1. **Use `lock` for shared state.** Short critical section, no
   async work inside. (Use `SemaphoreSlim` if you must await
   inside.)
2. **Use `Interlocked` for counters and flags.** Faster than
   `lock` for single-word updates.
3. **Use `volatile` for fields read on one thread and written on
   another** when no other synchronisation is needed.
4. **Use `Channel<T>` for producer/consumer.** It gives you both
   communication and synchronisation.
5. **Always pass `CancellationToken` through async code.** Never
   `.Wait()` / `.Result` in async code.

## A short example

```csharp
class Counter
{
    private int _value;
    public void Increment() => Interlocked.Increment(ref _value);
    public int Value => Volatile.Read(ref _value);
}
```

`Interlocked.Increment` is atomic and full-fence; `Volatile.Read` is
acquire. A reader on any thread will see either the pre- or
post-increment value, never a torn one.
