using System;
using System.Threading;

namespace Cp.Core;

/// <summary>
/// Ch06 — lock-free primitives: Interlocked, Volatile, SpinLock,
/// SpinWait, a simple lock-free SPSC ring.
/// </summary>
public static class Ch06LockFree
{
    /// <summary>Compare-and-swap loop on a reference.</summary>
    public static int CasLoop()
    {
        var counter = 0;
        Parallel.For(0, 1000, _ => Interlocked.Increment(ref counter));
        return counter;
    }

    /// <summary>Volatile.Read / Volatile.Write on a long field.</summary>
    public static class VolatileFlag
    {
        private long _state;
        public void Set(long v) => Volatile.Write(ref _state, v);
        public long Get() => Volatile.Read(ref _state);
    }

    /// <summary>SpinLock: short critical sections, no kernel transition.</summary>
    public static int SpinLockDemo()
    {
        var sl = new SpinLock(false);
        var counter = 0;
        Parallel.For(0, 1000, _ =>
        {
            var taken = false;
            sl.Enter(ref taken);
            try { counter++; } finally { if (taken) sl.Exit(); }
        });
        return counter;
    }

    /// <summary>SpinWait: spin then back off.</summary>
    public static int SpinWaitDemo()
    {
        var spin = new SpinWait();
        for (var i = 0; i < 100; i++) spin.SpinOnce();
        return spin.Count;
    }

    /// <summary>Lock-free SPSC ring buffer.</summary>
    public sealed class SpscRing<T>
    {
        private readonly T?[] _buf;
        private readonly int _mask;
        private long _head;
        private long _tail;

        public SpscRing(int requestedCapacity)
        {
            var cap = 1;
            while (cap < requestedCapacity) cap <<= 1;
            _buf = new T?[cap];
            _mask = cap - 1;
        }

        public bool TryEnqueue(T item)
        {
            var head = Volatile.Read(ref _head);
            var tail = Volatile.Read(ref _tail);
            if (head - tail >= _buf.Length) return false;
            _buf[head & _mask] = item;
            Volatile.Write(ref _head, head + 1);
            return true;
        }

        public bool TryDequeue(out T? item)
        {
            var tail = Volatile.Read(ref _tail);
            var head = Volatile.Read(ref _head);
            if (tail >= head) { item = default; return false; }
            item = _buf[tail & _mask];
            _buf[tail & _mask] = default;
            Volatile.Write(ref _tail, tail + 1);
            return true;
        }
    }
}
