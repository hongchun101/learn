# 03 · 强一致性方案(2PC / XA / 3PC / Percolator / Spanner 2PC)

> 目标:把"数据库层"的强一致方案讲透:2PC 是什么、缺什么、3PC 怎么补、Percolator/Spanner 怎么在大规模分布式数据库上把它工程化。

---

## 1. 角色与术语

| 角色 | 名称 | 职责 |
| --- | --- | --- |
| 协调者 / TM | Transaction Manager | 推动两阶段、维护全局事务状态 |
| 参与者 / RM | Resource Manager | 数据库 / 资源,提供 prepare / commit / rollback |

---

## 2. 两阶段提交(2PC / XA)

### 2.1 流程

```
               协调者(Coordinator)         参与者 A       参与者 B
                  │                          │              │
                  │────── ① prepare ─────────►│              │
                  │────── ① prepare ──────────┼─────────────►│
                  │                          │              │
                  │◄────── ②a vote-yes ───────┤              │
                  │◄────── ②b vote-yes ───────┼──────────────┤
                  │                          │              │
                  │── ③ commit(if all yes) ──►│              │
                  │── ③ commit ──────────────┼─────────────►│
```

**阶段 1(PREPARE)**:
- 协调者向所有参与者发 PREPARE。
- 参与者本地写 redo/undo log,锁定资源,投票 yes/no。
- 关键:只要返回 yes,必须保证"之后无论发生什么都能提交"。

**阶段 2(COMMIT / ROLLBACK)**:
- 全部 yes → 协调者发 COMMIT。
- 任一 no 或超时 → 协调者发 ROLLBACK。

### 2.2 XA 规范(DTP 模型)

```
        Application(AP)
             │
   ┌─────────┴─────────┐
   │   Transaction     │      ← TX 接口(begin / commit / rollback)
   │   Manager (TM)    │
   └─────────┬─────────┘
             │  XA 接口(prepare / commit / rollback)
   ┌─────────┼─────────┐
   │         │         │
 RM(RDBMS) RM(MQ)    RM(...)
```

- JDBC: `javax.sql.XAConnection`
- JTA: Java Transaction API
- 跨语言:app→TX 调 TM,TM→XA 调 RM

### 2.3 故障矩阵

| 故障 | 参与者状态 | 应对 |
| --- | --- | --- |
| 协调者宕机(阶段 1 后) | 参与者持有锁,无法决定 | 备份协调者 + 日志恢复;参与者最终超时回滚 |
| 协调者宕机(阶段 1 前) | 参与者未 lock | 协调者重启按日志重发 |
| 协调者发 COMMIT 时丢包 | 参与者不知最终决定 | 协调者重发;参与者按"prepared"等指令 |
| 部分参与者 COMMIT 失败 | 部分已提交、部分未提交 | 重试 COMMIT 直到成功;幂等 |
| 脑裂(协调者单点分裂) | 两个协调者都发不同指令 | 唯一协调者(quorum 选举) |

### 2.4 致命缺陷

1. **同步阻塞**:PREPARE 后所有参与者持有锁,直到协调者发最终指令。
2. **协调者单点**:协调者宕机 → 全员阻塞;需备份协调者 + 日志持久化。
3. **数据不一致**:第二阶段部分收到 COMMIT、部分未收到 → 脑裂。
4. **性能差**:两次 RPC + 写日志 + 持锁,不适合高并发。

### 2.5 代码示例(Java + Atomikos)

```xml
<dependency>
  <groupId>com.atomikos</groupId>
  <artifactId>transactions-jdbc</artifactId>
  <version>5.0.9</version>
</dependency>
```

```java
UserTransactionManager tm = new UserTransactionManager();
tm.init();

UserTransaction tx = tm.getUserTransaction();
try {
    tx.begin();
    updateOrderDs1();      // 数据源 1
    updateAccountDs2();    // 数据源 2
    tx.commit();
} catch (Exception e) {
    tx.rollback();
}
```

### 2.6 MySQL XA 实战

```sql
-- 节点 A
XA START 'tx-1';
UPDATE order SET status='PAID' WHERE id=1;
XA END 'tx-1';
XA PREPARE 'tx-1';

-- 节点 B
XA START 'tx-2';
UPDATE account SET balance=balance-100 WHERE id=10;
XA END 'tx-2';
XA PREPARE 'tx-2';

-- 两端都 PREPARE 后,任一节点:
XA COMMIT 'tx-1';
XA COMMIT 'tx-2';
```

