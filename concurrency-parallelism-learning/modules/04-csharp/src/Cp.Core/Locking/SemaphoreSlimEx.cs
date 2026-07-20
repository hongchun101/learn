using System;
using System.Threading;
using System.Threading.Tasks;

namespace Cp.Core.Locking;

/// <summary>
/// Composite semaphore: combines N semaphores, all must be acquired
/// to pass. Useful for resources that span multiple dependencies.
/// </summary>
public sealed class CompositeSemaphore : IAsyncDisposable
{
    private readonly SemaphoreSlim[] _sems;
    public CompositeSemaphore(params SemaphoreSlim[] sems) { _sems = sems; }
    public async ValueTask<Release> AcquireAsync(CancellationToken ct = default)
    {
        var acquired = new bool[_sems.Length];
        try
        {
            for (var i = 0; i < _sems.Length; i++)
            {
                await _sems[i].WaitAsync(ct).ConfigureAwait(false);
                acquired[i] = true;
            }
            return new Release(this, acquired);
        }
        catch
        {
            for (var i = 0; i < _sems.Length; i++) if (acquired[i]) _sems[i].Release();
            throw;
        }
    }
    public ValueTask DisposeAsync() { foreach (var s in _sems) s.Dispose(); return ValueTask.CompletedTask; }

    public readonly struct Release : IAsyncDisposable
    {
        private readonly CompositeSemaphore _owner;
        private readonly bool[] _acquired;
        internal Release(CompositeSemaphore owner, bool[] acquired) { _owner = owner; _acquired = acquired; }
        public ValueTask DisposeAsync()
        {
            for (var i = 0; i < _acquired.Length; i++) if (_acquired[i]) _owner._sems[i].Release();
            return ValueTask.CompletedTask;
        }
    }
}
