# 07 · 学习资源与书单

> **本章目标**:精选权威书单 + 高质量博客 + GitHub 项目 + 社区 + 课程,直接照单学。
> **原则**:**源码级 + 生产级 + 长期价值**,拒绝"7 天速成"。

---

## 0. 全景图

```
┌──────────────────────────────────────────────────────────────┐
│                   50K 大数据工程师学习地图                      │
└──────┬──────────────┬──────────────┬──────────────┬──────────┘
       │              │              │              │
┌──────▼──────┐ ┌─────▼─────┐ ┌──────▼──────┐ ┌─────▼─────┐
│  书单         │ │ 博客       │ │ GitHub 项目  │ │ 课程      │
│  经典 + 源码  │ │ 大厂 + 社区 │ │ star + fork │ │ 慕课 / 公开 │
└──────────────┘ └────────────┘ └─────────────┘ └───────────┘
       │              │              │              │
┌──────▼──────────────▼──────────────▼──────────────▼──────────┐
│  社区 / 大会                                                    │
│  Apache 邮件列表 / Slack / VLDB / SIGMOD / Strata / Flink Forward│
└───────────────────────────────────────────────────────────────┘
```

---

## 1. 书单(★ 权威 / 必读 / 长期价值)

### 1.1 第一梯队(必读 + 反复读)

