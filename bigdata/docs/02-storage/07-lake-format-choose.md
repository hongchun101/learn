# 07. 三湖对比与选型决策树

> **本章定位**:最后一章,把 Iceberg / Hudi / Paimon 三个湖格式放在同一坐标系下对比,给出 **5 个典型业务场景的明确推荐**,作为整个存储篇的"实战总结"。
>
> **学习目标**:能在面试或实际业务中,基于 5–10 个维度,3 分钟内给出选型结论。

---

## 1. 三湖一句话对比

| 维度 | Iceberg | Hudi | Paimon |
| --- | --- | --- | --- |
| **核心定位** | 通用表格式,引擎中立 | 增量摄取 + 表管理 | Flink First 湖格式 |
| **诞生方** | Netflix(2017) | Uber(2017) | 阿里(2022)→ Apache |
| **主语言** | Java | Java/Scala | Java |
| **写入模式** | Copy-on-Write(主) | CoW + MoR | LSM(类 HBase MoR) |
| **行级 update** | v2+ (Deletion Vectors) | 原生(主键表) | 原生(LSM) |
| **Changelog 流读** | 弱 | 一般 | **强** |
| **引擎生态** | Spark/Trino/Flink/Hive | Spark 主导,Flink 一般 | Flink 主导,Spark 一般 |
| **Catalog** | REST/Hive/Glue/Nessie | HMS/FileSystem | HMS/REST/DLF |
| **云原生友好** | 极佳(S3) | 良好 | 良好 |

---

## 2. 十维评分卡(1–5 分)

| 维度 | Iceberg | Hudi | Paimon | 说明 |
| --- | --- | --- | --- | --- |
| Spark 写入成熟度 | 5 | 5 | 3 | Iceberg/Hudi 与 Spark 生态多年磨合 |
| Flink 写入成熟度 | 3 | 3 | 5 | Paimon 是 Flink 亲儿子 |
| 实时 CDC 入湖 | 3 | 4 | 5 | Paimon/Hudi 强 |
| 批 ETL 性能 | 5 | 4 | 3 | Iceberg 静态查询优化好 |
| 流式 Changelog 订阅 | 2 | 3 | 5 | Paimon 原生支持 |
| Schema 演进 | 5 | 4 | 4 | Iceberg v3 默认列 + Variant |
| Hidden Partition | 5 | 4 | 4 | Iceberg 最成熟 |
| Time Travel | 5 | 4 | 4 | 三者都支持,API 略有差异 |
| 索引能力 | 3 | 5(Bloom) | 4(LSM) | Hudi/Paimon 主键索引强 |
| 社区/文档 | 5 | 4 | 3(成长中) | Iceberg 社区最大 |

**总分**:
- Iceberg:**40**(通用、Spark、Trino 友好)。
- Hudi:**38**(CDC、索引)。
- Paimon:**38**(Flink、Changelog)。

---

## 3. 五场景推荐结论

### 场景 1:离线数仓(ODS → DWD → DWS → ADS)

**核心诉求**:每日定时 ETL,大文件为主,分析查询多,Schema 演进频繁。

**推荐**:**Iceberg**(首选)、Hudi CoW(次选)。

**理由**:
- Iceberg 的 Hidden Partition + Manifest 优化,大表扫描剪枝极快。
- Spark 写入成熟度最高,`MERGE INTO`/`DELETE` 在 v3 几乎零成本。
- Trino/Presto 查询优化路径成熟。

**实战落地**:
- 用 Iceberg REST Catalog(Polarberg / Nessie),支持跨引擎共享。
- 用 `write.target-file-size-bytes = 256 MB`,定期 `rewrite_data_files`。

---

### 场景 2:实时 CDC 入湖(MySQL / PostgreSQL → 湖)

**核心诉求**:低延迟摄入,频繁 Update,下游需要流式订阅。

**推荐**:**Paimon**(首选)、Hudi MoR(次选)、Iceberg v3(备选)。

