# sync-over-async pitfalls

The most common bugs in C# async code come from *mixing sync and
async*. This document lists every one of them and shows the fix.

## 1. `.Result` / `.Wait()`

```csharp
// BAD: blocks the thread until the task completes.
var html = _http.GetStringAsync(url).Result;
```

If the awaited continuation needs to run on the captured
`SynchronizationContext` (the UI thread in WPF), and you call
`.Result` on that thread, you deadlock.

**Fix:** `await` it.

```csharp
var html = await _http.GetStringAsync(url);
```

## 2. `lock` around async work

```csharp
// BAD: lock can't span an await.
lock (_mu)
{
    await _db.LoadAsync();   // CS1996: cannot await in lock body
}
```

**Fix:** Use `SemaphoreSlim` with `WaitAsync`:

```csharp
await _sem.WaitAsync();
try
{
    await _db.LoadAsync();
}
finally { _sem.Release(); }
```

## 3. `async void`

```csharp
// BAD: exceptions are unobservable.
public async void DoWork() { ... }
```

**Fix:** Return `Task` (or `Task<T>`):

```csharp
public async Task DoWork() { ... }
```

`async void` is only allowed in event handlers.

## 4. Fire-and-forget without exception handling

```csharp
// BAD: any exception is unobserved.
_ = Task.Run(DoWorkAsync);
```

**Fix:** Always `await` or attach a continuation:

```csharp
_ = Task.Run(DoWorkAsync).ContinueWith(t => Log(t.Exception), TaskContinuationOptions.OnlyOnFaulted);
```

## 5. Sequential awaits that could be parallel

```csharp
// BAD: 3 sequential round-trips.
var a = await GetAAsync();
var b = await GetBAsync();
var c = await GetCAsync();
```

**Fix:**

```csharp
var aTask = GetAAsync();
var bTask = GetBAsync();
var cTask = GetCAsync();
await Task.WhenAll(aTask, bTask, cTask);
```

## 6. `ConfigureAwait(false)` overuse

`ConfigureAwait(false)` is for *library* code. In *application* code
(controllers, view models), you usually want the context.

## 7. Cancellation ignored

```csharp
// BAD: CancellationToken is not honoured.
public async Task DoWork(CancellationToken ct)
{
    await _http.GetStringAsync(url);  // never checks ct
}
```

**Fix:** Pass `ct` to every async call, and use `ct.ThrowIfCancellationRequested()` at checkpoints.

## 8. Lost context

```csharp
// BAD: ConfigureAwait(false) on a UI thread, then try to update the UI.
await Task.Run(() => HeavyWork()).ConfigureAwait(false);
label.Text = "done";  // may throw — not on the UI thread
```

**Fix:** Use `await` without `ConfigureAwait(false)` in UI code, or
explicitly marshal back:

```csharp
await Task.Run(() => HeavyWork());
if (InvokeRequired) BeginInvoke(() => label.Text = "done");
else label.Text = "done";
```

## 9. Spinloop on a Task

```csharp
// BAD: tight loop polling a Task.
while (!task.IsCompleted) Thread.Sleep(1);
```

**Fix:** `await` it.

## 10. Using `Task.Run` for already-async work

```csharp
await Task.Run(async () => await DoWorkAsync());  // pointless
```

`DoWorkAsync` already returns a `Task`. `Task.Run` adds a thread-pool
hop and an extra allocation.
