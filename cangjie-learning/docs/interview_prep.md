# 仓颉高级工程师面试指南（50K 目标）

> 本指南面向准备仓颉 / 鸿蒙相关岗位面试的工程师。涵盖 **必知必会**、**常见考题**、**系统设计**、**项目展示** 四个维度。学完本项目 + 本指南，足以应对资深岗位的技术面。

---

## 目录

1. [面试画像与考察维度](#1-面试画像与考察维度)
2. [基础知识速记（必背）](#2-基础知识速记必背)
3. [高频考点 50 题](#3-高频考点-50-题)
4. [代码能力题与参考实现](#4-代码能力题与参考实现)
5. [系统设计题（仓颉视角）](#5-系统设计题仓颉视角)
6. [项目深挖准备](#6-项目深挖准备)
7. [薪资谈判与价值证明](#7-薪资谈判与价值证明)
8. [推荐书单与延伸学习](#8-推荐书单与延伸学习)

---

## 1. 面试画像与考察维度

### 1.1 50K 岗位的典型画像

| 公司类型 | 岗位 | 核心考察 |
|----------|------|----------|
| 华为/鸿蒙生态 | 仓颉 SDK / 编译器 / 工具链 | 语言特性深度、GC、编译原理 |
| 鸿蒙 App 厂商 | 鸿蒙应用开发 | UI 框架、性能优化、生态集成 |
| 互联网公司 | 服务端 / 工具 | 并发、网络、数据库、工程化 |
| 创业公司 | 全栈 | 快速学习、独立交付、产品思维 |

### 1.2 五维评估

| 维度 | 占比 | 考察方式 |
|------|------|----------|
| 语言基础 | 20% | 概念问答、写代码 |
| 类型与泛型 | 25% | 设计类型、写 API |
| 并发与性能 | 20% | 设计并发方案、分析瓶颈 |
| 工程能力 | 20% | 架构设计、调试、测试 |
| 业务理解 | 15% | 系统设计、权衡取舍 |

---

## 2. 基础知识速记（必背）

### 2.1 类型系统

| 概念 | 关键点 |
|------|--------|
| `struct` vs `class` | 值 vs 引用；浅拷贝 vs 共享 |
| `enum` 负载 | `\| Circle(Float64)`；模式匹配强制穷尽 |
| `Option<T>` / `?T` | 表达"可能没有"；强制处理 |
| `Result<T, E>` | 表达"可预期错误"；可组合 |
| `Equatable<T>` | `==` `!=` 必须同时重载 |
| `Comparable<T>` | `compare() -> Ordering` |
| `Hashable` | `hashCode() -> Int64`；与 `Equatable` 一起实现才可作 Map key |
| `ToString` | `toString()`；字符串插值需要 |
| 协变/逆变 | 仓颉 1.2 暂未原生支持，使用 `<:` 约束模拟 |

### 2.2 控制流

| 概念 | 关键点 |
|------|--------|
| `if` 是表达式 | 必须有 else 分支（除 `Unit` 返回时） |
| `match` 是表达式 | 强制穷尽；`case x where 守卫` |
| `for (x in range)` | `1..10` 不含右，`1..=10` 含右 |
| `while` | 经典循环 |
| `break` / `continue` | 标准控制流 |
| `return` | 函数内 |

### 2.3 函数

| 概念 | 关键点 |
|------|--------|
| 命名参数 `!` | `func foo(a!: Int = 0)` |
| Lambda 语法 | `{ a: Int, b: Int => a + b }` |
| 闭包捕获 | 引用包装；lambda 修改 `var` 通过 `Cell<T>` |
| 高阶函数 | `(Int) -> Int` 是一等类型 |
| 函数引用 | `let f = foo` 直接传递函数 |

### 2.4 错误处理

| 概念 | 关键点 |
|------|--------|
| `try / catch / finally` | 异常机制；finally 必执行 |
| 自定义异常 | `<: Exception` |
| `Result` 优于异常 | 可组合；签名强制处理 |
| `?` 运算符 | 错误传播 |

### 2.5 并发

| 概念 | 关键点 |
|------|--------|
| `spawn {}` | 返回 `Future<T>` |
| `Future.get()` | 阻塞；异常传播 |
| `Channel<T>` | 协程间通信 |
| `Mutex` | 保护临界区 |
| `AtomicInt64` | 无锁计数 |
| 协程 vs 线程 | 协程轻量；调度由运行时 |

### 2.6 标准库

| 模块 | 关键类型 |
|------|----------|
| `std.core` | 基础类型、Equatable/Comparable/Hashable |
| `std.collection` | Array, ArrayList, HashMap, HashSet |
| `std.fs` | File, Directory, Path |
| `std.regex` | Regex, MatchData |
| `std.time` | DateTime, Duration |
| `std.sync` | Mutex, AtomicInt64, Future, spawn |
| `std.math` | abs, sqrt, pow |

---

## 3. 高频考点 50 题

### 类型与基础（10 题）

**Q1. struct 和 class 的根本区别是什么？**
> struct 是值类型，赋值时拷贝；class 是引用类型，赋值时共享。struct 默认字段 `let`，class 灵活。struct 适合数据载体，class 适合有身份的对象。

**Q2. 仓颉的 Option 类型如何使用？**
> `?T` 等价 `Option<T>`，有 `Some(T)` 和 `None`。用 `match` 强制处理 None，或 `unwrapOr(default)` 提供默认值。`map`/`flatMap` 支持链式。

**Q3. 仓颉如何表达"可能失败"的操作？**
> `Result<T, E>` 优于异常：编译期强制处理，可组合（`map`/`flatMap`），无栈展开开销。

**Q4. 枚举的负载有什么意义？**
> 把状态相关的数据绑定到状态本身，避免散落的字段。模式匹配时强制穷尽所有变体。

**Q5. `extend` 的工程意义？**
> 给已有类型加方法不修改原定义。可给标准库加领域方法，给枚举加状态机方法。

**Q6. 什么是泛型约束？为什么需要？**
> `where T <: Comparable<T>` 约束类型必须实现某些接口。约束提供能力（可比较、可哈希），保证泛型函数能调用该能力。

**Q7. Hashable 和 Equatable 为什么必须一起实现？**
> HashMap/HashSet 用 hashCode 定位桶，用 equals 比较相同桶的元素。两者必须一致：相等对象必须有相等 hashCode，否则查找失败。

**Q8. 什么是模式匹配中的"守卫"？**
> `case x where x > 0` 在模式上附加布尔条件，让匹配更灵活。

**Q9. 仓颉的字符串是 UTF-8 编码吗？字符数怎么算？**
> 是。`String.size` 是字节数，字符数用 `s.toRuneArray().size`。`Rune` 是 Unicode 码点。

**Q10. 什么是"裸字符串字面量"？**
> `#"\d+"#` 不处理转义，适合正则与路径。

### 进阶特性（10 题）

**Q11. 操作符重载的约束？**
> 至少一个参数包含被重载的类型；`==` 必须同时重载 `!=`。重载要保持语义。

**Q12. Lambda 捕获语义？**
> 按引用包装 `var`（使用 `Cell<T>`），按值捕获 `let`。多线程下需同步。

**Q13. 柯里化是什么？仓颉如何实现？**
> 把多参数函数转为单参数链：`f(a,b)` → `f(a)(b)`。实现：返回新 lambda。

**Q14. 什么是 `const` 函数？**
> 编译期求值。只能调用其他 `const` 函数，只能用基本运算。报错"expected 'const' expression" 时需检查是否调用了运行期函数。

**Q15. 仓颉如何做依赖注入？**
> 通过 `init` 参数传入依赖（接口或类型），避免单例和全局变量。

**Q16. `class` 与 `interface` 的取舍？**
> interface 表达行为契约（多个能力）；class 表达有身份的对象。用 `extend` 给 interface 加默认方法。

**Q17. 什么是结构化并发？**
> 协程的生命周期绑定到父作用域（spawn 后必须 get 或 detach），避免泄漏。本版本部分支持。

**Q18. 类型擦除容器如何实现？**
> `ArrayList<Any>` 装箱；或 `ArrayList<(TypeTag, Any)>`；运行时类型检查。

**Q19. `match` 与 `if-else` 链的区别？**
> `match` 强制穷尽；可解构；可守卫；`if-else` 仅布尔条件。match 编译期检查覆盖，if-else 不会。

**Q20. 仓颉如何实现 Builder 模式？**
> 链式调用返回 `this`：`.method().method().build()`。

### 并发与性能（10 题）

**Q21. spawn 与线程的区别？**
> spawn 创建协程（用户态调度，轻量），线程由 OS 调度。协程适合 IO 密集、高并发；线程适合 CPU 密集。

**Q22. 死锁的四个必要条件？**
> 互斥、占有等待、不可剥夺、循环等待。破坏任一即可避免死锁。

**Q23. Mutex 与 AtomicInt64 的选择？**
> 简单计数用 Atomic；复合操作（如 check-then-update）用 Mutex。

**Q24. Future.get() 抛异常的时机？**
> 调用 `.get()` 时。如果不调用，异常会被吞没，协程失败但不通知。

**Q25. Channel 的有界 vs 无界？**
> 有界：背压，防止生产过快；无界：可能 OOM。生产环境优先有界。

**Q26. 如何测量程序耗时？**
> `let start = DateTime.now(); ...; let elapsed = DateTime.now() - start`

**Q27. 数组与链表的选择？**
> 随机访问多 → 数组。频繁头插 → 链表。简单场景默认数组（CPU cache 友好）。

**Q28. StringBuilder 与 String 拼接？**
> String 不可变，拼接产生新对象；大量拼接用 StringBuilder。

**Q29. 仓颉的 GC 是哪种？**
> 仓颉运行时使用并发标记-清扫 GC。具体实现版本相关。

**Q30. struct 含 Array 字段的拷贝？**
> 浅拷贝；Array 底层引用共享。要深拷贝需手动复制。

### 工程能力（10 题）

**Q31. 如何组织大型仓颉项目？**
> 按层分包：`core / domain / services / infrastructure`。每个包单一职责。

**Q32. 公共 API 的设计原则？**
> 最小化暴露；显式类型；不可变优先；返回 Option/Result 而不是抛异常。

**Q33. 单元测试的组织？**
> 一个测试类对应一个被测类；一个测试方法对应一个被测方法的关键路径。

**Q34. 错误信息应该包含什么？**
> 上下文（输入值、位置）+ 错误类别 + 修复建议（可选）。

**Q35. 什么是 YAGNI？**
> You Aren't Gonna Need It。不要为未来需求过度设计。

**Q36. 何时重构？**
> 重复 3 次以上；函数超过 50 行；嵌套超过 4 层；测试困难。

**Q37. 如何评估第三方库？**
> 维护活跃度、API 稳定性、文档质量、社区规模、性能 benchmark。

**Q38. 如何处理跨模块错误？**
> 在模块边界把内部异常翻译为业务异常 / Result，不泄漏实现细节。

**Q39. 仓颉单例的三大风险？**
> 测试性差、状态泄漏、并发安全。改进：依赖注入 + 工厂方法。

**Q40. 如何选择 struct vs class？**
> 见本项目 `docs/best_practices.md` 的决策树。

### 业务与设计（10 题）

**Q41. 状态机在仓颉中如何建模？**
> enum + 负载 + match；状态转移函数放在 enum 内。

**Q42. 用 enum 表达"业务状态"的收益？**
> 非法状态不可表达；编译期检查覆盖；模式匹配强制处理所有路径。

**Q43. 类型驱动开发的流程？**
> 业务约束 → 类型定义 → API 设计 → 实现。

**Q44. 设计高并发爬虫的关键点？**
> 有界 Channel、Worker 池、限流、超时、错误隔离、指数退避重试。

**Q45. 如何设计可扩展的日志系统？**
> 接口 + 实现（控制台、文件、远程）；级别 + 上下文；结构化字段。

**Q46. 缓存的设计模式？**
> Cache-aside（应用层）；Read-through（缓存层）；Write-through；Write-behind。

**Q47. 分布式锁的常见实现？**
> Redis SETNX；ZooKeeper；数据库唯一约束。本地 Mutex 不能跨进程。

**Q48. 鸿蒙应用与仓颉服务端的关系？**
> 鸿蒙 App 主要用 ArkTS；仓颉用于服务端 / 工具链 / 跨端 SDK。两者通过 API 通信。

**Q49. 一个高并发服务如何划分职责？**
> 接入层（路由、限流）→ 业务层（领域逻辑）→ 数据层（仓储、缓存）。每层独立可测。

**Q50. 如何在 1 周内熟悉一个新语言到能写生产代码？**
> 1) 跑通 hello world 与官方教程；2) 看 1 个完整开源项目；3) 实现 1 个端到端 demo；4) 写 10 个单元测试覆盖核心 API；5) 复盘语言独有特性。

---

## 4. 代码能力题与参考实现

### 题目 1：实现 LRU 缓存

```cangjie
public class LruCache<K, V> where K <: Hashable & Equatable<K> {
    private let capacity: Int64
    private var map: HashMap<K, V>
    private var order: ArrayList<K>  // 简化：访问时移到末尾

    public init(capacity: Int64) {
        this.capacity = capacity
        this.map = HashMap<K, V>()
        this.order = ArrayList<K>()
    }

    public func get(key: K): ?V {
        match (map.get(key)) {
            case Some(v) =>
                touch(key)
                return Some(v)
            case None => return None
        }
    }

    public func put(key: K, value: V): Unit {
        if (map.contains(key)) {
            map[key] = value
            touch(key)
        } else {
            if (order.size >= capacity) {
                let oldest = order[0]
                order = sliceFrom(order, 1)
                map.remove(oldest)
            }
            map[key] = value
            order.add(key)
        }
    }

    private func touch(key: K): Unit {
        // 简化：从 order 中移除并重新加到末尾
        var newOrder = ArrayList<K>()
        for (k in order) {
            if (k != key) { newOrder.add(k) }
        }
        newOrder.add(key)
        order = newOrder
    }

    private func sliceFrom(arr: ArrayList<K>, start: Int64): ArrayList<K> {
        var result = ArrayList<K>()
        var i = start
        while (i < arr.size) {
            result.add(arr[i])
            i += 1
        }
        return result
    }
}
```

**复杂度**：get/put 都是 O(n)，可以用双向链表优化到 O(1)。

### 题目 2：用 enum 设计订单状态机

```cangjie
public enum OrderStatus {
    | Pending
    | Paid(amount: Float64, method: String, paidAt: DateTime)
    | Shipped(trackingNumber: String, carrier: String)
    | Delivered(at: DateTime, signedBy: String)
    | Cancelled(reason: String, cancelledBy: String)

    public func canTransitionTo(next: OrderStatus): Bool {
        match ((this, next)) {
            case (Pending, Paid) => true
            case (Paid, Shipped) => true
            case (Shipped, Delivered) => true
            case (Pending, Cancelled) => true
            case (Paid, Cancelled) => true
            case _ => false
        }
    }

    public func isTerminal(): Bool {
        match (this) {
            case Delivered | Cancelled => true
            case _ => false
        }
    }
}
```

### 题目 3：并发安全的配置管理器

```cangjie
public class ConfigManager {
    private let mutex: Mutex
    private var configs: HashMap<String, String>
    private var watchers: ArrayList<(String, String) -> Unit>

    public init() {
        this.mutex = Mutex()
        this.configs = HashMap<String, String>()
        this.watchers = ArrayList<(String, String) -> Unit>()
    }

    public func get(key: String): ?String {
        mutex.lock()
        try { return configs.get(key) }
        finally { mutex.unlock() }
    }

    public func set(key: String, value: String): Unit {
        mutex.lock()
        try {
            configs[key] = value
        } finally {
            mutex.unlock()
        }
        // 在锁外触发 watcher，避免死锁
        for (w in watchers) {
            w(key, value)
        }
    }

    public func watch(callback: (String, String) -> Unit): Unit {
        mutex.lock()
        try { watchers.add(callback) }
        finally { mutex.unlock() }
    }
}
```

---

## 5. 系统设计题（仓颉视角）

### 设计题 1：高并发 HTTP 客户端

**需求**：并发下载 1000 个 URL，控制并发数 ≤ 50，失败重试 3 次。

**设计**：

```cangjie
public class HttpClient {
    private let sem: Semaphore           // 控制并发数
    private let retry: Int64

    public init(maxConcurrent: Int64, retry: Int64) {
        this.sem = Semaphore(maxConcurrent)
        this.retry = retry
    }

    public func fetchAll(urls: Array<String>): Array<String> {
        let futures = ArrayList<Future<String>>()
        for (url in urls) {
            let f = spawn {
                sem.acquire()
                defer { sem.release() }
                return fetchWithRetry(url, retry)
            }
            futures.add(f)
        }
        var results = ArrayList<String>()
        for (f in futures) { results.add(f.get()) }
        return results.toArray()
    }

    func fetchWithRetry(url: String, attempts: Int64): String {
        var attempt: Int64 = 0
        while (attempt < attempts) {
            try {
                return httpGet(url)
            } catch (e: Exception) {
                attempt += 1
                sleep(Duration.second * pow2(attempt))  // 指数退避
            }
        }
        throw Exception("Failed after ${attempts} retries")
    }
}
```

**关键点**：
- 信号量控制并发（避免资源耗尽）。
- 指数退避（避免雪崩）。
- Future 收集（并发等待）。

### 设计题 2：分布式任务队列

**需求**：提交任务到队列，多 worker 并行处理，支持失败重试、结果回调。

**架构**：
- `TaskQueue`：基于 Channel 的有界队列。
- `Worker`：spawn 协程，从队列取任务执行。
- `Result`：用 Result<T, E> 表达。
- `RetryPolicy`：指数退避 + 最大次数。

### 设计题 3：实时数据聚合服务

**需求**：接收 10K QPS 的事件流，按 1 分钟窗口聚合，结果实时输出。

**架构**：
- 输入：Channel< Event >。
- 聚合：滑动窗口（按时间桶）。
- 输出：Channel< Aggregate > 或 HTTP 推送。
- 错误处理：event 解析失败入死信队列。

---

## 6. 项目深挖准备

### 6.1 准备 STAR 故事

每个项目用 **STAR** 结构：

| 字母 | 含义 | 示例 |
|------|------|------|
| S | Situation 背景 | 旧系统每秒 100 QPS，无法支撑业务增长 |
| T | Task 任务 | 重新设计后端，目标 1000 QPS |
| A | Action 行动 | 用仓颉 + spawn + Channel 重写 |
| R | Result 结果 | QPS 提升 10 倍，CPU 占用降 40% |

### 6.2 准备 5 个项目的口头介绍

| 项目 | 时长 | 重点 |
|------|------|------|
| 本教程项目 | 5 min | 20 个模块、文档体系、工程实践 |
| 个人 side project | 3 min | 独立设计的能力 |
| 工作项目 1 | 5 min | 性能优化或架构改进 |
| 工作项目 2 | 5 min | 复杂业务建模 |
| 开源贡献 | 3 min | 协作与代码品味 |

### 6.3 准备常见追问

- "这个项目最难的技术点是什么？你怎么解决的？"
- "如果让你重做一次，你会改哪里？"
- "性能瓶颈在哪？实测数据？"
- "如何保证代码质量？测试覆盖？"
- "团队怎么协作？Code Review 流程？"

---

## 7. 薪资谈判与价值证明

### 7.1 50K 月薪的能力映射

| 能力维度 | 50K 期望 |
|----------|----------|
| 语言深度 | 能给同事讲解 ADT、模式匹配、并发模型 |
| 系统设计 | 独立设计 5+ 模块的中型系统 |
| 性能优化 | 能定位 P99 延迟瓶颈，给出方案 |
| 工程质量 | 写可测试、可维护、可扩展的代码 |
| 业务理解 | 把模糊需求翻译为清晰的技术方案 |
| 团队影响 | 主导 1-2 个中型项目 / 培训新人 |

### 7.2 谈判筹码

| 资产 | 怎么用 |
|------|--------|
| 大厂背景 | 标准化训练过 |
| 鸿蒙/仓颉先发优势 | 稀缺供给 |
| 开源贡献 | 证明协作能力 |
| 业务成果 | 数据说话（QPS、ROI） |
| 面试表现 | 现场表现 > 简历 |

### 7.3 谈薪话术

- **锚定**：先报期望（"我的期望是 50K"）。
- **依据**：列具体能力（"我有仓颉 X 个月实战经验，主导过 Y 项目"）。
- **弹性**：保留空间（"具体可谈，取决于整体 package"）。
- **比较**：对标市场（"根据市场报告，类似岗位在 X 范围"）。

### 7.4 反 offer 处理

- "感谢！我需要 24 小时考虑。"
- 列出比较维度（薪资、成长、技术栈、团队）。
- 不要在压力下承诺。

---

## 8. 推荐书单与延伸学习

### 8.1 仓颉相关

- 仓颉官方文档：https://cangjie-lang.cn/
- 仓颉 GitHub 示例
- 鸿蒙开发者文档

### 8.2 类型与函数式编程

- 《Programming in Scala》(Odersky)
- 《Functional Programming in Scala》(Paul Chiusano)
- 《Type-Driven Development with Idris》(Edwin Brady)

### 8.3 并发与性能

- 《Java Concurrency in Practice》
- 《C++ Concurrency in Action》(Anthony Williams)
- 《Systems Performance》(Brendan Gregg)

### 8.4 系统设计

- 《Designing Data-Intensive Applications》(Martin Kleppmann)
- 《System Design Interview》(Alex Xu)
- 《Software Engineering at Google》

### 8.5 工程实践

- 《Clean Code》(Robert Martin)
- 《The Pragmatic Programmer》(Hunt & Thomas)
- 《Refactoring》(Martin Fowler)

---

## 附录 A：面试高频口诀

```
类型优先不可变，枚举胜过散字段。
模式匹配强制全，错误用类型表达。
Channel 通信代共享，spawn 协程轻量并行。
const 函数编译期，extend 给类型加方法。
文档加 /// 测试加 @，工程标准不能省。
```

---

## 附录 B：现场编码注意事项

1. **先想后写**：拿到题目先想 1 分钟，问清边界条件。
2. **从类型开始**：先写函数签名（输入输出）。
3. **小步迭代**：写一段编译一段，避免大量代码一次性写完。
4. **主动解释**：边写边说思路，面试官评估你的思维过程。
5. **承认未知**：不会的诚实说，并说"我会怎么去查"。
6. **测试思维**：写完主动想测试用例。

---

## 附录 C：5 周冲刺计划

| 周 | 重点 | 产出 |
|----|------|------|
| 1 | 跑通 20 模块 + 完成 tutorial | 可运行的代码 + 文档笔记 |
| 2 | 深入并发、性能、宏 | 3 个完整 demo |
| 3 | 整理项目 + 刷 50 题 | STAR 故事 + 代码实现 |
| 4 | 模拟面试 + 改进弱项 | 5 次模拟面记录 |
| 5 | 投递 + 谈判 | Offer |

按此计划，2-3 个月可达到 50K 级别仓颉工程师的面试准备度。
