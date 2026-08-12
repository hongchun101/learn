# 11 · 隔离级别与异常处理(三把刀)

> 目标:把分布式事务里所有模式都必须面对的"三把刀"——空补偿、防悬挂、幂等——讲透,附 DTM 子事务屏障的实现要点、隔离级别对照。

---

## 1. 分布式隔离级别

ANSI SQL 隔离级别在分布式场景下仍适用,但通过不同机制实现:

| 级别 | 单机实现 | 分布式实现 |
| --- | --- | --- |
| Read Uncommitted | 读不加锁 | 不推荐 |
| Read Committed | 读快照 | Raft ReadIndex |
| Repeatable Read | 读快照,事务内不变 | Snapshot Isolation |
| Serializable | 谓词锁 | 2PL + 索引范围锁 |
| **Snapshot Isolation** | MVCC | SI(NewSQL 常用) |
| **Serializable Snapshot Isolation(SSI)** | MVCC + 检测 | CockroachDB / FaunaDB |

### 1.1 NewSQL 隔离级别对照

| 数据库 | 默认隔离 |
| --- | --- |
| Spanner | External Consistency |
| TiDB | Snapshot Isolation |
| CockroachDB | Serializable |
| OceanBase | Read Committed + 可配 Serializable |
| YugabyteDB | Serializable |

---

## 2. 三把刀:分布式事务的三大经典异常

业界常称为"三把刀"——空补偿、防悬挂、幂等。任何 TCC / Saga / AT / 消息方案都必须解决。

### 2.1 空补偿(Null Compensation)

**场景**:分支 Try 未执行,Cancel 反而先到达。

**原因**:网络重试或协调者重发 Cancel 时,Try 实际未执行。

**典型时序**:
```
T1 = 0: 协调者发 Try(网络丢包)
T2 = 1: 协调者超时,发 Cancel
T3 = 2: Cancel 到达,Try 未执行
T4 = 3: 服务端检测到 Try 未执行 → 必须"空补偿"成功
```

**解决**:
```java
public boolean cancel(BusinessContext ctx) {
    if (!txLogRepo.exists(ctx.txId, "TRY")) {
        txLogRepo.mark(ctx.txId, "CANCEL");  // 记录空补偿
        return true;
    }
    // 正常 Cancel
    ...
}
```

### 2.2 防悬挂(Hang Prevention)

**场景**:Try 因网络延迟到达时,Cancel 已完成。

**后果**:Try 完成后,资源冻结却永远不被 Confirm/Cancel(悬挂)。

**典型时序**:
```
T1 = 0: 协调者发 Cancel(分支无 Try)
T2 = 1: Cancel 完成
T3 = 2: 原 Try 重试到达 → 资源冻结,但 Cancel 已记录 → 悬挂
```

**解决**:
```java
public boolean prepare(BusinessContext ctx, OrderDTO dto) {
    if (txLogRepo.exists(ctx.txId, "CANCEL")) return true;  // Cancel 已完成,放弃 Try
    if (!accountRepo.canDebit(dto.from, dto.amount)) return false;
    accountRepo.freeze(dto.from, dto.amount);
    txLogRepo.insertIfAbsent(ctx.txId, "TRY");
    return true;
}
```

### 2.3 幂等(Idempotency)

**场景**:Confirm / Cancel 重试,重复执行导致数据错乱。

**解决三层防御**:

| 层 | 机制 | 适用 |
| --- | --- | --- |
| 1 | 唯一索引(`tx_id + op`) | 任何 DB |
| 2 | 状态机校验(已 Confirm/Cancel 跳过) | DB + 状态字段 |
| 3 | 业务唯一键(订单号、流水号) | 业务约束 |

```sql
-- 幂等表
CREATE TABLE tx_log (
    tx_id      VARCHAR(64) NOT NULL,
    op         VARCHAR(16) NOT NULL,  -- TRY / CONFIRM / CANCEL
    status     VARCHAR(16) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (tx_id, op)
);
```

