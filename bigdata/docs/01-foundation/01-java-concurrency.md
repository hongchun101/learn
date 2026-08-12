# 第 01 章 Java 并发与 JVM

> 大数据 80% 的崩溃、OOM、慢 GC,根因都在这一章。Spark/Flink/Hadoop/Kafka 全是 JVM 进程,**不懂 JVM 等于在黑盒上瞎调参数**。

---

## 一、为什么大数据工程师必须懂 JVM

```
+-----------------------+        +-----------------------+
|  Spark Driver/Executor |  ----> |  JVM 堆 + GC + JIT    |
+-----------------------+        +-----------------------+
            |                              ^
            |   shuffle write 12 GB        |
            |   map output 撑爆 young gen  |  Full GC 30s
            |                              |  STW,任务超时
            v                              |
       任务失败 / Executor lost
```

Spark 单个 Task 处理 1-10 GB 数据很常见,堆设置不对 → 频繁 GC → shuffle 失败 → 任务重试 → 集群雪崩。Flink 状态后端用 RocksDB + JVM 堆,堆配错了 checkpoint 慢 10 倍。

**结论**:你调的 `spark.executor.memory`、`-Xmx`、`-XX:+UseG1GC` 不是玄学,每个参数背后都有可解释的物理过程。

---

## 二、JDK 17 关键特性(对比 JDK 8)

| 特性 | JDK 8 | JDK 17 | 大数据收益 |
|------|-------|--------|----------|
| Lambda | 基础 | 类型推断增强 | Spark UDF 编写更简洁 |
| Stream API | 有 | 无大变 | 部分 ETL 可改写 |
| `var` | 无 | 有 | 大数据配置类样板代码 -30% |
| Sealed Class | 无 | 有 | Flink 类型系统更安全 |
| Pattern Matching | 无 | 完整 | 配合 switch 消除 if-else |
| ZGC | 无 | 生产可用 | TB 级堆 < 1ms 暂停 |
| Foreign Function | 无 | incubator | 零拷贝读取堆外内存 |

**迁移建议**:新集群直接 JDK 17,稳定集群继续 JDK 8(等社区全面适配),但要明确知道你在用什么、放弃什么。

---

## 三、GC 对比:G1 vs ZGC vs Parallel

### 3.1 核心指标

```
              吞吐量        暂停时间      堆上限      适用场景
Parallel      ★★★★★        几百ms~秒级    几十GB     离线批处理,不在意暂停
G1            ★★★★         10-200ms       几十GB     默认选择,平衡型
ZGC           ★★★~★★★★    < 1ms (avg)   8TB        大堆/低延迟,在线服务
Shenandoah    ★★★~★★★★    < 1ms          TB级       类似 ZGC,Red Hat 主推
```

### 3.2 G1 工作原理(ASCII 图)

```
+-----------------------------------------------------------+
|                      G1 Heap (Region 化)                  |
|                                                           |
|  +----+----+----+----+----+----+----+----+----+----+----+ |
|  | E  | E  | S  | O  | O  | H  | E  | O  | S  | E  |空闲 | |
|  +----+----+----+----+----+----+----+----+----+----+----+ |
|     Eden    Survivor   Old      Humongous                |
|                                                           |
|  1. 并发标记 找出回收价值最大的 Region (Mixed GC)          |
|  2. 优先回收垃圾多的 Region,达成暂停时间目标             |
+-----------------------------------------------------------+
```

### 3.3 ZGC 核心:染色指针 + 读屏障

```
对象引用(64 位指针):
  [  未用  |  MetaData  |  Remapped/0/1/2  |  对象地址  ]
              染色位       状态标记         实际地址

读屏障伪代码:
  if (指针染色位 != 当前) {
      自愈(将旧地址映射到新地址);
      修正指针染色位;
  }

并发:标记 + 转移 + 重定位 全程并发,STW 阶段只剩 roots 扫描(<1ms)
```

### 3.4 大数据选型矩阵

