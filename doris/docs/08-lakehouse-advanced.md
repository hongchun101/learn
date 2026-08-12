# 08｜Lakehouse、存算分离与高级能力

进阶能力不是技术清单。每项都要回答：数据是否需要复制、鲜度多少、查询模式是什么、谁负责源系统、失败如何降级、收益是否大于复杂度。

## 1. Catalog 心智模型

Doris 可通过 Catalog 访问 Hive、Iceberg、Paimon、Hudi、JDBC 等生态数据源（支持范围和语法按版本核对）。内表与外表的选择：

- **内表**：写入、索引、物化、低延迟和资源控制更强；需要维护数据副本；
- **外表**：避免复制、共享源数据；受文件布局、元数据、对象存储和源系统并发影响；
- **混合**：原始数据留湖，热聚合/高频服务层落 Doris。

Catalog POC 必测：小文件数量、文件格式、分区发现、Schema 演进、谓词下推、列裁剪、元数据缓存、冷/热缓存、源端限流和权限透传。

## 2. 文件与表布局

湖上查询慢，常见原因不是 Doris 算子，而是：小文件过多、分区过细、文件统计缺失、排序差、压缩格式不合适、对象存储请求延迟。先做文件分析，再决定 compaction、重写或热数据落内表。

外表性能报告至少包含：文件数、总字节、选中文件数、扫描字节、元数据时间、远端读时间、缓存命中率。

## 3. 存算分离选型

### 适合的信号

- 计算峰谷明显，存储容量增长与计算增长不同步；
- 多租户/多团队需要独立计算组；
- 已有可靠对象存储、网络和凭据体系；
- 能接受并治理缓存未命中尾延迟。

### 不适合的信号

- 本地开发或小团队；
- 没有稳定共享存储；
- 业务要求极低且稳定的本地 I/O 延迟；
- 团队没有 Meta Service/对象存储故障处理能力。

不能用一次热缓存 POC 证明存算分离适合生产。至少包含重启后冷缓存、扩容、存储限流、网络分区和元数据故障。

## 4. 异步物化视图与湖上加速

典型路径：

```text
外部明细表（湖）
  -> 分区增量读取
  -> Doris 异步物化视图/内表聚合
  -> BI 查询透明改写
```

需要定义 refresh watermark、迟到数据回补、源分区删除、查询回退、视图失效和成本上限。物化层不能成为不可重建的唯一真相。

## 5. 半结构化与 AI 数据栈

4.x 概览列出 VARIANT、全文和向量能力。适合做混合过滤/检索 + 结构化聚合的统一查询，但必须测召回率、延迟、索引构建、更新和存储成本。

```sql
-- 仅作能力示意；先为 body 建立包含合适 analyzer 的倒排索引，
-- 再按当前版本的全文检索文档选择 MATCH_ALL/MATCH_ANY/MATCH_PHRASE/SEARCH。
CREATE INDEX idx_products_body ON products (body)
USING INVERTED;

SELECT product_id, category_id, sales_count
FROM products
WHERE category_id = 1
  AND body MATCH_ALL '轻量 透气'
ORDER BY sales_count DESC
LIMIT 20;
```

`MATCH_ALL` 表示关键词都命中；短语、前缀和复杂布尔条件应改用对应 `MATCH_PHRASE`/`MATCH_PHRASE_PREFIX`/`SEARCH` 语法，并验证 analyzer、召回率和 Profile。

向量检索实验不能只看 TopK 速度：用标注集算 Recall@K、过滤后召回、更新延迟和内存；对安全/财务场景不要把近似检索当绝对正确。

## 6. 高并发与缓存

行存、短路执行、Dictionary、SQL/条件/外表文件缓存分别解决不同问题。决策框架：

1. 请求是否主键点查？
2. 是否允许近实时/缓存陈旧？
3. 读写比、Key 分布和突发并发是什么？
4. 命中率、失效、预热和扩容行为如何？
5. 缓存击穿时是否会拖垮集群？

## 7. 高级能力实验

- 建一个外部 Catalog，测冷/热缓存和文件裁剪；
- 用同一指标比较“外表直查”“内表落地”“异步 MV”；
- 制造小文件和坏文件，写出诊断/修复 Runbook；
- 对混合检索建立 1000 条标注查询，测 Recall@K + P95；
- 对存算分离做 4 个故障场景并计算成本/性能边界。

## 8. 过关标准

能提交一份架构 ADR：至少比较两种方案，写出数据路径、鲜度、性能、成本、故障、权限、迁移和回滚，并用 POC 数据支撑结论，而不是用“湖仓一体”作结论。

参考：[Lakehouse 概览](https://doris.apache.org/docs/4.x/lakehouse/lakehouse-overview/)、[Catalog](https://doris.apache.org/docs/4.x/lakehouse/catalog-overview/)、[存算分离](https://doris.apache.org/docs/4.x/compute-storage-decoupled/)、[AI](https://doris.apache.org/docs/4.x/ai/)。

下一章：[故障诊断手册](09-troubleshooting.md)。