**MySQL 注意点**:
- 5.7 之前 binlog 不支持 XA;8.0 才稳定。
- 阿里云 RDS / PolarDB 上是常用方案。

---

## 3. 三阶段提交(3PC)

### 3.1 流程

```
阶段 1 CanCommit :协调者询问参与者能否提交(只读不锁)。
阶段 2 PreCommit :参与者写 redo/undo 日志,锁定资源。
阶段 3 DoCommit  :参与者执行 commit。
```

### 3.2 改进点

- **CanCommit 不锁**:减少同步阻塞窗口。
- **参与者超时**:协调者失联时,参与者可自我提交或回滚。

### 3.3 局限

- 网络分区出现"假成功"时仍可能不一致。
- 实际系统很少采用,**被 Paxos/Raft 取代**。
- 3PC 协议本身只是在教科书中讨论,不要在生产中"实现"它。

---

## 4. Percolator / Spanner 2PC

### 4.1 核心思想

Percolator 是 Google 跑在 BigTable 上的分布式事务实现,Spanner 在 Percolator 基础上加了 TrueTime + Paxos 实现**外部一致性(External Consistency)**。

### 4.2 模型

```
Client → Txn Manager → 多数派写入(Prepare)
                     → Primary 提交点(Commit Point)
                     → 各 Shard 应用事务
```

### 4.3 Percolator 关键流程

1. **Choose Primary**:在涉及的首个 shard 中选 Primary,记录此次事务的 lock。
2. **Prewrite**:对所有 shard 写数据 + 加锁(主锁 + 数据锁)。
3. **Commit**:在 Primary 写 commit 标记(commit_ts + commit_type);其他 shard 异步 commit。
4. **Rollback**:根据 lock TTL 清理孤儿事务。

### 4.4 Spanner 外部一致性

- **TrueTime API**:GPS + 原子钟,给出"现在"的区间 `[earliest, latest]`。
- 提交时间戳 = latest + 等待区间 → 保证线性一致。
- 数据按主键范围切分(Paxos Group),每个 Group 一个 Raft 集群。

详见 [08 · 共识与复制](08-consensus.md) 与 [09 · NewSQL](09-newsql.md)。

---

## 5. 方案对比

| 方案 | 一致性 | 性能 | 阻塞 | 协调者 | 适用 |
| --- | --- | --- | --- | --- | --- |
| 2PC / XA | 强一致 | 差 | 是 | 单点 | 传统金融 / ERP |
| 3PC | 弱于 2PC | 中 | 较少 | 单点 | 几乎不用 |
| Percolator 2PC | 强一致(快照) | 中 | 否 | Primary | BigTable 时代 |
| Spanner 2PC | 外部一致性 | 中 | 否 | Paxos | 全球 NewSQL |

---

## 6. 故障排查 Checklist

- [ ] 协调者是否有持久化日志?
- [ ] 参与者 PREPARE 后是否落 redo?
- [ ] 是否配了备份协调者?
- [ ] 是否有"prepared 但无 commit"的悬挂事务监控?
- [ ] 锁等待时间是否合理?

---

## 7. 面试高频问题

**Q1. 2PC 为什么不直接保证一致?**
- 第二阶段发 COMMIT 时,协调者不知道"是否所有参与者都收到"。
- 协调者可能只能重发 COMMIT,但部分参与者可能回滚过 → 脑裂。
- 解决方案:redo/undo + 幂等 + 重试,代价是阻塞。

**Q2. 为什么生产中很少用 2PC,XA 接口还存在?**
- 高并发下锁竞争严重,持锁时间长。
- 协调者单点是隐患,必须有备份协调者 + 日志。
- 互联网场景更多用 TCC/Saga/消息替代;但金融、ERP 仍依赖 XA。

**Q3. Percolator 2PC 和传统 2PC 的区别?**
- Percolator 2PC **不阻塞**——靠 Primary lock + snapshot 读。
- 失败时靠 TTL 清理,异步回滚。
- 适合 BigTable 这种大表,不适合传统行锁数据库。

**Q4. Spanner 一定要 TrueTime 吗?**
- 严格说,等价方案可用 HLC(Hybrid Logical Clock)+ 单点授时。
- TrueTime 的价值是给"全球外部一致性"提供了一个工程上最简单的路径(只等区间)。
- CockroachDB 用 HLC,YugabyteDB 也用 HLC。
