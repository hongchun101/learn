# 第 05 章 分布式理论

> 所有分布式系统都是这些理论的工程化:HDFS = GFS 的开源实现,Kafka = 顺序日志 + ISR 的工程,Raft 撑起 etcd/Consul。**不懂理论,调参就是玄学**。

---

## 一、CAP 定理

### 1.1 三选二

```
           Consistency (一致性)
              /\
             /  \
            /    \
           /      \
          /   你   \
         /   在    \
        /   这     \
       / 三角形    \
      /   哪边    \
     /____________\
Availability   Partition
(可用性)        (分区容错)
```

| 性质 | 含义 |
|------|------|
| C | 所有节点同一时刻看到同一数据 |
| A | 每个请求都收到响应(不保证是最新) |
| P | 网络分区时系统仍能继续提供服务 |

**关键事实**:**P 不可放弃**(分布式必须容忍网络),所以实际是 CP 还是 AP 的选择。

### 1.2 工程实现

| 系统 | 倾向 | 取舍 |
|------|------|------|
| HDFS | CP | 分区时停止写,保一致 |
| Cassandra | AP | 分区时仍可写,有冲突修复 |
| ZooKeeper | CP | `ZAB` 协议保一致,leader 不可用时停服 |
| Kafka | AP/CP 切换 | `acks=all` 时偏 CP,`acks=1` 偏 AP |
| etcd | CP | Raft 严格多数派 |

---

## 二、BASE 理论

CAP 在大型互联网里"太严",BASE 是工程化妥协:

| 性质 | 含义 |
|------|------|
| BA (Basically Available) | 基本可用(降级、部分可用) |
| S (Soft State) | 软状态(中间态可见) |
| E (Eventual Consistency) | 最终一致 |

应用:订单系统、社交 feed、跨数据中心同步。**强一致只在钱/账上必需**。

---

## 三、ACID vs BASE

| 维度 | ACID (传统 RDBMS) | BASE (NoSQL) |
|------|-------------------|--------------|
| 一致性 | 强一致 | 最终一致 |
| 原子性 | 事务级 | 单文档/单行 |
| 隔离性 | 多级 | 弱 |
| 持久性 | 立即 | 异步 |
| 适用 | 银行、订单核心 | 海量数据、高并发 |

---

## 四、Paxos 与 Raft

### 4.1 Paxos(分布式共识的"圣杯")

```
角色:
  Proposer  - 提议者
  Acceptor  - 接受者(投票)
  Learner   - 学习者(同步)

两阶段:
  Phase 1: Prepare(n)  -> Promise(n)
  Phase 2: Accept(n, v) -> Accepted(n, v)

保证:多数派接受即成共识
```

**难点**:实现细节繁杂(选主、活锁、多 Paxos),Google Chubby 团队自述"折磨了几年"。

### 4.2 Raft(Paxos 的工程化)

```
+----------------+        +----------------+
|    Leader      | <----> |   Follower     |
|  处理所有写     |        |   心跳跟随     |
+----------------+        +----------------+
        ^
        | 选举时
        v
+----------------+
|   Candidate   |
+----------------+

三状态机:
  Follower  -> 选举超时 -> Candidate
  Candidate -> 获多数票 -> Leader
  Leader    -> 发现更高 term -> Follower
```

**关键概念**:

| 概念 | 含义 |
|------|------|
| Term | 逻辑时钟,单调递增 |
| Log Entry | (term, index, command) |
| Log Matching | 同 index+term 必同 cmd |
| Election Timeout | 随机 150-300ms |
| Heartbeat | leader 周期性空 append |

**选举时序图**:

```
T0 Follower A 超时 -> 成为 Candidate(term=5)
   投票给自己,请求 B/C
T1 B 收到 RequestVote,投给 A(若 log 够新)
T2 C 收到 RequestVote,投给 A
T3 A 收到多数票 -> 成为 Leader(term=5)
T4 A 立即发 AppendEntries(心跳),阻止新选举
```

**etcd 落地**:每个写请求都要多数派 fsync,集群通常 3/5 节点;读可以走 leader(`linearizable`)或 stale read(`Serializable` 弱)。

---

## 五、Gossip 协议

### 5.1 核心思想

