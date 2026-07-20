# async/await state machine

When the C# compiler sees an `async` method, it generates a state
machine. Each `await` becomes a state; the method is split into
chunks at each `await`, with each chunk ending in a state transition.

## The shape

```csharp
public async Task<int> FetchAndProcess(string url)
{
    var html = await _http.GetStringAsync(url);   // state 0
    var parsed = Parse(html);                     // state 1
    return await _db.SaveAsync(parsed);           // state 2
}
```

Compiles to (roughly):

```csharp
public Task<int> FetchAndProcess(string url)
{
    var sm = new StateMachine(url);
    sm.MoveNext();  // runs the first chunk
    return sm.Task;
}

class StateMachine : IAsyncStateMachine
{
    int _state = -1;
    TaskAwaiter<string> _awaiter1;
    TaskAwaiter<int> _awaiter2;

    public void MoveNext()
    {
        switch (_state)
        {
            case -1: goto Start;
            case 0:  goto GotHtml;
            case 1:  goto GotParsed;
        }
    Start:
        _awaiter1 = _http.GetStringAsync(_url).GetAwaiter();
        if (_awaiter1.IsCompleted) goto GotHtml;
        _state = 0;
        _awaiter1.OnCompleted(MoveNext);
        return;
    GotHtml:
        var html = _awaiter1.GetResult();
        var parsed = Parse(html);
        _awaiter2 = _db.SaveAsync(parsed).GetAwaiter();
        if (_awaiter2.IsCompleted) goto GotParsed;
        _state = 1;
        _awaiter2.OnCompleted(MoveNext);
        return;
    GotParsed:
        return _awaiter2.GetResult();
    }
}
```

## What this means

- An `async` method *itself* doesn't run on a separate thread. It
  runs on the caller's thread until the first `await` that returns
  an incomplete `Task`.
- After an `await`, the continuation runs on *whichever* thread the
  awaited task completes on. By default, this is the captured
  `SynchronizationContext` (the UI thread in WPF/WinForms, the
  request thread in ASP.NET pre-Core, or the thread pool in console
  / ASP.NET Core).
- `ConfigureAwait(false)` opts out of capturing the context. Use it
  in *library* code that doesn't care which thread it runs on. Skip
  it in *application* code that needs to update UI.

## Anti-patterns

### `.Result` / `.Wait()`

```csharp
var html = _http.GetStringAsync(url).Result;  // blocks the thread
```

This blocks the calling thread until the task completes. On a UI
thread, it deadlocks. On a thread-pool thread, it wastes a thread
that could be running other work. **Never do this.**

### `async void`

`async void` is only for event handlers. Exceptions in an `async void`
method go to the `SynchronizationContext` (UI thread) and cannot be
caught.

```csharp
async void Button_Click(object sender, EventArgs e)
{
    await DoWork();
}
```

### `Task.Run` on already async code

```csharp
await Task.Run(async () => await DoWorkAsync());  // pointless
```

`DoWorkAsync` already returns a `Task`. Wrapping it in `Task.Run`
adds an extra thread-pool hop for no benefit.

### Sequential awaits

```csharp
var a = await GetAAsync();
var b = await GetBAsync();   // doesn't start until a is done
var c = await GetCAsync();
```

Use `Task.WhenAll` to run in parallel:

```csharp
var a = GetAAsync();
var b = GetBAsync();
var c = GetCAsync();
await Task.WhenAll(a, b, c);
```

## Cancellation

Always pass `CancellationToken` through async methods. Use
`CancellationTokenSource.CreateLinkedTokenSource` to compose
multiple tokens (parent + timeout).
