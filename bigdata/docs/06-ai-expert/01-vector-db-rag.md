# 01 · 向量数据库与 RAG 系统

> **本章目标**:搞懂 ANN 算法的工程权衡(IVF / HNSW / PQ / ScaNN),能对 Milvus / TiDB Vector / Qdrant / Redis 8 / Elasticsearch 做出选型决策;并能搭建一个生产级 RAG 系统 + 把向量数据入湖。
>
> **难度**:★★★★☆。建议阅读 3 小时,实操 6 小时。

---

## 0. 全景图

```
                ┌──────────────────────────────────────────────────┐
                │             RAG Application                      │
                │  (LangChain / LlamaIndex / Dify / 内部平台)        │
                └─────────────────────┬────────────────────────────┘
                                      │
                ┌─────────────────────┴──────────────────────────┐
                │   Embedding Model(推理服务)                    │
                │   - bge-large-zh-v1.5 / bge-m3 / mxbai /       │
                │     OpenAI text-embedding-3 / Qwen3-Embed       │
                └─────────────────────┬──────────────────────────┘
                                      │ 1024–3072 维 float32 向量
                                      ▼
                ┌─────────────────────────────────────────────┐
                │   Vector Database(ANN 检索)                  │
                │  Milvus / Qdrant / TiDB Vector / ES 8 /      │
                │  Redis 8 / pgvector / LanceDB                 │
                └──────┬──────────────────────────┬────────────┘
                       │                          │
                       ▼                          ▼
        ┌──────────────────────────┐  ┌────────────────────────────┐
        │  元数据 / 过滤检索        │  │  向量数据入湖              │
        │  BM25 + 向量混合打分      │  │  Iceberg / Hudi / OSS       │
        │  (Hybrid Search)         │  │  (审计 / 回流训练)           │
        └──────────────────────────┘  └────────────────────────────┘
```

**核心结论**:向量库不是"取代关系型数据库",而是**新的索引类型**。把它当作"相似度检索的搜索引擎"来理解,选型就清晰了。

---

## 1. ANN 算法原理:工程视角

### 1.1 检索精度的度量

| 指标 | 含义 | 公式 |
| --- | --- | --- |
| **Recall@10** | Top-10 中真实最近邻占比 | `\|ANN ∩ GT\| / \|GT\|` |
| **QPS** | 每秒查询数 | 单机并发测得 |
| **P99 latency** | 99% 请求延迟 | 实测 |
| **Build time** | 建索引时间 | 1 亿向量典型 10 min – 数小时 |
| **Index size** | 索引占内存 / 磁盘 | 通常是原向量 1.5–10 倍 |

### 1.2 IVF(Inverted File Index)

**原理**:
1. 用 KMeans 把向量空间划成 `nlist` 个聚类桶(如 4096);
2. 每条向量只属于最近的桶;
3. 查询时,先找最近的 `nprobe` 个桶(如 32),只在这些桶里暴力搜。

**复杂度**:`O(n · d)` 训练,`O(nlist · d + nprobe · n/nlist · d)` 查询。

**优点**:
- 内存可控,百亿向量可下推;
- 训练快,适合亿级以上;
- 与 PQ 组合后压缩到原大小 1/10。

**缺点**:
- Recall 随 `nprobe` 增大而提升,但 P99 也线性变差;
- 数据分布漂移后桶不均衡,需要重建。

**Faiss IVF-FLAT 代码**:
```python
import faiss
nlist = 4096
quantizer = faiss.IndexFlatL2(d)            # 粗排用 L2
index = faiss.IndexIVFFlat(quantizer, d, nlist, faiss.METRIC_L2)
index.train(xb)                              # xb 是训练集,> 30·nlist
index.add(xb)                                # 加向量
index.nprobe = 32                            # 查询探针数
D, I = index.search(xq, k=10)
```

### 1.3 HNSW(Navigable Small World Graph)

**原理**:构造一张多层导航图,每条向量有若干近邻;查询从顶层稀疏图"贪心"下沉到底层稠密图。**复杂度 `O(log N)`**。

