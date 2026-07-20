using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace Cp.Core;

/// <summary>
/// Mirrors the contract surface in <c>src/cross-lang/contracts.ts</c>.
/// Every language module implements the same tasks against this
/// shape (or its local equivalent) so the cross-language tests can
/// be ported line-by-line.
/// </summary>
public static class Contracts
{
    public delegate Task<O> Worker<I, O>(I input, CancellationToken ct);

    public interface IFanOutFanIn<I, O>
    {
        Task<IReadOnlyList<O>> RunAsync(IReadOnlyList<I> inputs, int parallelism, CancellationToken ct = default);
    }

    public interface IPipeline<T>
    {
        Task<IReadOnlyList<T>> RunAsync(IReadOnlyList<T> source, CancellationToken ct = default);
    }

    public interface IRateLimiter
    {
        Task<int> RunAsync(int ratePerSec, int durationMs, CancellationToken ct = default);
    }

    public interface IBarrier
    {
        Task ArriveAndWaitAsync(CancellationToken ct = default);
    }

    public interface IMpmcQueue<T>
    {
        int Capacity { get; }
        ValueTask EnqueueAsync(T item, CancellationToken ct = default);
        ValueTask<T?> DequeueAsync(TimeSpan timeout, CancellationToken ct = default);
        void Close();
    }

    public interface IParallelReduce<T>
    {
        Task<T> RunAsync(IReadOnlyList<T> inputs, int parallelism, Func<T, T, T> combine, CancellationToken ct = default);
    }
}
