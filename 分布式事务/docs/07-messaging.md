# 07 · 消息、Outbox、通知

> 目标:把"消息驱动的最终一致性"系列方案讲透——本地消息表 / RocketMQ 事务消息 / Kafka 事务 / Outbox / CDC / 最大努力通知,各自适用、失败模式、坑点。

---

## 1. 本地消息表(Local Message Table)

### 1.1 思想

将分布式事务转换为**本地事务 + 异步投递**:
- 业务数据和消息**写同一张表** → 同一本地事务 → 同时成功 / 失败。
- 独立 worker 扫描消息表 → 投递到 MQ → 下游消费。
- 下游消费失败 → 靠重试 + 幂等保障最终一致。

### 1.2 流程

```sql
-- 本地事务
BEGIN
  INSERT INTO orders ...;
  INSERT INTO local_message(outbox, status='PENDING') ...;
COMMIT;

-- Worker 异步
loop
  SELECT * FROM local_message WHERE status='PENDING' LIMIT 100;
  foreach msg
    sendMQ(msg);
    UPDATE local_message SET status='SENT';
END
```

### 1.3 优缺点

| 优点 | 缺点 |
| --- | --- |
| 实现简单,主流数据库即可 | 轮询开销;实时性受轮询频率影响 |
| 与本地事务同库,原子写 | 需要一个调度 worker |
| 投递 at-least-once | 下游必须幂等 |

### 1.4 优化

- 开启 `transactional outbox` 自动发布(Kafka Connect / Debezium)。
- 用数据库 CDC 代替 polling:订阅 binlog → Kafka。

---

## 2. 事务消息(Transactional Outbox / RocketMQ)

### 2.1 RocketMQ 事务消息的两阶段

```
Producer → Broker 半消息(Half Message)
          ↓
   执行本地事务(orderDao.insert)
          ↓
   根据本地事务结果:
   - 成功 → COMMIT Message → 消息对消费者可见
   - 失败 → ROLLBACK Message → 删除
   - UNKNOWN → Broker 回查(RPC 调 Producer)
```

### 2.2 流程

```
┌────────────┐         ┌────────────┐         ┌─────────────┐
│ Producer   │ ──①───▶ │   Broker   │ ──③───▶ │  Consumer   │
│            │         │ (Half Msg) │         │             │
│            │ ──②───▶ │            │         │             │
│ Local tx   │         │            │         │             │
└────────────┘         └────────────┘         └─────────────┘
       ▲                    │
       └── ⑥ 回查 ───────────┘
```

### 2.3 代码示例

```java
TransactionMQProducer producer = new TransactionMQProducer("g1");
producer.setNamesrvAddr("namesrv:9876");
producer.start();

Message msg = new Message("OrderTopic", "TAG", body.getBytes());
TransactionSendResult result = producer.sendMessageInTransaction(
    msg,
    new LocalTransactionExecutor() {
        @Override
        public LocalTransactionState executeLocalTransactionBranch(Message m, Object arg) {
            try {
                orderDao.create((OrderDTO) arg);  // 本地事务
                return LocalTransactionState.COMMIT_MESSAGE;
            } catch (Exception e) {
                return LocalTransactionState.ROLLBACK_MESSAGE;
            }
        }

        @Override
        public LocalTransactionState checkLocalTransactionBranch(MessageExt m) {
            // Broker 回查
            return orderDao.exists(m.getKeys()) ?
                LocalTransactionState.COMMIT_MESSAGE :
                LocalTransactionState.ROLLBACK_MESSAGE;
        }
    },
    order);

System.out.println(result.getLocalTransactionState());
```

### 2.4 故障矩阵

| 故障 | 表现 | 应对 |
| --- | --- | --- |
| 本地事务成功后,COMMIT 失败 | 消息未发送,但订单已建 | Broker 回查;Producer 用订单存在性判断 |
| 本地事务失败但已发 COMMIT | 消息发出,但订单未建 | 极少见;Producer 端需幂等 + 业务校验 |
| Consumer 消费失败 | 业务未执行 | 消费重试 + 幂等 |
| Broker 回查一直 UNKNOWN | 状态不确定 | Producer 端最终以业务库为准 |

