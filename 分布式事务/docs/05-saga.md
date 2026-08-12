# 05 · Saga 深度剖析

> 目标:把 Saga 模式讲透——编排式 vs 命令式、状态机 DSL、补偿设计、隔离性短板,以及与 TCC 的取舍。

---

## 1. 核心思想

把一个长事务拆为 N 个**本地子事务** `T1, T2, …, Tn`;每个子事务都有对应的**补偿动作** `C1, C2, …, Cn`。
- 任一 `Ti` 失败 → 依次执行 `Ci-1, Ci-2, …, C1` 进行回滚(逆向补偿)。

```
T1 → T2 → T3 → … → Tn
 │   │   │
fail fail fail
 ↓   ↓   ↓
C1  C2  C3
```

---

## 2. 两种协调方式

### 2.1 编排式(Orchestration)

中心协调者(Camunda / Airflow / 自研 Orchestrator)按状态机推进。

```
[Start] → T1 → T2 → T3 → [End]
          │      │
         (f)   (f)
          ▼      ▼
          C1    C2
          ▼      ▼
         Compensating Flow
```

**优点**:流程可视化,调试容易。
**缺点**:中心协调者需高可用;业务量大时协调者压力大。

### 2.2 命令式(Choreography)

无中心节点,通过事件传递;失败时各服务监听补偿事件。

```
订单服务    → publish OrderCreated
库存服务    ← subscribe,扣减,publish InventoryReserved
营销服务    ← subscribe,核销券,publish CouponUsed
支付服务    ← subscribe,扣款,publish PaymentProcessed
```

任意环节失败 → publish `OrderCancelled`,各服务反向补偿。

**优点**:无中心节点,扩展性好。
**缺点**:流程分散,难追踪;事件循环风险。

---

## 3. 经典 Saga 实现

| 实现 | 风格 | 特点 |
| --- | --- | --- |
| **Apache ServiceComb Saga** | 编排式 | 华为开源,JSON / Java 状态机 DSL |
| **Seata Saga** | 编排式 | 基于状态机 DSL |
| **Cadence / Temporal** | 编排式 | 工作流引擎,广义支持 Saga |
| **Apache Airflow** | 编排式 | 通用 DAG 编排 |
| **Eventuate Tram** | 命令式 | 事件驱动 + Saga + CQRS |

---

## 4. 状态机 DSL 示例(Seata Saga)

```java
// 状态机 DSL(JSON)
{
  "Name": "OrderSaga",
  "StartState": "CreateOrder",
  "States": {
    "CreateOrder": {
      "Type": "ServiceTask",
      "ServiceName": "OrderService",
      "ServiceMethod": "create",
      "Next": "ReserveInventory"
    },
    "ReserveInventory": {
      "Type": "ServiceTask",
      "ServiceName": "InventoryService",
      "ServiceMethod": "reserve",
      "CompensateState": "CancelInventory",
      "Next": "DeductBalance"
    },
    "DeductBalance": {
      "Type": "ServiceTask",
      "ServiceName": "AccountService",
      "ServiceMethod": "deduct",
      "CompensateState": "RefundBalance",
      "Next": "Succeed"
    },
    "CancelInventory": { "Type": "ServiceTask", "ServiceMethod": "cancel", "Next": "Compensated" },
    "RefundBalance":  { "Type": "ServiceTask", "ServiceMethod": "refund",  "Next": "Compensated" },
    "Succeed":      { "Type": "Succeed" },
    "Compensated":  { "Type": "Fail" }
  }
}
```

---

## 5. 补偿设计:可逆 vs 不可逆

### 5.1 可逆业务(完美补偿)

| 业务 | 子事务 | 补偿 |
| --- | --- | --- |
| 订单创建 | `create` | `cancel` |
| 库存扣减 | `deduct` | `restock` |
| 余额扣减 | `debit` | `refund` |
| 优惠券核销 | `use` | `release` |

### 5.2 不可逆业务(需业务侧承担)

| 业务 | 失败方式 | 应对 |
| --- | --- | --- |
| 发送短信 | 已发,无法收回 | 业务侧补偿:返券 / 人工 / 退款 |
| 推送通知 | 已推送 | 同上 |
| 第三方支付 | 外部已扣款 | 重试退款接口 + 对账 + 人工兜底 |

> 原则:尽量把不可逆操作放在 Saga 最后;前置用 Saga + 异步对账兜底。

---

## 6. 隔离性:Saga 的最大短板

| 问题 | 表现 | 解决 |
| --- | --- | --- |
| **脏读** | T1 已执行但未提交,其他事务读到中间态 | 业务侧"重读"或"补偿读" |
| **脏写** | T1 失败回滚,但 T2 已基于 T1 的中间态写入 | 业务侧防重 + 版本号 |
| **丢失更新** | T2 覆盖了 T1 的提交 | 乐观锁 / 版本号 |

