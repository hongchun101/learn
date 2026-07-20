using System;
using System.Linq;
using System.Threading.Tasks;
using Cp.Core;
using Xunit;

namespace Cp.Core.Tests;

public class Ch01Tests
{
    [Fact] public void SpawnAndJoinReturnsId() { Assert.True(Ch01Threads.SpawnAndJoin() > 0); }
    [Fact] public void AtomicCounter() { Assert.Equal(8000, Ch01Threads.AtomicCounter(8, 1000)); }
    [Fact] public void MonitorDemo() { Assert.Equal(8000, Ch01Threads.MonitorDemo()); }
    [Fact] public void RwLockDemo() { Assert.Equal(2000, Ch01Threads.RwLockDemo()); }
    [Fact] public void ManualResetEventSlim() { Assert.Equal(1, Ch01Threads.ManualResetEventSlimDemo()); }
}

public class Ch02Tests
{
    [Fact] public async Task TaskWhenAll() { Assert.Equal(10, await Ch02AsyncAwait.TaskWhenAll(10)); }
    [Fact] public async Task TaskWhenAny() { Assert.Equal(2, await Ch02AsyncAwait.TaskWhenAny()); }
    [Fact] public async Task WithTimeout() { Assert.Equal("cancelled", await Ch02AsyncAwait.WithTimeout(50)); }
    [Fact] public async Task MaybeAsyncFast() { Assert.Equal(42, await Ch02AsyncAwait.MaybeAsync(true)); }
}

public class Ch03Tests
{
    [Fact] public void ParallelSum() { Assert.Equal(45, Ch03ParallelStl.ParallelSum(new[] { 1, 2, 3, 4, 5, 6, 7, 8, 9 })); }
    [Fact] public void ConcurrentDictionary() { Assert.Equal(10, Ch03ParallelStl.ConcurrentDictionary()); }
    [Fact] public void ConcurrentQueue() { Assert.Equal(1000, Ch03ParallelStl.ConcurrentQueue()); }
    [Fact] public void ConcurrentBag() { Assert.Equal(1000, Ch03ParallelStl.ConcurrentBag()); }
    [Fact] public void ImmutableDictionary() { Assert.Equal(1000, Ch03ParallelStl.ImmutableDictionary()); }
    [Fact] public void ParallelForEachAsync()
    {
        var xs = Enumerable.Range(0, 100).ToList();
        Assert.Equal(xs.Sum(), Ch03ParallelStl.ParallelForEachAsync(xs));
    }
}

public class Ch04Tests
{
    [Fact] public async Task ChannelPipeline()
    {
        var stages = new Func<int, int>[] { x => x + 1, x => x * 2, x => x - 3 };
        var r = await Ch04Channels.ChannelPipeline(new[] { 0, 1, 2, 3 }, stages);
        Assert.Equal(new[] { -1, 1, 3, 5 }, r);
    }
    [Fact] public async Task ChannelRoundTrip() { Assert.Equal(Enumerable.Range(0, 100).Sum(), await Ch04Channels.ChannelRoundTrip(100)); }
}

public class Ch05Tests
{
    [Fact] public async Task AsyncLock() { Assert.Equal(8000, await Ch05Locking.AsyncLockDemo(8)); }
    [Fact] public async Task AsyncManualReset() { await Ch05Locking.AsyncManualResetEventDemo(); }
    [Fact] public async Task SemaphoreLimit()
    {
        var max = await Ch05Locking.SemaphoreSlimLimit(100, 4);
        Assert.True(max <= 4);
    }
}

public class Ch06Tests
{
    [Fact] public void CasLoop() { Assert.Equal(1000, Ch06LockFree.CasLoop()); }
    [Fact] public void VolatileFlag()
    {
        var f = new Ch06LockFree.VolatileFlag();
        f.Set(42);
        Assert.Equal(42, f.Get());
    }
    [Fact] public void SpinLock() { Assert.Equal(1000, Ch06LockFree.SpinLockDemo()); }
    [Fact] public void Spsc()
    {
        var q = new Ch06LockFree.SpscRing<int>(16);
        for (var i = 0; i < 16; i++) Assert.True(q.TryEnqueue(i));
        for (var i = 0; i < 16; i++) { Assert.True(q.TryDequeue(out var v)); Assert.Equal(i, v); }
    }
}

public class Ch07Tests
{
    [Fact] public async Task ScopedCancellation()
    {
        Assert.Equal("cancelled by parent", await Ch07Structured.ScopedAsync(default));
    }
}

public class Ch08Tests
{
    [Fact] public async Task MapFilter()
    {
        async IAsyncEnumerable<int> Source()
        {
            await Task.Yield();
            yield return 1;
            yield return 2;
            yield return 3;
        }
        var mapped = Ch08AsyncIter.MapAsync(Source(), x => x * 10);
        var filtered = Ch08AsyncIter.FilterAsync(mapped, x => x > 10);
        var collected = await Ch08AsyncIter.CollectAsync(filtered);
        Assert.Equal(new[] { 20, 30 }, collected);
    }
}
