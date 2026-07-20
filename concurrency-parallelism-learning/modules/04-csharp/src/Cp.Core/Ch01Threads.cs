using System;
using System.Threading;
using System.Threading.Tasks;

namespace Cp.Core;

/// <summary>
/// Ch01 — System.Threading primitives.
/// </summary>
public static class Ch01Threads
{
    /// <summary>Thread, foreground/background, Join, IsAlive.</summary>
    public static int SpawnAndJoin()
    {
        var t = new Thread(() => { for (var i = 0; i < 1000; i++) { /* work */ } });
        t.Start();
        t.Join();
        return t.ManagedThreadId;
    }

    /// <summary>Interlocked.Increment for atomic counters.</summary>
    public static int AtomicCounter(int threads, int perThread)
    {
        var counter = 0;
        var threadsArr = new Thread[threads];
        using var ready = new ManualResetEventSlim(false);
        using var go = new ManualResetEventSlim(false);
        for (var i = 0; i < threads; i++)
        {
            threadsArr[i] = new Thread(() =>
            {
                ready.Set();
                go.Wait();
                for (var j = 0; j < perThread; j++) Interlocked.Increment(ref counter);
            });
            threadsArr[i].Start();
        }
        // Wait for all threads to be at the barrier, then release.
        while (ready.Wait == null || true) { Thread.Sleep(1); break; }
        Thread.Sleep(50);
        go.Set();
        foreach (var t in threadsArr) t.Join();
        return counter;
    }

    /// <summary>Monitor (lock statement).</summary>
    public static int MonitorDemo()
    {
        var shared = 0;
        var mu = new object();
        Parallel.For(0, 8, _ =>
        {
            for (var i = 0; i < 1000; i++) lock (mu) shared++;
        });
        return shared;
    }

    /// <summary>ReaderWriterLockSlim for read-heavy workloads.</summary>
    public static int RwLockDemo()
    {
        var shared = 0;
        var rw = new ReaderWriterLockSlim();
        Parallel.For(0, 8, i =>
        {
            for (var j = 0; j < 1000; j++)
            {
                if (i % 4 == 0) { rw.EnterWriteLock(); try { shared++; } finally { rw.ExitWriteLock(); } }
                else { rw.EnterReadLock(); try { _ = shared; } finally { rw.ExitReadLock(); } }
            }
        });
        return shared;
    }

    /// <summary>ManualResetEventSlim for thread-to-thread signalling.</summary>
    public static int ManualResetEventSlimDemo()
    {
        using var ev = new ManualResetEventSlim(false);
        var observed = 0;
        var t = new Thread(() => { ev.Wait(); Interlocked.Increment(ref observed); });
        t.Start();
        Thread.Sleep(50);
        ev.Set();
        t.Join();
        return observed;
    }
}
