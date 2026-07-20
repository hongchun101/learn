using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Channels;
using System.Threading.Tasks;

namespace Cp.Core;

/// <summary>
/// Idiomatic C# implementations of the six cross-language tasks.
/// Mirrors <c>src/cross-lang/contracts.ts</c>.
/// </summary>
public static class CrossLang
{
    // ---- 1. fan-out / fan-in ----
    public static async Task<IReadOnlyList<int>> FanOutAsync(
        IReadOnlyList<int> inputs,
        int parallelism,
        Func<int, int> work,
        CancellationToken ct = default)
    {
        if (inputs.Count == 0) return Array.Empty<int>();
        var p = Math.Max(1, Math.Min(parallelism, inputs.Count));
        var outBuf = new int[inputs.Count];
        using var sem = new SemaphoreSlim(p, p);
        var tasks = new Task[p];
        for (var w = 0; w < p; w++)
        {
            tasks[w] = Task.Run(async () =>
            {
                while (true)
                {
                    ct.ThrowIfCancellationRequested();
                    var i = Interlocked.Increment(ref _fanIndex) - 1;
                    if (i >= inputs.Count) return;
                    await sem.WaitAsync(ct).ConfigureAwait(false);
                    try { outBuf[i] = work(inputs[i]); }
                    finally { sem.Release(); }
                }
            }, ct);
        }
        await Task.WhenAll(tasks).ConfigureAwait(false);
        return outBuf;
    }
    private static int _fanIndex;

    // ---- 2. pipeline ----
    public static async Task<IReadOnlyList<int>> PipelineAsync(
        IReadOnlyList<int> source,
        IReadOnlyList<Func<int, int>> stages,
        CancellationToken ct = default)
    {
        var results = new int[source.Count];
        for (var i = 0; i < source.Count; i++)
        {
            var v = source[i];
            foreach (var stage in stages) v = stage(v);
            results[i] = v;
            if ((i & 0xFF) == 0) await Task.Yield();
        }
        return results;
    }

    // ---- 3. rate limiter ----
    public static async Task<int> RateLimitAsync(
        int ratePerSec,
        int durationMs,
        CancellationToken ct = default)
    {
        var intervalMs = 1000.0 / ratePerSec;
        using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        cts.CancelAfter(durationMs);
        var produced = 0;
        var sw = System.Diagnostics.Stopwatch.StartNew();
        var next = 0.0;
        try
        {
            while (!cts.IsCancellationRequested)
            {
                var elapsed = sw.Elapsed.TotalMilliseconds;
                if (elapsed >= next)
                {
                    produced++;
                    next += intervalMs;
                }
                else
                {
                    var wait = (int)Math.Ceiling(next - elapsed);
                    if (wait > 0) await Task.Delay(wait, cts.Token).ConfigureAwait(false);
                }
            }
        }
        catch (OperationCanceledException) { /* expected */ }
        return produced;
    }

    // ---- 4. barrier ----
    public sealed class Barrier : IAsyncDisposable
    {
        private readonly TaskCompletionSource _tcs;
        public Barrier(int parties) { _tcs = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously); }
        public Task ArriveAndWaitAsync(CancellationToken ct = default)
        {
            if (Interlocked.Decrement(ref _remaining) == 0) _tcs.TrySetResult();
            return _tcs.Task.WaitAsync(ct);
        }
        private int _remaining;
        public ValueTask DisposeAsync() => ValueTask.CompletedTask;
    }

    // ---- 5. MPMC queue ----
    public sealed class MpmcQueue<T> : Contracts.IMpmcQueue<T>
    {
        private readonly Channel<T> _ch;
        public int Capacity { get; }
        public MpmcQueue(int capacity)
        {
            Capacity = capacity;
            _ch = Channel.CreateBounded<T>(new BoundedChannelOptions(capacity)
            {
                FullMode = BoundedChannelFullMode.Wait,
                SingleReader = false,
                SingleWriter = false,
            });
        }
        public ValueTask EnqueueAsync(T item, CancellationToken ct = default) => _ch.Writer.WriteAsync(item, ct);
        public async ValueTask<T?> DequeueAsync(TimeSpan timeout, CancellationToken ct = default)
        {
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            cts.CancelAfter(timeout);
            try { var v = await _ch.Reader.ReadAsync(cts.Token).ConfigureAwait(false); return v; }
            catch (OperationCanceledException) { return default; }
        }
        public void Close() => _ch.Writer.TryComplete();
    }

    // ---- 6. parallel reduce ----
    public static async Task<long> ParallelReduceAsync(
        IReadOnlyList<long> inputs,
        int parallelism,
        CancellationToken ct = default)
    {
        if (inputs.Count == 0) throw new ArgumentException("empty");
        var p = Math.Max(1, Math.Min(parallelism, inputs.Count));
        var chunkSize = (inputs.Count + p - 1) / p;
        var tasks = new Task<long>[p];
        for (var i = 0; i < p; i++)
        {
            var from = i * chunkSize;
            var to = Math.Min(from + chunkSize, inputs.Count);
            tasks[i] = Task.Run(() =>
            {
                long s = 0;
                for (var j = from; j < to; j++) s += inputs[j];
                return s;
            }, ct);
        }
        var partials = await Task.WhenAll(tasks).ConfigureAwait(false);
        long total = 0;
        foreach (var p2 in partials) total += p2;
        return total;
    }
}