**关键参数**:
- `M`:每个节点边数,典型 16–48,越大 Recall 越高、内存越大;
- `efConstruction`:构建时候选队列大小,典型 100–200;
- `efSearch`:查询时候选队列大小,典型 64–256。

**优点**:
- Recall 极高(95%+ 容易);
- P99 极稳定;
- 支持动态增删。

**缺点**:
- 内存爆炸:1 亿 768 维 float32 + M=32,**内存 ~120GB**;
- 构建慢,十亿级只能分布式(hnswlib `parallel_build`)。

**Hnswlib 代码**:
```python
import hnswlib
index = hnswlib.Index(space="cosine", dim=1024)
index.init_index(max_elements=10_000_000, ef_construction=200, M=32)
index.add_items(xb, ids=np.arange(len(xb)))
index.set_ef(128)                            # 查询 ef
labels, distances = index.knn_query(xq, k=10)
```

### 1.4 PQ(Product Quantization,乘积量化)

**原理**:把 768 维向量切成 8 段子向量(如 8×96),每段用 KMeans 聚成 256 个 centroids → 用 1 字节 ID 表示。**压缩比 768×4 字节 → 8 字节 ≈ 96×**。

**优点**:内存极省,百亿向量单机可存。
**缺点**:Recall 损失 5–10%,需要配合 Rerank 恢复精度。

**OPQ(Optimized PQ)** 用 PCA 旋转后再 PQ,Recall 比标准 PQ 高 3–5%。

### 1.5 ScaNN(Google SoTA)

**原理**:
- **Anisotropic Vector Quantization (AVQ)**:让量化误差"方向对齐"真值,Recall 远超传统 PQ;
- **Tree + 4-bit Quantization**:树结构保证速度,4-bit 保证精度。

**ScaNN 在 ann-benchmarks 上一骑绝尘**,比 IVF-PQ 同样内存下 Recall 高 10%+。

**代码**(Python):
```python
# pip install scann
import scann
searcher = (
    scann.scann_ops_pybind.builder(xb, k=10, dist_sq="squared_l2")
        .tree(num_leaves=2000, num_leaves_to_search=100, training_sample_size=250000)
        .score_ah(2, anisotropic_quantization_threshold=0.2)
        .reorder(100)
        .build()
)
neighbors, distances = searcher.search(xq)
```

### 1.6 各算法综合对比

| 算法 | Recall@10(1M 768d) | QPS | 内存(1M) | 适用规模 |
| --- | --- | --- | --- | --- |
| Flat(Brute) | 1.00 | 30 | 3GB | < 100 万 |
| **IVF4096,PQ64** | 0.85 | 8000 | 0.3GB | 1–10 亿 |
| **IVF4096,Flat** | 0.97 | 1200 | 3GB | 千万级 |
| **HNSW(M=32)** | 0.99 | 1500 | 4GB(仅向量) | 千万级 |
| **ScaNN(AVQ)** | 0.97 | 5000 | 0.6GB | 千万–亿级 |
| **DiskANN** | 0.95 | 1000 | 0.3GB(SSD) | 10–100 亿 |

---

## 2. 主流向量数据库对比(2026 年现状)

### 2.1 横向对比表

