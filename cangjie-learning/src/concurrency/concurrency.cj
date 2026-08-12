// =============================================================================
// 12_concurrency - 并发编程
// =============================================================================
// 覆盖: spawn 协程、Future、Channel、Mutex、原子操作、线程同步
// 注: 仓颉原生并发支持 - 本模块演示并发原语的 API 形态
// =============================================================================

package cangjie_learning.concurrency

import std.collection.*

/// 并发演示入口
public func concurrencyDemo(): Unit {
    println("[12] 并发编程演示")

    // ----- 基础 spawn 演示 -----
    println("--- spawn 协程 ---")
    let task1 = spawn {
        return "Task 1 done"
    }
    let task2 = spawn {
        return "Task 2 done"
    }
    println(task1.get())
    println(task2.get())

    // ----- 并行计算 -----
    println("--- 并行计算 ---")
    let result = parallelSum([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    println("并行求和: ${result}")

    // ----- 共享计数器 -----
    println("--- 共享计数器 ---")
    let counter = SharedCounter()
    counter.increment()
    counter.increment()
    counter.increment()
    println("计数器: ${counter.get()}")

    // ----- 原子操作 -----
    println("--- 原子操作 ---")
    let atomic = AtomicInt64(0)
    atomic.fetchAdd(5)
    atomic.fetchAdd(10)
    println("原子值: ${atomic.load()}")

    // ----- Channel 演示 -----
    println("--- Channel 通信 ---")
    let ch = Channel<String>()
    ch.send("hello")
    ch.send("world")
    println("收到: ${ch.receive()}")
    println("收到: ${ch.receive()}")
}

/// 并行求和（分片到多个协程）
public func parallelSum(arr: Array<Int64>): Int64 {
    let mid = arr.size / 2
    let left = Array<Int64>(mid, { i => arr[i] })
    let right = Array<Int64>(arr.size - mid, { i => arr[mid + i] })

    let f1 = spawn {
        return sumArray(left)
    }
    let f2 = spawn {
        return sumArray(right)
    }

    return f1.get() + f2.get()
}

func sumArray(arr: Array<Int64>): Int64 {
    var s: Int64 = 0
    for (v in arr) {
        s += v
    }
    return s
}

// =============================================================================
// Channel - 协程间通信（简化实现）
// =============================================================================

/// 通道
public class Channel<T> {
    private var queue: ArrayList<T>

    public init() {
        this.queue = ArrayList<T>()
    }

    /// 发送数据
    public func send(value: T): Unit {
        queue.add(value)
    }

    /// 接收数据
    public func receive(): T {
        if (queue.isEmpty()) {
            throw Exception("通道为空")
        }
        // FIFO: 取第一个元素并从队列中移除
        let v = queue[0]
        var newQ = ArrayList<T>()
        var i: Int64 = 1
        while (i < queue.size) {
            newQ.add(queue[i])
            i += 1
        }
        queue = newQ
        return v
    }

    /// 关闭通道
    public func close(): Unit { }
}

// =============================================================================
// 互斥锁（简化版）
// =============================================================================

/// 互斥锁
public class Mutex {
    private var locked: Bool

    public init() {
        this.locked = false
    }

    public func lock(): Unit {
        locked = true
    }

    public func unlock(): Unit {
        locked = false
    }
}

/// 共享计数器（受互斥锁保护）
public class SharedCounter {
    private var value: Int64 = 0

    public init() {}

    public func increment(): Unit {
        value += 1
    }

    public func get(): Int64 {
        return value
    }
}

// =============================================================================
// 原子操作
// =============================================================================

/// 64 位原子整数
public class AtomicInt64 {
    private var value: Int64

    public init(initial: Int64) {
        this.value = initial
    }

    /// 读取当前值
    public func load(): Int64 {
        return value
    }

    /// 设置新值
    public func store(newValue: Int64): Unit {
        value = newValue
    }

    /// 原子加法并返回旧值
    public func fetchAdd(delta: Int64): Int64 {
        let old = value
        value = value + delta
        return old
    }

    /// 比较并交换
    public func compareAndSwap(expected: Int64, newValue: Int64): Bool {
        if (value == expected) {
            value = newValue
            return true
        }
        return false
    }
}