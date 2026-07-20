using System;
using System.Threading.Tasks;

namespace Cp.Core.Locking;

/// <summary>
/// An async-friendly ManualResetEvent. Set once, all current and
/// future awaiters pass.
/// </summary>
public sealed class AsyncManualResetEvent
{
    private TaskCompletionSource _tcs = new(TaskCreationOptions.RunContinuationsAsynchronously);
    public Task WaitAsync() => _tcs.Task;
    public void Set() => _tcs.TrySetResult();
    public void Reset() { lock (this) { if (_tcs.Task.IsCompleted) _tcs = new(TaskCreationOptions.RunContinuationsAsynchronously); } }
}
