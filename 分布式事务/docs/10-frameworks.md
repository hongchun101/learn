# 10 · 主流框架与中间件

> 目标:把"主流框架"横向对比,看清每个框架擅长什么、踩过哪些坑,选型时直接对照。

---

## 1. 全景矩阵

| 框架 | 模式 | 主导方 | 语言 | 特色 |
| --- | --- | --- | --- | --- |
| **Seata** | AT / TCC / Saga / XA | 阿里 + 蚂蚁 | Java | 国内最流行,多种模式统一 |
| **Apache ServiceComb Saga** | Saga | 华为 | Java | JSON 状态机 DSL |
| **ByteTCC** | TCC | 字节跳动 | Java | 高性能动态代理 |
| **Hmily** | TCC / Saga / 消息 | 京东 | Java | 注解式混合 |
| **EasyTransaction** | TCC + 补偿 | 新浪 | Java | 多种补偿模式统一抽象 |
| **Apache RocketMQ** | 事务消息 | 阿里 | Java | 半消息 + 回查 |
| **DTM** | XA / TCC / SAGA / 消息 / Outbox | 国内社区 | Go | 子事务屏障,易上手 |
| **Eventuate Tram** | Saga + CQRS | Chris Richardson | Java | 事件驱动 |

---

## 2. Seata

### 2.1 模块

| 模块 | 作用 |
| --- | --- |
| TC(Transaction Coordinator) | 协调者,维护全局/分支事务状态 |
| TM(Transaction Manager) | 事务管理器,定义全局事务边界 |
| RM(Resource Manager) | 资源管理器,管理分支资源 |

### 2.2 模式矩阵

| 模式 | 适用 | 关键 |
| --- | --- | --- |
| AT | 关系型数据库自动事务 | 自动反向 SQL |
| TCC | 高一致性、性能敏感 | 三段方法 |
| Saga | 长事务 | 状态机 |
| XA | 强一致、传统数据库 | 数据库 XA |

### 2.3 Spring Boot 集成

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
```

```java
@GlobalTransactional
public void orderSaga(OrderDTO dto) { ... }
```

### 2.4 部署模式

- **单机**:开发调试。
- **集群**:DB / File / Redis 持久化 + 多节点。
- **高可用**:建议至少 3 节点,持久化用 DB(MySQL)。

---

## 3. Apache ServiceComb Saga

- 华为开源,Saga 编排框架。
- 支持 JSON / Java 状态机 DSL。
- 提供 Java 客户端 Pack。
- 与 ServiceComb 微服务体系融合度高。

### 3.1 状态机示例

```json
{
  "Name": "OrderSaga",
  "StartState": "CreateOrder",
  "States": {
    "CreateOrder": {
      "Type": "ServiceTask",
      "ServiceName": "OrderService",
      "ServiceMethod": "create",
      "Next": "ReserveInventory"
    }
  }
}
```

---

## 4. ByteTCC / Hmily / EasyTransaction

### 4.1 ByteTCC

| 特性 | 描述 |
| --- | --- |
| 开发者 | 字节跳动 |
| 特色 | 高性能 TCC,动态代理 |
| 适用 | 高并发 TCC 场景 |

### 4.2 Hmily

| 特性 | 描述 |
| --- | --- |
| 开发者 | 京东 |
| 特色 | TCC + Saga + 本地消息表混合,注解式 |
| 适用 | 多模式混合场景 |

#### Hmily 示例

```java
@HmilyTCC(confirmMethod = "confirm", cancelMethod = "cancel")
public boolean prepare(Long userId, BigDecimal amount) {
    return accountDao.tryDebit(userId, amount);
}

public boolean confirm(Long userId, BigDecimal amount) {
    return accountDao.confirmDebit(userId, amount);
}