```java
public boolean confirm(BusinessContext ctx) {
    // 幂等检查
    if (txLogRepo.exists(ctx.txId, "CONFIRM")) return true;
    // 业务:真正扣款
    accountRepo.debitFrozen(ctx.txId);
    txLogRepo.mark(ctx.txId, "CONFIRM");
    return true;
}
```

---

## 3. DTM 的子事务屏障(Barrier)

DTM 通过一个统一的 `Barrier` 模式,把三把刀全部自动化。

### 3.1 屏障表

```sql
CREATE TABLE barrier (
    id VARCHAR(64) PRIMARY KEY,
    op VARCHAR(16) NOT NULL  -- TRY / CONFIRM / CANCEL
);
```

### 3.2 屏障实现

```go
// 伪 Go
func CallWithCurrent(tx *sql.Tx, op string, business func() error) (bool, error) {
    // 1. 插入 barrier
    res, err := tx.Exec(
        "INSERT IGNORE INTO barrier (id, op) VALUES (?, ?)",
        txID, op)
    if err != nil {
        return false, err
    }
    affected, _ := res.RowsAffected()
    if affected == 0 {
        // 已执行过,跳过
        return true, nil
    }
    // 2. 执行业务
    if err := business(); err != nil {
        return false, err
    }
    return true, nil
}
```

### 3.3 三把刀的对应

| 异常 | Barrier 处理 |
| --- | --- |
| 空补偿 | Cancel 插入 barrier(影响行=0)→ 跳过 Cancel |
| 防悬挂 | Try 插入 barrier(影响行=0)→ 跳过 Try |
| 幂等 | 重复 Cancel/Confirm 插入 barrier(影响行=0)→ 跳过 |

> 关键:Barrier + 业务 SQL 必须在同一本地事务中。

---

## 4. 三把刀故障矩阵

| 异常 | 触发场景 | 关键防御 |
| --- | --- | --- |
| 空补偿 | 网络重试 Cancel 早于 Try | Cancel 先查 txLog |
| 防悬挂 | Try 比 Cancel 后到 | Try 前查 txLog |
| 幂等 | Confirm/Cancel 重试 | 唯一索引 + 状态机 |

---

## 5. 幂等设计细节

### 5.1 幂等键的选取

| 类型 | 适用 |
| --- | --- |
| 业务唯一键(订单号、流水号) | 最强约束 |
| (tx_id, op) | 框架级幂等 |
| (tx_id, op, biz_key) | 复合幂等 |

### 5.2 幂等存储性能

- 直接走 DB 唯一索引:可靠,但要一次额外写。
- Redis SETNX:高性能,需考虑持久化与过期。
- 局部状态机:和应用状态合并,减少一次写入。

### 5.3 幂等 vs 状态机

幂等 = "执行一次和执行 N 次结果相同"。
状态机 = "只能按状态推进,不能倒退"。

> 两者不同:幂等保证"重复无害",状态机保证"流程方向"。
> 实际项目中两者都做:幂等保护技术层,状态机保护业务层。

---

## 6. 隔离与异常对照表

| 隔离级别 | 防止脏读 | 防止不可重复读 | 防止幻读 | 防止脏写 | 防止丢失更新 |
| --- | --- | --- | --- | --- | --- |
| Read Uncommitted | ✗ | ✗ | ✗ | ✗ | ✗ |
| Read Committed | ✓ | ✗ | ✗ | ✗ | ✗ |
| Repeatable Read | ✓ | ✓ | 部分 | ✗ | ✗ |
| Snapshot | ✓ | ✓ | ✓ | 部分 | ✓ |
| Serializable | ✓ | ✓ | ✓ | ✓ | ✓ |

> 分布式场景:Sameple→Snapshot(Percolator);Serializable→SSI(CockroachDB)。

---

## 7. 实战案例:Anti-pattern 与正确做法

### 7.1 仅"业务重试"不做幂等

```java
// ❌ 错误
@RocketMQMessageListener(topic = "OrderCreated")
public void onMessage(OrderDTO dto) {
    inventoryDao.deduct(dto.skuId, dto.qty);  // 重试 → 重复扣减
}
```

