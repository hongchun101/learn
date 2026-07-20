using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Channels;
using System.Threading.Tasks;
using Cp.Core;
using Xunit;

namespace Cp.Core.Tests;

/// <summary>
/// Cross-language contract tests. Each test corresponds to one of
/// the seven scenarios in <c>src/cross-lang/contracts.ts</c>.
/// </summary>
public class CrossLangTests
{
    [Fact]
    public async Task FanOutPreservesInputOrder()
    {
        var inputs = Enumerable.Range(0, 100).ToList();
        var outList = await CrossLang.FanOutAsync(inputs, 16, i => i * 2);
        for (var i = 0; i < inputs.Count; i++) Assert.Equal(i * 2, outList[i]);
    }

    [Fact]
    public async Task FanOutHandlesParallelismEdges()
    {
        var inputs = new[] { 1, 2, 3, 4, 5 };
        foreach (var p in new[] { 1, 2, 5, 10 })
        {
            var outList = await CrossLang.FanOutAsync(inputs, p, i => i + 1);
            Assert.Equal(new[] { 2, 3, 4, 5, 6 }, outList);
        }
    }

    [Fact]
    public async Task PipelineAppliesInOrder()
    {
        var stages = new Func<int, int>[] { x => x + 1, x => x * 2, x => x - 3 };
        var outList = await CrossLang.PipelineAsync(new[] { 0, 1, 2, 3 }, stages);
        Assert.Equal(new[] { -1, 1, 3, 5 }, outList);
    }

    [Fact]
    public async Task RateLimitProducesInBand()
    {
        var n = await CrossLang.RateLimitAsync(200, 100);
        Assert.InRange(n, 15, 30);
    }

    [Fact]
    public async Task BarrierBlocksUntilAllArrived()
    {
        var parties = 4;
        var released = 0;
        var tasks = Enumerable.Range(0, parties).Select(async _ =>
        {
            using var b = new CrossLang.Barrier(parties);
            await b.ArriveAndWaitAsync();
            Interlocked.Increment(ref released);
        }).ToArray();
        await Task.WhenAll(tasks);
        Assert.Equal(parties, released);
    }

    [Fact]
    public async Task MpmcQueueRoundTrip()
    {
        var q = new CrossLang.MpmcQueue<int>(4);
        var n = 100;
        var producers = 3;
        var producerTasks = Enumerable.Range(0, producers).Select(p => Task.Run(async () =>
        {
            for (var i = 0; i < n; i++) await q.EnqueueAsync(p * 1000 + i);
        })).ToArray();
        var total = producers * n;
        var consumerCount = 0;
        var perConsumer = total / 4;
        var consumerTasks = Enumerable.Range(0, 4).Select(_ => Task.Run(async () =>
        {
            for (var i = 0; i < perConsumer; i++)
            {
                var v = await q.DequeueAsync(TimeSpan.FromSeconds(1));
                if (v is not null) Interlocked.Increment(ref consumerCount);
            }
        })).ToArray();
        await Task.WhenAll(producerTasks);
        await Task.WhenAll(consumerTasks);
        Assert.Equal(total, consumerCount);
    }

    [Fact]
    public async Task ParallelReduceMatchesSequential()
    {
        var xs = Enumerable.Range(1, 1000).Select(i => (long)i).ToList();
        var expected = xs.Sum();
        foreach (var p in new[] { 1, 2, 4, 8, 16, 32, 100 })
        {
            var got = await CrossLang.ParallelReduceAsync(xs, p);
            Assert.Equal(expected, got);
        }
    }
}