> 关键:Saga 隔离性极低,事务中的每个子事务对其他事务立即可见。

### 6.1 对策:版本号 + 防腐读

```sql
-- 业务表加 version
UPDATE inventory
SET stock = stock - 1, version = version + 1
WHERE sku_id = ? AND version = ?;
```

补偿动作也要带 version,避免覆盖新数据。

---

## 7. 与 TCC 的对比

| 维度 | Saga | TCC |
| --- | --- | --- |
| 隔离性 | 极低 | 高(Try 冻结) |
| 业务侵入 | 中(每个子事务 + 补偿) | 大(三段方法) |
| 性能 | 高(异步) | 中 |
| 适用 | 长事务、跨服务多步骤 | 短事务、强隔离 |
| 补偿设计 | 经常不可逆 | 一般可逆 |
| 调试 | 编排式易;命令式难 | 易 |

---

## 8. 实战模式

### 8.1 编排式(Saga + 工作流引擎)

```
[Begin] → [CreateOrder] → [ReserveInventory] → [DeductBalance] → [Succeed]
              │                  │                    │
              ▼                  ▼                    ▼
          [CancelOrder]    [CancelInventory]    [RefundBalance] → [Compensated]
```

### 8.2 命令式(Saga + 事件)

```
OrderCreated → InventoryReserved → BalanceDeducted → OrderCompleted
                  │                  │
                  ▼                  ▼
            InventoryCancelled   BalanceRefunded
```

---

## 9. 故障矩阵

| 故障 | 表现 | 应对 |
| --- | --- | --- |
| 编排者宕机 | 状态丢失 | 持久化状态机 + 恢复 |
| 子事务超时 | 协调者重试 | 幂等 |
| 补偿失败 | 协调者重试 | 幂等 |
| 补偿永久失败 | 业务不可逆 | 人工介入 + 对账兜底 |
| 子事务执行后业务态外泄 | 脏读 | 业务侧"补读" |

---

## 10. 优缺点

| 优点 | 缺点 |
| --- | --- |
| 适合长事务 | 没有隔离性,中间状态对外可见 |
| 业务侵入比 TCC 小 | 补偿逻辑设计复杂,部分业务无法完美回滚 |
| 支持异步,性能好 | 调试追踪困难(命令式更难) |
| 不依赖特定数据库 | 命令式流程分散 |

---

## 11. 故障排查 Checklist

- [ ] 状态机是否持久化?
- [ ] 补偿动作是否幂等?
- [ ] 补偿动作是否处理"补偿时业务已变更"?
- [ ] 不可逆操作是否放在 Saga 末尾?
- [ ] 是否有对账兜底?
- [ ] 编排者是否高可用?

---

## 12. 面试高频问题

**Q1. Saga 怎么保证"看似一致"?**
- 不保证强一致,保证"最终一致"。
- 中间状态对外可见,需业务侧补偿(版本号、防腐读)。
- 配合对账兜底,定期校正数据。

**Q2. 编排式 vs 命令式怎么选?**
- 流程复杂、跨多团队 → 编排式(可视化维护成本低)。
- 服务自治要求高、扩展性强 → 命令式(无中心瓶颈)。
- 业界主流:Seata Saga(编排式)、Eventuate Tram(命令式)。

**Q3. Saga 为什么不保证隔离性?**
- Saga 子事务提交通常立即对其他事务可见。
- 2PC 靠持锁隔离,持锁时间长;Saga 牺牲隔离换性能。
- 资金账不能用 Saga,只能容忍最终一致的业务才适合。

**Q4. 怎么解决 Saga 中的脏读?**
- **业务侧补读**:读到中间态时,主动"重读"或"信任补偿"。
- **版本号**:基于旧版本的操作拒绝。
- **语义锁**:业务上把"冻结"作为对外可见的合法状态。

**Q5. Saga 和事件溯源(Event Sourcing)的关系?**
- 事件溯源是存储模式;Saga 是协调模式。
- 两者经常组合:用事件流作为 Saga 的输入和输出。
- 配合 Temporal / Axon 等框架能进一步降低复杂度。
## 13. 延伸阅读

- Saga 与 TCC 的取舍 → [04 · TCC](04-tcc.md)
- 框架实现(Saga 模式) → [10 · 主流框架矩阵](10-frameworks.md)
- 实战案例(电商下单) → [12 · 实战案例](12-case-studies.md)
- 隔离与三把刀 → [11 · 隔离级别与异常处理](11-isolation-anti-patterns.md)
- 选型决策 → [13 · 选型决策与最佳实践](13-decision-tree.md)
