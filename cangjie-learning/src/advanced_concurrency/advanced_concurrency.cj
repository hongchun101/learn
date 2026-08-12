// =============================================================================
// 19_advanced_concurrency - 高级并发
// =============================================================================
// 覆盖: spawn + Future、Channel、Mutex、并行 Map/Reduce
// 标准库: std.sync, std.time, std.collection
// =============================================================================

package cangjie_learning.advanced_concurrency

import std.sync.*
import std.collection.*

/// 高级并发演示入口
public func advancedConcurrencyDemo(): Unit {
    println("[19] 高级并发演示")

    // ----- 1. spawn 与 Future -----
    println("--- spawn + Future ---")
    let f1 = spawn {
        sleep_wrapper(10)
        return "协程 1 完成"
    }
    let f2 = spawn {
        sleep_wrapper(5)
        return 42
    }
    println("f1 = ${f1.get()}")
    println("f2 = ${f2.get()}")

    // ----- 2. 并行 Map -----
    println("--- 并行 Map ---")
    let items: Array<Int64> = [1, 2, 3, 4, 5]
    let futures = ArrayList<Future<Int64>>()
    for (x in items) {
        let f = spawn {
            sleep_wrapper(5)
            return x * x
        }
        futures.add(f)
    }
    print("结果: ")
    for (f in futures) {
        print("${f.get()} ")
    }
    println("")

    // ----- 3. Channel 生产者-消费者 -----
    println("--- Channel ---")
    let ch = Channel<Int64>(10)
    let producer = spawn {
        var i: Int64 = 0
        while (i < 5) {
            ch.send(i * 10)
            i += 1
        }
        return "producer done"
    }
    let consumer = spawn {
        var sum: Int64 = 0
        var j: Int64 = 0
        while (j < 5) {
            // 简单的轮询等待（仓颉 1.2 无原生条件变量）
            var received: Int64 = 0
            var got = false
            while (!got) {
                try {
                    received = ch.receive()
                    got = true
                } catch (e: Exception) {
                    sleep_wrapper(1)
                }
            }
            sum += received
            j += 1
        }
        return sum
    }
    producer.get()
    let total = consumer.get()
    println("消费总和: ${total}")

    // ----- 4. 互斥锁 -----
    println("--- 互斥锁 ---")
    let counter = SafeCounter()
    let workers = ArrayList<Future<Unit>>()
    var i: Int64 = 0
    while (i < 10) {
        let w = spawn {
            var j: Int64 = 0
            while (j < 100) {
                counter.increment()
                j += 1
            }
        }
        workers.add(w)
        i += 1
    }
    for (w in workers) {
        w.get()
    }
    println("10 协程各加 100 次 = ${counter.get()}")

    // ----- 5. 原子操作 -----
    println("--- 原子操作 ---")
    let atom = AtomicInt64(100)
    println("初始值: ${atom.load()}")
    let old = atom.fetchAdd(50)
    println("fetchAdd(50) 返回旧值: ${old}, 当前值: ${atom.load()}")
    let swapped = atom.compareAndSwap(150, 200)
    println("CAS 150->200: ${swapped}, 当前值: ${atom.load()}")

    // ----- 6. 并行归约 -----
    println("--- 并行归约 ---")
    let arr = ArrayList<Int64>()
    i = 1
    while (i <= 100) {
        arr.add(i)
        i += 1
    }
    let parallelSum = parallelSumArr(arr, 4)
    println("1..100 并行求和 = ${parallelSum}（期望 5050）")

    // ----- 7. 异步错误传播 -----
    println("--- 异步异常 ---")
    let failing = spawn {
        throw Exception("协程内异常")
    }
    try {
        failing.get()
    } catch (e: Exception) {
        println("捕获: ${e.message}")
    }

    // ----- 8. 并发安全单例 -----
    println("--- 单例 ---")
    let s1 = ConfigSingleton.instance
    let s2 = ConfigSingleton.instance
    println("同一实例: ${s1.name == s2.name}")
}

/// 包装 sleep（统一单位）
func sleep_wrapper(ms: Int64): Unit {
    sleep(Duration.millisecond * ms)
}

/// 并行求和（分片到 N 个协程）
public func parallelSumArr(items: ArrayList<Int64>, parallelism: Int64): Int64 {
    let chunkSize = (items.size + parallelism - 1) / parallelism
    var futures = ArrayList<Future<Int64>>()
    var start: Int64 = 0
    while (start < items.size) {
        let end = if (start + chunkSize < items.size) { start + chunkSize } else { items.size }
        let slice = ArrayList<Int64>()
        var i = start
        while (i < end) {
            slice.add(items[i])
            i += 1
        }
        let f = spawn {
            var s: Int64 = 0
            for (v in slice) {
                s += v
            }
            return s
        }
        futures.add(f)
        start = end
    }
    var total: Int64 = 0
    for (f in futures) {
        total += f.get()
    }
    return total
}

/// 线程安全计数器
public class SafeCounter {
    private var value: Int64 = 0
    private let mutex: Mutex

    public init() {
        this.mutex = Mutex()
    }

    public func increment(): Unit {
        mutex.lock()
        try {
            value += 1
        } finally {
            mutex.unlock()
        }
    }

    public func get(): Int64 {
        mutex.lock()
        try {
            return value
        } finally {
            mutex.unlock()
        }
    }
}

/// 通道：基于 ArrayList 的有界通道
public class Channel<T> {
    private var queue: ArrayList<T>
    private let capacity: Int64
    private let mutex: Mutex
    private var closed: Bool

    public init(capacity: Int64) {
        this.queue = ArrayList<T>()
        this.capacity = capacity
        this.mutex = Mutex()
        this.closed = false
    }

    public func send(value: T): Unit {
        mutex.lock()
        try {
            if (closed) {
                throw Exception("通道已关闭")
            }
            if (queue.size >= capacity) {
                throw Exception("通道已满")
            }
            queue.add(value)
        } finally {
            mutex.unlock()
        }
    }

    public func receive(): T {
        mutex.lock()
        try {
            if (queue.isEmpty()) {
                throw Exception("通道为空")
            }
            let v = queue[0]
            var newQ = ArrayList<T>()
            var i: Int64 = 1
            while (i < queue.size) {
                newQ.add(queue[i])
                i += 1
            }
            queue = newQ
            return v
        } finally {
            mutex.unlock()
        }
    }

    public func close(): Unit {
        mutex.lock()
        try {
            closed = true
        } finally {
            mutex.unlock()
        }
    }
}

/// 线程安全单例
public class ConfigSingleton {
    public static let instance: ConfigSingleton = ConfigSingleton()
    public var name: String = "default-config"
    public var version: Int64 = 1

    private init() {}
}