| 维度 | **Milvus** | **Qdrant** | **TiDB Vector** | **Redis 8** | **Elasticsearch 8** | **pgvector** | **LanceDB** |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **底层算法** | IVF/HNSW/DiskANN/PQ/ScaNN | HNSW | HNSW | HNSW | HNSW | HNSW/IVF | IVF-PQ |
| **存储** | 对象存储(S3/MINIO)+ 内存缓存 | 磁盘 + mmap | RocksDB + TiKV | 内存 | 磁盘(Lucene HNSW) | 堆表 | 列存(Arrow) |
| **最大规模** | 数百亿 | 数十亿 | 数十亿 | 数千万 | 数十亿 | 千万级 | 亿级 |
| **过滤检索** | 标量+向量混合(强) | 标量 payload 过滤(强) | 强(SQL WHERE) | 弱 | 强(DSL) | 强(SQL) | 中 |
| **混合检索** | 自研 + BM25 | BM25 插件 | 全文 + 向量 | 无 | **原生最强** | 无 | 无 |
| **多租户** | 数据库/集合级 | collection 级 | 库级 | DB 级 | 索引级 | schema | namespace |
| **云原生** | K8s Operator + Helm | K8s Operator + Helm | TiDB Operator | Sentinel/Cluster | ECK / OpenSearch | 无 | 无 |
| **性能(1M 768d Recall=0.95)** | 8000 QPS | 5000 QPS | 3000 QPS | 20k QPS | 2000 QPS | 500 QPS | 4000 QPS |
| **运维复杂度** | 高 | 中 | 中 | 低 | 高 | 低 | 低 |
| **License** | Apache 2.0 | Apache 2.0 | Apache 2.0 | RSAL v2 / SSPL | Elastic / SSPL | PostgreSQL | Apache 2.0 |
| **典型用户** | 蚂蚁、Shopee、PayPal | HuggingFace、Microsoft | 知乎、小红书 | Snapchat、Twitter | Wikipedia、Uber | 个人/中型 | ML 团队 |

### 2.2 选型决策树

```
是否需要 ≥ 100 亿向量?
  ├─ 是 → Milvus (DiskANN) / Qdrant (磁盘 mmap)
  └─ 否 →
       是否已有 ES 集群?
         ├─ 是 → ES 8 (knn + BM25 混合)
         └─ 否 →
              是否需要 SQL 接口?
                ├─ 是 → TiDB Vector / pgvector (小规模)
                └─ 否 →
                     是否需要超低延迟(<10ms) 中小规模?
                       ├─ 是 → Redis 8 Vector
                       └─ 否 → Qdrant (运维简单 + 性能均衡)
```

### 2.3 各系统的核心架构(★ 必须理解)

#### Milvus
```
SDK → Proxy (无状态) → MixCoord (路由) → QueryNode / DataNode / IndexNode
                                 ↓
                       Message Storage (Kafka/Pulsar)
                                 ↓
              Object Storage (S3/MINIO/OSS) — 持久化向量 + 索引
                                 ↓
              MetaStore (etcd) — collection schema / segment 元数据
```

**核心组件源码**:
- `internal/proxy/task_search.go`:查询解析、路由
- `internal/querynodev2/segments/load_segment.go`:segment 加载
- `internal/indexnode/task.go`:索引构建任务
- `internal/storage/remote_chunk_manager.go`:对象存储访问

#### Qdrant
```
REST/gRPC → Service → Consensus (Raft)
                       ├─ Collection Manager
                       ├─ Update Queue (WAL → RocksDB)
                       └─ Search Executor (HNSW + Payload Index)
```
单二进制 Rust 实现,**部署极简**。`qdrant/src/lib.rs` 是入口,`src/vector_storage/` 是核心。

#### TiDB Vector
底层用 **TiKV**(分布式 KV),向量作为值的一部分,倒排 + HNSW 索引。**优势是 SQL 一体化**,可直接 `SELECT ... ORDER BY vec_distance(...) WHERE ...`。

```sql
-- TiDB Vector 用法
SELECT id, title,
       vec_distance_cosine(embedding, '[0.1, 0.2, ...]') AS distance
FROM knowledge_base
WHERE category = 'tech'
ORDER BY distance ASC
LIMIT 10;
```

#### Redis 8 Vector
- 内存存储,**P99 < 5ms**;
- 算法:**HNSW**(单实例)和**SVS**(可压缩,亿级);
- 与 Redis 已有数据结构(string/hash/json)共存;
- 缺点:贵(全内存)、不支持水平扩展。

```redis
FT.CREATE idx:docs ON HASH PREFIX 1 doc: SCHEMA \
    title TEXT embedding VECTOR HNSW 6 TYPE FLOAT32 DIM 1024 DISTANCE_METRIC COSINE \
    M 16 EF_CONSTRUCTION 200 EF_RUNTIME 100

FT.SEARCH idx:docs "*=>[KNN 10 @embedding $vec]" PARAMS 2 vec "\x00\x01\x02..." LIMIT 0 10
```

