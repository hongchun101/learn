using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace Cp.Core;

/// <summary>
/// Ch02 — async/await, Task, ValueTask, CancellationToken, ConfigureAwait.
/// </summary>
public static class Ch02AsyncAwait
{
    public static async Task<int> TaskWhenAll(int n)
    {
        var tasks = Enumerable.Range(0, n).Select(i => Task.FromResult(i * 2)).ToArray();
        var results = await Task.WhenAll(tasks).ConfigureAwait(false);
        return results.Length;
    }

    public static async Task<int> TaskWhenAny()
    {
        var slow = Task.Run(async () => { await Task.Delay(200); return 1; });
        var fast = Task.Run(async () => { await Task.Delay(10); return 2; });
        var first = await Task.WhenAny(slow, fast).ConfigureAwait(false);
        return await first.ConfigureAwait(false);
    }

    /// <summary>
    /// CancellationToken: link a parent + timeout, and the operation
    /// should respect both.
    /// </summary>
    public static async Task<string> WithTimeout(int ms)
    {
        using var cts = new CancellationTokenSource(ms);
        try
        {
            await Task.Delay(Timeout.Infinite, cts.Token).ConfigureAwait(false);
            return "completed";
        }
        catch (OperationCanceledException)
        {
            return "cancelled";
        }
    }

    /// <summary>
    /// ValueTask: zero-allocation hot path. Use when the common case
    /// completes synchronously.
    /// </summary>
    public static ValueTask<int> MaybeAsync(bool fast) =>
        fast ? new ValueTask<int>(42) : new ValueTask<int>(Task.Run(() => 99));

    /// <summary>
    /// The classic anti-pattern: .Result / .Wait in async code.
    /// This function demonstrates the *right* pattern: pass the
    /// CancellationToken all the way through.
    /// </summary>
    public static async Task<int> CorrectPattern(CancellationToken ct)
    {
        await Task.Delay(10, ct).ConfigureAwait(false);
        return 1;
    }
}