| 场景 | 推荐 GC | 原因 |
|------|---------|------|
| Spark 离线 ETL,堆 16-32G | G1 | 平衡,生态成熟 |
| Flink 实时,堆 8-16G | G1 | 状态后端已经用 RocksDB 堆外化 |
| HBase RegionServer,堆 32-64G | ZGC | 大堆避免 Region 迁移抖动 |
| Kafka Broker,堆 8G | G1/Parallel | 短小对象为主,停顿影响小 |
| 搜索/在线服务,堆 > 100G | ZGC | 唯一不抖的选择 |

---

## 四、AQS(AbstractQueuedSynchronizer)

Spark 的 `Semaphore`(限流)、`CountDownLatch`(等待 barrier)都基于 AQS。

### 4.1 核心结构

```
       +-----------+
       |  head (dummy)  <--- 已拿到锁的虚拟节点
       +-----------+
            |
            v
       +-----------+         +-----------+
       | Thread A  |  <----> | Thread B  |  <----> ...
       | waitStatus|         | waitStatus|
       +-----------+         +-----------+
        排队线程,CAS 争抢 state
```

**关键点**:
- `state` 是 volatile int,通过 CAS 修改
- 没拿到锁的线程进 FIFO 队列 park,前驱唤醒时再 CAS
- 公平/非公平取决于新入队线程能否抢在队列头前 CAS

### 4.2 ReentrantLock 公平 vs 非公平

```
非公平锁:刚释放的瞬间,新线程可能直接抢锁,跳过队列 (吞吐高,可能饥饿)
公平锁  :严格 FIFO (吞吐低,等待可预测)
```

**大数据场景**:Spark 用到大量锁(HashMap 桶、 shuffle 索引),几乎都用非公平。

---

## 五、CAS 与无锁编程

```java
// 典型 CAS 自旋
do {
    old = atomicRef.get();
    new = old + 1;
} while (!atomicRef.compareAndSet(old, new));
```

| 优点 | 缺点 |
|------|------|
| 无线程上下文切换 | 高竞争下 CPU 空转 |
| 单变量原子性 | ABA 问题(版本号解决) |
| 天然适合高并发读多写少 | 只能管一个变量 |

**生产案例**:LongAdder vs AtomicLong——高并发写多时,LongAdder 用分段 Cell 数组降低 CAS 冲突,吞吐高 5-10 倍。Spark 的累加器底层即此思路。

---

## 六、ThreadLocal 与内存泄漏

```
ThreadLocal<Conn> tl = new ThreadLocal<>();
// 用完不 remove()
+-------+--------+
| Thread |  Entry  |----> Conn @ 堆
+-------+--------+
              |
              v
       key = ThreadLocal(弱引用, GC 会清)
       value = Conn(强引用, 不会清)
       线程不死 -> 内存泄漏
```

**正确用法**:`try { tl.set(conn); ... } finally { tl.remove(); }`

**大数据陷阱**:Spark Executor 线程复用,如果 Task 里 ThreadLocal 没清理,长跑后 OOM。Flink 异步回调中也常见。

---

## 七、CompletableFuture

```java
CompletableFuture<Map> f1 = CompletableFuture.supplyAsync(() -> queryHBase());
CompletableFuture<Map> f2 = CompletableFuture.supplyAsync(() -> queryRedis());

CompletableFuture.allOf(f1, f2)
    .thenCompose(v -> merge(f1.join(), f2.join()))
    .orTimeout(500, TimeUnit.MILLISECONDS)   // JDK 9+
    .exceptionally(ex -> fallback());
```

| 阶段 | 用途 |
|------|------|
| `thenApply` | 同步转换 |
| `thenCompose` | 链式异步 |
| `thenCombine` | 两路合并 |
| `orTimeout` | 超时控制 |
| `exceptionally` | 兜底 |

**大数据场景**:ETL 拉取多源,join 后写 Kafka,任一环节超时/失败整体降级到缓存数据。

---

## 八、Spark 调优开关速查

