# 12 · 实战案例

> 目标:把"分布式事务"具体落地到三个真实业务场景——电商下单 / 跨行转账 / 库存-订单-支付,看每个环节选什么方案、为什么。

---

## 1. 电商下单跨服务事务

### 1.1 业务流程

```
下单服务 → 订单中心 → 库存服务 → 营销中心 → 支付中心 → 物流预约
```

### 1.2 关键诉求

| 节点 | 一致性 | 性能 | 备注 |
| --- | --- | --- | --- |
| 订单 + 库存 | 必须一致 | 高 | 避免超卖 |
| 优惠券 / 积分 | 可补偿 | 中 | 业务可承担少量补偿 |
| 支付 | 异步回调 | 中 | 允许"超时未支付"中间态 |
| 物流预约 | 最终一致 | 低 | 失败可重试 |

### 1.3 推荐组合

| 节点 | 模式 | 理由 |
| --- | --- | --- |
| 订单 + 库存 | **TCC** 强一致 | 避免超卖;库存冻结 |
| 营销 + 积分 | **可靠消息** 最终一致 | 量级高,容许补偿 |
| 支付 | 异步回调 + 对账 | 外部系统,不强求 |
| 物流 | 异步 + 重试 | 不可控因素多 |

### 1.4 异常流

| 异常 | 触发 | 应对 |
| --- | --- | --- |
| 库存冻结失败 | 库存不足 | 取消订单 |
| 支付超时 | 用户未付款 | 释放库存冻结 + 营销回滚 |
| 物流预约失败 | 第三方异常 | 记录 + 重试 + 人工介入 |
| 营销服务超时 | 下游 OOM | 消息重投 + 幂等 |

### 1.5 关键代码骨架

```java
@GlobalTransactional
public void placeOrder(OrderDTO order) {
    // 1. 订单创建(主单)
    orderDao.create(order);

    // 2. 库存 TCC(冻结)
    inventoryTcc.prepare(order.skuId, order.qty);

    // 3. 营销(可靠消息)
    couponMessage.send(new CouponUseEvent(order.orderId, order.couponId));

    // 4. 支付(异步)
    paymentRpc.create(order);
}
```

### 1.6 故障矩阵

| 故障 | 表现 | 应对 |
| --- | --- | --- |
| 库存冻结超时 | Try 未执行 | 协调者发 Cancel |
| 营销消息丢失 | 消息未投 | 重投 + 幂等 |
| 支付回调失败 | 订单卡"待支付" | 定时轮询 + 对账 |
| 物流预约 5xx | 异步推送失败 | 重试 + 死信队列 |

---

## 2. 跨行转账

### 2.1 关键点

- 资金安全(0 资损)。
- 高可靠 + 最终一致。
- 对账兜底。

### 2.2 方案对比

| 方案 | 适用 | 备注 |
| --- | --- | --- |
| **TCC + 幂等 + 对账** | 经典方案 | 强一致 + 兜底 |
| **Saga + 本地事务** | 备份方案 | 一致性可降级 |
| **NewSQL(TiDB / OceanBase)** | 跨行清算 | 单库分布式事务 |

### 2.3 TCC 转账示例

```java
@TccTransactional
public String transfer(String fromAccount, String toAccount, BigDecimal amount) {
    // A 冻结
    transferTccAction.freeze(fromAccount, amount);
    // B 准备加款
    transferTccAction.prepareAdd(toAccount, amount);
    return "ok";
}
```

### 2.4 状态设计

```sql
-- 账户表
ALTER TABLE account ADD COLUMN freeze_amount DECIMAL(20,2) NOT NULL DEFAULT 0;

-- 流水表
CREATE TABLE transfer_flow (
    tx_id        VARCHAR(64) PRIMARY KEY,
    from_account VARCHAR(64),
    to_account   VARCHAR(64),
    amount       DECIMAL(20,2),
    status       VARCHAR(16),  -- INIT / TRY / OK / CANCELLED
    created_at   TIMESTAMP,
    updated_at   TIMESTAMP
);
```