**理由**:
- Paimon Primary Key 表 + `changelog-producer=input`,Flink CDC 链路极简。
- Hudi MoR + Flink CDC 也可,但配置更繁琐。
- Iceberg v3 + Deletion Vectors 也支持,但性能略差。

**实战落地**:
- Paimon + Flink CDC 3.x,一行 SQL 接入。
- 启用 `sequence.field = op_ts`,确保 update 顺序正确。

---

### 场景 3:湖仓一体(查询 + 即席分析)

**核心诉求**:Trino/Presto + Spark 共享同一份数据,Schema 演进,Time Travel。

**推荐**:**Iceberg**(首选)。

**理由**:
- Trino 对 Iceberg 的 page index / Puffin 优化最深,查询计划最优。
- Schema 演进、隐藏分区、Time Travel 是面试"标配",Iceberg 文档/案例最丰富。
- 跨引擎一致性最好(Spark 写、Trino 读、Flink 读,无 schema 漂移)。

**实战落地**:
- 用 REST Catalog(Polarberg/Tabular),不要用 Hive Catalog(锁竞争严重)。
- 大表(>10 TB)启用 Deletion Vectors,加速 DELETE。

---

### 场景 4:流式管道(CDC → 实时数仓 → 下游流计算)

**核心诉求**:从一张表能"流式"读出所有变更,下游多个 Flink 作业订阅。

**推荐**:**Paimon**(首选)、Iceberg v3(次选)。

**理由**:
- Paimon 原生 Changelog + Consumer,流读语义完整。
- 多个下游可以**独立消费位点**(consumer.id),互不干扰。
- Hudi 也能流读,但性能/生态不及 Paimon。

**实战落地**:
- Paimon 主表 + `changelog-producer=input`。
- 下游 Flink 作业用 `consumer.id = '<job-name>'`,重启自动接续。

---

### 场景 5:AI / LLM 时代的数据底座

**核心诉求**:结构化宽表 + 非结构化日志 + 向量混合存储;LLM 调用产生的高频更新。

**推荐**:**Iceberg**(结构化) + Milvus(向量) + Paimon(实时状态)。

**理由**:
- 离线宽表 / Feature Store 走 Iceberg。
- 实时状态 / 会话历史走 Paimon(写入快、流读好)。
- 向量检索走 Milvus / Qdrant。

**实战落地**:
- Iceberg 存 LLM 训练集、特征工程结果。
- Paimon 存会话状态、用户偏好增量。
- Milvus 存 Embedding,提供 RAG 检索。

---

## 4. 推荐默认(如果只能选一个)

**如果业务是"以 Spark 批处理为主 + 偶尔 Flink 实时":** 默认 **Iceberg**。

**如果业务是"以 Flink 实时为主 + 增量入湖 + 流式订阅":** 默认 **Paimon**。

**如果业务是"已有大量 HBase / Spark 历史,需要快速迁移到湖格式":** 默认 **Hudi MoR**(HBase → Hudi 兼容性好)。

---

## 5. 决策树(伪代码)

```python
def recommend_lake_format(business):
    if business.is_real_time_cdc() and business.has_flink():
        return "Paimon"
    if business.has_spark_only() and business.is_batch_heavy():
        return "Iceberg"
    if business.has_hbase_legacy() and business.wants_migration():
        return "Hudi MoR"
    if business.is_lakehouse_query():
        return "Iceberg"
    if business.needs_changelog_streaming():
        return "Paimon"
    return "Iceberg"  # safe default
```

---

## 6. 反模式(不要这么做)

| 反模式 | 后果 |
| --- | --- |
| 一个项目同时用 Iceberg + Hudi + Paimon | 团队认知分裂,运维成本 ×3 |
| 5 GB 的小表用 Iceberg | 元数据开销远大于数据本身 |
| 把 Paimon 用作"纯离线批表" | 失去流读优势,价值打折 |
| 在 Iceberg 表上做高频单行 UPDATE | 走 Deletion Vectors,否则慢 |
| 用 Hive Catalog + 高并发写 | ZK 锁竞争,Commit 频繁失败 |