### 7.2 正确做法

```java
// ✅ 正确
@RocketMQMessageListener(topic = "OrderCreated")
public void onMessage(OrderDTO dto) {
    if (deductLogRepo.exists(dto.orderId)) return;  // 幂等
    inventoryDao.deduct(dto.skuId, dto.qty);
    deductLogRepo.markSuccess(dto.orderId);
}
```

### 7.3 跳过 Cancel 前的"Try 检查"

```java
// ❌ 错误
public boolean cancel(BusinessContext ctx) {
    accountRepo.unfreeze(ctx.txId);  // Try 未执行时直接调用 → NPE/数据错乱
    return true;
}
```

### 7.4 正确做法

```java
// ✅ 正确
public boolean cancel(BusinessContext ctx) {
    if (!txLogRepo.exists(ctx.txId, "TRY")) {
        txLogRepo.mark(ctx.txId, "CANCEL");  // 空补偿
        return true;
    }
    accountRepo.unfreeze(ctx.txId);
    txLogRepo.mark(ctx.txId, "CANCEL");
    return true;
}
```

---

## 8. 通用防御清单

| 防御 | 必做 |
| --- | --- |
| 幂等 | 所有写操作(分支、消息、回调) |
| 空补偿 | Try/Cancel 互换场景 |
| 防悬挂 | Try 可能后到场景 |
| 状态机 | 业务单向推进 |
| 对账 | 任何异步链路 |
| Trace | 跨服务的 xid 串联 |

---

## 9. 故障排查 Checklist

- [ ] 是否有悬挂事务(已 Cancel 但 Try 后到)?
- [ ] 是否有空补偿警告?
- [ ] 幂等表是否覆盖所有写?
- [ ] 状态机是否单向?
- [ ] 是否有"上下游账户余额不一致"?

---

## 10. 面试高频问题

**Q1. 三把刀为什么是分布式事务的"必须"而不是"建议"?**
- 网络不可靠决定了重试必然发生。
- 重试 + 异步 = 一定出现"操作顺序乱"。
- 不处理三把刀就会:
  - 空补偿:把不该释放的资源释放了。
  - 悬挂:把不该冻结的资源冻结了。
  - 重复:把不该扣的款扣了。
- 三把刀处理不好,资金账必出问题。

**Q2. 幂等为什么不能靠"返回上次结果"?**
- 分布式场景下"上次结果"可能在另一台机器。
- 业务侧无法保证"返回上次结果"的安全性。
- 幂等必须靠"业务结果幂等"——重复执行结果相同。

**Q3. DTM 子事务屏障是如何实现的?**
- 一张 `barrier(id, op)` 表,`(id, op)` 唯一索引。
- 业务执行前插入 barrier:影响行=1 → 执行;影响行=0 → 跳过。
- 屏障插入 + 业务 SQL 在同一本地事务。
- 一次屏障调用同时解决空补偿、防悬挂、幂等。

**Q4. 新人最容易踩的坑是什么?**
- 忘记"先查 txLog 再执行"。
- 幂等键选不到业务唯一键 → 重复扣款。
- Saga 补偿无限重试,失败原因不告警。

**Q5. 状态机和幂等的区别?**
- 状态机:管"流程方向",如 `[Created] → [Paid] → [Shipped]`,不能倒退。
- 幂等:管"重复无害",如同一 op 多次执行结果相同。
- 两者协同:幂等保护技术层,状态机保护业务层。
## 11. 延伸阅读

- 三把刀的具体落地 → [04 · TCC](04-tcc.md) / [05 · Saga](05-saga.md) / [06 · AT 模式](06-at-seata.md) / [07 · 消息](07-messaging.md)
- 框架实现(DTM 子事务屏障) → [10 · 主流框架矩阵](10-frameworks.md)
- 实战案例(异常流) → [12 · 实战案例](12-case-studies.md)
- 调试套路 → [13 · 选型决策与最佳实践](13-decision-tree.md)