### 2.5 流程图

```
[A.Try 冻结]  ──ok──► [B.Try 占位]  ──ok──► [A.Confirm 扣款]  ──ok──► [B.Confirm 入账]
    │                       │                       │                       │
    └── fail ──► [A.Cancel 释放] ──► [B.Cancel 释放]                       │
                                                                              │
                                                       ┌──────────────────────┘
                                                       ▼
                                                  [对账每日一次]
```

### 2.6 异常流

| 异常 | 应对 |
| --- | --- |
| A.Try 失败 | 直接走 A.Cancel(空补偿) |
| B.Try 失败 | A.Cancel 释放冻结 |
| A.Confirm 失败 | 协调者重试;幂等 |
| B.Confirm 失败 | 协调者重试;幂等;若永久失败,对账兜底 |
| 网络分区 | 协调者超时 → 全 Cancel;恢复后重新发起 |

### 2.7 对账设计

```sql
-- 日终对账
SELECT from_account, amount, status
FROM transfer_flow
WHERE status = 'OK'
  AND created_at >= CURRENT_DATE;

-- 银行对账文件
SELECT account_id, balance
FROM bank_statement
WHERE date = CURRENT_DATE;

-- 差异处理
SELECT t.account_id, t.our_balance, b.bank_balance
FROM our_balance t
JOIN bank_statement b ON t.account_id = b.account_id
WHERE t.our_balance != b.bank_balance;
```

---

## 3. 库存-订单-支付链路

### 3.1 一致性目标

订单主链路可容忍**暂时性"超时未支付"** 状态,通过对账释放库存。

### 3.2 状态机

```
[Created] → [Paid] → [Shipped] → [Done]
     │                     ↑
     ▼                     │
  [Cancelled] ←────────────┘
       ▲
     超时/对账
```

### 3.3 实现要点

| 要点 | 设计 |
| --- | --- |
| 状态机严格单向 | 业务层校验,不可倒退 |
| 可重入幂等 | 同一订单号多次操作结果相同 |
| 取消订单时发布事件 | 发 `OrderCancelled` 事件 |
| 库存回补 | 监听 `OrderCancelled` 事件 |
| 营销回补 | 监听 `OrderCancelled` 事件 |
| 支付超时 | 30 分钟对账 → 自动取消 |

### 3.4 核心代码

```java
// 订单服务
@GlobalTransactional
public Order createOrder(OrderDTO dto) {
    Order order = orderDao.create(dto);
    inventoryTcc.prepare(dto.skuId, dto.qty);  // TCC 冻结库存
    paymentRpc.create(order);                   // 异步创建支付单
    return order;
}

// 支付回调
public void onPaymentCallback(PaymentCallback cb) {
    if (cb.status == "SUCCESS") {
        orderDao.updateStatus(cb.orderId, "PAID");
    } else {
        // 支付失败,异步补偿
        inventoryTcc.cancel(cb.orderId);
    }
}

// 订单超时取消
@Scheduled(cron = "0 */5 * * * *")
public void cancelExpiredOrders() {
    List<Order> expired = orderDao.findExpired(30, TimeUnit.MINUTES);
    for (Order o : expired) {
        orderDao.updateStatus(o.orderId, "CANCELLED");
        // 异步通知库存回补
        cancelEvent.publish(new OrderCancelled(o.orderId));
    }
}
```

### 3.5 库存回补链路

```
OrderCancelled 事件
   ↓
库存服务订阅
   ↓
库存 +qty(补偿)
   ↓
幂等检查(订单号 + 状态)
```

---

## 4. 选型决策图

| 业务 | 一致性 | 模式 | 框架 |
| --- | --- | --- | --- |
| 电商下单 | 强一致 | TCC + 可靠消息 | Seata TCC + RocketMQ |
| 跨行转账 | 强一致 | TCC + 对账 | Hmily / 自研 |
| 库-订单-支付 | 最终一致 | AT + 状态机 | Seata AT + 状态机 |
| 短信 / 邮件 | 最终一致 | 最大努力通知 | RocketMQ + Retry |
| 跨地域金融 | 强一致 | NewSQL | TiDB / OceanBase |

