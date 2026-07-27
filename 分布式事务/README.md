# 分布式事务完全教程：所有解决方案面面俱到

> 本教程系统性地梳理分布式事务领域的全部主流解决方案,从理论基石(CAP/BASE/ACID)到具体实现(2PC/3PC/TCC/Saga/AT/Seata/Outbox/MQ/最大努力通知/共识协议/NewSQL 等),涵盖原理、流程、异常处理、代码示例、优缺点对比与选型决策树,目标是让你"一文搞定"分布式事务。

---

## 目录

- [第 1 章 分布式事务的理论基石](#第-1-章-分布式事务的理论基石)
- [第 2 章 分布式事务的问题模型](#第-2-章-分布式事务的问题模型)
- [第 3 章 强一致性方案](#第-3-章-强一致性方案)
  - [3.1 两阶段提交(2PC/XA)](#31-两阶段提交2pcxa)
  - [3.2 三阶段提交(3PC)](#32-三阶段提交3pc)
  - [3.3 Percolator / Spanner 2PC](#33-percolator--spanner-2pc)
- [第 4 章 最终一致性方案](#第-4-章-最终一致性方案)
  - [4.1 TCC(Try-Confirm-Cancel)](#41-tcctry-confirm-cancel)
  - [4.2 Saga 模式](#42-saga-模式)
  - [4.3 AT 模式(Seata)](#43-at-模式seata)
  - [4.4 本地消息表(Local Message Table)](#44-本地消息表local-message-table)
  - [4.5 事务消息(Transactional Outbox / RocketMQ)](#45-事务消息transactional-outbox--rocketmq)
  - [4.6 最大努力通知(Best Effort Notification)](#46-最大努力通知best-effort-notification)
  - [4.7 可靠消息最终一致性](#47-可靠消息最终一致性)
- [第 5 章 共识与复制协议](#第-5-章-共识与复制协议)
  - [5.1 Paxos / Raft](#51-paxos--raft)
  - [5.2 Zab(ZooKeeper)](#52-zabzookeeper)
  - [5.3 Quorum NWR](#53-quorum-nwr)
- [第 6 章 NewSQL 与计算下推](#第-6-章-newsql-与计算下推)
  - [6.1 Google Spanner](#61-google-spanner)
  - [6.2 TiDB / TiKV](#62-tidb--tikv)
  - [6.3 CockroachDB / YugabyteDB](#63-cockroachdb--yugabytedb)
  - [6.4 OceanBase](#64-oceanbase)
- [第 7 章 主流框架与中间件](#第-7-章-主流框架与中间件)
  - [7.1 Seata](#71-seata)
  - [7.2 Apache ServiceComb Saga](#72-apache-servicecomb-saga)
  - [7.3 ByteTCC / Hmily / EasyTransaction](#73-bytcc--hmily--easytransaction)
  - [7.4 Apache RocketMQ 事务消息](#74-apache-rocketmq-事务消息)
  - [7.5 DTM(分布式事务管理器)](#75-dtm分布式事务管理器)
  - [7.6 Eventuate Tram](#76-eventuate-tram)
- [第 8 章 隔离级别与异常处理](#第-8-章-隔离级别与异常处理)
  - [8.1 分布式隔离级别](#81-分布式隔离级别)
  - [8.2 空补偿、防悬挂、幂等](#82-空补偿防悬挂幂等)
- [第 9 章 实战案例](#第-9-章-实战案例)
  - [9.1 电商下单跨服务事务](#91-电商下单跨服务事务)
  - [9.2 跨行转账](#92-跨行转账)
  - [9.3 库存-订单-支付链路](#93-库存-订单-支付链路)
- [第 10 章 选型决策](#第-10-章-选型决策)
- [第 11 章 性能、可观测与最佳实践](#第-11-章性能可观测与最佳实践)
- [第 12 章 未来趋势](#第-12-章未来趋势)
- [附录:速查表与参考资料](#附录速查表与参考资料)

---

## 第 1 章 分布式事务的理论基石

### 1.1 ACID(单机事务)

传统关系数据库的 4 个特性:

| 特性          | 含义                                                                  |
| ----------- | ------------------------------------------------------------------- |
| A 原子性(Atomicity) | 事务中的操作要么全部成功,要么全部失败回滚                                                |
| C 一致性(Consistency) | 事务前后,数据从一个一致状态变换到另一个一致状态(由业务约束 + 原子性 + 隔离性共同保证)                    |
| I 隔离性(Isolation)  | 并发事务之间互不干扰,各事务像独占系统一样运行                                            |
| D 持久性(Durability) | 事务一旦提交,对数据的修改永久生效,即使宕机也不丢失                                        |

### 1.2 CAP 定理(2000,Eric Brewer)

在一个分布式系统中,**一致性(Consistency)**、**可用性(Availability)**、**分区容忍性(Partition tolerance)** 三者不可兼得,最多只能同时满足其中两个。

$$
\text{CAP}: \quad C \land A \land P \;\;\text{不可同时成立}
$$

- **CP**:放弃可用性,追求强一致性(ZooKeeper、etcd、Consul、HBase)。
- **AP**:放弃强一致性,追求可用性 + 分区容忍(大多数互联网系统:Eureka、Cassandra、DynamoDB、Couchbase)。
- **CA**:放弃分区容忍(传统关系数据库单机/主备;分布式场景下不现实)。

> 注意:这里的 C 是**线性一致性(Linearizability)**,不是 ACID 中的 C。

### 1.3 BASE 理论

BASE = Basically Available(基本可用) + Soft state(软状态) + Eventually consistent(最终一致性)。
是大规模互联网系统对 CAP 中 AP 选择的工程化总结。

- **基本可用**:允许损失部分可用性(响应时间降级、功能降级)。
- **软状态**:允许系统存在中间状态(数据副本同步中)。
- **最终一致性**:经过一段时间后,所有副本最终达成一致。

### 1.4 ACID vs BASE

| 维度    | ACID                       | BASE                                  |
| ----- | -------------------------- | ------------------------------------- |
| 目标    | 强一致                        | 最终一致                                  |
| 复杂度   | DB 内置,易用                   | 应用层处理                                 |
| 性能    | 较差,锁竞争                     | 高并发友好                                 |
| 适用    | 金融、ERP、订单核心                 | 电商、社交、物流、内容                          |
| 关系    | 与 CAP 中 C 对应              | 与 CAP 中 AP 对应                       |

### 1.5 一致性模型谱系

```
强 ───────> 弱
线性一致性 > 顺序一致性 > 因果一致性 > 读已写一致性 > 单调读一致性 > 最终一致性
```

- **线性一致性(Linearizability)**:任何一次读都能看到最近一次写。
- **顺序一致性(Sequential)**:所有操作存在某种全局顺序,每个客户端的操作顺序在该顺序中保留。
- **因果一致性(Causal)**:有因果关系的操作有序,无因果关系的可并发。
- **最终一致性(Eventually)**:停止写入后,经过有限时间所有副本收敛。

### 1.6 衡量分布式系统的指标

- **可用性**:可用时间 / 总时间 → SLA(99.9%、99.99%、99.999%)。
- **延迟与吞吐**:P50 / P99 / P999 / QPS / TPS。
- **一致性强度**(如 1.5 所列)。
- **故障恢复时间(RTO)** 与 **数据丢失容忍(RPO)**。

---

## 第 2 章 分布式事务的问题模型

### 2.1 为什么需要分布式事务?

当业务数据/计算分布在多个节点(微服务、数据库分片、不同存储)上,**单机 ACID 事务无法跨节点保证原子性**。典型场景:

- 跨数据库:订单库 + 库存库 + 支付库。
- 跨服务:订单服务、库存服务、支付服务。
- 跨地域:多机房、多区域。
- 跨存储:MySQL + Redis + ES + Hive。
- 跨异构系统:与外部银行、第三方支付、物流对接。

### 2.2 经典问题举例

#### 例 1:电商下单

```
下单服务 → 订单库(创建订单)
        → 库存服务(扣减库存)
        → 优惠券服务(核销券)
        → 支付服务(创建支付单)
```

任一失败 → 全部回滚。

#### 例 2:跨行转账

A 行扣款 + B 行加款,任何一方失败都不能让资金账目失衡。

### 2.3 业务层面的常见诉求

| 诉求      | 解决方案                                              |
| ------- | ------------------------------------------------- |
| 不允许资损   | 强一致(TCC、AT、Saga 编排)                              |
| 允许短暂不一致 | 最终一致(消息、Outbox、最大努力通知)                          |
| 性能优先    | Saga + 异步 / 消息 / 最大努力通知                         |
| 强隔离     | 同步阻塞(2PC/XA、TCC),但吞吐低                              |

### 2.4 分布式事务实现的四大流派

```
┌──────────────────────────────────────────────────────────────────┐
│                  分布式事务实现流派                                │
├──────────────────────────────────────────────────────────────────┤
│ 1. 基于 XA/2PC 协议(数据库层)              →  强一致、阻塞、低吞吐    │
│ 2. 基于补偿/工作流(Saga、TCC)              →  业务侵入、最终一致   │
│ 3. 基于可靠消息(MQ、Outbox)                →  最终一致、性能好      │
│ 4. 基于共识协议(Raft、Spanner)             →  全球强一致、NewSQL    │
└──────────────────────────────────────────────────────────────────┘
```

---

## 第 3 章 强一致性方案

### 3.1 两阶段提交(2PC/XA)

#### 3.1.1 协议角色

- **协调者(Coordinator)**:事务管理器(TM),负责推动两阶段。
- **参与者(Participant)**:资源管理器(RM),数据库/服务。

#### 3.1.2 流程

```
                协调者                         参与者 A     参与者 B
                  │                              │           │
                  │────── ① prepare ────────────►│           │
                  │────── ① prepare ─────────────┼──────────►│
                  │                              │           │
                  │◄────── ②a vote-yes ───────────┤           │
                  │◄────── ②b vote-yes ───────────┼───────────┤
                  │                              │           │
                  │─── ③ commit(if all yes) ────►│           │
                  │─── ③ commit ────────────────┼──────────►│
```

**阶段 1(PREPARE)**:协调者向所有参与者发 PREPARE,参与者本地写入 redo/undo 日志并锁定资源,投票 yes/no。

**阶段 2(COMMIT/ROLLBACK)**:协调者汇总投票:
- 全部 yes → 发 COMMIT。
- 任一 no 或超时 → 发 ROLLBACK。

#### 3.1.3 XA 规范

XA 是 X/Open 组织定义的分布式事务接口规范(DTP 模型):

```
        Application(AP)
             │
   ┌─────────┴─────────┐
   │   Transaction     │      ← TX 接口(begin/commit/rollback)
   │   Manager (TM)    │
   └─────────┬─────────┘
             │  XA 接口(prepare/commit/rollback)
   ┌─────────┼─────────┐
   │         │         │
 RM(RDBMS) RM(MQ)   RM(...)
```

JDBC 中的 `javax.sql.XAConnection`、JTA(Java Transaction API)都遵循 XA。

#### 3.1.4 2PC 的致命缺陷

1. **同步阻塞**:所有参与者在 PREPARE 后持有锁,直到协调者发最终指令。
2. **协调者单点**:协调者宕机 → 全员阻塞;需借助备份协调者 + 日志持久化。
3. **数据不一致**:第二阶段部分收到 COMMIT、部分未收到 → 不一致(脑裂)。
4. **性能差**:两次 RPC + 写日志 + 持锁,不适合高并发。

#### 3.1.5 代码示例(Java + Atomikos)

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

    // 数据源 1
    updateOrderDs1();
    // 数据源 2
    updateAccountDs2();

    tx.commit();
} catch (Exception e) {
    tx.rollback();
}
```

#### 3.1.6 MySQL XA 实践

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

-- 两端都 PREPARE 成功后,任一节点执行:
XA COMMIT 'tx-1';
XA COMMIT 'tx-2';
```

#### 3.1.7 改进:Mysql XA 的注意点

- MySQL 5.7 之前不支持 XA 的 binlog,8.0 才稳定。
- 在阿里云 RDS / PolarDB 上是常用方案之一。

### 3.2 三阶段提交(3PC)

在 2PC 基础上插入 `CanCommit` 预询,以及引入参与者超时机制,降低阻塞范围。

#### 3.2.1 流程

```
阶段 1 CanCommit  :协调者询问参与者能否提交(只读不锁)。
阶段 2 PreCommit  :参与者写 redo/undo 日志,锁定资源。
阶段 3 DoCommit   :参与者执行 commit。
```

#### 3.2.2 优势 / 局限

- 减少同步阻塞(CanCommit 不锁)。
- 引入超时后,参与者可在协调者失联时自我提交或回滚。
- **但**:网络分区出现"假成功"时仍可能不一致;实际系统很少采用,被 Paxos/Raft 等共识协议取代。

### 3.3 Percolator / Spanner 2PC

Google 在大规模分布式数据库上采用的两阶段提交:**Percolator** → **Spanner**。
特点:

1. 第一阶段,各 shard 写事务数据到一个**带时间戳**的位置。
2. 第二阶段,**Primary** 记录 commit 标记,其他 shard 通过读 Primary 决定可见性。
3. Spanner 借助 TrueTime + Paxos 实现**外部一致性(External Consistency)**。

```
Client → Txn Manager → 多数派写入(Prepare)
                     → Primary 提交点(Commit Point)
                     → 各 Shard 应用事务
```

详细实现见 [第 6 章 NewSQL](#第-6-章-newsql-与计算下推)。

---

## 第 4 章 最终一致性方案

### 4.1 TCC(Try-Confirm-Cancel)

#### 4.1.1 思想

将一个业务操作拆分为三个阶段:

- **Try**:资源预留(冻结),检查 + 预留必要资源。
- **Confirm**:真正执行业务;使用 Try 阶段冻结的资源。要求**幂等**。
- **Cancel**:释放 Try 阶段冻结的资源。要求**幂等** + **空回滚容忍**。

#### 4.1.2 流程图

```
Client  Coordinator  Try(冻结)     Confirm(执行)        Cancel(释放)
  │          │           │             │                  │
  │─ 注册 ──►│           │             │                  │
  │          │── Try ──►│             │                  │
  │          │◄── OK ───┤             │                  │
  │          │         (根据全局结果)   │                  │
  │          │── Confirm ─────────────►                  │
  │          │── Cancel ──────────────────────────────► │
```

#### 4.1.3 典型场景

- 转账:`A.Try` 冻结 100 元 → `B.Try` 加 100 元占位 → `A.Confirm` 扣款 → `B.Confirm` 入账。
- 订单:`Order.Try` 状态 = 锁定,`Inventory.Try` 库存冻结。

#### 4.1.4 代码示例(伪代码)

```java
public interface TccAction {
    boolean prepare(BusinessContext ctx, OrderDTO dto);
    boolean confirm(BusinessContext ctx);
    boolean cancel(BusinessContext ctx);
}

public class TransferTcc implements TccAction {
    @Override
    public boolean prepare(BusinessContext ctx, OrderDTO dto) {
        // 1. 校验
        if (!accountRepo.canDebit(dto.from, dto.amount)) return false;
        // 2. 冻结
        accountRepo.freeze(dto.from, dto.amount);
        // 3. 写入幂等表
        txLogRepo.insertIfAbsent(ctx.txId, "TRY");
        return true;
    }

    @Override
    public boolean confirm(BusinessContext ctx) {
        // 幂等:已 confirm 则直接返回 true
        if (txLogRepo.exists(ctx.txId, "CONFIRM")) return true;
        // 真正扣款
        accountRepo.debitFrozen(ctx.txId);
        txLogRepo.mark(ctx.txId, "CONFIRM");
        return true;
    }

    @Override
    public boolean cancel(BusinessContext ctx) {
        // 幂等
        if (txLogRepo.exists(ctx.txId, "CANCEL")) return true;
        // 释放冻结
        accountRepo.unfreeze(ctx.txId);
        txLogRepo.mark(ctx.txId, "CANCEL");
        return true;
    }
}
```

#### 4.1.5 优点 / 缺点

| 优点                | 缺点                                          |
| ----------------- | ------------------------------------------- |
| 强一致(最终也通过锁定)     | 业务侵入大,要写三套方法                                |
| 由应用层控制粒度,灵活      | Cancel/Confirm 必须幂等,设计复杂                    |
| 性能比 2PC 好(短锁)    | 需要全局事务管理器调度                                 |

#### 4.1.6 常见 TCC 框架

- **Seata TCC 模式**(阿里)
- **Hmily**(京东)
- **ByteTCC**(字节跳动)
- **EasyTransaction**(新浪)

### 4.2 Saga 模式

#### 4.2.1 思想

把一个长事务拆为 N 个本地子事务 `T1, T2, …, Tn`;每个子事务都有对应的**补偿动作** `C1, C2, …, Cn`。
- 任一 `Ti` 失败 → 依次执行 `Ci-1, Ci-2, …, C1` 进行回滚(逆向补偿)。

#### 4.2.2 两种协调方式

##### (1) 编排式(Orchestration)

由中心协调者(Camunda / Apache Airflow / 自研 Orchestrator)按状态机推进。

```
[Start] → T1 → T2 → T3 → [End]
          │      │
         (f)   (f)
          ▼      ▼
          C1    C2
          ▼      ▼
         Compensating Flow
```

##### (2) 命令式(Choreography)

无中心节点,通过事件传递(`OrderCreated → InventoryReserved → PaymentProcessed → OrderCompleted`)。
失败时各服务监听补偿事件。

```
订单服务    → publish OrderCreated
库存服务    ← subscribe,扣减,publish InventoryReserved
营销服务    ← subscribe,核销券,publish CouponUsed
支付服务    ← subscribe,扣款,publish PaymentProcessed
```

任意环节失败 → publish `OrderCancelled`,各服务反向补偿。

#### 4.2.3 经典 Saga 实现

- **Apache ServiceComb Saga**(华为)
- **Seata Saga 模式**(基于状态机 DSL)
- **Cadence / Temporal**(工作流引擎,广义支持 Saga)
- **Apache Airflow**(广义编排)

#### 4.2.4 代码示例(Seata Saga DSL)

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

#### 4.2.5 优点 / 缺点

| 优点            | 缺点                                                                                       |
| ------------- | ---------------------------------------------------------------------------------------- |
| 适合长事务         | 没有隔离性,中间状态对外可见(脏读需要业务侧补偿)                                                                |
| 业务侵入比 TCC 小   | 补偿逻辑设计复杂,部分业务无法完美回滚(如"已发短信")                                                              |
| 支持异步,性能好     | 调试追踪困难                                                                                   |

### 4.3 AT 模式(Seata)

#### 4.3.1 思想

Automatic Transaction(自动事务)模式:无业务侵入,像本地事务一样使用,框架自动处理两阶段。
本质:**自动化的 2PC + 全局锁 + undo log**。

#### 4.3.2 架构

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

#### 4.3.3 执行流程(以 Insert/Update 为例)

**阶段 1(分支注册 + Before Image + After Image + Insert undo log)**:

```sql
-- 原始 SQL
UPDATE product SET stock = stock - 1 WHERE id = 1;

-- Seata 拦截后生成的 SQL(伪):
SELECT stock FROM product WHERE id = 1;             -- before image
UPDATE product SET stock = stock - 1 WHERE id = 1;
SELECT stock FROM product WHERE id = 1;             -- after image
INSERT INTO undo_log(xid, branch_id, before, after, ...) VALUES (...);
```

**全局提交**:

- 删除 undo_log,释放本地锁,提交本地事务。

**全局回滚**:

- 根据 undo_log 的 before image **反向补偿**,删除 after image(若有)。
- 释放本地锁。

#### 4.3.4 全局锁 vs 本地锁

- AT 通过 **SELECT … FOR UPDATE** + **全局锁表** 防止其他全局事务并发修改同一行。
- 缓解脏写问题:处于"全局未决"期间,本地事务已提交,其他全局事务看到的是"新值",需要根据 xid 判断回滚。

#### 4.3.5 代码示例

```java
@GlobalTransactional(name = "order-tx", rollbackFor = Exception.class)
public void placeOrder(OrderDTO order) {
    orderDao.create(order);             // 分支 1
    inventoryDao.deduct(order.skuId);   // 分支 2
    accountDao.debit(order.userId);     // 分支 3
}
```

#### 4.3.6 优点 / 缺点

| 优点                | 缺点                                                          |
| ----------------- | ----------------------------------------------------------- |
| 业务 0 侵入          | 依赖本地事务 + undo log,不适用于 NoSQL / 非 JDBC 资源                  |
| 自动化 2PC 性能较好      | 高并发下全局锁竞争激烈                                                  |
| 与 Spring 注解无缝集成   | 隔离级别仅支持 Read Uncommitted;脏读/脏写在某些场景会出现,需配合 SELECT FOR UPDATE |

#### 4.3.7 Seata TCC、AT、Saga、XA 对比

| 模式      | 一致性  | 业务侵入 | 性能  | 隔离 | 适用               |
| ------- | ---- | ---- | --- | -- | ---------------- |
| AT      | 最终一致 | 无    | 中   | 低  | 大多数关系型数据库业务      |
| TCC     | 最终一致 | 高    | 高   | 高  | 金融、库存等需要强隔离      |
| Saga    | 最终一致 | 中    | 高   | 极低 | 长事务、跨服务多步骤       |
| XA      | 强一致  | 无    | 低   | 中  | 数据库支持 XA 的传统业务   |

### 4.4 本地消息表(Local Message Table)

#### 4.4.1 思想

将分布式事务转换为**本地事务 + 异步投递**:
- 业务数据和消息**写同一张表** → 同一本地事务 → 同时成功 / 失败。
- 独立 worker 扫描消息表 → 投递到 MQ → 下游消费。
- 下游消费失败 → 靠重试 + 幂等保障最终一致。

#### 4.4.2 流程

```
[本地事务]
BEGIN
  INSERT INTO orders ...;
  INSERT INTO local_message(outbox, status='PENDING') ...;
COMMIT;

[Worker 异步]
loop
  SELECT * FROM local_message WHERE status='PENDING' LIMIT 100;
  foreach msg
    sendMQ(msg);
    UPDATE local_message SET status='SENT';
END
```

#### 4.4.3 优缺点

| 优点               | 缺点                                          |
| ---------------- | ------------------------------------------- |
| 实现简单,主流数据库即可   | 轮询开销;实时性受轮询频率影响                            |
| 与本地事务同库,原子写    | 需要一个调度 worker                                  |
| 投递可保证 at-least-once | 下游必须幂等                                       |

#### 4.4.4 优化

- 开启 `transactional outbox` 自动发布(Kafka Connect / Debezium)。
- 用数据库 CDC(Change Data Capture)代替 polling:订阅 binlog → Kafka。

### 4.5 事务消息(Transactional Outbox / RocketMQ)

#### 4.5.1 RocketMQ 事务消息的两阶段

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

##### 流程示意

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

#### 4.5.2 RocketMQ 代码示例

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

#### 4.5.3 Kafka 事务消息

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

但注意:Kafka 事务是 **流处理事务**,而**不绑定外部业务数据库**,因此不能完全替代分布式事务。它与 Outbox 模式配合最佳。

### 4.6 最大努力通知(Best Effort Notification)

#### 4.6.1 适用场景

不需要保证对方一定成功,但希望**尽最大努力去通知**,典型例:
- 支付结果通知商户。
- 第三方平台结果回执。
- 短信 / 邮件 / 站内信。

#### 4.6.2 实现要点

- 失败重试:有限次数 + 指数退避。
- 最终一致性:对账兜底(定时核对)。
- 调用方必须幂等。

#### 4.6.3 代码骨架

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

#### 4.6.4 与可靠消息最终一致性的区别

| 维度   | 最大努力通知     | 可靠消息最终一致性       |
| ---- | ---------- | ---------------- |
| 是否保证对方成功 | 否,允许失败最终人工 | 是,通过重试和补偿保证对齐 |
| 流程   | 系统 → 业务方    | 系统 → MQ → 业务方    |
| 适用   | 通知、对账      | 跨服务核心业务          |

### 4.7 可靠消息最终一致性

#### 4.7.1 思路

通过**消息中间件 + 重试 + 幂等 + 监控告警**来确保最终一致。流程:

```
┌─────────────────┐  发本地消息  ┌──────────────┐   投递    ┌──────────┐
│ 服务 A(本地事务) │ ──────────▶ │   MQ/RocketMQ│ ────────▶ │ 服务 B   │
└─────────────────┘             └──────────────┘           └──────────┘
                                                                │
                                                              消费 + 幂等
                                                                ▼
                                                             [下游业务]
```

#### 4.7.2 关键设计

1. **消息可靠投递**:
   - 至少一次(at-least-once) + 消费者幂等。
2. **消费幂等**:
   - 唯一业务键去重表。
   - Redis SETNX 简化版。
   - DB 唯一索引约束。
3. **重试策略**:
   - 失败队列 + 阶梯重试(立即 / 1min / 5min / 30min)。
4. **死信队列**:
   - 兜底存储,人工介入。

#### 4.7.3 完整示例(订单 + 库存)

```java
// 服务 A:订单服务
@Transactional
public void placeOrder(OrderDTO dto) {
    orderDao.create(dto);
    // 事务消息(RocketMQ 半消息)
    messageProducer.sendTxMsg("OrderCreated", dto);
}

// 服务 B:库存服务
@RocketMQMessageListener(topic = "OrderCreated")
public class InventoryListener implements RocketMQListener<OrderDTO> {
    public void onMessage(OrderDTO dto) {
        // 幂等判断
        if (deductLogRepo.exists(dto.orderId)) return;
        // 业务
        inventoryDao.deduct(dto.skuId, dto.qty);
        deductLogRepo.markSuccess(dto.orderId);
    }
}
```

---

## 第 5 章 共识与复制协议

> 共识协议是 NewSQL 与强一致存储的根基。区分:它们解决的是**复制一致性**(多副本达成一致),与跨服务事务机制常配合但不直接等价。

### 5.1 Paxos / Raft

#### 5.1.1 Paxos

由 Leslie Lamport 提出,解决**多副本一致性**。

- **角色**:Proposer / Acceptor / Learner。
- **两阶段**:Prepare(承诺) → Accept(投票)。
- **Multi-Paxos**:用 Log 复制实现一致状态机。

#### 5.1.2 Raft(In Search of an Understandable Consensus Algorithm)

Paxos 工程实现复杂,Raft 简化了角色:

- **Leader / Follower / Candidate**。
- **任期(Term)** 机制:每次选举单调递增。
- **日志复制**:Leader 把日志项复制到多数派 Follower 后提交。

```
Client ─▶ Leader ──▶ Follower 1, 2, 3 …(多数派确认)─▶ commit
```

#### 5.1.3 工业实现

- etcd、Consul(ZooKeeper 同类):用 Raft 实现 KV。
- TiKV、CockroachDB、Chubby:基于 Raft 做存储引擎。
- PolarDB / PolarFS、OceanBase:各有自研共识协议。

### 5.2 Zab(ZooKeeper)

ZooKeeper Atomic Broadcast:
- 类似 2PC,但 Leader 选举 + 事务广播,保证**全局有序**。
- 节点状态:LOOKING / FOLLOWING / LEADING / OBSERVING。

### 5.3 Quorum NWR

- **N**:副本总数。
- **W**:写副本数(成功的副本数)。
- **R**:读副本数。
- 满足 `W + R > N` → 强读一致。
- 经典:Amazon Dynamo、Cassandra。

```
N=3, W=2, R=2 → 读一定看到最近写入
```

---

## 第 6 章 NewSQL 与计算下推

### 6.1 Google Spanner

- 全球分布式强一致数据库。
- **TrueTime API**(GPS + 原子钟)→ 给每个事务分配全局时间戳,实现**外部一致性**。
- 数据按主键范围切分(Paxos Group),每个 Group 一个 Raft 集群。
- 事务:Percolator 风格 2PC + TrueTime。

```
     TrueTime API
          │
 Spanner Client
   ├─ Coordinator(Primary)
   ├─ Participants(Paxos Groups)
   └─ 2PC + Lock Table
```

### 6.2 TiDB / TiKV

- 国产开源 NewSQL(原 PingCAP)。
- 架构:
  - **TiDB**:SQL 计算层(MySQL 兼容协议)。
  - **TiKV**:分布式 KV 存储(Raft 复制,MVCC,Percolator 事务)。
  - **PD(Placement Driver)**:元数据 + 调度。

#### 6.2.1 TiKV 事务模型(Percolator)

```
┌─────────────────┐
│ TiDB SQL Layer  │  ← 解析 SQL、生成分布式执行计划
└────────┬────────┘
         │
         ▼
┌──────────────────────────────┐
│ TiKV Distributed Transaction │
│   - Primary lock             │
│   - Secondary writes         │
│   - Percolator 2PC           │
└──────────────────────────────┘
```

事务流程:

1. 在涉及的首个 region 中选 Primary。
2. **Prewrite**:Primary / Secondary 写数据 + 加锁(写悲观锁 + 数据)。
3. **Commit**:Primary 写 commit 标记 + 时间戳;其他 region 异步 commit。
4. **Rollback**:根据 lock TTL,清理孤儿事务。

#### 6.2.2 隔离级别

- 默认为 **Snapshot Isolation**,通过 SI + Lock 防止写冲突。
- 支持 `SELECT … FOR UPDATE` 实现悲观锁。

#### 6.2.3 TiDB 与分布式事务

- 跨节点 UPDATE 自动分布式事务,**对应用透明**。
- 限制:大事务会触发 GC 与锁等待,推荐业务拆分。

### 6.3 CockroachDB / YugabyteDB

- **CockroachDB**:基于 Raft + HLC(Hybrid Logical Clock)+ 分布式 SQL 层。
- **YugabyteDB**:YSQL(PostgreSQL 兼容)+ DocDB(Raft + RocksDB)。

二者均提供**外部一致性 + Serializable 隔离**。

### 6.4 OceanBase

- 阿里自研,经历过双 11 洗礼。
- **多副本强一致 + Paxos 变种 + 准内存数据库引擎**。
- 支持 Oracle / MySQL 兼容模式,分布式事务 0 改造。
- OBProxy + OBServer + RootService 体系。

---

## 第 7 章 主流框架与中间件

### 7.1 Seata

Seata(Simple Extensible Autonomous Transaction Architecture)由阿里 + 蚂蚁金服开源,是目前国内最流行的分布式事务框架。

#### 7.1.1 模块

| 模块                      | 作用              |
| ----------------------- | --------------- |
| TC(Transaction Coordinator) | 协调者,维护全局/分支事务状态 |
| TM(Transaction Manager) | 事务管理器,定义全局事务边界 |
| RM(Resource Manager)     | 资源管理器,管理分支资源   |

#### 7.1.2 模式矩阵

| 模式  | 适用           | 关键 |
| --- | ------------ | -- |
| AT  | 关系型数据库自动事务   | 自动反向 SQL |
| TCC | 高一致性、性能敏感    | 三段方法  |
| Saga | 长事务           | 状态机    |
| XA  | 强一致、传统数据库    | 数据库 XA |

#### 7.1.3 Spring Boot 集成

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

### 7.2 Apache ServiceComb Saga

- 华为开源,Saga 编排框架。
- 支持 JSON / Java 状态机 DSL。
- 提供 Java 客户端 Pack。
- 与 ServiceComb 微服务体系融合度高。

### 7.3 ByteTCC / Hmily / EasyTransaction

| 框架         | 开发者  | 特色                              |
| ---------- | ---- | ------------------------------- |
| ByteTCC    | 字节跳动 | 高性能 TCC、动态代理                     |
| Hmily      | 京东   | TCC + Saga + 本地消息表混合,注解式        |
| EasyTransaction | 新浪   | TCC + 多种补偿模式统一抽象                |

#### 7.3.1 Hmily 示例

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

### 7.4 Apache RocketMQ 事务消息

见 [4.5 节](#45-事务消息transactional-outbox--rocketmq)。

### 7.5 DTM(分布式事务管理器)

- 国产 Go 语言实现的分布式事务框架(轻量、高性能)。
- 支持 **XA、TCC、SAGA、消息、Outbox、子事务屏障**。
- 子事务屏障(Barrier)自动处理空补偿 / 防悬挂 / 幂等。

#### 7.5.1 子事务屏障(Barrier)

```go
if barrier.CallWithCurrent(tx, func() error {
    // 业务逻辑(Insert)
}) {
    // 成功
}
```

- 实现原理:在 DB 中插入 `id_barrier` 行,根据 unique key 锁定防止重复。

### 7.6 Eventuate Tram

- 基于事件驱动的 Saga 框架。
- 消息存储在 MySQL/Postgres 中(CDC 投递到 Kafka)。
- 支持 Saga + CQRS。

---

## 第 8 章 隔离级别与异常处理

### 8.1 分布式隔离级别

ANSI SQL 隔离级别在分布式场景仍适用,但通过不同机制实现:

| 级别                       | 单机实现      | 分布式实现                  |
| ------------------------ | --------- | ---------------------- |
| Read Uncommitted         | 读不加锁      | 不推荐                    |
| Read Committed           | 读快照       | Raft ReadIndex         |
| Repeatable Read          | 读快照,事务内不变 | Snapshot Isolation     |
| Serializable             | 谓词锁        | 2PL + 索引范围锁           |
| **Snapshot Isolation**   | MVCC       | SI(NewSQL 常用)         |
| **Serializable Snapshot Isolation(SSI)** | MVCC + 检测   | CockroachDB / FaunaDB |

### 8.2 空补偿、防悬挂、幂等

这是分布式事务中**三大经典异常**,业界称为三把刀。

#### 8.2.1 空补偿(Null Compensation)

**场景**:分支 Try 未执行,Cancel 反而先到达。
**原因**:网络重试导致 Cancel 早于 Try 抵达。

**解决**:
- Cancel 要先查 `txId` 是否执行过 Try。
- 未执行 → 直接返回成功(空补偿)。

#### 8.2.2 防悬挂(Hang Prevention)

**场景**:Try 因网络延迟到达时,Cancel 已完成。
**后果**:Try 完成后,资源冻结却永远不被 Confirm/Cancel(悬挂)。

**解决**:
- Try 执行前先查事务状态;若已 Cancel → 直接放弃执行。

#### 8.2.3 幂等(Idempotency)

**场景**:Confirm / Cancel 重试,重复执行导致数据错乱。
**解决**:
- 通过 `txId + op` 在 DB 中建唯一索引,插入即视为已执行,跳过后续逻辑。

#### 8.2.4 DTM 的子事务屏障实现

```sql
-- 在每个分支事务中插入 barrier 标记
INSERT IGNORE INTO barrier(tx_id, op) VALUES (?, ?);
-- 若 INSERT 影响行数 = 0 → 已执行过,跳过业务
```

```
- Cancel 处理:插入 barrier ⇒ 影响行=0?空补偿 → 跳过 Cancel。
- Confirm 处理:插入 barrier ⇒ 影响行=0?重复 Confirm → 跳过。
```

详细参考: [https://github.com/dtm-labs/dtm](https://github.com/dtm-labs/dtm) 的 barrier 章节。

---

## 第 9 章 实战案例

### 9.1 电商下单跨服务事务

#### 9.1.1 业务流程

```
下单服务 → 订单中心 → 库存服务 → 营销中心 → 支付中心 → 物流预约
```

#### 9.1.2 关键诉求

- 订单与库存:必须一致(避免超卖)。
- 优惠券 / 积分:扣减可补偿。
- 支付:异步回调,允许稍后达成。

#### 9.1.3 推荐组合

| 节点     | 模式           |
| ------ | ------------ |
| 订单 + 库存 | **TCC** 强一致  |
| 营销 + 积分 | **可靠消息** 最终一致 |
| 支付     | 异步回调 + 对账     |

#### 9.1.4 异常流

- 库存冻结失败 → 取消订单。
- 支付超时 → 释放库存冻结 + 营销回滚。
- 物流预约失败 → 仅记录,由人工 / 重试保证。

### 9.2 跨行转账

#### 9.2.1 关键点

- 资金安全(0 资损)。
- 高可靠 + 最终一致。
- 对账兜底。

#### 9.2.2 方案

- 经典:**TCC + 幂等 + 对账**。
- 备份方案:**Saga + 本地事务**。
- 强一致需求且使用 NewSQL:**TiDB / OceanBase 一键分布式事务**。

```java
// 转账示例(TCC)
@TccTransactional
public String transfer(String fromAccount, String toAccount, BigDecimal amount) {
    transferTccAction.freeze(fromAccount, amount);
    transferTccAction.prepareAdd(toAccount, amount);
    return "ok";
}
```

### 9.3 库存-订单-支付链路

#### 9.3.1 一致性目标

订单主链路可容忍**暂时性"超时未支付"** 状态,通过对账释放库存。

#### 9.3.2 状态机

```
[Created] → [Paid] → [Shipped] → [Done]
     │                     ↑
     ▼                     │
  [Cancelled] ←────────────┘
       ▲
     超时/对账
```

#### 9.3.3 实现要点

- 状态机严格单向,**可重入幂等**。
- 取消订单时发布 `OrderCancelled` 事件,库存 / 营销回补。

---

## 第 10 章 选型决策

### 10.1 决策树

```
               ┌── 一致性要求 ──►
               │      │
               │   强一致
               │      │
        跨库 / 跨服务? ─────► 强一致 + 同步 ──► 2PC / XA / NewSQL
               │
            最终一致
               │
   ┌───────────┴───────────┐
长事务?                  短事务?
   │                       │
 Saga                    性能优先? ──► 可靠消息 / Outbox
                         │
                       强隔离?
                         │
                         ▼
                       TCC
```

### 10.2 矩阵决策

| 场景         | 优先  | 推荐               |
| ---------- | --- | ---------------- |
| 传统金融资金账    | 强一致 | TCC + XA(对账双保险) |
| 电商下单库存     | 强一致 | TCC              |
| 电商下单优惠     | 最终一致 | 可靠消息 / Outbox    |
| 跨境汇款、跨行清算  | 最终一致 | Saga + 对账        |
| 高并发计数 / 排行榜 | 最终一致 | 最大努力通知 + Redis  |
| 全局日志、通知类   | 最终一致 | MQ + 最大努力通知     |
| 跨地域写入      | 强一致 | NewSQL(Spanner、TiDB) |
| 简单通知       | 最终一致 | 最大努力通知           |
| 已有 Seata 体系 | 多种   | Seata(AT/TCC/Saga) |

### 10.3 切忌踩坑

1. **不要在最终一致场景追求强一致**:徒增复杂度。
2. **不要把消息当事务唯一手段**:必须叠加幂等 + 重试 + 对账。
3. **不要忽视悬挂 / 空补偿**:提交流程必须先判断事务分支状态。
4. **不要在 NewSQL 之外硬上 SSI**:成本不划算。
5. **不要混用多种方案**:统一收敛到 1~2 种全局模式。

---

## 第 11 章 性能、可观测与最佳实践

### 11.1 性能调优

| 方案     | 优化                       |
| ------ | ------------------------ |
| 2PC/XA | 减少参与方、缩短持锁时间、合理分布协调者      |
| TCC    | Try 阶段避免远程 RPC,资源预冻结本地化 |
| Saga   | 异步化、子事务拆分               |
| MQ     | 批量发送、削峰填谷、消费者并行、幂等去重      |
| NewSQL | 避免大事务、热表拆分、Region 打散     |

### 11.2 可观测

- **Trace**:全链路(OpenTelemetry / SkyWalking)。
- **Metrics**:事务成功率、平均时延、P99、Saga 完成率、回滚率。
- **Logs**:事务 ID(xid)、分支 ID(branchId)、状态迁移。
- **大盘**:Seata / DTM 自带控制台 → 故障定位、悬挂事务处理。
- **告警**:异常事务 / 悬挂 / 长时间 UNKNOWN / 死信队列激增。

### 11.3 最佳实践清单

1. **统一事务 ID**:贯穿 MQ、日志、DB 行。
2. **幂等覆盖一切写**:消息消费、Try/Confirm/Cancel、回调、扣款。
3. **幂等表 + 业务唯一索引** 双保险。
4. **重试有上限**:防止雪崩。
5. **对账是兜底**:任何异步链路都不能省对账。
6. **资源预留与回滚**:Try 资源要"软冻结",Cancel 要可重复。
7. **单元 + 集成测试**:故障注入(ChaosBlade/Litmus)验证流程。
8. **读写分离 / 缓存**:隔离性低时可引入 Redis、Elasticsearch 提升查询体验。
9. **文档与状态机**:给每个事务一份"流程图 + 异常路径"文档。
10. **避免大事务**:NewSQL 仍需控制事务行数和持续时间。

---

## 第 12 章 未来趋势

1. **Serverless 化事务**:Amazon Aurora DSQL / Google Cloud Spanner 在云原生中提供自动分布式事务。
2. **AI 辅助协调**:用 LLM 生成 Saga 状态机 DSL、自动补偿策略。
3. **多模数据库原生事务**:PolarDB / TiDB 集成分析 + 事务 + AI。
4. **跨链互操作分布式事务**:Web3 + 跨链桥的"原子跨链事务"。
5. **确定性分布式事务**:基于确定性记录的事件溯源(Event Sourcing)+ 重放,重塑 Saga。
6. **零信任 + 隐私计算下的事务**:可信执行环境(TEE / SGX)中的原子事务。
7. **可观测 + Chaos Engineering 成为事务平台的标配**:数据正确性 + 服务韧性同等重要。

---

## 附录:速查表与参考资料

### A. 速查表

| 关键字           | 模式                  | 备注                        |
| ------------- | ------------------- | ------------------------- |
| XA / 2PC      | 数据库层                | 强一致                       |
| 3PC           | 数据库层                | 几乎不用                      |
| TCC           | 应用层三段              | 强隔离                        |
| Saga          | 长事务                 | 业务侵入中                      |
| AT / Seata    | ORM 透明 2PC          | 适合 JDBC                   |
| 可靠消息 / MQ  | 异步最终一致               | 高吞吐                       |
| 本地消息表         | DB + Worker         | 简单可靠                      |
| Outbox / CDC  | 监听 binlog           | 实时投递                      |
| 最大努力通知        | 尽力重试 + 对账           | 通知场景                      |
| Raft / Paxos  | 多副本状态机             | NewSQL 底层                |
| Spanner       | TrueTime + Paxos    | 全球强一致                     |
| TiDB / TiKV   | Percolator 2PC     | MySQL 兼容                 |
| CockroachDB   | Raft + HLC         | PostgreSQL 兼容            |
| OceanBase     | 自研共识                | Oracle/MySQL 兼容          |

### B. 实战速记口诀

> **强一致看 TCC 或 NewSQL,长事务走 Saga,异步靠 MQ,通知用最大努力。任何方案 → 幂等是底线,对账是兜底。**

### C. 推荐阅读 & 参考资料

1. **Google Percolator** Paper
2. **Spanner: Google's Globally-Distributed Database**, OSDI 2012
3. **TiDB 官方文档 - Percolator 事务模型**
4. **Seata 官方文档 - 概念与设计**
5. **Apache RocketMQ 事务消息设计**
6. **《数据密集型应用系统设计》(DDIA)** —— Martin Kleppmann
7. **《分布式协议与算法实战》** —— 极客时间
8. **DTM 项目子事务屏障设计**(https://github.com/dtm-labs/dtm)
9. **Apache ServiceComb Saga 文档**
10. **CockroachDB 文档 - 事务模型**

### D. 完整项目示例(目录建议)

```
order-distributed-tx-demo/
├── pom.xml
├── order-service/                (Seata AT 模式)
├── inventory-service/            (TCC 实现)
├── payment-service/              (RocketMQ 事务消息)
├── coupon-service/               (本地消息表)
├── settlement-service/           (Saga,每天对账)
├── dtm-server/                   (DTM 子事务屏障)
└── chaos-test/                   (Litmus / ChaosBlade)
```

---

> **结语**:分布式事务不是单一银弹,而是**根据业务一致性 + 性能 + 复杂度**多目标权衡的工程艺术。从 2PC 到 NewSQL,从 TCC 到 Saga,从 MQ 到 Outbox,每种方案都对应着明确的适用场景和取舍。掌握本教程中的全部方案,你已具备面对任何分布式事务场景的完整知识体系。