#### Elasticsearch 8
- 底层仍是 Lucene HNSW(从 7.3 开始);
- 强项是 **Hybrid Search**:`BM25 + knn_score` 加权;
- `_source` 字段过滤、聚合、Pipeline 全部复用。

```json
POST /knowledge/_search
{
  "query": {
    "hybrid": {
      "queries": [
        { "match": { "title": "向量检索" }},
        { "knn": {
            "field": "embedding",
            "query_vector": [0.1, 0.2, ...],
            "k": 10, "num_candidates": 100
        }}
      ]
    }
  }
}
```

---

## 3. 与 RAG 系统集成

### 3.1 RAG 标准流水线(★ 重点)

```
┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│ 文档加载  │→│ 切片     │→│ Embedding│→│ 入向量库  │→│ 检索     │
│ Loader   │  │ Splitter │  │ Encoder  │  │ Indexer  │  │ Retriever│
└──────────┘  └──────────┘  └──────────┘  └──────────┘  └────┬─────┘
                                                            │
                                                            ▼
                                              ┌──────────────────────────┐
                                              │  Rerank(可选,提升 Recall) │
                                              └────────────┬─────────────┘
                                                            │
                                                            ▼
                                              ┌──────────────────────────┐
                                              │  Prompt 组装 + LLM 推理   │
                                              └──────────────────────────┘
```

### 3.2 切片策略(性能关键)

| 策略 | 优点 | 缺点 |
| --- | --- | --- |
| **固定长度** | 简单 | 切断语义 |
| **按段落** | 保持语义 | 长文档 chunk 过大 |
| **Recursive(递归按 \n\n / \n / 。)** | 平衡 | 中文需自定义 |
| **Markdown / HTML 结构** | 语义完整 | 实现复杂 |
| **Semantic(Embedding 切)** | 语义最优 | 慢,需 L2 距离判断 |
| **Sliding window + overlap** | 鲁棒 | 重复存储 |

**推荐生产**:中文 RAG 用 **Recursive + overlap** + 元数据(标题/章节/来源)。`chunk_size = 256–512 tokens,overlap = 50`。

```python
# LlamaIndex 中文切片
from llama_index.core.node_parser import SentenceSplitter

splitter = SentenceSplitter(
    chunk_size=512,
    chunk_overlap=50,
    paragraph_separator="\n\n",
    secondary_chunking_regex="[。！？!?]",
)
nodes = splitter.get_nodes_from_documents(documents)
```

### 3.3 Embedding 模型选型(2026 年 8 月更新)

| 模型 | 维度 | 中文 | MTEB Avg | 推理速度(GPU) |
| --- | --- | --- | --- | --- |
| **BAAI/bge-large-zh-v1.5** | 1024 | ★★★★★ | 64.5 | 1000 句/s/A100 |
| **BAAI/bge-m3** | 1024 | ★★★★★(多语) | 66.0 | 800 句/s/A100 |
| **Qwen3-Embedding-8B** | 4096 | ★★★★★ | 70.2 | 400 句/s/A100 |
| **text-embedding-3-large** | 3072 | ★★★★ | 64.6 | API |
| **mxbai-embed-large-v1** | 1024 | ★★★ | 64.3 | 1200 句/s/A100 |

**生产经验**:
- 中文首选 **bge-m3**(多语 + 8192 token 长文 + 检索 + 分类 + 聚类统一);
- 极致质量用 **Qwen3-Embedding-8B**,但要 H100 部署;
- 成本敏感用 **bge-large-zh-v1.5**,4-bit 量化后单 A10 可跑。

### 3.4 完整可运行的 RAG 代码(LlamaIndex + Qdrant)

