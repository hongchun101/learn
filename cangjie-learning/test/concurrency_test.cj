// =============================================================================
// tests/concurrency_test.cj - 并发测试
// =============================================================================

package tests

import cangjie_learning.advanced_concurrency.*

@Test
public class ConcurrencyTest {
    @TestCase
    public func testSpawn(): Unit {
        let f = spawn { return 42 }
        @Assert(f.get() == 42)
    }

    @TestCase
    public func testMultipleSpawns(): Unit {
        let f1 = spawn { return 10 }
        let f2 = spawn { return 20 }
        @Assert(f1.get() + f2.get() == 30)
    }

    @TestCase
    public func testParallelSum(): Unit {
        let arr = ArrayList<Int64>()
        for (i in 1..=10) { arr.add(i) }
        let s = parallelSumArr(arr, 2)
        @Assert(s == 55)
    }

    @TestCase
    public func testSafeCounter(): Unit {
        let counter = SafeCounter()
        counter.increment()
        counter.increment()
        counter.increment()
        @Assert(counter.get() == 3)
    }

    @TestCase
    public func testAtomicInt(): Unit {
        let atom = AtomicInt64(0)
        atom.fetchAdd(5)
        atom.fetchAdd(3)
        @Assert(atom.load() == 8)
        let old = atom.compareAndSwap(8, 100)
        @Assert(old)
        @Assert(atom.load() == 100)
    }

    @TestCase
    public func testChannel(): Unit {
        let ch = Channel<Int64>(5)
        ch.send(1)
        ch.send(2)
        @Assert(ch.receive() == 1)
        @Assert(ch.receive() == 2)
    }
}
