using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Channels;
using System.Threading.Tasks;

namespace Cp.Core;

/// <summary>
/// Ch04 — System.Threading.Channels: the producer/consumer primitive.
/// </summary>
public static class Ch04Channels
{
    public static async Task<IReadOnlyList<int>> ChannelPipeline(
        IReadOnlyList<int> source,
        IReadOnlyList<Func<int, int>> stages,
        CancellationToken ct = default)
    {
        // Bounded channel gives backpressure; the producer blocks
        // when the consumer is slow.
        var ch = Channel.CreateBounded<int>(new BoundedChannelOptions(16)
        {
            FullMode = BoundedChannelFullMode.Wait,
            SingleReader = true,
            SingleWriter = true,
        });

        var producer = Task.Run(async () =>
        {
            foreach (var v in source) await ch.Writer.WriteAsync(v, ct).ConfigureAwait(false);
            ch.Writer.TryComplete();
        }, ct);

        var results = new List<int>();
        var consumer = Task.Run(async () =>
        {
            await foreach (var v in ch.Reader.ReadAllAsync(ct).ConfigureAwait(false))
            {
                var w = v;
                foreach (var s in stages) w = s(w);
                results.Add(w);
            }
        }, ct);

        await Task.WhenAll(producer, consumer).ConfigureAwait(false);
        return results;
    }

    public static async Task<int> ChannelRoundTrip(int n)
    {
        var ch = Channel.CreateUnbounded<int>();
        var prod = Task.Run(async () =>
        {
            for (var i = 0; i < n; i++) await ch.Writer.WriteAsync(i).ConfigureAwait(false);
            ch.Writer.TryComplete();
        });
        var sum = 0;
        var cons = Task.Run(async () =>
        {
            await foreach (var v in ch.Reader.ReadAllAsync().ConfigureAwait(false)) sum += v;
        });
        await Task.WhenAll(prod, cons).ConfigureAwait(false);
        return sum;
    }
}
