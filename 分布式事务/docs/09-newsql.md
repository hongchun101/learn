# 09 · NewSQL 与计算下推

> 目标:看 Spanner / TiDB / CockroachDB / YugabyteDB / OceanBase 是如何把共识协议 + 2PC 落地成"全球强一致"数据库,以及它们对应用透明带来的取舍。

---

## 1. NewSQL 三大支柱

```
        NewSQL = 分布式 SQL 接口
              + 共识协议(Raft / Paxos)
              + 跨节点事务(Percolator / Spanner 2PC)
```

---

## 2. Google Spanner

### 2.1 关键特性

- 全球分布式强一致数据库。
- **TrueTime API**(GPS + 原子钟) → 给每个事务分配全局时间戳,实现**外部一致性(External Consistency)**。
- 数据按主键范围切分(Paxos Group),每个 Group 一个 Raft 集群。
- 事务:Percolator 风格 2PC + TrueTime。

### 2.2 架构

```
     TrueTime API
          │
 Spanner Client
   ├─ Coordinator(Primary)
   ├─ Participants(Paxos Groups)
   └─ 2PC + Lock Table
```

### 2.3 写流程

1. 选涉及的首个 shard 为 Primary。
2. TrueTime 给定时间戳区间 `[earliest, latest]`。
3. 等待区间收敛 → 提交时间戳 = latest。
4. 各 Paxos Group 写入 + commit 标记 → 对外可见。

> 外部一致性 = 任何事务的提交时间戳都能反映真实因果顺序。

---

## 3. TiDB / TiKV

### 3.1 架构

```
┌─────────────┐
│   TiDB      │  ← SQL 计算层(MySQL 兼容协议)
└─────┬───────┘
      │
┌─────┴───────┐
│   TiKV      │  ← 分布式 KV(Raft + MVCC + Percolator)
└─────┬───────┘
      │
┌─────┴───────┐
│    PD       │  ← Placement Driver(元数据 + 调度)
└─────────────┘
```

### 3.2 TiKV 事务模型(Percolator)

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

### 3.3 事务流程

1. 在涉及的首个 region 中选 Primary。
2. **Prewrite**:Primary / Secondary 写数据 + 加锁(写悲观锁 + 数据)。
3. **Commit**:Primary 写 commit 标记 + 时间戳;其他 region 异步 commit。
4. **Rollback**:根据 lock TTL 清理孤儿事务。

### 3.4 隔离级别

- 默认 **Snapshot Isolation**,通过 SI + Lock 防止写冲突。
- 支持 `SELECT … FOR UPDATE` 实现悲观锁。

### 3.5 TiDB 与分布式事务

- 跨节点 UPDATE 自动分布式事务,**对应用透明**。
- 限制:大事务会触发 GC 与锁等待,推荐业务拆分。

---

## 4. CockroachDB / YugabyteDB

### 4.1 CockroachDB

- 基于 Raft + HLC(Hybrid Logical Clock)+ 分布式 SQL 层。
- PostgreSQL 兼容协议。
- 提供**外部一致性 + Serializable 隔离**。

### 4.2 YugabyteDB

- YSQL(PostgreSQL 兼容)+ DocDB(Raft + RocksDB)。
- 同样的外部一致性 + Serializable。
- 优势:DocDB 支持半结构化数据,多模 API。

---

## 5. OceanBase

### 5.1 特点

- 阿里自研,经历过双 11 洗礼。
- **多副本强一致 + Paxos 变种 + 准内存数据库引擎**。
- 支持 Oracle / MySQL 兼容模式,分布式事务 0 改造。

### 5.2 架构

```
Client → OBProxy → OBServer(分片)
                    │
              ┌─────┴─────┐
              │  Paxos    │  ← 多副本强一致
              │  Group    │
              └───────────┘
```

- 单个 OBServer 内:多租户、多副本。
- 跨 OBServer:分布式事务 + 2PC。

---

## 6. 对比

