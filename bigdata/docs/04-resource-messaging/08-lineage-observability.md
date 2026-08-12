# 08 · 数据血缘与可观测性(Lineage + Observability)

> **本章定位**:讲透大数据治理的"两个核心"——**数据血缘**(Lineage)和**可观测性**(Observability)。覆盖 OpenLineage、OpenTelemetry、Prometheus + Grafana、FluentBit + Loki 完整链路。
>
> **学习时长**:建议 8 学时(理论 2 + 实战 6)。

---

## 1. 治理的两根支柱:血缘 + 可观测性

```
┌──────────────────────────────── 大数据治理全景 ─────────────────────────────┐
│                                                                            │
│   数据资产                                                                  │
│   ├── Metadata(元数据):表的 Schema、分区、Owner、血缘                      │
│   ├── Quality(质量):校验规则、异常检测                                     │
│   ├── Security(安全):权限、脱敏、加密                                      │
│   └── Cost(成本):资源消耗、存储费用                                        │
│                                                                            │
│   可观测性(Observability)                                                  │
│   ├── Metrics(指标):CPU、吞吐、延迟、QPS                                  │
│   ├── Logs(日志):错误、访问、审计                                         │
│   ├── Traces(链路):跨服务请求链路                                          │
│   └── Events(事件):作业生命周期、状态变更                                  │
│                                                                            │
│   数据血缘(Data Lineage)                                                   │
│   ├── Source:来自哪个表/系统                                              │
│   ├── Transform:做了什么转换(SQL/Aggregate)                              │
│   ├── Target:写入哪个表                                                  │
│   └── Impact Analysis:改动影响哪些下游                                    │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

**两者的关系**:
- **可观测性** 回答"**现在**发生了什么"。
- **血缘** 回答"**数据从哪来到哪去**"。

---

## 2. OpenLineage —— 开放数据血缘标准

### 2.1 为什么需要 OpenLineage?

在大数据场景中,**没有血缘等于"看不见数据"**:

```
传统痛点:
   表 user_orders_dwd 有 30 个下游报表,你想改字段,但不知道有哪些报表受影响。
   没有血缘 → 改一行 SQL → 30 个报表出错 → 业务投诉。
   有血缘 → 改之前查询血缘 → 提前通知下游 owner → 安全升级。