public boolean cancel(Long userId, BigDecimal amount) {
    return accountDao.cancelDebit(userId, amount);
}
```

### 4.3 EasyTransaction

| 特性 | 描述 |
| --- | --- |
| 开发者 | 新浪 |
| 特色 | TCC + 多种补偿模式统一抽象 |
| 适用 | 复杂业务编排 |

---

## 5. Apache RocketMQ 事务消息

详见 [07 · 消息、Outbox、通知](07-messaging.md)。

- 半消息 + 回查机制。
- 与 Spring 集成 `@RocketMQMessageListener`。
- 适用:核心业务 + 异步解耦。

---

## 6. DTM(分布式事务管理器)

### 6.1 概览

- 国产 **Go 语言**实现的分布式事务框架(轻量、高性能)。
- 支持 **XA、TCC、SAGA、消息、Outbox、子事务屏障**。
- 子事务屏障(Barrier)自动处理空补偿 / 防悬挂 / 幂等。

### 6.2 子事务屏障(Barrier)

```go
if barrier.CallWithCurrent(tx, func() error {
    // 业务逻辑(Insert)
}) {
    // 成功
}
```

- 实现原理:在 DB 中插入 `id_barrier` 行,根据 unique key 锁定防止重复。

### 6.3 优势

- 跨语言:HTTP / gRPC 接口,任何语言都能接入。
- 易部署:Go 单二进制 + DB/Redis 即可运行。
- 易理解:Barrier 模式让三把刀自动消失。

---

## 7. Eventuate Tram

### 7.1 概览

- 基于事件驱动的 Saga 框架。
- 消息存储在 MySQL/Postgres 中(CDC 投递到 Kafka)。
- 支持 Saga + CQRS。

### 7.2 适用

- 事件驱动架构 + Saga。
- 需要 CQRS 分离读写模型。

---

## 8. 选型决策

| 业务 | 推荐 |
| --- | --- |
| 已有 Spring 生态 + 多种业务 | Seata |
| 纯 saga 编排 + Java | ServiceComb Saga / Seata Saga |
| 高并发 TCC + 已有 Java 体系 | ByteTCC / Hmily |
| 跨语言接入 | DTM |
| 核心业务 + 异步解耦 | RocketMQ 事务消息 |
| 事件驱动架构 | Eventuate Tram |

---

## 9. 框架常见坑

| 坑 | 表现 | 解决 |
| --- | --- | --- |
| Seata AT 隔离级别 | 仅 Read Uncommitted | 业务侧补 `FOR UPDATE` |
| Seata TCC 资源冻结 | 业务字段改造 | 提前设计冻结字段 |
| Saga 补偿不可逆 | 最后一步发送短信 | 业务承担 / 返券 |
| RocketMQ 事务消息 | Producer 重启后状态丢失 | checkLocalTransaction 必须幂等 |
| CDC 延迟 | 实时性下降 | 监控 binlog 位点 |

---

## 10. 故障排查 Checklist

- [ ] 协调者是否高可用?
- [ ] 持久化(store mode)是否配置?
- [ ] 客户端版本是否与 Server 兼容?
- [ ] 监控大盘是否覆盖所有事务状态?
- [ ] 是否有"UNKNOWN"状态堆积?

---

## 11. 面试高频问题

**Q1. Seata 为什么能一个框架支持 4 种模式?**
- 抽象出"协调者 + 资源管理器"两层。
- 协调者统一管理事务状态;资源管理器按模式实现不同的 prepare/confirm/cancel。
- 业务侧只需要选模式,框架封装细节。

**Q2. DTM 跟 Seata 最大的区别?**
- 语言:DTM 是 Go,Seata 是 Java。
- DTM Barrier 把"空补偿/防悬挂/幂等"做成框架关键字,业务不感知。
- 跨语言:DTM 走 HTTP/gRPC,任何语言都能接入。

**Q3. 多模式混用(Seata AT + TCC)会不会冲突?**
- 不会。每个分支事务选好自己的模式即可。
- TC 不关心模式,只关心全局事务状态。
- 全局注解 `@GlobalTransactional` 包裹所有分支。

**Q4. RocketMQ 事务消息是分布式事务框架吗?**
- 严格说,不是"完整"分布式事务框架。
- 它解决"业务表 + 消息"原子投递,达成最终一致。
- 后续消费链仍需补偿 + 幂等 + 对账。

**Q5. 选型时优先看业务还是看框架?**
- 优先看业务:一致性要求、性能、运维能力、成本。
- 框架是工具,业务是约束。
- 不要"为了用 Seata 而用 Seata"。
