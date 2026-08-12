# 04 · TCC 深度剖析(Try-Confirm-Cancel)

> 目标:把 TCC 的"三段方法 + 幂等 + 空补偿 + 防悬挂"讲透,示意代码 + 故障矩阵 + 框架对比,直接落地可参考。

---

## 1. 核心思想

把一个业务操作拆为三段:

| 阶段 | 目的 | 关键性质 |
| --- | --- | --- |
| **Try** | 资源预留(冻结) + 校验 | 不真正执行业务 |
| **Confirm** | 真正执行业务 | 幂等 |
| **Cancel** | 释放 Try 冻结的资源 | 幂等 + 空补偿容忍 |

> 配合一个**事务协调者**统一调度各分支的 Try / Confirm / Cancel。

---

## 2. 流程图

```
Client  Coordinator  Try(冻结)     Confirm(执行)        Cancel(释放)
  │          │           │             │                  │
  │─ 注册 ──►│           │             │                  │
  │          │── Try ──►│             │                  │
  │          │◄── OK ───┤             │                  │
  │          │   (根据全局结果)         │                  │
  │          │── Confirm ─────────────►                  │
  │          │── Cancel ──────────────────────────────►│
```

---

## 3. 典型场景

### 3.1 转账

```
A.Try   冻结 100 元
B.Try   加 100 元占位
A.Confirm 扣款
B.Confirm 入账
```

### 3.2 订单

```
Order.Try      状态 = 锁定
Inventory.Try  库存冻结
Order.Confirm  状态 = 已下单
Inventory.Confirm 扣减库存
```

---

## 4. 故障矩阵

| 故障 | 表现 | 应对 |
| --- | --- | --- |
| Try 失败 | 协调者记录失败 → 走 Cancel | Cancel 幂等 |
| Confirm 失败(网络) | 协调者重试 | Confirm 幂等 |
| Cancel 失败(网络) | 协调者重试 | Cancel 幂等 |
| Cancel 比 Try 先到 | 空补偿 | 见 [11 · 异常处理](11-isolation-anti-patterns.md) |
| Try 比 Cancel 后到 | 悬挂 | 见 [11 · 异常处理](11-isolation-anti-patterns.md) |
| Try 写后协调者宕机 | 协调者恢复后按日志重发 | Cancel/Confirm 幂等 |

---

## 5. 代码示例(Java)

```java
public interface TccAction {
    boolean prepare(BusinessContext ctx, OrderDTO dto);
    boolean confirm(BusinessContext ctx);
    boolean cancel(BusinessContext ctx);
}

public class TransferTcc implements TccAction {
    @Override
    public boolean prepare(BusinessContext ctx, OrderDTO dto) {
        if (!accountRepo.canDebit(dto.from, dto.amount)) return false;
        accountRepo.freeze(dto.from, dto.amount);
        txLogRepo.insertIfAbsent(ctx.txId, "TRY");
        return true;
    }

    @Override
    public boolean confirm(BusinessContext ctx) {
        if (txLogRepo.exists(ctx.txId, "CONFIRM")) return true;
        accountRepo.debitFrozen(ctx.txId);
        txLogRepo.mark(ctx.txId, "CONFIRM");
        return true;
    }

    @Override
    public boolean cancel(BusinessContext ctx) {
        if (txLogRepo.exists(ctx.txId, "CANCEL")) return true;
        accountRepo.unfreeze(ctx.txId);
        txLogRepo.mark(ctx.txId, "CANCEL");
        return true;
    }
}
```

### 5.1 Cancel 完整写法(处理空补偿)

```java
@Override
public boolean cancel(BusinessContext ctx) {
    // 1. 空补偿:Try 未执行
    if (!txLogRepo.exists(ctx.txId, "TRY")) {
        txLogRepo.mark(ctx.txId, "CANCEL");   // 记录已处理
        return true;
    }
    // 2. 正常 Cancel
    if (txLogRepo.exists(ctx.txId, "CANCEL")) return true;
    accountRepo.unfreeze(ctx.txId);
    txLogRepo.mark(ctx.txId, "CANCEL");
    return true;
}
```

### 5.2 Try 完整写法(防悬挂)