---

## 3. Kafka 事务消息

Kafka 0.11+ 提供 `Transactional API`,跨分区 / 主题的"恰好一次"语义:

```java
properties.put(ProducerConfig.TRANSACTIONAL_ID_CONFIG, "order-tx-1");
KafkaProducer<String, String> producer = new KafkaProducer<>(properties);
producer.initTransactions();
try {
    producer.beginTransaction();
    producer.send(new ProducerRecord<>("order-topic", order));
    producer.send(new ProducerRecord<>("audit-topic", order));
    producer.commitTransaction();
} catch (Exception e) {
    producer.abortTransaction();
}
```

> ⚠️ **Kafka 事务是"流处理事务",不绑定外部业务数据库**——它不能完全替代分布式事务。与 Outbox 模式配合最佳。

---

## 4. Outbox + CDC

### 4.1 思想

- 业务表 + outbox 表在同一本地事务中写入。
- CDC 工具(Debezium / Canal / Maxwell)订阅 binlog → 投递到 Kafka。
- 下游在 Kafka 上消费。

### 4.2 优势

| 优势 | 说明 |
| --- | --- |
| 实时性 | 毫秒级投递 |
| 无轮询 | 推模式 |
| 解耦 | 业务不感知 CDC |
| 跨库 | 多业务库统一进 Kafka |

### 4.3 Debezium + Kafka Connect 示例

```json
{
  "name": "inventory-connector",
  "config": {
    "connector.class": "io.debezium.connector.mysql.MySqlConnector",
    "database.hostname": "mysql",
    "database.port": "3306",
    "database.user": "debezium",
    "database.password": "dbz",
    "database.server.id": "184054",
    "database.server.name": "fullfillment",
    "table.include.list": "inventory.outbox",
    "transforms": "outbox",
    "transforms.outbox.type": "io.debezium.transforms.outbox.EventRouter"
  }
}
```

---

## 5. 最大努力通知(Best Effort Notification)

### 5.1 适用场景

不需要保证对方一定成功,但希望**尽最大努力去通知**:
- 支付结果通知商户。
- 第三方平台结果回执。
- 短信 / 邮件 / 站内信。

### 5.2 实现要点

- 失败重试:有限次数 + 指数退避。
- 最终一致性:对账兜底(定时核对)。
- 调用方必须幂等。

### 5.3 代码骨架

```java
public void notifyMerchant(String orderId) {
    int attempt = 0;
    while (attempt < MAX_RETRY) {
        try {
            boolean ok = merchantClient.notify(orderId);
            if (ok) return;
        } catch (Exception ignored) {
            sleep(expBackoff(attempt));
        }
        attempt++;
    }
    // 入"兜底表",由对账任务 / 人工介入
    fallbackRepo.insert(new NotifyRecord(orderId, "notify-fail"));
}
```

### 5.4 与可靠消息最终一致性的区别

| 维度 | 最大努力通知 | 可靠消息最终一致性 |
| --- | --- | --- |
| 是否保证对方成功 | 否,允许失败最终人工 | 是,通过重试和补偿保证对齐 |
| 流程 | 系统 → 业务方 | 系统 → MQ → 业务方 |
| 适用 | 通知、对账 | 跨服务核心业务 |

---

## 6. 可靠消息最终一致性

### 6.1 思路

通过**消息中间件 + 重试 + 幂等 + 监控告警**来确保最终一致。

```
┌─────────────────┐  发本地消息  ┌──────────────┐   投递    ┌──────────┐
│ 服务 A(本地事务) │ ──────────▶ │   MQ/RocketMQ│ ────────▶ │ 服务 B   │
└─────────────────┘             └──────────────┘           └──────────┘
                                                                │
                                                              消费 + 幂等
                                                                ▼
                                                             [下游业务]
```

### 6.2 关键设计

