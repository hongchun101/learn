using System;
using System.Threading;
using System.Threading.Tasks;

namespace Cp.Core.Locking;

/// <summary>
/// An async lock: awaits instead of blocking the thread. Use when
/// holding the lock requires awaiting another async operation.
/// </summary>
public sealed class AsyncLock
{
    private readonly SemaphoreSlim _sem = new(1, 1);

    public async ValueTask<Release> AcquireAsync(CancellationToken ct = default)
    {
        await _sem.WaitAsync(ct).ConfigureAwait(false);
        return new Release(_sem);
    }

    public readonly struct Release : IAsyncDisposable
    {
        private readonly SemaphoreSlim _sem;
        internal Release(SemaphoreSlim sem) { _sem = sem; }
        public ValueTask DisposeAsync()
        {
            _sem.Release();
            return ValueTask.CompletedTask;
        }
    }
}