| 参数 | 推荐值 | 作用 |
|------|--------|------|
| `spark.executor.memory` | 8-16G | 堆总大小 |
| `spark.executor.memoryOverhead` | 1-2G | 堆外,网络/Yarn 容器 |
| `spark.memory.fraction` | 0.6 | 堆中执行+存储占比 |
| `spark.memory.storageFraction` | 0.5 | 存储占比上限 |
| `-XX:+UseG1GC` | - | 启用 G1 |
| `-XX:MaxGCPauseMillis` | 200 | G1 暂停目标 |
| `-XX:+HeapDumpOnOutOfMemoryError` | - | OOM 自动 dump |
| `-XX:HeapDumpPath` | /tmp | dump 路径 |
| `-XX:+PrintGCDetails` | 仅调试 | GC 日志 |

---

## 实战任务

1. **GC 日志分析**:写一个无限创建对象的程序,加 `-Xmx128m -Xlog:gc*:file=gc.log:time`,跑 30 秒,用 [GCViewer](https://github.com/chewiebug/GCViewer) 打开 `gc.log`,看 Young/Old 切换和 Full GC 频率。
2. **AQS 自实现**:抄写一个 `MyCountDownLatch`,只用 `LockSupport.park/unpark` + CAS。
3. **CAS 性能对比**:JMH benchmark,AtomicLong vs LongAdder,1/10/100 线程并发写,记录吞吐差。
4. **ThreadLocal 泄漏复现**:在线程池里循环 `set(new byte[10MB])` 不 remove,跑 5 分钟,观察老年代增长。
5. **CompletableFuture 实战**:模拟"并行查 HBase + Redis,任一超时返回兜底",超时设 500ms,跑通。

---

## 专家面试题

1. **G1 和 ZGC 的核心区别?什么场景必须用 ZGC?**
   要点:G1 Region 化 + 增量回收,STW 控制在 10-200ms;ZGC 染色指针 + 读屏障,STW < 1ms。堆 > 64G 或要求 p99 延迟 < 50ms 必选 ZGC。

2. **AQS 的核心思想是什么?为什么用 CLH 队列的变体?**
   要点:CAS 操作 state,FIFO 队列管理等待线程。CLH 变体只需在前驱节点上自旋,锁释放时唤醒后继,缓存友好,无队首竞争。

3. **CAS 的 ABA 问题怎么解决?举一个你用过的场景。**
   要点:加版本号(AtomicStampedReference)。场景:用 `AtomicReference<Node>` 实现无锁栈,Pop 时判 head 引用 + 版本号都未变。

4. **ThreadLocal 为什么会导致内存泄漏?怎么避免?**
   要点:ThreadLocalMap 的 key 是弱引用,value 是强引用。线程复用场景(线程池)必须 `remove()`,否则累积到 OOM。

5. **生产里一次让你印象最深的 GC 事故,怎么定位的?**
   要点:必须讲清现象(慢/失败)→ 监控(GC 日志 + jstat)→ 根因(大对象/内存泄漏/参数错)→ 修复 + 验证。参考模板:CMS 晋升失败 → 改 G1,堆从 16G 调到 24G,加 `-XX:InitiatingHeapOccupancyPercent=45`。

6. **CompletableFuture 的 `thenApply` 和 `thenCompose` 区别?**
   要点:`thenApply` 把 Function 返回值直接包装;`thenCompose` 接收返回 `CompletionStage` 的 Function,展开嵌套。链式异步必须用 `thenCompose`。

---

## 生产经验

- **永远开启 GC 日志**:`-Xlog:gc*:file=gc.log:time,uptime`。出问题你才知道当时 GC 状况,日志成本几乎为零。
- **OOM 自动 heap dump**:`-XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=/data/dump`。Eclipse MAT 分析 dump 是基本功,提前装好。
- **别用 finalize/PhantomReference 救火**:对象生命周期不可控,正确做法是早释放 + 监控 + 告警。
- **Spark 堆设置经验公式**:`executor.memory + memoryOverhead ≈ 容器上限 × 0.85`,留 15% 给系统。
- **慎用偏向锁**:JDK 17 默认关闭偏向锁(-XX:-UseBiasedLocking),大数据高竞争场景意义不大,但老应用里仍是排查项。