```
    A 节点         B 节点         C 节点
    state: v3      state: v2      state: v1
        |             |               |
        +--- 随机选择节点对,周期性交换最新 state ---+
                          |
                          v
    state: v3      state: v3      state: v3   (收敛)

特性:
  - 反熵(anti-entropy):节点间全量同步
  - 传谣(rumor mongering):仅同步最新 update
  - O(log N) 收敛
```

### 5.2 应用

| 系统 | 用法 |
|------|------|
| Cassandra | 节点发现、失败检测、最终一致读修复 |
| Consul | 成员变更、健康状态传播 |
| Redis Cluster | 节点间槽位信息扩散 |

---

## 六、Quorum 机制

```
N = 副本数
W = 写确认数
R = 读确认数

强一致条件: W + R > N
```

| 配置 (N=3) | W | R | 性质 |
|-------------|---|---|------|
| (3, 1, 1) | 1 | 1 | AP 倾向,可能读到旧 |
| (3, 2, 2) | 2 | 2 | 强一致,延迟高 |
| (3, 3, 1) | 3 | 1 | 写慢读快 |
| (3, 1, 3) | 3 | 1 | 写快读慢 |
| (3, 2, 1) | 2 | 1 | 不一致窗口 |

**Kafka**:副本数 N=3,`acks=all` 等价 W=N,`acks=1` 等价 W=1。`min.insync.replicas=2` 保证 W+R>N。

---

## 七、Vector Clock(向量时钟)

### 7.1 为什么需要

```
节点 A 写 v1, 复制到 B
节点 B 写 v2, 复制到 C
节点 C 写 v3, 复制到 A

A 看到: B 是 v2 还是 v3? 单纯时间戳无法判断并发 vs 因果
```

### 7.2 原理

```
Vector Clock: 数组,每个节点一位

事件 E1 在节点 A:
  VC(E1) = {A:1, B:0, C:0}

A -> B 写, B 收到后 +1:
  VC(E2) = {A:1, B:1, C:0}

比较规则:
  V1 < V2  : V1 每位 <= V2 且至少一位 <
  V1 || V2 : 都不是另一个的祖先(并发)
```

### 7.3 应用与局限

| 系统 | 实现 |
|------|------|
| DynamoDB | 向量时钟 + 客户端协调 |
| Riak | 同上 |
| Cassandra | LWW(最后写胜)+ 时间戳,简化版 |

**局限**:节点多时 VC 膨胀,工程上通常截断或切到 LWW。

---

## 八、CRDT(Conflict-free Replicated Data Types)

### 8.1 思路

不靠协调,数学上保证最终一致的数据结构。

| 类型 | 操作 | 例子 |
|------|------|------|
| G-Counter | +1 | 计数器 |
| PN-Counter | +/- | 增减计数器 |
| G-Set | add | 集合并集 |
| 2P-Set | add/remove | 集合带删除 |
| OR-Set | add/remove(可复活) | 复杂场景 |
| LWW-Register | set(last-write-wins) | 单值 |

### 8.2 应用

```
+------------------------+       +----------------------+
|  协作编辑(G-Set + RGA) |       |  Redis CRDT 模块     |
+------------------------+       +----------------------+
  - Yjs (富文本)
  - Automerge (JSON)
```

---

## 九、幂等性(Idempotency)

### 9.1 什么是幂等

```
f(f(x)) = f(x)

例:
  HTTP DELETE 通常幂等
  HTTP POST 通常不幂等 (创建订单)
```

### 9.2 实现模式

```java
// 1. 唯一请求 ID + 去重表
String reqId = request.id;
if (dedupTable.putIfAbsent(reqId, "1") != null) {
    return cachedResult(reqId);   // 重放,返回上次结果
}

// 2. 数据库 UNIQUE 约束 + 异常捕获
try {
    insertOrder(order);
} catch (DuplicateKeyException e) {
    return existingOrder(order.id);
}

// 3. 状态机版本号
UPDATE order SET status = 'PAID', version = version + 1
WHERE id = ? AND version = ?;     -- 乐观锁,重试安全
```

### 9.3 大数据场景

