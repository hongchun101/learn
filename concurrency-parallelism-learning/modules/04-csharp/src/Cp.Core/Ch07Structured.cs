using System;
using System.Threading;
using System.Threading.Tasks;

namespace Cp.Core;

/// <summary>
/// Ch07 — structured concurrency patterns: lifetimes of children
/// are bounded by the parent. C# doesn't have a built-in
/// "TaskScope" yet, so we use `using var` + `LinkedCTS`.
/// </summary>
public static class Ch07Structured
{
    public static async Task<string> ScopedAsync(CancellationToken ct)
    {
        using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        var t = Task.Run(async () =>
        {
            await Task.Delay(Timeout.Infinite, cts.Token).ConfigureAwait(false);
            return "completed";
        });
        await Task.Delay(50, ct).ConfigureAwait(false);
        cts.Cancel();
        try { return await t.ConfigureAwait(false); }
        catch (OperationCanceledException) { return "cancelled by parent"; }
    }

    /// <summary>
    /// Task.WhenAll with linked cancellation: any child failure or
    /// the parent cancel cancels the rest.
    /// </summary>
    public static async Task<int> ParallelWithCancel(IReadOnlyList<Func<CancellationToken, Task<int>>> tasks, CancellationToken ct)
    {
        using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        var running = tasks.Select(f => Task.Run(async () => await f(cts.Token).ConfigureAwait(false), cts.Token)).ToArray();
        try
        {
            var results = await Task.WhenAll(running).ConfigureAwait(false);
            return results.Sum();
        }
        catch
        {
            cts.Cancel();
            throw;
        }
    }
}