| 维度 | Spanner | TiDB | CockroachDB | YugabyteDB | OceanBase |
| --- | --- | --- | --- | --- | --- |
| 时间戳 | TrueTime(GPS+原子钟) | TSO(PD) | HLC | HLC | 内置 GTS |
| 共识协议 | Paxos | Raft | Raft | Raft | Paxos 变种 |
| 协议兼容 | 自家 | MySQL | PostgreSQL | PostgreSQL | Oracle/MySQL |
| 隔离级别 | External Consistency | Snapshot | Serializable | Serializable | Read Committed + Serializable |
| 跨地域 | 强 | 弱(单 Region 强) | 强 | 强 | 强 |
| 部署成本 | 极高 | 中 | 中 | 中 | 中 |

---

## 7. 适用场景

| 场景 | 推荐 |
| --- | --- |
| 跨地域强一致读写 | Spanner、CockroachDB、OceanBase |
| MySQL 兼容、低成本 | TiDB |
| 既有 MySQL/PG 业务平滑迁移 | TiDB / CockroachDB |
| Oracle / MySQL 双栈 | OceanBase |
| 国内云 | TiDB / OceanBase / PolarDB |

---

## 8. 注意事项

| 注意点 | 说明 |
| --- | --- |
| 大事务限制 | NewSQL 仍需控制事务行数 / 持续时间 |
| 索引设计 | 跨 region 索引性能差 |
| 备份恢复 | 跨 region 备份成本高 |
| 运维经验 | 需要新的 DBA 技能(Raft、Region、HLC) |
| 成本 | 比传统 MySQL 主从 + 分库分表高 |

---

## 9. 故障矩阵

| 故障 | 表现 | 应对 |
| --- | --- | --- |
| 节点宕机 | Raft 重新选主(秒级) | 客户端重试 |
| Region 不可用 | 读降级 / 写失败 | 多副本 + Region 打散 |
| 跨 Region 延迟 | 写延迟高 | 业务就近读 + 异步复制 |
| 时间戳服务宕机 | 事务不可用 | TSO 高可用(PD / GTS) |
| 大事务超时 | 锁等待 | 业务拆分 |

---

## 10. 故障排查 Checklist

- [ ] Region 健康度?是否有热点?
- [ ] TSO / GTS 是否稳定?
- [ ] GC 状态?是否清理慢?
- [ ] 慢 SQL?是否跨 Region?
- [ ] 限流配置?是否触发了 token 限流?

---

## 11. 面试高频问题

**Q1. Spanner 为什么一定要 TrueTime?**
- 外部一致性要求"任何事务的提交时间戳都反映真实因果顺序"。
- 单点授时(TSO)也行,但要跨域同步 → 实现复杂。
- TrueTime 用 GPS + 原子钟直接给"区间",工程上最简单。

**Q2. TiDB 为什么不直接用 Spanner 2PC?**
- TiDB 用的是 Percolator 2PC + TSO。
- 单 Region 范围内 TSO 即可,不需要 TrueTime 这种硬件依赖。
- 跨 Region 写性能不如 Spanner,但成本低。

**Q3. NewSQL 都能取代分库分表吗?**
- 大多数场景可以,但 NewSQL 不是万能。
- 极强事务性能(高并发小事务) → 仍可能需要分库分表 + 业务改造。
- 选型:看业务一致性 + 性能 + 成本 + 运维能力。

**Q4. 为什么 OceanBase 在国内用得多?**
- 双 11 验证:高并发 + 强一致 + 兼容 MySQL/Oracle。
- 阿里云 / 蚂蚁体系成熟,运维生态完善。
- 国产化需求红利。

**Q5. 业务迁移到 NewSQL 的最大坑?**
- 跨节点 JOIN 性能差。
- 跨 Region 事务延迟不可控。
- 既有分库分表 ID 体系不能再用。
- 索引设计需要重新审视。
## 12. 延伸阅读

- 共识底层 → [08 · 共识与复制协议](08-consensus.md)
- 2PC 在分布式数据库中的实现 → [03 · 强一致性方案](03-strong-consistency.md)
- 实战迁移策略 → [12 · 实战案例](12-case-studies.md)
- 选型决策 → [13 · 选型决策与最佳实践](13-decision-tree.md)
- 未来方向 → [14 · 未来趋势](14-future.md)