---

## 7. 实战任务

### 任务 1:三个湖格式性能对比

```bash
# 启动 Iceberg/Hudi/Paimon 三套环境
docker compose up iceberg hudi paimon

# 同一份数据 1 亿行,分别写入
spark-submit --conf spark.sql.catalog=iceberg ...
spark-submit --conf spark.sql.catalog=hudi ...
flink run -c paimon.App ...
```

观察:写入吞吐、查询 P99、commit 频率。

### 任务 2:Time Travel 跨引擎

```sql
-- Iceberg:Spark 写,Trino 读历史版本
spark.sql("INSERT INTO iceberg.db.t VALUES ...")
trino.sql("SELECT * FROM iceberg.db.t FOR SYSTEM_TIME AS OF '2024-01-01'")
```

### 任务 3:CDC 链路验证

```
MySQL --> Flink CDC --> Paimon Primary Key
                            ↓
                       Flink Sink (Kafka)
                            ↓
                    Flink 下游消费
```

验证:
1. MySQL 插入一行,Paimon 有 +I 事件。
2. MySQL 更新一行,Paimon 有 -U/+U 事件。
3. MySQL 删除一行,Paimon 有 -D 事件。

---

## 8. 专家面试题(5 题)

1. **三湖(Iceberg / Hudi / Paimon)各自的核心设计哲学是什么?一句话概括差异。**
2. **如果让你从 0 搭建一个实时数仓,你选 Paimon 还是 Iceberg + Flink CDC?为什么?**
3. **Iceberg v3 的 Deletion Vectors 解决了 v2 的什么痛点?和 Hudi MoR 的 log 文件本质区别?**
4. **三湖在 Time Travel 上实现细节差异?为什么 Iceberg 的 Time Travel 体验最好?**
5. **你的公司如果未来要"湖仓一体"迁移,你会建议从哪个存储迁移到哪个湖格式?说明路径。**

---

## 9. 本章小结

- **没有"最好的湖格式",只有"最合适的湖格式"**。
- 决策维度:**引擎生态(Spark vs Flink)、写入模式(批量 vs 实时)、读模式(批查 vs 流订阅)、生态成熟度、团队技能**。
- 默认:**Spark 多 → Iceberg,Flink 多 → Paimon,HBase 迁移 → Hudi MoR**。
- 整个存储篇到此结束,后续计算篇将围绕"数据怎么用"展开。

---

## 10. 附录:三湖命令速查

### Iceberg

```sql
-- 创建表
CREATE TABLE db.t (id BIGINT, name STRING, ts TIMESTAMP) USING iceberg;
-- Time Travel
SELECT * FROM db.t FOR SYSTEM_TIME AS OF '2024-01-01';
-- 合并小文件
CALL spark_catalog.system.rewrite_data_files('db.t');
```

### Hudi

```python
# Spark 写
df.write.format("hudi") \
    .option("hoodie.table.name", "orders") \
    .option("hoodie.datasource.write.table.type", "MERGE_ON_READ") \
    .option("hoodie.datasource.write.operation", "upsert") \
    .option("hoodie.datasource.write.precombine.field", "ts") \
    .option("hoodie.datasource.write.recordkey.field", "id") \
    .save("/path/to/tbl")
```

### Paimon

```sql
-- Flink 创建
CREATE TABLE orders (
  id BIGINT PRIMARY KEY,
  ts TIMESTAMP
) WITH (
  'bucket' = '4',
  'changelog-producer' = 'input'
);

-- 流读 changelog
SELECT * FROM orders /*+ OPTIONS('scan.changelog.mode' = 'all') */;
```

---

下一阶段:[03-计算篇](../../03-compute/00-compute-history.md)