```python
# pip install llama-index llama-index-vector-stores-qdrant qdrant-client
from llama_index.core import (
    VectorStoreIndex, SimpleDirectoryReader, Settings, StorageContext
)
from llama_index.vector_stores.qdrant import QdrantVectorStore
from llama_index.embeddings.huggingface import HuggingFaceEmbedding
from llama_index.llms.vllm import Vllm
import qdrant_client

# 1) 启动 Qdrant (本地) / 连远程
client = qdrant_client.QdrantClient(host="localhost", port=6333)
vector_store = QdrantVectorStore(
    client=client,
    collection_name="kb_demo",
    enable_hybrid=True,                # 开启 BM25 混合
    hybrid_fetcher_fn=...,
)

# 2) 设置全局 Embedding + LLM
Settings.embed_model = HuggingFaceEmbedding(
    model_name="BAAI/bge-m3",
    device="cuda",
    max_length=8192,
)
Settings.llm = Vllm(
    model="Qwen/Qwen2.5-72B-Instruct",
    api_base="http://gpu-01:8000/v1",
    temperature=0.1,
    max_tokens=2048,
)

# 3) 加载 + 切片 + 入库
documents = SimpleDirectoryReader("./data/", recursive=True).load_data()
storage_context = StorageContext.from_defaults(vector_store=vector_store)
index = VectorStoreIndex.from_documents(
    documents,
    storage_context=storage_context,
    transformations=[SentenceSplitter(chunk_size=512, chunk_overlap=50)],
    show_progress=True,
)

# 4) 检索 + 生成
query_engine = index.as_query_engine(
    similarity_top_k=10,
    hybrid_top_k=10,                  # hybrid 模式
    vector_top_k=10,
    alpha=0.5,                        # 0=BM25 only, 1=vector only
)
response = query_engine.query("向量数据库的核心算法有哪些?")
print(response)
```

### 3.5 检索质量优化

**Rerank 是性价比最高的优化**(Recall +15%,延迟 +200ms):

```python
from llama_index.postprocessor.flag_embedding_reranker import FlagEmbeddingReranker

reranker = FlagEmbeddingReranker(
    model="BAAI/bge-reranker-v2-m3",
    top_n=5,                          # 重排后取前 5
)
query_engine = index.as_query_engine(
    similarity_top_k=20,
    node_postprocessors=[reranker],
)
```

**Query 改写(HyDE / Step-back)**:
```python
from llama_index.core.query_engine import MultiStepQueryEngine
# 先用 LLM 把 query 改写成更通用的"假设答案",再用假设去检索
```

### 3.6 RAG 评估

```python
# RAGAS 评估:context_precision / context_recall / faithfulness / answer_relevancy
from ragas import evaluate
from ragas.metrics import (
    context_precision, context_recall,
    faithfulness, answer_relevancy,
)

dataset = [{
    "question": "向量数据库的核心算法?",
    "contexts": ["IVF 倒排...", "HNSW 图..."],
    "answer": "IVF 和 HNSW",
    "ground_truth": "IVF / HNSW / PQ / ScaNN"
}]
result = evaluate(dataset, metrics=[context_precision, context_recall, faithfulness, answer_relevancy])
```

生产参考指标:`context_precision ≥ 0.85`, `faithfulness ≥ 0.90`, `answer_relevancy ≥ 0.85`。

---

## 4. 向量数据入湖:可观测 + 可治理 + 可回流

### 4.1 为什么向量数据也要入湖

- **审计**:哪个用户何时查了哪些文档,合规需要;
- **回流训练**:badcase → 训练数据;
- **离线评测**:不连生产库也能跑 RAGAS;
- **跨团队共享**:业务 A 检索过的 query 给业务 B 用。

### 4.2 Iceberg Schema 设计

```sql
-- prompt.dwd_doc_chunk (文档切片维度)
CREATE TABLE prompt.dwd_doc_chunk (
    chunk_id        STRING,            -- UUID
    doc_id          STRING,
    chunk_text      STRING,
    chunk_pos       INT,               -- 第几个切片
    source          STRING,            -- confluence / oss / web
    embedding       ARRAY<FLOAT>,      -- 1024 维 bge-m3 向量
    embedding_model STRING,
    created_at      TIMESTAMP,
    dt              STRING
) PARTITIONED BY (dt)
STORED AS ICEBERG
TBLPROPERTIES (
    'format-version' = '2',
    'write.upsert.enabled' = 'true'
);

-- prompt.dwd_vector_search_log (检索日志)
CREATE TABLE prompt.dwd_vector_search_log (
    query_id        STRING,
    user_id         STRING,
    query_text      STRING,
    query_embedding ARRAY<FLOAT>,
    top_k           INT,
    retrieved_ids   ARRAY<STRING>,
    retrieved_scores ARRAY<FLOAT>,
    reranked_ids    ARRAY<STRING>,
    reranked_scores ARRAY<FLOAT>,
    latency_ms      INT,
    vector_db       STRING,            -- qdrant / milvus
    created_at      TIMESTAMP,
    dt              STRING
) PARTITIONED BY (dt);
```

