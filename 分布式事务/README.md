# 分布式事务进阶教程

> 本教程把"分布式事务"拆成多个独立、聚焦、深度优先的文档,每篇只讲透一个维度,跨篇通过显式链接串联。**不要试图用一篇 README 讲完所有细节**。

---

## 阅读路径

| 目标 | 推荐路径 |
| --- | --- |
| 零基础入门 | [01](docs/01-fundamentals.md) → [02](docs/02-problem-model.md) → [03](docs/03-strong-consistency.md) → [04](docs/04-tcc.md) → [05](docs/05-saga.md) |
| 框架选型 / 落地方案 | [02](docs/02-problem-model.md) → [06](docs/06-at-seata.md) → [07](docs/07-messaging.md) → [10](docs/10-frameworks.md) → [13](docs/13-decision-tree.md) |
| 原理深挖 / 面试 | [01](docs/01-fundamentals.md) → [03](docs/03-strong-consistency.md) → [04](docs/04-tcc.md) → [05](docs/05-saga.md) → [08](docs/08-consensus.md) → [09](docs/09-newsql.md) → [11](docs/11-isolation-anti-patterns.md) |
| 排查线上问题 | [11](docs/11-isolation-anti-patterns.md) → [04](docs/04-tcc.md) → [06](docs/06-at-seata.md) → [07](docs/07-messaging.md) → [13](docs/13-decision-tree.md) |
| 跨服务架构师 | [12](docs/12-case-studies.md) → [13](docs/13-decision-tree.md) → [06](docs/06-at-seata.md) → [07](docs/07-messaging.md) → [10](docs/10-frameworks.md) |

---

## 文档清单

### 入口
- [docs/00-index.md](docs/00-index.md) — 各章交叉引用矩阵

### 基础理论
- [docs/01-fundamentals.md](docs/01-fundamentals.md) — ACID / CAP / BASE / 一致性模型
- [docs/02-problem-model.md](docs/02-problem-model.md) — 典型场景与四大流派

### 强一致性方案
- [docs/03-strong-consistency.md](docs/03-strong-consistency.md) — 2PC / XA / 3PC / Percolator / Spanner 2PC

### 业务层方案
- [docs/04-tcc.md](docs/04-tcc.md) — TCC 深度剖析
- [docs/05-saga.md](docs/05-saga.md) — Saga 深度剖析
- [docs/06-at-seata.md](docs/06-at-seata.md) — AT 模式与 Seata 内核
- [docs/07-messaging.md](docs/07-messaging.md) — 消息、Outbox、通知

### 底层共识
- [docs/08-consensus.md](docs/08-consensus.md) — Paxos / Raft / Zab / Quorum NWR
- [docs/09-newsql.md](docs/09-newsql.md) — Spanner / TiDB / CockroachDB / YugabyteDB / OceanBase

### 工程实现
- [docs/10-frameworks.md](docs/10-frameworks.md) — 主流框架矩阵
- [docs/11-isolation-anti-patterns.md](docs/11-isolation-anti-patterns.md) — 隔离级别与三把刀

### 实战
- [docs/12-case-studies.md](docs/12-case-studies.md) — 电商下单 / 跨行转账 / 库存-订单-支付
- [docs/13-decision-tree.md](docs/13-decision-tree.md) — 选型决策与最佳实践

### 趋势
- [docs/14-future.md](docs/14-future.md) — Serverless / AI / 跨链 / 隐私计算

---

## 速记口诀

> **强一致看 TCC 或 NewSQL,长事务走 Saga,异步靠 MQ,通知用最大努力。任何方案 → 幂等是底线,对账是兜底。**

---

## 为什么拆成多文件?

- 一篇 1300+ 行 RD 没人会读第二遍;
- 每个主题维护人不同,合在一起 review 必痛;
- 阅读时跳读、搜索的体验,远比"线性阅读"重要;
- 主题扩展(Seata 新模式 / NewSQL 新版本)只需改对应文件,不影响其他主题。

---

## 入门最低必读

1. **半小时理解"为什么"** → [docs/01-fundamentals.md](docs/01-fundamentals.md)
2. **两小时"看清楚"** → [docs/02-problem-model.md](docs/02-problem-model.md) + [docs/03-strong-consistency.md](docs/03-strong-consistency.md)
3. **"挑一种用到"** → [docs/04-tcc.md](docs/04-tcc.md) 或 [docs/06-at-seata.md](docs/06-at-seata.md)
4. **"搞定异常"** → [docs/11-isolation-anti-patterns.md](docs/11-isolation-anti-patterns.md)
5. **"选型"** → [docs/13-decision-tree.md](docs/13-decision-tree.md)

---

## 贡献方式

- 每个文件独立 topic,改一个不影响其他。
- 增加章节:在 `docs/` 下新建 `XX-name.md`,在 `docs/00-index.md` 加交叉链接,在 README 加链接。
- 深度优先:宁可一篇把一个点讲透,不要把多个点糅在一起。
