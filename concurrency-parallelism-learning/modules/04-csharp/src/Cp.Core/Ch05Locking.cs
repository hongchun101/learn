using System;
using System.Threading;
using System.Threading.Tasks;
using Cp.Core.Locking;

namespace Cp.Core;

/// <summary>
/// Ch05 — the various locks and coordination primitives.
/// </summary>
public static class Ch05Locking
{
    public static async Task<int> AsyncLockDemo(int workers)
    {
        var lk = new AsyncLock();
        var shared = 0;
        var tasks = new Task[workers];
        for (var i = 0; i < workers; i++)
        {
            tasks[i] = Task.Run(async () =>
            {
                await using (await lk.AcquireAsync().ConfigureAwait(false))
                {
                    for (var j = 0; j < 1000; j++) Interlocked.Increment(ref shared);
                }
            });
        }
        await Task.WhenAll(tasks).ConfigureAwait(false);
        return shared;
    }

    public static async Task AsyncManualResetEventDemo()
    {
        using var ev = new SemaphoreSlim(0, 1);
        var t = Task.Run(async () => { await ev.WaitAsync().ConfigureAwait(false); });
        await Task.Delay(50).ConfigureAwait(false);
        ev.Release();
        await t.ConfigureAwait(false);
    }

    public static async Task<int> SemaphoreSlimLimit(int n, int limit)
    {
        using var sem = new SemaphoreSlim(limit, limit);
        var active = 0;
        var maxActive = 0;
        var tasks = new Task[n];
        for (var i = 0; i < n; i++)
        {
            tasks[i] = Task.Run(async () =>
            {
                await sem.WaitAsync().ConfigureAwait(false);
                try
                {
                    var cur = Interlocked.Increment(ref active);
                    InterlockedMax(ref maxActive, cur);
                    await Task.Delay(10).ConfigureAwait(false);
                    Interlocked.Decrement(ref active);
                }
                finally { sem.Release(); }
            });
        }
        await Task.WhenAll(tasks).ConfigureAwait(false);
        return maxActive;
    }
    private static void InterlockedMax(ref int location, int value)
    {
        int initial, newMax;
        do { initial = location; newMax = Math.Max(initial, value); }
        while (Interlocked.CompareExchange(ref location, newMax, initial) != initial);
    }
}
