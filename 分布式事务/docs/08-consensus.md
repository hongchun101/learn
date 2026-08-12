# 08 · 共识与复制协议

> 目标:把 Paxos / Raft / Zab / Quorum 讲透,理解它们解决的是"多副本一致性",是 NewSQL/2PC 的底层支撑。

---

## 1. 为什么需要共识协议?

多个副本同时接收写请求时,如何保证**所有副本最终一致**?
- 强一致要求:多数副本写入后才算成功。
- 弱一致要求:异步复制,可能丢数据。

> 共识协议解决"多个副本如何就一个值达成一致"。

---

## 2. Paxos

### 2.1 角色

| 角色 | 职责 |
| --- | --- |
| Proposer | 提出议案 |
| Acceptor | 投票 |
| Learner | 学习已选定值 |

### 2.2 两阶段

```
阶段 1 Prepare  :Proposer 选编号 n,广播 Prepare(n);Acceptor 承诺不再接受 < n 的议案。
阶段 2 Accept   :Proposer 收到多数派承诺后,广播 Accept(n, value);Acceptor 接受并持久化。
```

### 2.3 Multi-Paxos

- 用 Log 复制实现一致状态机。
- 每次 Prepare 选定 leader,后续 Accept 走 leader 优化通路。

### 2.4 局限

- 难实现,难理解。
- 工业实现:Google Chubby、Spanner 早期。

---

## 3. Raft(In Search of an Understandable Consensus Algorithm)

### 3.1 简化:Paxos 工程实现复杂,Raft 简化了角色

| 角色 | 职责 |
| --- | --- |
| Leader | 处理所有写请求,复制日志 |
| Follower | 被动响应 |
| Candidate | 选举中的临时角色 |

### 3.2 关键机制

- **任期(Term)**:每次选举单调递增,Leader 唯一。
- **心跳**:Leader 定期发心跳;超时 → 触发选举。
- **日志复制**:Leader 把日志项复制到多数派 Follower 后提交。

```
Client ─▶ Leader ──▶ Follower 1, 2, 3 …(多数派确认)─▶ commit
```

### 3.3 选举过程

1. Follower 在 election timeout 内未收到心跳 → 转 Candidate。
2. Candidate 自增 term,投自己,RequestVote RPC。
3. 多数派同意 → 成为 Leader。
4. 收到更高 term → 退回 Follower。

### 3.4 脑裂处理

- 旧 Leader 看到新 term → 自动 step down。
- 提交需要多数派,网络分区时少数派无法提交。

---

## 4. Zab(ZooKeeper Atomic Broadcast)

ZooKeeper 的一致性协议:
- 类似 2PC,但 Leader 选举 + 事务广播,保证**全局有序**。
- 节点状态:LOOKING / FOLLOWING / LEADING / OBSERVING。

```
Leader election (Fast Leader Election)
   ↓
Discovery   (同步 epoch)
   ↓
Synchronization (补齐历史提议)
   ↓
Broadcast    (两阶段:Proposal / Commit)
```

---

## 5. Quorum NWR

适合 Dynamo 风格无 leader 复制:

| 参数 | 含义 |
| --- | --- |
| N | 副本总数 |
| W | 写副本数(成功写入的副本数) |
| R | 读副本数 |

满足 `W + R > N` → **强读一致**。

```
N=3, W=2, R=2 → 读一定看到最近写入
```

经典:Amazon Dynamo、Cassandra、Riak。

---

## 6. 共识协议对比

| 协议 | 角色数 | 实现复杂度 | 性能 | 工业项目 |
| --- | --- | --- | --- | --- |
| Paxos | 3 | 极高 | 优 | Chubby、Spanner |
| Raft | 3 | 低 | 优 | etcd、TiKV、CockroachDB |
| Zab | 3 | 中 | 优 | ZooKeeper |
| Quorum NWR | 0 | 极低 | 优 | Dynamo、Cassandra |

---

## 7. 共识协议与分布式事务的关系

| 关系 | 说明 |
| --- | --- |
| 共识 = 多副本一致 | 解决"同一份数据多个副本"</td> |
| 分布式事务 = 跨节点原子性 | 解决"多个数据节点原子写" |
| 二者结合 | NewSQL(TiDB、Spanner)用共识做副本,再用 Percolator 2PC 做跨节点事务 |

> 共识协议是**支撑**而非**替代**分布式事务。

---

## 8. 故障矩阵

| 故障 | 表现 | 应对 |
| --- | --- | --- |
| Leader 宕机 | 短暂不可用 | 选举新 Leader(数百毫秒) |
| 网络分区 | 多数派继续,少数派拒绝写入 | W + R > N 仍提供强读 |
| 双主(脑裂) | 旧 Leader 看到新 term 自动 step down | Raft 任期机制 |
| 日志落后 | Follower 落后 | 安装快照 / 增量同步 |

---

## 9. 实战注意点

- **不要自己实现 Raft**:直接用 etcd / TiKV 提供的 KV。
- 共识协议对外表现是"线性一致 KV",上层业务把它当强一致存储用。
- 共识层的事务能力有限(单 key 事务),跨 key 事务要靠上层 Percolator/XA。

---

## 10. 面试高频问题

**Q1. Raft 选举为什么能保证唯一 Leader?**
- 每个 term 只能选出一个 Leader,因为多数派投票唯一。
- 旧 Leader 看到新 term → 自动 step down → 脑裂自动愈合。

**Q2. Paxos 和 Raft 关键区别?**
- Raft 把"选主 + 日志复制"明确分开,Paxos 不区分。
- Raft 强 leader,日志只从 leader 流向 follower;Paxos 任何 proposer 可以提。
- Raft 更容易理解、Paxos 更灵活。

**Q3. 为什么 W + R > N 能强读一致?**
- 写成功的 W 个副本集合与读访问的 R 个副本集合必有交集。
- 交集里至少有一个副本有最新写入 → 读一定看得到。

**Q4. Raft 写入流程为什么是"两段 RPC"?**
- 第一段:Leader → Follower 复制日志(AppendEntries)。
- 第二段:多数派确认后 → Leader commit → 通知 Follower。
- 严格说不是 2PC(没有 prepare),但同样是两阶段。

**Q5. 共识协议能把网络分区作为"机会"吗?**
- 能。分区时少数派不可写,多数派继续工作。
- 客户端配 `prefer-newnode` 或读最新副本 → 仍可服务。
- CAP 中的 P 不再是"灾难",而是"可声明的分区处理策略"。
## 11. 延伸阅读

- 共识协议与 2PC 的结合 → [03 · 强一致性方案](03-strong-consistency.md)
- 共协议落地(NewSQL) → [09 · NewSQL 与计算下推](09-newsql.md)
- 共识层之上的事务 → [09 · NewSQL](09-newsql.md) / [06 · AT 模式](06-at-seata.md)