### 4.3 Flink 入湖作业骨架

```java
public class VectorLogLakeJob {
    public static void main(String[] args) throws Exception {
        StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment();
        env.enableCheckpointing(60_000, CheckpointingMode.EXACTLY_ONCE);

        // 1) 消费检索日志
        KafkaSource<String> src = KafkaSource.<String>builder()
            .setBootstrapServers("kafka:9092")
            .setTopics("vector-search-events")
            .setGroupId("vector-lake")
            .setStartingOffsets(OffsetsInitializer.latest())
            .setValueOnlyDeserializer(new SimpleStringSchema())
            .build();

        DataStream<SearchLog> stream = env.fromSource(src, WatermarkStrategy.noWatermarks(), "kafka")
            .map(new JsonParser<>())
            .filter(Objects::nonNull)
            .map(new PiiRedactor<>());

        // 2) 写入 Iceberg
        FlinkSink.forRowData(stream)
            .tableLoader(TableLoader.fromHadoopTable(
                "iceberg://warehouse/prompt.db/dwd_vector_search_log"))
            .overwrite(false)
            .append();

        env.execute("VectorLogLake");
    }
}
```

### 4.4 向量入湖的两个坑

1. **数组列(ARRAY<FLOAT>)压缩差**:Iceberg 用 Parquet 默认 ZSTD,对 1024 维 float 数组压缩率仅 1.5×。解决方案:转成 `BINARY`(拼成 bytes)或 Parquet `BYTE_ARRAY`。
2. **Embedding 版本**:每次模型升级都带来 ID 漂移,**必须把 `embedding_model` 写入表**;回滚模型时按 `embedding_model = 'bge-m3@2025-06-01'` 过滤重算。

---

## 5. 工程实践:一个生产级 RAG 系统的搭建

### 5.1 端到端架构

```
┌────────────────────────────────────────────────────────────────┐
│  Data Pipeline(Luigi/Airflow)                                 │
│  Confluence / 飞书 / GitLab / PDF → 切片 → Embedding →        │
│       Iceberg(dwd_doc_chunk) → Qdrant                          │
└────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌────────────────────────────────────────────────────────────────┐
│  Online Retrieval(QPS 1k+)                                    │
│  API → Query Rewrite (改写) → Hybrid Search(Qdrant) →         │
│       Rerank(bge-reranker-v2-m3) → Prompt → vLLM(Qwen2.5)    │
└────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌────────────────────────────────────────────────────────────────┐
│  Observability(Langfuse + Grafana)                            │
│  prompt version / latency / cost / eval score / badcase       │
└────────────────────────────────────────────────────────────────┘
```

### 5.2 关键监控指标

| 类别 | 指标 | 阈值 |
| --- | --- | --- |
| **延迟** | embedding / retrieve / rerank / llm P50/P99 | P99 < 3s |
| **质量** | RAGAS 四项(离线) | 全部 ≥ 0.85 |
| **成本** | 单次 / 单日 / 单用户 | 设预算 |
| **向量库** | Qdrant QPS / segment 数 / 内存 | < 80% 容量 |
| **流量** | 检索 QPS / 命中率 / no-result 率 | 命中率 ≥ 60% |

### 5.3 真实故障

