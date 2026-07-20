using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace Cp.Core;

/// <summary>
/// Ch03 — the parallel and concurrent collections in .NET.
/// </summary>
public static class Ch03ParallelStl
{
    public static long ParallelSum(IReadOnlyList<int> xs, int parallelism = 0)
    {
        if (parallelism > 0) Parallel.ForEach(xs, new ParallelOptions { MaxDegreeOfParallelism = parallelism }, _ => { });
        return xs.AsParallel().Sum();
    }

    public static int ConcurrentDictionary()
    {
        var d = new System.Collections.Concurrent.ConcurrentDictionary<int, int>();
        Parallel.For(0, 1000, i => d.AddOrUpdate(i % 10, 1, (_, v) => v + 1));
        return d.Count;
    }

    public static int ConcurrentQueue()
    {
        var q = new System.Collections.Concurrent.ConcurrentQueue<int>();
        Parallel.For(0, 1000, q.Enqueue);
        var sum = 0;
        while (q.TryDequeue(out var v)) sum += v;
        return sum;
    }

    public static int ConcurrentBag()
    {
        var b = new System.Collections.Concurrent.ConcurrentBag<int>();
        Parallel.For(0, 1000, b.Add);
        return b.Count;
    }

    public static int ImmutableDictionary()
    {
        var d = System.Collections.Immutable.ImmutableDictionary<int, int>.Empty;
        for (var i = 0; i < 1000; i++) d = d.SetItem(i, i * i);
        return d.Count;
    }

    public static int ParallelForEachAsync(IReadOnlyList<int> xs)
    {
        var sum = 0;
        Parallel.ForEachAsync(xs, async (x, ct) =>
        {
            await Task.Delay(1, ct).ConfigureAwait(false);
            Interlocked.Add(ref sum, x);
        }).GetAwaiter().GetResult();
        return sum;
    }
}
