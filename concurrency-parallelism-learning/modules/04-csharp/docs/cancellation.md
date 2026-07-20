# Cancellation

Cancellation in .NET is cooperative: the caller signals "stop", the
callee periodically checks and returns early.

## `CancellationToken`

A `CancellationToken` is the read-side of cancellation. The
write-side is `CancellationTokenSource`. Tokens are *cheap to copy*;
sources are *single-use* (or, rather, single-purpose — you can call
`Cancel` multiple times, but you should not "reuse" a source for
multiple unrelated operations).

```csharp
var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
try
{
    await LongRunningOperation(cts.Token);
}
catch (OperationCanceledException)
{
    Console.WriteLine("cancelled");
}
finally
{
    cts.Dispose();
}
```

## Linking tokens

```csharp
var linked = CancellationTokenSource.CreateLinkedTokenSource(parentCt, myCt);
try
{
    await DoWork(linked.Token);
}
finally
{
    linked.Dispose();   // releases the registration
}
```

The linked source cancels when *any* of its source tokens cancel.

## How to honour a token

### Pass it through

Every async method that may take time should accept a
`CancellationToken` and pass it to any inner async calls.

### Checkpoint

For long synchronous loops, check the token periodically:

```csharp
for (var i = 0; i < n; i++)
{
    ct.ThrowIfCancellationRequested();
    HeavyWork();
}
```

### Race the token

```csharp
await Task.WhenAny(workTask, ct.CancelWhenTimeoutAsync(timeout));
```

Or use `cts.CancelAfter(timeout)` to set a deadline.

## What does NOT cancel

Cancellation is cooperative. The following do NOT cancel a running
operation:

- A blocking synchronous call (e.g. `File.ReadAllBytes`) does not
  see the token.
- An infinite CPU loop without `ThrowIfCancellationRequested` does
  not see the token.
- A native blocking syscall does not see the token.

To cancel these, you must run them on a separate thread and
`Thread.Interrupt` (dangerous, deprecated) or use `Process.Kill`.

## Patterns

### Per-request timeout

```csharp
public async Task<string> GetWithTimeout(string url, int ms)
{
    using var cts = new CancellationTokenSource(ms);
    var client = _httpFactory.CreateClient();
    return await client.GetStringAsync(url, cts.Token);
}
```

### Cancel on first error

```csharp
using var cts = new CancellationTokenSource();
var tasks = urls.Select(u => FetchAsync(u, cts.Token)).ToArray();
try { await Task.WhenAll(tasks); }
catch { cts.Cancel(); throw; }
```

### Cooperative parallel for

```csharp
Parallel.ForEach(items, new ParallelOptions { CancellationToken = ct }, item =>
{
    ct.ThrowIfCancellationRequested();
    Process(item);
});
```