---

## 5. 实战坑点

| 坑 | 表现 | 解决 |
| --- | --- | --- |
| 库存冻结字段忘记独立 | Cancel 误影响正常业务 | 冻结字段与正式字段分开 |
| 支付回调未带 xid | 排查困难 | 支付单携带业务流水号 |
| 营销回补偿失败 | 优惠券占用 | 营销服务必须幂等 + 重试 |
| 订单超时未对账 | 库存长期占用 | 定时任务 + 对账 |
| 状态机可倒退 | 数据错乱 | 状态字段加单向约束 |

---

## 6. 真实案例对比

### 6.1 阿里电商下单

- 订单 + 库存:TCC 冻结 + 异步 Confirm。
- 营销:RocketMQ 事务消息 + 幂等。
- 支付:异步回调 + RocketMQ。
- 物流:最大努力通知 + 对账。

### 6.2 银行跨行清算

- 入境:文件解析 + 事务消息入库。
- 清算:批量 TCC 冻结 + 异步提交。
- 对账:每日 3 次对账 + 差异人工。

### 6.3 12306 购票

- 余票:强一致(Redis + DB)。
- 订单:异步 + 状态机。
- 支付:RocketMQ 异步 + 30 分钟超时回滚。

---

## 7. 故障排查 Checklist

- [ ] 业务是否区分"必须强一致"与"可最终一致"?
- [ ] 资源冻结字段是否独立?
- [ ] 异常流的每一步都有应对吗?
- [ ] 对账任务是否覆盖所有异步链路?
- [ ] 状态机是否单向?
- [ ] 是否有超时未处理的订单告警?

---

## 8. 面试高频问题

**Q1. 电商下单该用 TCC 还是 AT?**
- 订单 + 库存:TCC(强隔离,避免超卖)。
- 营销 + 积分:可靠消息(高吞吐)。
- 支付:异步回调(不可控)。
- 不要全链路 TCC,会拖慢整条链路。

**Q2. 跨行转账为什么不用 NewSQL 一把梭?**
- 跨行 = 跨银行,NewSQL 只能解决行内清算。
- 跨行需要走央行或三方通道,必须靠"消息 + 对账 + 人工兜底"。
- TCC 只处理行内,跨行异步 + 对账兜底。

**Q3. 库存超卖怎么避免?**
- **DB 行锁**:`SELECT … FOR UPDATE`(强隔离,性能差)。
- **乐观锁**:version 字段。
- **库存冻结**:TCC / Saga 提前预留。
- **Redis 原子操作**:扣减前 `DECR`,扣后回滚。
- 业务量大时优先 Redis + DB 最终一致。

**Q4. 支付回调超时怎么办?**
- 30 分钟内支付确认 → 订单正常推进。
- 30 分钟未支付 → 订单超时 → 库存回补 + 营销回滚。
- 终态对账:每日核对"我们的订单 vs 支付通道",差异人工。

**Q5. 怎么评估"业务一致性"够不够?**
- 资金账:必须强一致(0 资损)。
- 订单核心:强一致(库存、订单)。
- 营销:最终一致(可补偿)。
- 通知:最大努力通知(对账兜底)。
- 跨地域业务:NewSQL 或最终一致。
## 9. 延伸阅读

- TCC 的 Try/Confirm/Cancel 落地 → [04 · TCC](04-tcc.md)
- Saga 状态机 → [05 · Saga](05-saga.md)
- AT 模式与 Seata → [06 · AT 模式](06-at-seata.md)
- 消息 + 幂等 + 重试 → [07 · 消息、Outbox、通知](07-messaging.md)
- 三把刀 → [11 · 隔离级别与异常处理](11-isolation-anti-patterns.md)
- 选型决策 → [13 · 选型决策与最佳实践](13-decision-tree.md)
