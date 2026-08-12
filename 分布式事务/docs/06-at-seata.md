# 06 · AT 模式与 Seata 内核

> 目标:从"自动化的 2PC + undo log + 全局锁"切入,把 AT 模式讲透,看清它"零业务侵入"背后的代价。

---

## 1. 核心思想

**Automatic Transaction**(自动事务):
- 像本地事务一样写代码,框架自动生成两阶段。
- 本质:**自动化的 2PC + 全局锁 + undo log**。
- 适用:大部分基于 JDBC 的关系型数据库业务。

---

## 2. 架构

```
        Application
            │
      @GlobalTransactional
            │
   ┌────────┴─────────┐
   │   TC (Seata     │      ← 协调者(Transaction Coordinator)
   │   Server)        │
   └────────┬─────────┘
            │
   ┌────────┴─────────┐
   │   RM 代理数据源   │      ← Resource Manager,拦截 SQL
   └──────────────────┘
```

| 模块 | 作用 |
| --- | --- |
| **TC**(Transaction Coordinator) | 协调者,维护全局/分支事务状态 |
| **TM**(Transaction Manager) | 事务管理器,定义全局事务边界 |
| **RM**(Resource Manager) | 资源管理器,管理分支资源 |

---

## 3. 执行流程(以 Update 为例)

### 阶段 1:分支注册 + Before/After Image + 写 undo_log

```sql
-- 原始 SQL
UPDATE product SET stock = stock - 1 WHERE id = 1;

-- Seata 拦截后生成的 SQL(伪):
SELECT stock FROM product WHERE id = 1;             -- before image
UPDATE product SET stock = stock - 1 WHERE id = 1;
SELECT stock FROM product WHERE id = 1;             -- after image
INSERT INTO undo_log(xid, branch_id, before, after, ...) VALUES (...);
```

### 阶段 2:全局提交

- 删除 undo_log,释放本地锁,提交本地事务。

### 阶段 3:全局回滚

- 根据 undo_log 的 before image **反向补偿**,删除 after image(若有)。
- 释放本地锁。

---

## 4. 全局锁 vs 本地锁

| 类型 | 机制 | 作用 |
| --- | --- | --- |
| **本地锁** | `SELECT … FOR UPDATE` 锁住行 | 防止同一全局事务内并发 |
| **全局锁** | Seata TC 上的全局锁表 | 防止其他全局事务并发修改同一行 |

**缓解脏写的核心**:
- 处于"全局未决"期间,本地事务已提交,其他全局事务看到的是"新值"。
- Seata 在 commit 阶段根据 xid 判断回滚。

---

## 5. 故障矩阵

| 故障 | 表现 | 应对 |
| --- | --- | --- |
| TC 宕机 | 全局事务状态丢失 | TC 集群 + 持久化(store mode:db / file / redis) |
| 分支事务提交失败 | TC 状态与分支不一致 | TC 持续重试 + 异步 worker |
| undo_log 写失败 | 回滚失败 | TC 记录"待回滚" + 人工介入 |
| 全局锁竞争 | 性能下降 | 缩短事务、热点表拆分 |
| 脏写 | 绕过全局锁直接修改 | Seata Server 端的"前后镜像校验" |

---

## 6. 代码示例

```java
@GlobalTransactional(name = "order-tx", rollbackFor = Exception.class)
public void placeOrder(OrderDTO order) {
    orderDao.create(order);             // 分支 1
    inventoryDao.deduct(order.skuId);   // 分支 2
    accountDao.debit(order.userId);     // 分支 3
}
```

### 6.1 Spring Boot 配置

```yaml
seata:
  enabled: true
  application-id: order-service
  tx-service-group: my_tx_group
  service:
    vgroup-mapping:
      my_tx_group: default
    grouplist:
      default: 127.0.0.1:8091
  registry:
    type: nacos
    nacos:
      server-addr: 127.0.0.1:8848
```

---

## 7. Seata 模式矩阵