**故障:向量库 QPS 突降 90%**
- **现象**:Qdrant 集群 P99 从 30ms 涨到 800ms,业务方反馈 RAG 慢。
- **定位**:`GET /collections/kb_demo` 显示 segment 数从 100 涨到 8000,**索引碎片化**。
- **根因**:增量更新后未触发合并,Qdrant 默认 `optimizer_interval = 60s` 但实际 30 分钟才合并。
- **修复**:手动触发 `POST /collections/kb_demo/optimize`;改 `optimizer_interval = 30s`。
- **改进**:写入端用 batch + 定期 `POST /collections/{name}/snapshots` 备份。

---

## 6. 实战任务

1. **本地起 Qdrant + 灌 100 万 bge-m3 向量**,记录索引构建时间和 P99。
2. **用 RAGAS 评估一个公开数据集**(如 HotpotQA)的中文 RAG,得到 baseline。
3. **加 Rerank**,对比 Recall +5%。
4. **把检索日志通过 Flink 写入 Iceberg**,写 SQL 统计最热 query。
5. **对比 IVF / HNSW / ScaNN** 在 100 万 768 维向量上的 Recall / QPS / 内存三轴。

---

## 7. 专家面试题

1. **HNSW 为什么比 IVF 快?有什么代价?**
   *图遍历 O(log N) vs 桶内暴力 O(n/nlist);代价是内存 + 构建慢 + 难分布式。*

2. **PQ 的压缩原理?为什么能压缩 96×?**
   *每段量化到 256 个 centroids,768 维 → 8 字节 = 1 byte/段 × 8 段;原理是 KMeans + 残差编码。*

3. **为什么 Qdrant 用 Rust 实现?有什么工程取舍?**
   *零成本抽象 + 内存安全 + 无 GC;取舍是开发速度慢,但生产性能 / 稳定性更好。*

4. **Hybrid Search 为什么能比单向量检索 Recall 高?**
   *BM25 抓精确关键词,向量抓语义;互补场景,加权融合(Reciprocal Rank / Linear)。*

5. **向量库能不能完全替代 ES?**
   *不能。向量库擅长相似度,ES 擅长全文 + 聚合 + Pipeline;生产都用混合。*

6. **为什么 RAG 比 Fine-tune 性价比高?**
   *RAG 实时更新知识 / 成本低 / 可解释;Fine-tune 改模型权重,知识固化,实时性差。*

7. **向量数据怎么入湖?为什么 ARRAY<FLOAT> 不好?**
   *Flink 消费 → Iceberg;ARRAY 列压缩率差(1.5×),用 BINARY 或 BYTE_ARRAY。*

8. **Embedding 模型升级怎么平滑?**
   *双写 + 灰度:旧模型继续服务,新模型离线评估;按 doc_id 切换;旧模型按 dt 保留 30 天。*

9. **Qdrant 的 segment 合并是什么?为什么重要?**
   *小 segment 合并成大 segment,减少文件描述符、提升查询 locality;生产必须配 optimizer_interval。*

10. **TiDB Vector 和 Milvus 的本质区别?**
    *TiDB Vector = SQL 一体化(中量级);Milvus = 专用向量引擎(海量级)。选型看团队 SQL 依赖。*

---

## 8. 生产经验

1. **任何向量库上线前必须压测**:1 亿向量 P99 < 100ms 是底线。
2. **Embedding 模型必须锁版本**(dvc / model registry),否则一夜之间检索全乱。
3. **向量数据禁止存原始 float32 到 OSS**,一定要 binpack / parquet,1 亿向量 1.5TB → 250GB。
4. **Rerank 是 RAG 性价比第一优化**,比换 Embedding 模型 / 加缓存都划算。
5. **混合检索的 alpha 必须 A/B 测**,0.3–0.7 通常较优,业务不同差异大。
6. **向量库必须分多 namespace**(业务 / 安全等级),避免单点故障 / 数据泄露。
7. **向量检索的 badcase 必须周会 review**,回流到训练数据 / 提示工程。
8. **大规模向量库一定要 SSD**,机械盘 P99 直接爆炸。
9. **不要用 `pgvector` 撑生产**(< 千万),架构选型阶段就要考虑 Milvus / Qdrant。
10. **向量数据定期重建索引**(季度),冷数据归档到 S3 + 重建轻量索引。

---

**下一章** → [02-性能调优三板斧](./02-performance-tuning.md)