| 场景 | 幂等方法 |
|------|----------|
| Kafka 消费 | offset + 业务唯一键 |
| Spark 重试 | 幂等写入(主键 UPSERT) |
| 定时任务 | 跑批日期作为分区,覆盖写 |
| API 重复提交 | Idempotency-Key header |

---

## 十、综合对照表

| 理论 | 解决什么问题 | 代表工程 |
|------|--------------|----------|
| CAP | 分布式不可能三角 | - |
| BASE | 弱一致方案 | Dynamo, Cassandra |
| Paxos/Raft | 共识(少数服从多数) | etcd, Consul, Kafka KRaft |
| Gossip | 去中心化状态传播 | Cassandra, Consul |
| Quorum (W+R>N) | 一致性读写平衡 | HDFS, Kafka, Dynamo |
| Vector Clock | 因果关系建模 | DynamoDB, Riak |
| CRDT | 无协调最终一致 | Yjs, Automerge |
| 幂等 | 重试安全 | 所有分布式 API |

---

## 实战任务

1. **Raft 选举模拟**:写 Python 模拟 5 节点 Raft 选举,故意 kill leader,观察 term 变化和重新选主。
2. **Gossip 收敛模拟**:1000 节点随机初始化 state 0/1/2,每轮随机与邻居同步,统计几轮后所有节点达成同一状态。
3. **Quorum 计算**:N=5,W=3,R=3,写一份数据需要至少几个副本成功?读需要几个?能否容忍 2 节点故障?
4. **幂等接口**:用 Spring Boot 写一个 `POST /orders` 接口,带 `Idempotency-Key` 头,实现去重表。
5. **CRDT 计数器**:实现一个 G-Counter,3 节点测试并发自增,合并后结果正确。

---

## 专家面试题

1. **CAP 能不能三选三?为什么?**
   要点:不能。分区容错 P 是分布式前提(网络不可靠),所以只有 CP 和 AP 的选择。

2. **Paxos 和 Raft 区别?为什么 Raft 流行?**
   要点:Raft 把 Paxos 的"多角色 + 隐式领导"拆成强 Leader + 三状态机 + 日志复制,易理解易实现。etcd/Consul 都用 Raft。

3. **W+R>N 强一致的推导?**
   要点:任何读至少看一份最新写(W 写保证 N-W+1 副本成功,读 R 至少一份与之重叠)。

4. **Vector Clock 怎么判断因果 vs 并发?**
   要点:逐位比较,全 ≤ 是祖先,部分 > 是因果,否则并发。DynamoDB 用这个检测写冲突。

5. **CRDT 和最终一致什么关系?**
   要点:CRDT 是不需要协调也能收敛的数据结构,数学上保证交换律/结合律/幂等律,是大规模分布式系统的"省心"选择。

6. **Kafka `acks=all` + `min.insync.replicas=2` 怎么保证不丢?**
   要点:写至少 2 副本确认 + 至少 2 副本存活,等于 Quorum W=2,leader 切换也不丢。

7. **生产中怎么设计幂等?举一个真实场景。**
   要点:必须讲清业务场景(支付/消息/任务)→ 幂等键来源(请求 ID / 业务主键 / 跑批日期)→ 实现方案(去重表 / UPSERT / 乐观锁)→ 异常路径处理。

8. **强一致、弱一致、最终一致分别适用什么场景?**
   要点:钱/账 = 强;订单/库存 = 准强(最终一致可接受);社交 feed = 最终一致。

---

## 生产经验

- **分布式系统选型先问一致**:钱有关 → CP(etcd/ZooKeeper);用户感知 → AP(Cassandra/Dynamo);都不关键 → 默认选最熟的技术栈。
- **Kafka KRaft 替换 ZooKeeper 已成熟**(2024 GA),新集群直接 KRaft,少一层依赖。
- **Raft 集群节点数选 3/5/7**:奇数容忍 (N-1)/2 故障;不要 4 节点(只多 1 票成本,但容忍数等于 3)。
- **幂等键必须客户端生成且带过期**:服务端去重表通常 TTL 24 小时,避免无限增长。
- **CRDT 不是万能**:写少读多场景合适;强业务规则(如库存不超卖)还得靠锁或事务。
- **Vector Clock 复杂度高**:除非真的需要检测并发写冲突,否则 LWW + 时间戳更易维护。