| 模式 | 一致性 | 业务侵入 | 性能 | 隔离 | 适用 |
| --- | --- | --- | --- | --- | --- |
| **AT** | 最终一致 | 无 | 中 | 低 | 大多数关系型数据库业务 |
| **TCC** | 最终一致 | 高 | 高 | 高 | 金融、库存等需要强隔离 |
| **Saga** | 最终一致 | 中 | 高 | 极低 | 长事务、跨服务多步骤 |
| **XA** | 强一致 | 无 | 低 | 中 | 数据库支持 XA 的传统业务 |

---

## 8. 隔离级别与读已写

- 默认隔离:**Read Uncommitted**(本地事务已提交即可读到)。
- 风险:其他全局事务可能读到"未决"中间态。
- 解决:在 AT 之上加 `SELECT … FOR UPDATE` 或状态字段过滤。

---

## 9. AT 模式的代价

| 代价 | 原因 |
| --- | --- |
| 不支持 NoSQL | undo_log 依赖关系型 DB |
| 性能低于纯本地事务 | 写前后镜像 + 写 undo_log |
| 全局锁竞争激烈 | 热点表事务性能下降 |
| 隔离级别仅 Read Uncommitted | 需业务侧补 |
| DBA 视角的复杂度 | undo_log 表膨胀,Gc 风险 |

---

## 10. undo_log 清理

- Seata Server 异步任务定期删除已结束的全局事务对应 undo_log。
- 长时间未结束的全局事务必须监控告警。

---

## 11. 实战案例:电商下单(AT)

```java
@GlobalTransactional
public void placeOrder(OrderDTO order) {
    // 分支 1:订单服务
    orderDao.create(order);
    // 分支 2:库存服务(同一 TC、不同库)
    inventoryRpc.deduct(order.skuId, order.qty);
    // 分支 3:账户服务
    accountRpc.debit(order.userId, order.amount);
}
```

任何 RPC 抛出异常 → TC 通知所有分支 → 各分支根据 undo_log 反向补偿。

---

## 12. 故障排查 Checklist

- [ ] Seata Server 集群是否高可用?
- [ ] undo_log 表是否膨胀?清理策略是否生效?
- [ ] 是否有"长时间 UNKNOWN"的事务?
- [ ] 全局锁等待时间是否合理?
- [ ] 业务是否绕过全局锁直接修改热点行?

---

## 13. 面试高频问题

**Q1. AT 模式如何保证"回滚"?**
- 阶段 1 写前后镜像到 undo_log。
- 阶段 2 全局回滚时,根据 undo_log 的 before image 反向 UPDATE。
- 如果 after image 比 before image 多行,还要删除新增行。

**Q2. AT 模式的脏写怎么处理?**
- 全局事务 A 处于"未决"时,本地事务已 commit。
- 如果此时另一个全局事务 B 通过非 AT 通道直接修改了同一行 → 脏写。
- Seata 在回滚时会比较当前数据与 after image,不一致则报警,人工介入。

**Q3. AT 与 TCC 的取舍?**
- AT:零业务侵入,适合大多数业务;但性能低、隔离低、不支持 NoSQL。
- TCC:业务侵入大,但性能高、隔离强,适合资金账。
- 选型:核心链路 TCC, 非核心链路 AT。

**Q4. AT 能不能改成强一致?**
- 加上"全局锁 + 序列化隔离" → 等价于 XA。
- 但 AT 本身不持有 DB 行锁,只靠全局锁。
- 需要"全场强一致"时,直接用 XA 更简单。

**Q5. Seata Server 怎么保证高可用?**
- TC 集群(store mode:db / file / redis)。
- 内部用 Raft 或主备 + 状态机持久化。
- 客户端通过 `vgroup-mapping` 路由到任意 TC 节点。

---

## 14. Seata 关键源码 / 文档

- `seata-tm`:`@GlobalTransactional` 切面
- `seata-rm-datasource`:`DataSourceProxy` 拦截 SQL,生成 undo_log
- `seata-server`:TC 状态机 + 全局锁 + 持久化
- 官方文档:https://seata.apache.org/
## 15. 延伸阅读

- Seata 整体框架 → [10 · 主流框架矩阵](10-frameworks.md)
- AT 模式三把刀 → [11 · 隔离级别与异常处理](11-isolation-anti-patterns.md)
- 实战案例(电商下单) → [12 · 实战案例](12-case-studies.md)
- 选型决策 → [13 · 选型决策与最佳实践](13-decision-tree.md)
