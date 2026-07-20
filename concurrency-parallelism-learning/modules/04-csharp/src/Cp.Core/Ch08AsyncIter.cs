using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace Cp.Core;

/// <summary>
/// Ch08 — IAsyncEnumerable: typed streaming with backpressure.
/// </summary>
public static class Ch08AsyncIter
{
    public static async IAsyncEnumerable<int> MapAsync(
        IAsyncEnumerable<int> source,
        Func<int, int> f,
        [EnumeratorCancellation] CancellationToken ct = default)
    {
        await foreach (var v in source.WithCancellation(ct).ConfigureAwait(false))
            yield return f(v);
    }

    public static async IAsyncEnumerable<int> FilterAsync(
        IAsyncEnumerable<int> source,
        Func<int, bool> pred,
        [EnumeratorCancellation] CancellationToken ct = default)
    {
        await foreach (var v in source.WithCancellation(ct).ConfigureAwait(false))
            if (pred(v)) yield return v;
    }

    public static async Task<IReadOnlyList<int>> CollectAsync(IAsyncEnumerable<int> source, CancellationToken ct = default)
    {
        var list = new List<int>();
        await foreach (var v in source.WithCancellation(ct).ConfigureAwait(false))
            list.Add(v);
        return list;
    }
}

// IAsyncEnumerable lives in System.Collections.Generic, but
// IAsyncEnumerator / CancellationToken require the using statements
// above. The [EnumeratorCancellation] attribute is in
// System.Runtime.CompilerServices.
namespace System.Runtime.CompilerServices
{
    [AttributeUsage(AttributeTargets.Parameter)]
    public sealed class EnumeratorCancellationAttribute : Attribute { }
}