```java
@Override
public boolean prepare(BusinessContext ctx, OrderDTO dto) {
    // 防悬挂:Try 之前若已 Cancel,直接放弃
    if (txLogRepo.exists(ctx.txId, "CANCEL")) return true;
    if (!accountRepo.canDebit(dto.from, dto.amount)) return false;
    accountRepo.freeze(dto.from, dto.amount);
    txLogRepo.insertIfAbsent(ctx.txId, "TRY");
    return true;
}
```

---

## 6. 幂等的三层防御

| 层 | 机制 | 适用 |
| --- | --- | --- |
| 1 | 唯一索引(`tx_id + op`) | 任何 DB |
| 2 | 状态机校验(已 Confirm/Cancel 跳过) | DB + 状态字段 |
| 3 | 业务唯一键(订单号、流水号) | 业务约束 |

---

## 7. 资源设计:怎么"冻结"?

| 资源 | 冻结方式 |
| --- | --- |
| 余额 | 加 `freeze_amount` 字段;扣款时 `freeze -= amt; balance -= amt` |
| 库存 | 加 `stock_freeze` 字段;出库时 `stock_freeze -= qty; stock -= qty` |
| 优惠券 | 状态改成 `LOCKED`;核销后改 `USED` |
| 订单 | 状态改成 `LOCKED`;支付后改 `PAID` |

> 原则:冻结字段与正式字段分开,避免 Cancel 误影响业务读。

---

## 8. 优缺点

| 优点 | 缺点 |
| --- | --- |
| 强一致(最终通过锁定) | 业务侵入大,要写三套方法 |
| 由应用层控制粒度,灵活 | Cancel/Confirm 必须幂等,设计复杂 |
| 性能比 2PC 好(短锁) | 需要全局事务管理器调度 |
| 适合资金账等强隔离场景 | Try 资源预冻结涉及业务字段改造 |

---

## 9. 常见 TCC 框架

| 框架 | 开发者 | 特色 |
| --- | --- | --- |
| **Seata TCC** | 阿里 | 注解驱动,集成 Spring |
| **Hmily** | 京东 | TCC + Saga + 本地消息表混合 |
| **ByteTCC** | 字节跳动 | 高性能 TCC,动态代理 |
| **EasyTransaction** | 新浪 | TCC + 多种补偿模式统一抽象 |

> 详细对比见 [10 · 框架矩阵](10-frameworks.md)。

---

## 10. 故障排查 Checklist

- [ ] 是否有 txLog 表?字段是 `(tx_id, op, status, created_at)`?
- [ ] Try 资源预冻结涉及的字段是否独立?
- [ ] Cancel 是否处理空补偿?
- [ ] Try 是否处理防悬挂?
- [ ] Confirm/Cancel 是否幂等?
- [ ] 协调者是否记录了全局状态?宕机后可恢复?

---

## 11. 面试高频问题

**Q1. TCC 能不能保证强一致?**
- TCC 不保证"实时强一致",但保证"提交后强一致"。
- Try 完成 → 资源冻结,对外暂时不可见。
- Confirm 完成 → 业务原子生效。
- 失败时靠 Cancel 释放资源,业务读到的始终是"冻结前"或"提交后"两种状态。

**Q2. TCC 与 2PC 的关键区别?**
- 2PC 锁在数据库层,持锁时间长,阻塞。
- TCC 锁在应用层(冻结字段),持锁时间短,可异步 Cancel/Confirm。
- TCC 想哪一行冻结就冻结哪一行,粒度更细。

**Q3. 空补偿为什么会出现?**
- 协调者发出 Try,网络丢包,协调者超时后发出 Cancel。
- 原 Try 重试到达时,Cancel 已执行。
- 解法:Cancel 前查 txLog,无 Try 则记空补偿并直接成功。

**Q4. 为什么 Confirm/Cancel 必须幂等?**
- 网络不可靠,协调者必须重试。
- 重试时业务可能已执行过,不能重复扣款。
- 解法:txLog 唯一索引 + 状态机。

**Q5. 与 Saga 的关键区别?**
- Saga 子事务无 Try 阶段,只有"执行 + 补偿"。
- TCC 多了 Try 预冻结,资源隔离性更强。
- Saga 适合长事务; TCC 适合短事务 + 强隔离。