```

**OpenLineage 是什么**:
- 由 LF AI & Data 基金会主导,**开放标准**。
- 定义 **Run**(执行)、**Dataset**(数据集)、**Job**(作业)三个核心概念。
- 已有集成:**Spark、Flink、Airflow、Dagster、Snowflake** 等。

### 2.2 核心概念

```
┌────────────────────────────────────────────────────────────────────┐
│                     OpenLineage 数据模型                            │
│                                                                     │
│   Dataset (数据集 / 表)                                              │
│   ├── namespace: 数据库类型 + 名称(iceberg://warehouse.db.table)    │
│   ├── name: 表全名                                              │
│   ├── facets: 额外属性(Schema、Version、Owner)                   │
│                                                                     │
│   Job (作业 / ETL)                                                  │
│   ├── namespace: 项目 / 系统                                       │
│   ├── name: 作业名(etl_user_orders_daily)                         │
│   └── facets: 输入输出、SQL、版本                                  │
│                                                                     │
│   Run (一次执行实例)                                                │
│   ├── runId: 唯一 ID                                               │
│   ├── facets: 时间、状态、参数                                    │
│   └── events: START / RUNNING / COMPLETE / FAIL                   │
│                                                                     │
└────────────────────────────────────────────────────────────────────┘
```

### 2.3 OpenLineage 与 Marquez

```
Marquez:OpenLineage 的官方 Reference Implementation
   ├── Web UI:展示血缘图
   ├── API:查询血缘、Run、Job
   └── 存储:Postgres + Metadata

架构:
   Job/Spark/Flink
        │  OpenLineage Events(START/COMPLETE)
        ▼
   Marquez HTTP API(POST /api/v1/lineage)
        │
        ▼
   Postgres(存储)
        │
        ▼
   Marquez Web UI(展示血缘图)
```

### 2.4 集成 Spark 示例

```python
# spark_etl.py
from pyspark.sql import SparkSession
from openlineage.spark.agent import OpenLineageSparkListener

spark = (
    SparkSession.builder
    .appName("etl_user_orders")
    .config("spark.extraListeners", OpenLineageSparkListener().class_name)
    .config("spark.openlineage.transport.type", "http")
    .config("spark.openlineage.transport.url", "http://marquez:5000/api/v1/lineage")
    .config("spark.openlineage.namespace", "myproject")
    .getOrCreate()
)

# 业务代码(自动捕获血缘)
df_users = spark.read.parquet("s3://bucket/users/")
df_orders = spark.read.jdbc("jdbc:mysql://...", "orders")
df_user_orders = df_orders.join(df_users, "user_id").filter(...)
df_user_orders.write.parquet("s3://bucket/user_orders/")

# OpenLineage Spark Listener 自动:
#   1. 收集 input datasets (users, orders)
#   2. 收集 output datasets (user_orders)
#   3. 提交 START / COMPLETE Event 到 Marquez
```

**事件流**:
```
Spark Job Start
   → OPENLINEAGE_START event
       { job: etl_user_orders, inputs: [users, orders] }
   → Spark SQL 执行 (Listener 捕获 QueryExecution)
   → Job Complete
       → OPENLINEAGE_COMPLETE event
           { job: etl_user_orders, outputs: [user_orders] }
```

### 2.5 集成 Airflow 示例

```python
from airflow import DAG
from airflow.providers.openlineage.operators.openlineage import OpenLineageProvider
from airflow.providers.openlineage.sensors.openlineage import OpenLineageDataset

with DAG("daily_etl") as dag:
    extract = SparkSubmitOperator(...)
    
    extract.lineage = {
        "inputs": [
            OpenLineageDataset(namespace="mysql://prod", name="orders")
        ],
        "outputs": [
            OpenLineageDataset(namespace="iceberg://warehouse", name="dwd.orders")
        ]
    }
```

### 2.6 关键源码类(OpenLineage)

```
openlineage/
├── spec/
│   └── facet.py                 # OpenLineage Facet Schema
├── client/
│   ├── transport.py             # HTTP/Kafka 传输
│   └── client.py
└── integrations/
    ├── spark/
    │   ├── listener.py          # SparkListener
    │   └── extractor.py         # 血缘抽取
    ├── airflow/
    │   └── extractor.py
    └── flink/
        └── ...
```

---

## 3. OpenTelemetry —— 三大支柱统一标准

### 3.1 三大支柱(Metrics/Logs/Traces)

```
┌──────────────────────────────────────────────────────────────────┐
│                       可观测性三大支柱                              │
│                                                                   │
│  Metrics(指标)                                                    │
│   ├── Counter: 累计计数(requests_total)                          │
│   ├── Gauge: 瞬时值(queue_size)                                 │
│   ├── Histogram: 分布(request_duration_seconds_bucket)          │
│   └── Summary: 摘要                                             │
│                                                                   │
│  Logs(日志)                                                       │
│   ├── 结构化日志(JSON)                                          │
│   ├── 包含 trace_id, span_id 关联到 trace                        │
│   └── 通常异步批量发送                                           │
│                                                                   │
│  Traces(链路)                                                     │
│   ├── Span: 一个工作单元(RPC、查询)                              │
│   ├── Trace: Span 的 DAG(一次完整请求)                           │
│   ├── Context Propagation: traceparent(W3C 标准)                 │
│   └── 用于性能分析与瓶颈定位                                     │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### 3.2 OpenTelemetry 架构

```
┌─────────────────────────── OpenTelemetry 架构 ──────────────────────┐
│                                                                       │
│   Application                                                         │
│   ├── OTel SDK(Java/Python/Go/...)                                   │
│   │   ├── Auto Instrumentation(自动埋点)                             │
│   │   ├── Manual Instrumentation(手动埋点)                           │
│   │   └── Context Propagation                                        │
│   │                                                                   │
│   └── Collector Agent(可选,Sidecar/DaemonSet)                       │
│       └── 接收 OTel 数据,初步处理(过滤、采样、聚合)                   │
│                                                                       │
│   OpenTelemetry Collector(独立进程)                                  │
│   ├── Receivers(接收):OTLP / Jaeger / Zipkin / Prometheus          │
│   ├── Processors(处理):batch / filter / tail_sampling / attributes  │
│   ├── Exporters(导出):Prometheus / Tempo / Loki / Jaeger           │
│   └── Extensions:zpages / health_check / k8s_tagger                 │
│                                                                       │
│   Backend Storage                                                     │
│   ├── Prometheus / VictoriaMetrics(Metrics)                          │
│   ├── Loki / Elasticsearch(Logs)                                     │
│   └── Tempo / Jaeger / Zipkin(Traces)                               │
│                                                                       │
│   Visualization                                                       │
│   └── Grafana(统一面板)                                              │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

### 3.3 大数据场景的应用

**Spark on K8s 应用 OTel**:
```java
// spark driver:使用 OpenTelemetry Java Agent
// -javaagent:/opt/otel/otel-javaagent.jar
// -Dotel.service.name=spark-driver
// -Dotel.exporter.otlp.endpoint=http://otel-collector:4317

// 业务代码手动埋点
import io.opentelemetry.api.trace.Tracer;
import io.opentelemetry.api.trace.Span;

Tracer tracer = GlobalOpenTelemetry.getTracer("spark-job");
Span span = tracer.spanBuilder("process-batch").startSpan();
try (Scope scope = span.makeCurrent()) {
    // 业务逻辑
} finally {
    span.end();
}
```

**Flink on K8s 应用 OTel**:
```java
// Flink 内置 metrics reporter 可以直接对接 Prometheus
// 也可加 OTel Java Agent 抓 trace

// Flink HTTP Server 也暴露 /metrics,Prometheus 直接抓取
```

### 3.4 OTel Collector 配置

```yaml
# otel-collector-config.yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318
  
  prometheus:
    config:
      scrape_configs:
        - job_name: 'kafka'
          static_configs:
            - targets: ['kafka-0:9308', 'kafka-1:9308']
        - job_name: 'spark'
          static_configs:
            - targets: ['spark-driver:4040']

processors:
  batch:
    timeout: 10s
    send_batch_size: 1024
  memory_limiter:
    check_interval: 1s
    limit_mib: 512

exporters:
  prometheus:
    endpoint: 0.0.0.0:8889
  loki:
    endpoint: http://loki:3100/loki/api/v1/push
  tempo:
    endpoint: tempo:4317
    tls:
      insecure: true

service:
  pipelines:
    metrics:
      receivers: [otlp, prometheus]
      processors: [batch, memory_limiter]
      exporters: [prometheus]
    traces:
      receivers: [otlp]
      processors: [batch]
      exporters: [tempo]
    logs:
      receivers: [otlp]
      processors: [batch]
      exporters: [loki]
```

---

## 4. Prometheus + Grafana 指标体系

### 4.1 Prometheus 架构

```
┌──────────────────────────────── Prometheus 架构 ────────────────────────┐
│                                                                          │
│   Pull 模型:Prometheus 主动拉取 Targets 的 /metrics                     │
│                                                                          │
│   Prometheus Server                                                     │
│   ├── TSDB(本地存储,2 小时为一段 Block)                                │
│   ├── PromQL(查询语言)                                                  │
│   ├── AlertManager(告警,独立进程)                                       │
│   └── 联邦 / Remote Write(VictoriaMetrics / Thanos)                    │
│                                                                          │
│   Exporters(指标暴露器)                                                  │
│   ├── node_exporter:OS 指标                                             │
│   ├── kafka_exporter:Kafka 指标                                         │
│   ├── jmx_exporter:JVM 指标                                             │
│   ├── kube-state-metrics:K8s 指标                                       │
│   └── 自定义 Exporter:业务指标                                          │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Kafka 指标采集

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'kafka'
    static_configs:
      - targets:
        - kafka-0:9308
        - kafka-1:9308
        - kafka-2:9308
  - job_name: 'kafka-jmx'
    static_configs:
      - targets:
        - kafka-0:9999   # jmx_exporter 暴露端口
```

**关键 Kafka 指标**:
- `kafka_server_broker_topic_metrics_messages_in_per_sec`:每秒入消息数。
- `kafka_server_replica_manager_under_replicated_partitions`:Under Replicated Partition 数(应 = 0)。
- `kafka_consumer_fetch_manager_records_lag_max`:Consumer Lag。
- `kafka_controller_active_count`:活跃 Controller 数(应 = 1)。
- `kafka_network_socket_server_network_processor_idle_percent`:网络线程空闲率。

### 4.3 Flink 指标采集

Flink 内置 Prometheus Reporter:
```yaml
# flink-conf.yaml
metrics.reporter.prom.factory.class: org.apache.flink.metrics.prometheus.PrometheusReporterFactory
metrics.reporter.prom.port: 9249-```

```yaml
# prometheus.yml
- job_name: 'flink'
  static_configs:
    - targets:
      - flink-jobmanager:9249
      - flink-taskmanager-1:9249
      - flink-taskmanager-2:9249
```

**关键 Flink 指标**:
- `flink_taskmanager_Status_JVM_CPU_Load`:JVM CPU Load。
- `flink_job_task_operator_eventTimeLag`:Event Time 延迟(关键流式指标)。
- `flink_job_task_numRecordsOutPerSecond`:输出速率。
- `flink_job_task_checkpointCount`:`flink_job_task_lastCheckpointDuration`.

### 4.4 Spark 指标采集

Spark 3.x 支持 PrometheusServlet:
```properties
spark.metrics.conf=/opt/spark/conf/metrics.properties
spark.ui.prometheus.enabled=true
```

`metrics.properties`:
```
*.sink.prometheusServlet.class=org.apache.spark.metrics.sink.PrometheusServlet
*.sink.prometheusServlet.path=/metrics
```

### 4.5 Grafana 看板

```
Grafana 看板结构:
┌────────────────────────────────────────────────────┐
│ Dashboard: 大数据平台监控                            │
│                                                     │
│ Row 1: 集群总览                                      │
│  ├── CPU 使用率(集群 / 单节点)                      │
│  ├── 内存使用率                                      │
│  └── 磁盘 IO 使用率                                  │
│                                                     │
│ Row 2: Kafka 监控                                    │
│  ├── 写入/读取速率(msg/s, MB/s)                      │
│  ├── Consumer Lag(各 Group)                         │
│  ├── Under Replicated Partitions                    │
│  └── Controller 健康度                              │
│                                                     │
│ Row 3: Flink 监控                                    │
│  ├── Event Time Lag                                 │
│  ├── Checkpoint 时长                                │
│  ├── Task Backpressure                              │
│  └── TaskManager CPU / Memory                       │
│                                                     │
│ Row 4: Spark 监控                                    │
│  ├── Job 运行时长                                    │
│  ├── Stage 耗时                                      │
│  ├── GC 时间                                         │
│  └── Shuffle 读/写数据量                             │
│                                                     │
│ Row 5: 调度系统                                       │
│  ├── Airflow DagRun 状态                            │
│  ├── DS Workflow 状态                              │
│  └── Task 失败率                                    │
│                                                     │
└────────────────────────────────────────────────────┘
```

### 4.6 告警规则示例

```yaml
# alertmanager-rules.yaml
groups:
- name: kafka
  rules:
  - alert: KafkaUnderReplicatedPartitions
    expr: kafka_server_replica_manager_under_replicated_partitions > 0
    for: 5m
    labels:
      severity: warning
    annotations:
      summary: "Kafka 有 {{ $value }} 个 under-replicated partition"
      description: "Broker {{ $labels.instance }} 副本同步异常"
  
  - alert: KafkaConsumerLag
    expr: kafka_consumer_fetch_manager_records_lag_max > 100000
    for: 10m
    labels:
      severity: critical
    annotations:
      summary: "Consumer Group {{ $labels.consumergroup }} lag > 10万"

- name: flink
  rules:
  - alert: FlinkEventTimeLag
    expr: flink_job_task_operator_eventTimeLag > 60000
    for: 5m
    labels:
      severity: warning
    annotations:
      summary: "Flink Event Time Lag 超过 1 分钟"
```

---

## 5. FluentBit + Loki 日志体系

### 5.1 日志架构

```
┌─────────────────────────── 日志体系架构 ────────────────────────────┐
│                                                                       │
│   Workload Pod                                                        │
│   ├── stdout / stderr(应用日志)                                      │
│   ├── 业务日志文件(/var/log/app/*.log)                                │
│   └── Container Runtime(Docker/containerd)                          │
│         │ /var/log/containers/<pod>.log                              │
│         ▼                                                            │
│   Node Agent:Fluent Bit                                              │
│   ├── 读取容器日志(/var/log/containers/)                              │
│   ├── 解析(Multiline Parser + JSON Parser)                            │
│   ├── 添加元数据(Pod / Container / Labels)                            │
│   ├── 过滤(按 namespace / app)                                       │
│   └── 推送到 Loki / Kafka / Elasticsearch                          │
│                                                                       │
│   Backend Storage                                                     │
│   ├── Loki(标签索引 + 对象存储)                                      │
│   ├── Elasticsearch(全文检索)                                         │
│   └── Kafka(流式 + 离线归档)                                         │
│                                                                       │
│   Visualization                                                       │
│   ├── Grafana(Loki 数据源)                                           │
│   └── Kibana(ES 数据源)                                              │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

### 5.2 为什么选 Fluent Bit 而非 Fluentd?

| 维度 | Fluent Bit | Fluentd |
| --- | --- | --- |
| **内存占用** | < 5 MB | > 40 MB |
| **性能** | 高(C 实现) | 中(Ruby) |
| **插件** | 较少(60+) | 极多(1000+) |
| **K8s 部署** | DaemonSet(每节点一份) | DaemonSet 或 Deployment |
| **生产推荐** | ✅ K8s 首选 | 通用、复杂场景 |

### 5.3 Fluent Bit 配置

```yaml
# fluent-bit-config.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: fluent-bit-config
  namespace: logging
data:
  fluent-bit.conf: |
    [SERVICE]
        Flush        5
        Log_Level    info
        Daemon       off
        Parsers_File parsers.conf
    
    [INPUT]
        Name              tail
        Path              /var/log/containers/*.log
        Parser            docker
        Tag               kube.*
        Refresh_Interval  5
        Mem_Buf_Limit     50MB
        Skip_Long_Lines   On
    
    [FILTER]
        Name                kubernetes
        Match               kube.*
        Kube_URL            https://kubernetes.default.svc:443
        Kube_CA_File        /var/run/secrets/kubernetes.io/serviceaccount/ca.crt
        Kube_Token_File     /var/run/secrets/kubernetes.io/serviceaccount/token
        Kube_Tag_Prefix     kube.var.log.containers.
        Merge_Log           On
    
    [FILTER]
        Name                grep
        Match               kube.*
        Regex               log kubernetes.labels.app ^(spark|flink|kafka)$
    
    [OUTPUT]
        Name                loki
        Match               kube.*
        Host                loki.logging.svc
        Port                3100
        Labels              job=fluent-bit,namespace=$kubernetes['namespace_name'],pod=$kubernetes['pod_name']
        Auto_Kubernetes_Labels on

  parsers.conf: |
    [PARSER]
        Name        docker
        Format      json
        Time_Key    time
        Time_Format %Y-%m-%dT%H:%M:%S.%LZ
        Time_Keep   On
```

### 5.4 Loki 架构

```
┌────────────────────────────────────── Loki 架构 ─────────────────────┐
│                                                                          │
│   Distributor(前端接收)                                                │
│       └── 验证、复制、转发                                             │
│                                                                          │
│   Ingester(写入)                                                        │
│       └── 写入内存 → 压缩 → 周期 flush 到存储                        │
│                                                                          │
│   Querier(查询)                                                         │
│       └── LogQL 查询,索引 + 数据查询                                  │
│                                                                          │
│   Storage                                                               │
│   ├── Index:Cassandra / BoltDB / TSDB(本地)                           │
│   └── Chunks:S3 / GCS / 本地盘                                        │
│                                                                          │
│   Compactor(后台)                                                      │
│       └── 压缩 + 过期清理                                              │
└──────────────────────────────────────────────────────────────────────────┘
```

### 5.5 LogQL 查询示例

```logql
# 查询特定 Pod 的 ERROR 日志
{namespace="spark-jobs", pod=~"spark-.*"} |= "ERROR"

# 统计每分钟错误数
sum(
  count_over_time(
    {namespace="spark-jobs"} |= "ERROR" [1m]
  )
)

# JSON 字段过滤
{namespace="spark-jobs"} 
  | json 
  | level="ERROR" 
  | line=~".*OutOfMemory.*"
```

### 5.6 关键源码类

| 组件 | 项目 | 核心类 |
| --- | --- | --- |
| **OpenLineage** | openlineage-spark | `OpenLineageSparkListener.scala` |
| Marquez | marquez | `LineageResource.java` |
| **OpenTelemetry SDK** | opentelemetry-java | `OpenTelemetrySdk.java` |
| OTel Collector | opentelemetry-collector | `otelcol/cmd/otelcol/main.go` |
| **Prometheus** | prometheus | `prometheus.go` |
| AlertManager | prometheus | `notifier/notifier.go` |
| **Fluent Bit** | fluent-bit | `fluent-bit.c` |
| Loki | loki | `pkg/loki/modules.go` |
| Grafana | grafana | `pkg/cmd/grafana-server/main.go` |

---

## 6. 端到端实战:大数据平台可观测性

### 6.1 完整 Stack 部署

```yaml
# docker-compose.yaml
version: '3.8'
services:
  # ========== Metrics ==========
  prometheus:
    image: prom/prometheus:v2.50.0
    volumes:
      - ./prometheus/prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus-data:/prometheus
    ports:
      - "9090:9090"
  
  grafana:
    image: grafana/grafana:10.3.0
    volumes:
      - grafana-data:/var/lib/grafana
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
  
  # ========== Logs ==========
  loki:
    image: grafana/loki:2.9.2
    volumes:
      - ./loki/loki-config.yaml:/etc/loki/local-config.yaml
    ports:
      - "3100:3100"
  
  fluent-bit:
    image: fluent/fluent-bit:2.2
    volumes:
      - ./fluent-bit/fluent-bit.conf:/fluent-bit/etc/fluent-bit.conf
      - /var/lib/docker/containers:/var/lib/docker/containers:ro
    depends_on:
      - loki
  
  # ========== Tracing ==========
  tempo:
    image: grafana/tempo:2.3.0
    volumes:
      - ./tempo/tempo-config.yaml:/etc/tempo.yaml
    ports:
      - "3200:3200"  # tempo
      - "4317:4317"  # otlp grpc
  
  otel-collector:
    image: otel/opentelemetry-collector:0.91.0
    volumes:
      - ./otel/otel-collector-config.yaml:/etc/otel-collector-config.yaml
    ports:
      - "4317:4317"  # otlp grpc
      - "4318:4318"  # otlp http
  
  # ========== Exporters ==========
  kafka-exporter:
    image: danielqsj/kafka-exporter:latest
    command:
      - --kafka.server=kafka:9092
    ports:
      - "9308:9308"
  
  node-exporter:
    image: prom/node-exporter:v1.7.0
    ports:
      - "9100:9100"
  
  # ========== Lineage ==========
  marquez:
    image: marquezca/marquez:latest
    environment:
      - POSTGRES_HOST=postgres
      - POSTGRES_DB=marquez
    ports:
      - "5000:5000"
    depends_on:
      - postgres
  
  postgres:
    image: postgres:15
    environment:
      - POSTGRES_DB=marquez
      - POSTGRES_USER=marquez
      - POSTGRES_PASSWORD=marquez
    volumes:
      - marquez-data:/var/lib/postgresql/data

volumes:
  prometheus-data:
  grafana-data:
  marquez-data:
```

### 6.2 Spark + OpenLineage 集成

```python
# Dockerfile
FROM apache/spark:3.5.1

RUN pip install openlineage-spark==1.20.0

ENV SPARK_EXTRA_CLASSPATH=/opt/spark/jars/*

COPY entrypoint.sh /opt/spark/entrypoint.sh
```

```python
# spark-submit
spark-submit \
  --master k8s://https://k8s-api:443 \
  --deploy-mode cluster \
  --conf spark.extraListeners=io.openlineage.spark.agent.OpenLineageSparkListener \
  --conf spark.openlineage.transport.type=http \
  --conf spark.openlineage.transport.url=http://marquez:5000/api/v1/lineage \
  --conf spark.openlineage.namespace=myproject \
  --conf spark.openlineage.parent.job_name=etl_user_orders \
  --conf spark.openlineage.job.ownership.codeowners_file=/opt/spark/CODEOWNERS \
  local:///opt/spark/jobs/etl.py
```

---

## 7. 关键源码类索引

| 组件 | 项目 | 核心类 |
| --- | --- | --- |
| **OpenLineage Spark** | openlineage-spark | `OpenLineageSparkListener.scala` |
| OpenLineage Facet | openlineage | `Dataset.java` |
| Marquez API | marquez | `LineageResource.java` |
| **OpenTelemetry Java** | opentelemetry-java | `OpenTelemetrySdk.java` |
| OTel Collector | opentelemetry-collector | `collector.go` |
| **Prometheus** | prometheus | `prometheus.go` |
| AlertManager | prometheus | `notifier.go` |
| **Fluent Bit** | fluent-bit | `fluent-bit.c` |
| Loki | loki | `pkg/loki/modules.go` |
| Grafana | grafana | `pkg/cmd/grafana-server/main.go` |

---

## 8. 专家面试题

> **Q1**:**数据血缘(Data Lineage)和数据可观测性(Observability)有什么区别?**
>
> **参考答案**:
> - **血缘**:回答"**数据从哪来到哪去**",本质是**静态关系图**(表 → 表 → 表),回答"如果改了下游,影响哪些"。
> - **可观测性**:回答"**现在发生了什么**",本质是**时序数据**(指标、日志、链路),回答"现在 Kafka Lag 是多少"。
> - **血缘** = 数据治理(变更管理、影响分析、合规审计)。
> - **可观测性** = 系统运维(监控、告警、故障排查)。
> - **生产建议**:血缘决定"主动管理数据",可观测性决定"被动响应故障",两者**必须并行建设**。

> **Q2**:**OpenLineage 与 Apache Atlas 有什么区别?**
>
> **参考答案**:
> - **Atlas**(Hortonworks / Apache):Hive / HBase / Sqoop 强,基于 Java,Web UI 完整,**重量级**(部署复杂)。
> - **OpenLineage**:现代,开放标准,生态集成广,**轻量级**(Marquez 即可)。
> - **Atlas 优势**:Hadoop 集成深、分类标签(Tag)、安全策略。
> - **OpenLineage 优势**:云原生(Spark / Airflow / Flink / Dagster / Snowflake)、开放标准。
> - **生产选型**:**新项目用 OpenLineage**,老 Hadoop 平台可保留 Atlas。

> **Q3**:**Fluent Bit 和 Fluentd 怎么选?**
>
> **参考答案**:
> - **K8s 节点日志采集 → Fluent Bit**(内存小、性能高、DaemonSet 部署)。
> - **复杂解析 / 多源汇聚 → Fluentd**(插件多、Ruby DSL)。
> - **生产组合**:Fluent Bit(采集)→ Kafka(缓冲)→ Fluentd(汇聚 / 解析)→ Loki / ES。
> - **关键指标**:Fluent Bit 单实例 5MB 内存,Fluentd 40MB+。
> - **陷阱**:Fluent Bit 插件少,**复杂正则表达式解析场景**需要 Fluentd。

> **Q4**:**Loki 和 Elasticsearch 在日志存储上怎么选?**
>
> **参考答案**:
> - **Loki**:基于标签的索引,**成本低**(S3 存数据),**全文检索能力弱**。
> - **Elasticsearch**:全文索引,能力强,成本高(每节点 16GB+ 内存)。
> - **选 Loki 场景**:应用日志为主,故障排查为主,搜索需求弱。
> - **选 ES 场景**:强搜索(复杂查询、聚合)、审计日志、合规。
> - **生产推荐**:**Loki + Grafana**(轻量、云原生)优先,**ES + Kibana** 用于搜索密集场景。

> **Q5**:**如何设计一个"既能监控又能告警"的大数据可观测性体系?**
>
> **参考答案**:
> 1. **指标层**:Prometheus 抓 Kafka / Flink / Spark / K8s Exporter,Grafana 出看板,AlertManager 告警。
> 2. **日志层**:Fluent Bit 采集 → Loki → Grafana 检索,异常日志触发 Sentry。
> 3. **链路层**:OTel SDK 埋点 → OTel Collector → Tempo,Grafana 关联 trace。
> 4. **血缘层**:OpenLineage Spark/Flink/Airflow 集成 → Marquez,变更前查询影响。
> 5. **告警分层**:
>    - **P0**:核心指标(CPU / Disk / Kafka Under Replicated)= 立即响应
>    - **P1**:业务指标(Lag / Throughput)= 15 分钟内
>    - **P2**:血缘预警(下游变更)= 24 小时内
> 6. **可观测性成熟度**:Levels 1~5(数据收集 → 关联 → 智能告警 → 自愈 → AIOps)。

---

## 9. 生产实战清单

- [ ] **Step 1:Prometheus + Grafana 部署** — `docker-compose` 起服务,接入 Kafka Exporter。
- [ ] **Step 2:Fluent Bit + Loki 部署** — DaemonSet 部署 Fluent Bit,验证日志采集。
- [ ] **Step 3:OTel Collector** — 部署 OTel Collector,接收 OTel 数据并导出。
- [ ] **Step 4:Spark 接入 OpenLineage** — `spark.extraListeners` 配 OpenLineageListener,跑 ETL 验证 Marquez 收到 Event。
- [ ] **Step 5:Airflow 接入 OpenLineage** — Airflow DAG 提交,验证 lineage 事件。
- [ ] **Step 6:Grafana Dashboard** — 导入 Confluent Kafka Dashboard、Flink Dashboard,出图。
- [ ] **Step 7:告警规则** — 配 Kafka Under Replicated、Flink Lag 等告警,触发验证。
- [ ] **Step 8:LogQL 查询** — 在 Grafana 写 LogQL,验证日志检索。
- [ ] **Step 9:Trace 关联** — OTel 接入后,验证 Trace ID 在 Loki 日志中可见。
- [ ] **Step 10:端到端验证** — 制造一次故障(Kafka Broker 宕机),验证告警 → 日志 → 血缘查询 → 恢复全链路。

**完成标志**:能在 30 分钟内通过 Grafana / Marquez 完成一次"故障发现 → 定位 → 恢复"全链路,所有数据来自监控体系,而不是肉眼盯。

---

## 10. 一句话总结

> **可观测性解决"现在",血缘解决"为什么"。** 两者结合 = "看得见 + 改得动",这是大数据平台从"能跑"升级到"可治理"的必经之路。OpenLineage + OpenTelemetry + Prometheus + Loki 是当前社区公认的事实标准。

---

## 附录:本教程阶段总结

完成 `docs/04-resource-messaging/` 全部 9 章后,你应该掌握:

```
阶段 3:调度与消息(4 周)
├── ✅ 消息总线选型(Kafka / Pulsar / RocketMQ / CDC)
├── ✅ Kafka 架构、调优、运维
├── ✅ Pulsar 分层架构
├── ✅ Kubernetes 基础与 Operator
├── ✅ Spark / Flink on K8s
├── ✅ Airflow / DolphinScheduler 调度
└── ✅ OpenLineage / OpenTelemetry / Prometheus / Loki 可观测性
```

**推荐下一阶段**:**docs/05-architecture**(架构与治理)—— Lambda / Kappa / Iceberg 湖仓一体、元数据治理、数据质量、DataOps。