1. **消息可靠投递**:at-least-once + 消费者幂等。
2. **消费幂等**:唯一业务键去重表 / Redis SETNX / DB 唯一索引。
3. **重试策略**:失败队列 + 阶梯重试(立即 / 1min / 5min / 30min)。
4. **死信队列**:兜底存储,人工介入。

### 6.3 完整示例(订单 + 库存)

```java
// 服务 A:订单服务
@Transactional
public void placeOrder(OrderDTO dto) {
    orderDao.create(dto);
    messageProducer.sendTxMsg("OrderCreated", dto);
}

// 服务 B:库存服务
@RocketMQMessageListener(topic = "OrderCreated")
public class InventoryListener implements RocketMQListener<OrderDTO> {
    public void onMessage(OrderDTO dto) {
        if (deductLogRepo.exists(dto.orderId)) return;  // 幂等
        inventoryDao.deduct(dto.skuId, dto.qty);
        deductLogRepo.markSuccess(dto.orderId);
    }
}
```

---

## 7. 消息方案对比

| 方案 | 实时性 | 业务侵入 | 复杂度 | 适用 |
| --- | --- | --- | --- | --- |
| 本地消息表 | 秒级 | 中(多一张表) | 低 | 简单业务 |
| RocketMQ 事务消息 | 毫秒级 | 低 | 中 | 高吞吐核心 |
| Kafka 事务 | 毫秒级 | 低 | 中 | 流处理 |
| Outbox + CDC | 毫秒级 | 极低(Debezium 透明) | 中(运维 CDC) | 多库聚合 |
| 最大努力通知 | 不承诺 | 极低 | 低 | 通知、对账 |

---

## 8. 故障排查 Checklist

- [ ] 消息是否带 traceId?能否串联全链路?
- [ ] 消费幂等键是否齐全?
- [ ] 重试上限是否合理?
- [ ] 死信队列是否有监控告警?
- [ ] CDC 工具是否有延迟监控?
- [ ] 对账任务是否覆盖所有异步链路?

---

## 9. 面试高频问题

**Q1. 本地消息表 vs RocketMQ 事务消息?**
- 本地消息表:通用,任何 DB + 任何 MQ;实时性依赖轮询。
- RocketMQ 事务消息:半消息 + 回查,实时性更好;依赖 RocketMQ。
- 选型:已有 RocketMQ → 事务消息;跨 MQ 兼容 → 本地消息表。

**Q2. Kafka 事务能替代分布式事务吗?**
- 不能。Kafka 事务只保证"流处理事务"——多个 Kafka topic + 写一次。
- 它不绑定外部业务数据库,不能保证"业务表 + Kafka 消息"原子。
- 与 Outbox 模式配合才是正解。

**Q3. CDC 会不会丢消息?**
- Debezium 基于 binlog 严格顺序,正常情况下不丢。
- 异常场景:主从切换 / binlog 清理 → 需要监控 binlog 位点。
- 关键:CDC 投递层本身的"at-least-once"语义 + 下游幂等。

**Q4. 最大努力通知和可靠消息本质区别?**
- 最大努力通知:不保证成功,允许失败,靠对账兜底。
- 可靠消息:必须达成最终一致,靠 MQ + 重试 + 幂等。
- 选型:通知类用最大努力;核心业务用可靠消息。

**Q5. 消息方案为什么都强调"幂等"?**
- at-least-once 投递 → 必然出现重复消息。
- 消费者侧必须幂等,否则重复扣款 / 重复发货。
- 幂等键:业务唯一键(订单号、流水号)。
## 10. 延伸阅读

- 消息 + 业务原子化的另一思路 → [04 · TCC](04-tcc.md) / [06 · AT 模式](06-at-seata.md)
- RocketMQ 事务消息框架细节 → [10 · 主流框架矩阵](10-frameworks.md)
- 幂等 / 空补偿 / 防悬挂 → [11 · 隔离级别与异常处理](11-isolation-anti-patterns.md)
- 实战案例(订单 + 库存) → [12 · 实战案例](12-case-studies.md)