#### (1) 《数据密集型应用系统设计》(Designing Data-Intensive Applications,DDIA)
- **作者**:Martin Kleppmann(剑桥大学分布式系统专家)
- **中文**:《数据密集型应用系统设计》(O'Reilly 引进 / 后浪出版)
- **英文原版**:https://dataintensive.net/
- **豆瓣评分**:9.7
- **核心价值**:**分布式系统圣经**。覆盖事务、复制、分片、一致性、共识、消息系统、批处理、流处理。每一章都是生产经验的提炼。
- **推荐理由**:**所有大数据工程师面试的"底层认知"**,无论 Spark / Flink / Kafka / Iceberg,原理都能在本书找到。

#### (2) 《Spark 权威指南》(Learning Spark / Spark The Definitive Guide)
- **作者**:Damian Cariou 等(Spark Committer + Databricks)
- **中文**:《Spark 权威指南》(O'Reilly 中文版)
- **英文原版**:https://github.com/databricks/learning-spark
- **豆瓣评分**:9.0
- **核心价值**:Databricks 官方出品的 Spark 教材。从 RDD 到 DataFrame / Structured Streaming,代码 + 原理 + 最佳实践。
- **推荐理由**:入门 + 进阶的权威书籍,代码可直接跑。

#### (3) 《Hadoop 权威指南》(Hadoop: The Definitive Guide)
- **作者**:Tom White(原 Cloudera 架构师)
- **中文**:《Hadoop 权威指南》(清华大学出版社)
- **英文**:O'Reilly
- **豆瓣评分**:8.5
- **核心价值**:HDFS / MapReduce / YARN 的官方参考书。第 4 版后增加 Spark / Flink / Iceberg 章节。
- **推荐理由**:理解"大数据是怎么来的"必读。

#### (4) 《Kafka 源码解析》
- **作者**:郑奇(快手大数据专家)
- **中文**:电子工业出版社
- **豆瓣评分**:8.0
- **核心价值**:从源码层解析 Kafka 的 Broker / Producer / Consumer / Controller / Group Coordinator。每章对应 Kafka 源码类。
- **推荐理由**:Kafka 面试 + 调优必备。

#### (5) 《Flink 源码解析》 / 《Flink 内核源码解析》
- **作者**:罗江伟 / 杨涵冰(阿里 / 字节 / 美团 Flink 专家)
- **中文**:电子工业出版社 / 机械工业出版社
- **豆瓣评分**:7.5–8.5
- **核心价值**:Flink 架构 / Runtime / State / Checkpoint 源码级解析。
- **推荐理由**:**Flink 工程师唯一中文源码书**。

### 1.2 第二梯队(扩展阅读)

#### (6) 《数据仓库工具箱》(The Data Warehouse Toolkit)
- **作者**:Ralph Kimball(维度建模之父)
- **中文**:《数据仓库工具箱》(清华大学出版社)
- **豆瓣评分**:8.8
- **核心价值**:维度建模经典,Kimball vs Inmon 大辩论。

#### (7) 《Iceberg 权威指南》 / 《Apache Iceberg The Definitive Guide》
- **作者**:李劲松(阿里 Iceberg PMC) + 社区
- **英文**:O'Reilly 2024
- **推荐理由**:Iceberg 中文权威。

#### (8) 《深入理解 Java 虚拟机》(JVM 圣经)
- **作者**:周志明
- **豆瓣评分**:9.5
- **推荐理由**:JVM 调优 + GC 算法 + 内存模型,大数据面试必备。

#### (9) 《Kubernetes 权威指南》(Kubernetes: Up and Running)
- **作者**:Brendan Burns(Microsoft / K8s 创始团队)
- **中文**:《Kubernetes 权威指南》(电子工业出版社)
- **豆瓣评分**:8.5
- **推荐理由**:K8s 入门 + 进阶的权威书。

#### (10) 《Effective Java》
- **作者**:Joshua Bloch(Java 集合框架作者)
- **豆瓣评分**:9.5
- **推荐理由**:Java 编码规范 + 最佳实践。

#### (11) 《Spark 快速大数据分析》(Fast Data Processing with Spark)
- **作者**:Holden Karau + Rachel Warren(原 Spark Committer)
- **豆瓣评分**:7.5
- **推荐理由**:Spark Streaming + PySpark 实战。

#### (12) 《Streaming Systems》
- **作者**:Tyler Akidau / Slava Chernyak(Google Dataflow 创始团队)
- **中文**:《流式系统》(电子工业出版社)
- **推荐理由**:流处理"四大支柱"(准确性 / 延迟 / 成本 / 灵活性)的源头。

#### (13) 《Kafka 权威指南》(Kafka: The Definitive Guide)
- **作者**:Neha Narkhede(GitHub Co-founder,原 Confluent CTO)
- **中文**:《Kafka 权威指南》(O'Reilly 中文版)
- **豆瓣评分**:8.5

#### (14) 《Database Internals》
- **作者**:Alex Petrov
- **豆瓣评分**:8.8
- **推荐理由**:存储引擎 + 分布式数据库原理。

#### (15) 《Linux 高性能服务器编程》
- **作者**:游双
- **豆瓣评分**:8.0
- **推荐理由**:网络 / IO / 进程 / 线程模型。

### 1.3 第三梯队(垂直深入)

| 书 | 适用 |
| --- | --- |
| 《ClickHouse 原理解析与应用》 | ClickHouse 工程师 |
| 《Doris 实时数仓实战》 | Doris / StarRocks 工程师 |
| 《Prometheus 监控实战》 | 可观测工程师 |
| 《深入理解 ElasticSearch》 | ES 工程师 |
| 《动手学深度学习》(李沐) | LLM / AI 入门 |
| 《深度学习》(花书) | AI 理论基础 |
| 《LangChain 实战》 | RAG / Agent 开发 |
| 《向量数据库原理与实践》 | 向量库工程师 |

### 1.4 英文书单(进阶必备)

| 书 | 作者 | 价值 |
| --- | --- | --- |
| Designing Data-Intensive Applications | Martin Kleppmann | ★★★★★ |
| Spark The Definitive Guide | Chambers / Zaharia | ★★★★★ |
| Kafka The Definitive Guide | Neha Narkhede | ★★★★★ |
| Streaming Systems | Tyler Akidau | ★★★★★ |
| Database Internals | Alex Petrov | ★★★★ |
| Hadoop The Definitive Guide | Tom White | ★★★★ |
| Kubernetes Up and Running | Brendan Burns | ★★★★ |
| Effective Java | Joshua Bloch | ★★★★ |
| Site Reliability Engineering | Google SRE 团队 | ★★★★ |
| The Data Warehouse Toolkit | Ralph Kimball | ★★★★ |
| Apache Iceberg: The Definitive Guide | O'Reilly | ★★★★ |
| Cloud Native Data Center Networking | Dinesh Dutt | ★★★ |
| LLM Engineer's Handbook | Paul Iusztin | ★★★★ |

---

## 2. 优质博客

### 2.1 阿里 / 字节 / 美团 / 腾讯 官方技术博客

| 博客 | 链接 | 价值 |
| --- | --- | --- |
| **阿里云 Dataworks 博客** | https://developer.aliyun.com/article/ | 阿里数据治理 / DataWorks 实战 |
| **阿里云 Apache Flink 中文社区** | https://flink-learning.org.cn/ | Flink 中文第一社区 |
| **字节跳动技术博客** | https://tech.bytedance.com/ | 字节大数据 / 搜索 / 推荐 |
| **美团技术团队** | https://tech.meituan.com/ | 美团大数据 / 外卖 / 配送 |
| **腾讯云原生** | https://cloud.tencent.com/developer/ | 腾讯 K8s / 大数据 |
| **滴滴技术** | https://www.didichuxing.com/tech/ | 滴滴大数据 / 出行 |
| **哔哩哔哩技术** | https://mp.weixin.qq.com/ | B 站流式架构 |
| **小米云技术** | https://xiaomi-cloud.github.io/ | 小米 OLAP |
| **京东技术** | https://blog.csdn.net/jd_tech | 京东 OLAP |

### 2.2 VLDB / SIGMOD 论文

**会议级别论文是底层原理最权威来源**:

| 会议 | 论文方向 | 推荐 |
| --- | --- | --- |
| **SIGMOD** | 数据库顶级 | https://dl.acm.org/conference/sigmod/proceedings |
| **VLDB** | 数据库顶级 | https://www.vldb.org/pvldb/ |
| **OSDI / SOSP** | 系统顶级 | OSDI 是大数据系统最佳场所 |
| **NSDI** | 网络系统 | |
| **ICDE** | 数据工程 | |
| **SIGIR** | 检索 / 向量 | |

**必读论文**:
- Google Spanner(Targeting 99% with Paxos)
- Google Bigtable / GFS / MapReduce(大数据奠基)
- Apache Spark(NSDI 2012)
- Apache Flink(数据流模型)
- Apache Kafka(Netty + Log)
- Snowflake(SIGMOD 2020):存算分离架构
- Delta Lake(VLDB 2020)
- Apache Iceberg / Hudi

### 2.3 InfoQ / QCon / 极客邦

- **InfoQ 中文**:https://www.infoq.cn/(中文最权威技术媒体)
- **QCon**:每年多场大会,大厂架构师分享
- **极客邦 / ArchSummit**:架构师峰会

### 2.4 社区博客(国外)

| 博客 | 作者 | 内容 |
| --- | --- | --- |
| **Martin Kleppmann**(DDIA 作者) | https://martin.kleppmann.com/ | 分布式系统 |
| **Apache Spark 官方博客** | https://spark.apache.org/blog/ | 新特性 |
| **Databricks Engineering Blog** | https://www.databricks.com/blog | Spark / Delta / MLflow |
| **Confluent Blog** | https://www.confluent.io/blog/ | Kafka / Flink |
| **AWS Big Data Blog** | https://aws.amazon.com/blogs/big-data/ | EMR / Glue / Athena |
| **StarRocks Blog** | https://www.starrocks.io/blog/ | OLAP |
| **Doris 官方博客** | https://doris.apache.org/blog/ | Doris |
| **Apache Iceberg Blog** | https://iceberg.apache.org/blog/ | Iceberg |
| **ClickHouse Blog** | https://clickhouse.com/blog/ | ClickHouse |
| **Netflix Tech Blog** | https://netflixtechblog.com/ | Netflix 大数据 |
| **Uber Engineering** | https://www.uber.com/blog/engineering/ | Uber 大数据 |
| **Airbnb Engineering** | https://medium.com/airbnb-engineering | Airbnb 数据 |
| **LinkedIn Engineering** | https://engineering.linkedin.com/blog | LinkedIn Kafka |

### 2.5 中文个人博客(必须 follow)

| 博主 | 平台 | 内容 |
| --- | --- | --- |
| **美团技术团队** | https://tech.meituan.com/ | 全技术栈 |
| **字节跳动技术** | https://tech.bytedance.com/ | 大数据 / AI |
| **vivo 互联网技术** | https://blog.csdn.net/vivo_tech | 大数据 / 推荐 |
| **菜鸟窝技术博客** | 公众号 | 大数据 |
| **数据民工来取经儿** | 公众号 | 大数据 |
| **大数据肌肉猿** | 公众号 | Spark / Flink |
| **五分钟学大数据** | 公众号 | 大数据入门 |
| **GitHub 中文社区** | https://github.com | 各类项目 |

---

## 3. GitHub 项目(★ 必须 star)

### 3.1 大数据核心项目

| 项目 | GitHub | Star | 必看理由 |
| --- | --- | --- | --- |
| **Apache Spark** | https://github.com/apache/spark | 39k+ | 必读源码 |
| **Apache Flink** | https://github.com/apache/flink | 24k+ | 必读源码 |
| **Apache Iceberg** | https://github.com/apache/iceberg | 7k+ | 湖格式 |
| **Apache Hudi** | https://github.com/apache/hudi | 5k+ | 湖格式 |
| **Apache Paimon** | https://github.com/apache/paimon | 2k+ | 湖格式 |
| **Apache Kafka** | https://github.com/apache/kafka | 30k+ | 消息系统 |
| **Apache Doris** | https://github.com/apache/doris | 13k+ | OLAP |
| **ClickHouse** | https://github.com/ClickHouse/ClickHouse | 36k+ | OLAP |
| **Apache Pulsar** | https://github.com/apache/pulsar | 14k+ | 消息系统 |
| **Trino** | https://github.com/trinodb/trino | 10k+ | MPP |
| **Apache Celeborn** | https://github.com/apache/celeborn | 1k+ | Shuffle 优化 |
| **Apache Kyuubi** | https://github.com/apache/kyuubi | 2k+ | Spark SQL Gateway |

### 3.2 工具 / 平台

| 项目 | GitHub | 用途 |
| --- | --- | --- |
| **Apache DolphinScheduler** | https://github.com/apache/dolphinscheduler | 10k+ | 调度系统 |
| **Apache Airflow** | https://github.com/apache/airflow | 36k+ | 调度系统 |
| **Apache Gravitino** | https://github.com/apache/gravitino | 1k+ | 元数据 |
| **DataHub** | https://github.com/datahub-project/datahub | 9k+ | 元数据血缘 |
| **Great Expectations** | https://github.com/great-expectations/great_expectations | 9k+ | 数据质量 |
| **dbt** | https://github.com/dbt-labs/dbt-core | 9k+ | 数据转换 |
| **Argo Workflows** | https://github.com/argoproj/argo-workflows | 14k+ | K8s 工作流 |
| **Apache Superset** | https://github.com/apache/superset | 60k+ | BI |
| **Metabase** | https://github.com/metabase/metabase | 38k+ | BI |
| **Apache Zeppelin** | https://github.com/apache/zeppelin | 6k+ | Notebook |
| **JuiceFS** | https://github.com/juicedata/juicefs | 11k+ | 分布式文件系统 |
| **Alluxio** | https://github.com/Alluxio/alluxio | 7k+ | 分布式缓存 |
| **Apache Pinot** | https://github.com/apache/pinot | 5k+ | OLAP |
| **Kyuubi** | https://github.com/apache/kyuubi | 2k+ | Spark Gateway |

### 3.3 AI / LLM 项目

| 项目 | GitHub | Star | 用途 |
| --- | --- | --- | --- |
| **vLLM** | https://github.com/vllm-project/vllm | 23k+ | LLM 推理 |
| **LangChain** | https://github.com/langchain-ai/langchain | 95k+ | LLM 框架 |
| **LlamaIndex** | https://github.com/run-llama/llama_index | 38k+ | RAG 框架 |
| **Milvus** | https://github.com/milvus-io/milvus | 31k+ | 向量库 |
| **Qdrant** | https://github.com/qdrant/qdrant | 20k+ | 向量库 |
| **Weaviate** | https://github.com/weaviate/weaviate | 13k+ | 向量库 |
| **Chroma** | https://github.com/chroma-core/chroma | 17k+ | 向量库 |
| **LanceDB** | https://github.com/lancedb/lancedb | 5k+ | 向量库 |
| **DSPy** | https://github.com/stanfordnlp/dspy | 22k+ | LLM 编译 |
| **Ollama** | https://github.com/ollama/ollama | 90k+ | 本地 LLM |
| **Langfuse** | https://github.com/langfuse/langfuse | 9k+ | LLM 可观测 |
| **Open WebUI** | https://github.com/open-webui/open-webui | 50k+ | LLM UI |
| **Hugging Face Transformers** | https://github.com/huggingface/transformers | 135k+ | LLM 框架 |
| **PyTorch** | https://github.com/pytorch/pytorch | 84k+ | 深度学习 |

### 3.4 必读的 awesome 系列

- **awesome-spark**:https://github.com/awesome-spark/awesome-spark
- **awesome-flink**:https://github.com/wuchong/awesome-flink(中文)
- **awesome-kafka**:https://github.com/infoslack/awesome-kafka
- **awesome-hadoop**:https://github.com/youngwookim/awesome-hadoop
- **awesome-iceberg**:https://github.com/duckdb/duckdb
- **awesome-data-engineering**:https://github.com/igorbarinov/awesome-data-engineering
- **awesome-mlops**:https://github.com/visenger/awesome-mlops
- **awesome-llm**:https://github.com/Hannibal046/Awesome-LLM
- **awesome-rag**:https://github.com/huawei-noah/awesome-rag

### 3.5 国内优秀开源项目

| 项目 | GitHub | 用途 |
| --- | --- | --- |
| **Apache Kyuubi** | https://github.com/apache/kyuubi | Spark Gateway(国产) |
| **Apache Gravitino** | https://github.com/apache/gravitino | 元数据(国产) |
| **seatunnel** | https://github.com/apache/seatunnel | 数据集成(国产) |
| **Linkis** | https://github.com/apache/linkis | 计算中间件(微众) |
| **StreamPark** | https://github.com/apache/streampark | Flink 平台 |
| **ChengYing** | https://github.com/DTStack/chengying | 大数据平台(袋鼠云) |
| **dolphinscheduler** | https://github.com/apache/dolphinscheduler | 调度(易观) |

---

## 4. 社区(★ 必须 follow)

### 4.1 Apache 邮件列表 / Slack

| 项目 | 链接 | 加入方式 |
| --- | --- | --- |
| **Spark 用户** | https://spark.apache.org/community.html | dev@spark.apache.org |
| **Flink 用户** | https://flink.apache.org/community.html | user@flink.apache.org |
| **Kafka 用户** | https://kafka.apache.org/contact | users@kafka.apache.org |
| **Iceberg 用户** | https://iceberg.apache.org/community/ | dev@iceberg.apache.org |
| **Doris 用户** | https://doris.apache.org/community/ | dev@doris.apache.org |
| **Hudi 用户** | https://hudi.apache.org/community/ | dev@hudi.apache.org |
| **Paimon 用户** | https://paimon.apache.org/community/ | dev@paimon.apache.org |

**Slack / Discord**:
- Apache Kafka Slack
- Apache Flink Slack
- Apache Spark Slack
- Apache Doris Slack

### 4.2 微信群 / QQ 群(中文)

- 各项目中文用户群(微信扫码加);
- **ApacheFlink 中文社区**(公众号);
- **ApacheDoris 中文社区**(公众号);
- **大数据肌肉猿**(公众号);
- **大数据技术架构**(公众号)。

### 4.3 大会 / Meetup

| 大会 | 频率 | 推荐 |
| --- | --- | --- |
| **Flink Forward** | 年度 | Flink 必去 |
| **KubeCon + CNCon** | 年度 | K8s + 云原生 |
| **Strata Data Conference** | 年度 | 数据生态 |
| **QCon** | 年度 | 架构实战 |
| **GIAC** | 年度 | 全球互联网架构 |
| **ArchSummit** | 年度 | 架构师峰会 |
| **DTC**(Data Tech Conference) | 年度 | 数据技术 |
| **VLDB / SIGMOD** | 学术 | 论文级 |

### 4.4 中文社区平台

| 平台 | 用途 |
| --- | --- |
| **InfoQ** | 技术文章 / 大会演讲 |
| **掘金** | 技术博客 / 经验分享 |
| **CSDN** | 中文技术博客 |
| **知乎** | 问答 / 经验 |
| **B 站** | 视频教程 / 大会回放 |
| **GitChat** | 技术 chat |
| **思否(SegmentFault)** | 技术问答 |
| **开源中国(OSCHINA)** | 开源项目 / 资讯 |

---

## 5. 课程

### 5.1 慕课网(imooc)

| 课程 | 作者 | 推荐指数 |
| --- | --- | --- |
| **大数据开发实战** | 黑马 / 尚硅谷 | ★★★★ |
| **Spark 入门到精通** | 多家 | ★★★★ |
| **Flink 核心技术与实战** | 诸葛老师 | ★★★★★ |
| **Kafka 核心技术与实战** | 诸葛老师 | ★★★★ |
| **ClickHouse 大数据实战** | 多家 | ★★★★ |
| **Doris / StarRocks 实战** | 多家 | ★★★★ |
| **数据仓库与建模** | 多家 | ★★★ |
| **数据治理实战** | 阿里 | ★★★★ |

### 5.2 Coursera / edX

| 课程 | 学校 | 推荐 |
| --- | --- | --- |
| **Big Data Specialization** | UC San Diego | ★★★★★ |
| **Cloud Computing** | Illinois | ★★★★ |
| **Machine Learning** | Stanford(Andrew Ng) | ★★★★★ |
| **Deep Learning Specialization** | deeplearning.ai | ★★★★★ |
| **Apache Spark** | IBM | ★★★★ |
| **Data Engineering** | DeepLearning.AI | ★★★★ |
| **Databricks Apache Spark** | UC Davis | ★★★★ |

### 5.3 国内公开课 / B 站

| 课程 | 来源 | 推荐 |
| --- | --- | --- |
| **Spark 源码解析** | B 站 / GitHub | ★★★★ |
| **Flink 源码解析** | 诸葛老师 / B 站 | ★★★★ |
| **Iceberg 实战** | B 站 / 阿里云 | ★★★★ |
| **Doris 实战** | B 站 / SelectDB | ★★★★ |
| **Kafka 实战** | B 站 | ★★★★ |
| **K8s 实战** | 慕课网 / B 站 | ★★★★ |
| **大厂架构演进** | 极客时间 | ★★★★ |

### 5.4 极客时间(付费)

| 课程 | 作者 | 推荐 |
| --- | --- | --- |
| **《从 0 开始学大数据》** | 李智慧 | ★★★★★ |
| **《Spark 性能调优实战》** | 秦江杰 | ★★★★ |
| **《Flink 核心技术与实战》** | 诸葛东杰 | ★★★★★ |
| **《Kafka 核心技术与实战》** | 胡夕 | ★★★★★ |
| **《ClickHouse 实战》** | 朱凯 | ★★★★ |
| **《数据中台实战课》** | 付静怡 | ★★★★ |
| **《大数据经典论文导读》** | 李智慧 | ★★★★★ |
| **《AI 大模型之美》** | 徐文浩 | ★★★★ |

### 5.5 大会回放 / YouTube

- **Flink Forward Asia / Europe**(YouTube / B 站免费)
- **KubeCon**(CNCF 官网免费)
- **Strata Data Conference**(O'Reilly 会员)
- **VLDB / SIGMOD**(学术,YouTube)
- **Databricks Data + AI Summit**(免费)
- **Confluent Current**(免费)

---

## 6. 推荐学习路线

### 6.1 基础阶段(1–3 个月)

| 资源 | 类型 | 时间 |
| --- | --- | --- |
| DDIA 中文 | 书 | 2 周 |
| Hadoop 权威指南 | 书 | 2 周 |
| Spark 权威指南 | 书 | 3 周 |
| 慕课 - 大数据开发实战 | 课程 | 4 周 |

### 6.2 进阶阶段(3–6 个月)

| 资源 | 类型 | 时间 |
| --- | --- | --- |
| Kafka 源码解析 | 书 | 2 周 |
| Flink 源码解析 | 书 | 2 周 |
| Iceberg 权威指南 | 书 | 2 周 |
| 极客时间 - Flink 核心 | 课程 | 4 周 |
| 极客时间 - Kafka 核心 | 课程 | 3 周 |

### 6.3 高级阶段(6–12 个月)

| 资源 | 类型 | 时间 |
| --- | --- | --- |
| DDIA 英文版 | 书 | 4 周 |
| 数据库经典论文 | 论文 | 8 周 |
| Vector DB 实战 | 课程 | 4 周 |
| AI 大模型之美 | 课程 | 4 周 |
| Apache 邮件列表 + GitHub 源码 | 实践 | 持续 |

### 6.4 求职阶段(1–3 个月)

| 资源 | 类型 | 时间 |
| --- | --- | --- |
| 06-interview-bank.md(本教程) | 题库 | 4 周 |
| 模拟面试 | 实践 | 持续 |
| 简历 STAR 改写 | 实践 | 2 周 |
| GitHub 项目贡献 | 实践 | 持续 |

---

## 7. 实战任务

1. **读完 DDIA 英文版**,写读书笔记。
2. **克隆 Spark / Flink 源码**,用 IDE 阅读核心类。
3. **给一个开源项目提 PR**(Apache Iceberg / Flink CDC)。
4. **订阅 InfoQ / 极客时间**,每周 1 篇技术 blog。
5. **加入 Apache 邮件列表**,观察 / 回答问题。
6. **录制 5 段技术分享视频**,发 B 站。
7. **在 GitHub 建个人技术 wiki**(基于 docsify / vitepress)。
8. **每季度读 1 篇 SIGMOD / VLDB 论文**。

---

## 8. 专家面试题

1. **DDIA 中你印象最深的章节?**
   *第 9 章 一致性 + 第 11 章 流处理 / 第 5 章 复制。*

2. **Spark / Flink 源码看过哪些类?**
   *Spark:DAGScheduler / TaskScheduler / ShuffleWriter;Flink:StreamTask / CheckpointCoordinator / AbstractStreamOperator。*

3. **Apache Iceberg / Hudi 看过哪些源码?**
   *Iceberg:SnapshotProducer / ManifestReader / ManifestWriter。*

4. **你 follow 的开源项目有哪些?贡献过吗?**
   *Apache Iceberg Contributor / Spark PR / Doris Issue。*

5. **你常看的技术博客是?**
   *美团 / 字节 / InfoQ / Databricks / Confluent。*

6. **你怎么选技术书?**
   *经典 + 源码级 + 生产实战 + 长期价值。*

7. **极客时间 / Coursera 上过哪些课?**
   *《Flink 核心》+《Kafka 核心》+《大数据经典论文导读》。*

8. **你怎么保持技术敏感度?**
   *每周 InfoQ + Apache 邮件列表 + 大会回放。*

9. **给新人推荐 3 本书?**
   *DDIA + Spark 权威指南 + 数据仓库工具箱。*

10. **怎么判断一篇论文值得读?**
    *看作者团队 + 项目落地 + 是否解决通用问题。*

---

## 9. 生产经验(给学习者的清单)

1. **技术书要读经典,不要读"速成"**。
2. **源码是面试分水岭**:`git clone` + IDE 阅读,胜过所有书籍。
3. **每季度写一篇 5000 字技术 blog**,深度 > 数量。
4. **GitHub 至少有 3 个 star > 100 的项目**。
5. **加入 Apache 邮件列表 + Slack**,观察团队怎么决策。
6. **英文阅读能力是分水岭**:DDIA 英文版 > 中文版。
7. **大会回放是免费的顶级课**:Flink Forward / KubeCon。
8. **博客不要追热点,要追底层**。
9. **每半年学一个新方向**:LLM / 向量 / GPU。
10. **坚持 > 聪明**:1 年每天 1 小时,胜过"7 天速成"。

---

## 结语:50K 的学习路径总结

```
月 1–3 :DDIA + 慕课基础 + 一门书(Spark 或 Flink)
月 4–6 :源码阅读 + 极客时间 + Apache 社区
月 7–9 :Iceberg + Doris + 湖仓一体实战
月 10–12:模拟面试 + 简历 STAR + 投递
```

**核心结论**:**50K = 源码深度 × 生产经验 × 软实力**。技术书是路径,源码是必经路,GitHub 是简历的延伸,社区是被发现的窗口,课程是加速器。**不要依赖单一资源**,组合最优。

---

**教程完整 8 章已完成。祝学习顺利!**