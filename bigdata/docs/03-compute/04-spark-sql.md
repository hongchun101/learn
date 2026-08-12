# 04. Spark SQL 与 Catalyst / Tungsten

> **本章定位**:Spark SQL 是日常数仓 ETL 的主力 API,理解 Catalyst 五阶段查询编译、Tungsten 内存优化、Whole-stage Codegen、Adaptive Query Execution(AQE)是面试官最常追问的"深水区"。读完本章,你能讲清楚一条 SQL 从 `select * from t` 到物理执行的完整旅程。

---

## 1. Spark SQL 总架构

```
                ┌───────────────────────────────────────────────┐
                │              SparkSession                     │
                │       (Spark 2.x 统一入口)                     │
                └───────────────────┬───────────────────────────┘
                                    │
                ┌───────────────────▼───────────────────────────┐
                │              SessionCatalog                   │
                │     (Hive MetaStore / CatalogV2)             │
                └───────────────────┬───────────────────────────┘
                                    │
   SQL ─────────► ┌─────────────────▼─────────────────────────┐
   DataFrame ──► │           SQL Parser                       │
   Dataset ──────► │      (ANTLR4, ANTLR-generated)            │
                  └─────────────────┬─────────────────────────┘
                                    │  Unresolved LogicalPlan
                  ┌─────────────────▼─────────────────────────┐
                  │             Analyzer                       │
                  │      (Resolve Catalog/Function)            │
                  └─────────────────┬─────────────────────────┘
                                    │  LogicalPlan
                  ┌─────────────────▼─────────────────────────┐
                  │        Catalyst Optimizer                  │
                  │  RBO(rule-based) + CBO(cost-based, Spark3)│
                  └─────────────────┬─────────────────────────┘
                                    │  Optimized LogicalPlan
                  ┌─────────────────▼─────────────────────────┐
                  │         SparkPlanner                       │
                  │      (LogicalPlan → PhysicalPlan)          │
                  └─────────────────┬─────────────────────────┘
                                    │  PhysicalPlan(SparkPlan)
                  ┌─────────────────▼─────────────────────────┐
                  │      Tungsten + Whole-stage Codegen        │
                  │      (Code Generation)                     │
                  └─────────────────┬─────────────────────────┘
                                    │  RDD 执行
                  ┌─────────────────▼─────────────────────────┐
                  │         Spark Core / DAGScheduler           │
                  └───────────────────────────────────────────┘
```

---

## 2. 五阶段编译流程详解

### 2.1 阶段 1:Parse(SQL → Unresolved LogicalPlan)

源码:`org.apache.spark.sql.catalyst.parser.AbstractSqlParser#parse`

Spark 用 ANTLR4 解析 SQL,生成 `AstBuilder`,最后产出 `LogicalPlan`(叶子节点是 `UnresolvedRelation`)。

```scala
val sqlText = "SELECT id, SUM(amt) FROM orders GROUP BY id"
val logicalPlan: LogicalPlan = session.sql(sqlText).logical  // → LogicalPlan
```

ANTLR4 语法文件:`sql/catalyst/src/main/antlr4/org/apache/spark/sql/catalyst/parser/SqlBase.g4`,定义词法 + 语法规则。

### 2.2 阶段 2:Analyze(Unresolved LogicalPlan → LogicalPlan)

源码:`org.apache.spark.sql.catalyst.analysis.Analyzer#execute`

Analyzer 跑 100+ 个 `Rule`,主要工作:

| 规则 | 作用 |
| --- | --- |
| `ResolveRelations` | 把 `UnresolvedRelation` 替换成 catalog 中的 `LogicalRelation` 或 `HiveTableRelation` |
| `ResolveReferences` | 解析 `*` / 字段引用为具体属性 `AttributeReference` |
| `ResolveFunctions` | 函数名转 `FunctionInfo`,标量函数 / 聚合函数 / 窗口函数 |
| `ResolveSubquery` | 子查询别名 + 相关性 |
| `Analyzer#CheckAnalysis` | 校验表存在、类型匹配、函数签名 |

```scala
// 典型 Rule 例子
case class ResolveRelations(catalog: SessionCatalog) extends Rule[LogicalPlan] {
  override def apply(plan: LogicalPlan): LogicalPlan = plan.transform {
    case UnresolvedRelation(tableName, _) =>
      catalog.lookupRelation(tableName) match {
        case relation: LogicalRelation => relation
        case other => other
      }
  }
}
```

### 2.3 阶段 3:Optimize(LogicalPlan → Optimized LogicalPlan)

源码:`org.apache.spark.sql.catalyst.optimizer.Optimizer#execute`

优化器是 Spark SQL 最复杂的部分,200+ 个 Rule,分四类:

#### 2.3.1 算子下推(Pushdown)

```
Filter Pushdown:
    SELECT * FROM orders WHERE id < 100
        → 把 filter 下推到 Scan:RDD.mapPartitions
        → 减少 Scan 的数据量

Column Pruning:
    SELECT id FROM orders
        → 只读 id 列,Parquet/ORC 列存加速

Predicate Pushdown:
    对 Parquet/ORC 文件,用 row group statistics 跳过整个 row group
```

源码:`PushDownPredicate`,`ColumnPruning` Rule。

#### 2.3.2 常量折叠(Constant Folding)

```scala
// 输入
Filter(Literal(1) === 1, child)

// 输出
child  // 直接删除整个 Filter,因为永远为 true
```

源码:`ConstantFolding` Rule。

#### 2.3.3 连接重排序(Join Reorder)

对多 join,基于 cost 排序:

```
T1 ⋈ T2 ⋈ T3
   ├── 1000 行 ⋈ 1亿 行 ⋈ 1万 行  (大表 broadcast 到小表?)
   ├── 1万行 ⋈ 1亿 行 ⋈ 1000 行
   └── 1亿 行 ⋈ 1000 行 ⋈ 1万 行
```

Spark 3.x 用 Dynamic Programming + Cost Model 选择最优 join 顺序,源码 `JoinReorderDP`。

#### 2.3.4 子查询去相关(Subquery Decorrelation)

```sql
-- 去相关前
SELECT * FROM T WHERE id IN (SELECT id FROM S WHERE T.amt > S.amt)
-- 去相关后
SELECT * FROM T LEFT SEMI JOIN (SELECT id FROM S) ON T.id = S.id AND T.amt > S.amt
```

源码:`DecorrelateInnerQuery`。

#### 2.3.5 优化器流程

源码位置:

```
org.apache.spark.sql.catalyst.optimizer.Optimizer
   ├─  fixedPoint = FixedPoint(maxIterations = 100)
   ├─  batches = Seq(
   │     OperatorOptimizations,
   │     FinishAnalysis,
   │     UserProvidedOptimizers,
   │     // ...
   │   )
   └─  override def execute(plan) = batches.foldLeft(plan) { (p, batch) => batch.execute(p) }
```

`OperatorOptimizations` 内含子批次(Operator Optimizer / Join Reorder / Aggregate / PushDown / ColumnPruning 等)。

### 2.4 阶段 4:SparkPlanner(LogicalPlan → PhysicalPlan)

源码:`org.apache.spark.sql.execution.SparkPlanner#plan`

```scala
override def plan(plan: LogicalPlan): Iterator[SparkPlan] = {
  // 先 apply strategies,产出多个候选物理计划
  strategies.iterator.flatMap(_(plan))
}
```

Strategies 是关键,核心策略:

| Strategy | 产出 | 适用 |
| --- | --- | --- |
| `DataSourceV1Strategy` | FileSourceScanExec | Parquet/ORC/JSON/CSV |
| `FileSourceScan` | ParquetScan / ORCScan | 列存 + pushdown |
| `JoinSelection` | BroadcastHashJoin / SortMergeJoin / ShuffleHashJoin / CartesianProduct | 选最优 join |
| `Aggregation` | HashAggregateExec / SortAggregateExec | 聚合 |
| `Window` | WindowExec | 窗口 |
| `InMemoryScans` | InMemoryRelation | cache 表 |

### 2.5 阶段 5:PrepareForExecution + Code Generation

源码:`org.apache.spark.sql.execution.QueryExecution#prepareForExecution`

```
SparkPlan
   └─ apply(PreparedPlan, InsertAdaptiveSparkPlan, ...)  // Spark 3.x AQE
       └─ apply(ReuseExchange, ReuseSubquery, ...)
           └─ apply(PlanSubqueries, EnsureRequirements, ...)
               └─ apply(CollapseCodegenStages, ...)
                   └─ apply(ExtractPythonUDFFromAggregates, ...)
                       → Executable SparkPlan
```

**关键点**:SparkPlanner 产出的物理计划是 `SparkPlan`,但还不可执行。`prepareForExecution` 阶段插入 codegen 标记(`WholeStageCodegenExec`)。

---

## 3. 物理计划算子全景

源码:`org.apache.spark.sql.execution`,核心算子:

| 算子 | 含义 | 关键参数 |
| --- | --- | --- |
| `FileSourceScanExec` | 扫表 | `dataFilters`, `pushedFilters` |
| `ProjectExec` | 投影 `SELECT` | `projectList` |
| `FilterExec` | 过滤 `WHERE` | `condition` |
| `HashAggregateExec` | 聚合 GROUP BY | `groupingExpressions`, `aggregateExpressions` |
| `SortExec` | 排序 | `sortOrder`, `global` |
| `BroadcastHashJoinExec` | 广播 Hash Join | `buildSide`, `joinKeys` |
| `ShuffledHashJoinExec` | Shuffle Hash Join | 一边 hash,一边探测 |
| `SortMergeJoinExec` | Sort Merge Join | 两边都排序 |
| `Exchange` | Shuffle 边界 | `ShuffleExchangeExec` |
| `WindowExec` | 窗口函数 | `windowExpression` |
| `CollectLimitExec` | `LIMIT` | `limit` |

### 3.1 EXPLAIN 看物理计划

```sql
EXPLAIN EXTENDED SELECT a.id, SUM(b.amt)
FROM orders a JOIN payments b ON a.id = b.order_id
WHERE b.ts > '2026-01-01'
GROUP BY a.id;
```

输出关键段落:

```
== Physical Plan ==
*(2) HashAggregate(keys=[a.id#10], functions=[sum(b.amt#20)])
+- Exchange hashpartitioning(a.id#10, 200)         ← ★ ShuffleExchangeExec
   +- *(1) HashAggregate(keys=[a.id#10], functions=[partial_sum(b.amt#20)])
      +- *(1) Project [a.id#10, b.amt#20]
         +- *(1) BroadcastHashJoin [a.id#10], [b.order_id#30], Inner, BuildRight
            :- *(1) Scan JDBC ...
            +- BroadcastExchange HashedRelationBroadcastMode
               +- Scan JDBC payments

(2) HashAggregate: stage 1 最终聚合,200 partition
   Exchange: shuffle by a.id (200 partitions)
   (1) HashAggregate: stage 0 部分聚合
   Project: 只取 a.id 和 b.amt
   BroadcastHashJoin: 小表 payments broadcast
```

`*(1)` 表示已做 codegen(`WholeStageCodegen`),`*` 表示未 codegen。

---

## 4. Tungsten:Spark 的"内存与 CPU 极限优化"

### 4.1 Tungsten 三大支柱

```
              ┌─────────────────────────────────────────┐
              │           Tungsten                     │
              │   (Project Tungsten, Spark 1.4+)        │
              ├────────────┬─────────────┬───────────────┤
              │ Memory Mgmt│   Codegen   │    Binary     │
              │ 堆外内存    │   代码生成   │   处理       │
              │ UnsafeRow  │             │   序列化      │
              └────────────┴─────────────┴───────────────┘
```

### 4.2 堆外内存:UnsafeRow

源码:`org.apache.spark.sql.catalyst.expressions.UnsafeRow`

传统 `InternalRow = {Int, String, Double}` 是对象,每个字段一个对象引用,GC 压力极大。
`UnsafeRow` 是定长 16 字节 / 8 字节的二进制布局,字段直接写堆外内存(`sun.misc.Unsafe`):

```
  ┌──────┬──────┬──────────┬──────────┬──────┐
  │ null │ size │ offset[] │  data[]  │ null │
  └──────┴──────┴──────────┴──────────┴──────┘
   header       字段偏移表   实际数据
   16 byte       8*N byte    变长
```

**好处**:
- GC 压力下降 90%。
- 字段直接按偏移访问,缓存命中率高。
- Hash aggregate / sort 直接读写 UnsafeRow,无需反序列化。

**配置**:
- `spark.memory.offHeap.enabled=true`
- `spark.memory.offHeap.size=4g`

### 4.3 整阶段代码生成(Whole-Stage Codegen)

源码:`org.apache.spark.sql.execution.WholeStageCodegenExec#doExecute`

把多个 operator 合并成一个 Java 方法,避免 Volcano 模型每行一个虚函数调用。

#### 4.3.1 Codegen 前后对比

```
Without Codegen(Volcano 模型):
   Filter → Project → Aggregate (each row = 3 virtual calls)

With Codegen(Whole-stage):
   Generated code:
     for (Row r : input) {
        if (!filter(r)) continue;
        Object[] p = project(r);
        agg.update(p);
     }
   (1 virtual call / 1000 rows)
```

源码入口:`org.apache.spark.sql.execution.CodegenSupport`,每个 SparkPlan 子类实现 `doProduce` / `consume`,Spark 把多个子节点合并成 `GeneratedClass`.

#### 4.3.2 Codegen 限制

- `LongCodePath`: 方法超过 64KB Java 字节码长度 → 报 `JaninoRuntimeException`。
  - 解决:调 `spark.sql.codegen.maxFieldsLength=100` 或拆分 Stage。
- Hive UDF: 反射调用,不能 codegen → 用 `spark.sql.legacy.allowEmptyDatasourceForHiveUDF=false`。

### 4.4 启用 Codegen

```sql
SET spark.sql.codegen.wholeStage = true;   -- 默认 true
SET spark.sql.codegen.fallback = true;     -- Codegen 失败回退到解释执行
SET spark.sql.codegen.maxFieldsLength = 100;
```

---

## 5. 自适应查询执行(Adaptive Query Execution,AQE)

Spark 3.x 引入,源码:`org.apache.spark.sql.execution.adaptive.AdaptiveSparkPlanExec`

### 5.1 AQE 三大优化

| 优化 | 原理 | 收益 |
| --- | --- | --- |
| 动态合并 Shuffle Partition | 运行时统计 partition 大小,合并小 partition | 减少 task 数 |
| 动态调整 Join 策略 | 运行时重新选择 join(Broadcast vs Sort Merge) | 优化 join |
| 动态优化数据倾斜 | 把大 partition 拆成多个小 partition + 随机前缀 | 解决 skew |

### 5.2 AQE 配置

```properties
spark.sql.adaptive.enabled=true
spark.sql.adaptive.coalescePartitions.enabled=true
spark.sql.adaptive.skewJoin.enabled=true
spark.sql.adaptive.localShuffleReader.enabled=true

spark.sql.adaptive.advisoryPartitionSizeInBytes=128m
spark.sql.adaptive.skewJoin.skewedPartitionFactor=5
spark.sql.adaptive.skewJoin.skewedPartitionThresholdInBytes=256m
```

### 5.3 AQE 的物理计划示例

```
开启 AQE 前:
   Exchange (200 partitions) → SortMergeJoin
   ↑ 即使小表也 shuffle

开启 AQE 后:
   Exchange(200 partitions) → AdaptiveSparkPlanExec 监控
                          → runtime 探测到左表小
                          → 改 BroadcastHashJoin
                          → 跳过 shuffle
```

源码:`AdaptiveSparkPlanExec#getPhysicalPlan` 监听 `QueryStage` 完成事件,根据统计信息调整计划。

### 5.4 Coalesce Shuffle Partitions 原理

源码:`CoalesceShufflePartitions` Rule:

```
- 收集每个 partition 的大小(Shuffle Read Metrics)
- 计算目标 partition 数 = totalBytes / advisoryPartitionSizeInBytes
- 合并小于目标大小 1.5 倍的连续 partition
- 减少 task 数,降低调度开销
```

---

## 6. Catalyst 优化器源码深度

### 6.1 规则执行流程

源码:`Catalyst 优化器#execute`

```scala
abstract class Optimizer extends RuleExecutor[LogicalPlan] {
  // fixedPoint = FixedPoint(100): Rule 多次迭代直到 plan 不变
  def batches: Seq[Batch]
  override def execute(plan: LogicalPlan): LogicalPlan = {
    batches.foldLeft(plan) { (currentPlan, batch) => batch.execute(currentPlan) }
  }
}

case class Batch(name: String, strategy: Strategy, rules: Rule[LogicalPlan]*)
```

### 6.2 RBO 重要规则

| 规则 | 位置 | 作用 |
| --- | --- | --- |
| PushDownPredicate | `pushdown` | Filter 下推 |
| PushDownLeftSemiAntiJoin | `pushdown` | Left Semi Join 下推 |
| ColumnPruning | `operatorOptimizations` | 删除无用列 |
| CollapseProject | `operatorOptimizations` | 合并相邻 Project |
| ConstantFolding | `operatorOptimizations` | 常量表达式预计算 |
| BooleanSimplification | `operatorOptimizations` | `AND/OR` 化简 |
| SimplifyConditionals | `operatorOptimizations` | `CASE WHEN` 化简 |
| LikeSimplification | `operatorOptimizations` | `LIKE` → `StartsWith` |
| NullPropagation | `operatorOptimizations` | NULL 传播 |
| CombineFilters | `operatorOptimizations` | 合并相邻 Filter |
| ReorderJoin | `operatorOptimizations` | join 顺序调整 |

### 6.3 CBO(cost-based)

Spark 3.x 通过 `StatisticsManager` 收集表统计信息(`ANALYZE TABLE t COMPUTE STATISTICS`)。
关键 CBO 规则:

- `JoinReorderDP`:动态规划求最优 join 顺序。
- `StarSchemaDetection`:星型模型 join 顺序(大表 - 多小表 - 大表)。
- `OptimizeMetadataOnlyQuery`:只查元数据时,跳过物理执行。

启用 CBO:

```sql
SET spark.sql.cbo.enabled=true;
SET spark.sql.cbo.joinReorder.enabled=true;
ANALYZE TABLE orders COMPUTE STATISTICS FOR COLUMNS id, customer_id;
```

### 6.4 EXPLAIN 查看 RBO + CBO 后的逻辑计划

```sql
EXPLAIN COST
SELECT * FROM orders WHERE id < 100;
```

输出包含每个节点的 `Statistics`:`rowCount`, `sizeInBytes`, 面试常考。

---

## 7. Code Generation:从 SparkPlan 到 Java 字节码

源码:`org.apache.spark.sql.execution.codegen.CodeGenerator`

### 7.1 Codegen 流程

```
SparkPlan (Filter → Project → Aggregate)
    └─ each operator implements CodegenSupport
        └─ doProduce(ctx): 生成表达式代码
        └─ consume(ctx): 接收子节点输出
    └─ GenerateMutableProjection / GenerateUnsafeProjection
        └─ Janino compiler (org.codehaus.janino)
            └─ 编译为 Java Class
                └─ 加载并执行
```

### 7.2 Codegen 生成的代码示例

```scala
class GeneratedClassForFilter extends GeneratedClass {
  // 由 Codegen 生成,类似:
  def process(input: Iterator[Row]): Iterator[Row] = {
    input.filter { row =>
      val tmp1 = row.getInt(0)
      tmp1 < 100
    }
  }
}
```

实际生成代码包含:
- 表达式求值(常量折叠后)
- 类型特化(int/long/double)
- 短路优化(`&&`)

### 7.3 Codegen 调优参数

| 参数 | 默认 | 作用 |
| --- | --- | --- |
| `spark.sql.codegen.wholeStage` | true | 启用 Whole-stage Codegen |
| `spark.sql.codegen.fallback` | true | Codegen 失败回退 |
| `spark.sql.codegen.maxFieldsLength` | 100 | Project 列数限制,超过则不 codegen |
| `spark.sql.codegen.hugeMethodLimit` | 65535 | Janino 单方法字节码上限 |
| `spark.sql.codegen.methodSplitThreshold` | 8 | 大方法自动拆分数 |

---

## 8. 物理计划 → RDD 执行:SparkPlan.execute

源码:`org.apache.spark.sql.execution.SparkPlan#execute`

```scala
abstract class SparkPlan extends QueryPlan[SparkPlan] {
  override def execute(): RDD[InternalRow] = {
    doExecute()  // 子类实现
  }

  protected def doExecute(): RDD[InternalRow] = {
    // 1. 收集子节点 RDD
    val inputRDDs = children.map(_.execute())
    // 2. 组合
    executeTake 或者 executeCollect 或者 rdd
    sparkContext.union(inputRDDs)
  }
}
```

`WholeStageCodegenExec#doExecute` 特殊:

```scala
override def doExecute(): RDD[InternalRow] = {
  val (ctx, cleanedSource) = CodeGenerator.compile(...)
  val rdds = children.map(_.execute())
  // 把 RDD union 后,传入 codegen class 的 InputRDD
  new InputRDDCodegen(rdds, cleanedSource)
}
```

---

## 9. 数据源 API:V1 / V2

### 9.1 V1:DataSource API(老)

```scala
spark.read.format("csv").option("header", true).load("hdfs:///data/*.csv")
spark.write.format("parquet").mode(SaveMode.Append).save("hdfs:///out")
```

### 9.2 V2:DataSourceV2 API(新)

特性:
- 推 pushdown 能力(Filter / Projection / Aggregation / Limit)。
- 多 catalog 抽象。
- 支持 Iceberg / Delta / Hudi 等湖格式。

```scala
class MyDataSourceV2 extends DataSourceV2 with ReadSupport {
  override def createReader(options: CaseInsensitiveStringMap): PartitionReaderFactory = ...
}
```

### 9.3 湖格式与 Spark SQL 的关系

| 湖格式 | Catalog | DataSourceV2 | 写入模式 |
| --- | --- | --- | --- |
| Apache Iceberg | HiveCatalog / HadoopCatalog / NessieCatalog | ✅ | Copy-on-Write / Merge-on-Read |
| Apache Hudi | HiveCatalog | ✅ | Copy-on-Write / Merge-on-Read |
| Delta Lake | Unity Catalog | ✅ | Append / Overwrite / Merge |
| Apache Paimon | FileSystem / Hive | ✅ | Append / Overwrite |

---

## 10. 生产参数清单

`spark-defaults.conf`(SQL 相关):

```properties
# Catalyst / AQE
spark.sql.adaptive.enabled=true
spark.sql.adaptive.coalescePartitions.enabled=true
spark.sql.adaptive.skewJoin.enabled=true
spark.sql.adaptive.localShuffleReader.enabled=true
spark.sql.adaptive.advisoryPartitionSizeInBytes=128m

# Codegen
spark.sql.codegen.wholeStage=true
spark.sql.codegen.fallback=true

# CBO
spark.sql.cbo.enabled=true
spark.sql.cbo.joinReorder.enabled=true
spark.sql.cbo.starSchemaDetection=true

# Join
spark.sql.autoBroadcastJoinThreshold=10m
spark.sql.broadcastTimeout=300s
spark.sql.shuffle.partitions=200

# 序列化
spark.sql.parquet.compression.codec=snappy
spark.sql.parquet.filterPushdown=true
spark.sql.parquet.enableDictionary=true

# 缓存
spark.sql.inMemoryColumnarStorage.compressed=true
spark.sql.inMemoryColumnarStorage.batchSize=10000
```

---

## 11. 生产实战任务

### 11.1 任务一:Catalyst 优化观察

```scala
// 启用详细日志
spark.sparkContext.setLogLevel("INFO")
spark.sql("SET spark.sql.planChangeLog.level = INFO")

// 复杂查询
spark.sql("""
  SELECT
    region,
    COUNT(DISTINCT user_id) AS dau,
    SUM(amount) AS gmv
  FROM orders
  WHERE ts > '2026-01-01'
  GROUP BY region
""").explain(true)

// 观察:
// == Parsed Logical Plan ==
// == Analyzed Logical Plan ==
// == Optimized Logical Plan ==
// == Physical Plan ==
```

### 11.2 任务二:AQE 优化数据倾斜

```scala
// 准备数据:90% 走 key=A,10% 走其他 key
val df = spark.range(0, 100000000)
  .selectExpr(s"if(id < 90000000, 1, id % 1000) AS key", "id")

// 启用 AQE 后跑 join,观察 UI
spark.conf.set("spark.sql.adaptive.enabled", true)
spark.conf.set("spark.sql.adaptive.skewJoin.enabled", true)

val result = df.join(df.selectExpr("key", "value"), "key")
  .groupBy("key").count()

result.collect()
// 观察 stage 1 中 task 时长:AQE 会把大 task 拆成多个小 task
```

### 11.3 任务三:Whole-stage Codegen 验证

```sql
-- 简单 query 触发
EXPLAIN SELECT id, amt, ts FROM orders WHERE region = 'cn';
-- 输出中如果有 *(1) 标志,表示 Whole-stage Codegen 生效

-- 复杂 query 关闭 codegen 验证性能差距
SET spark.sql.codegen.wholeStage = false;
SELECT ...  -- 慢 5~10x
```

### 11.4 任务四:DataSource V2 自定义

```scala
// code/spark/datasource-v2-mock.scala
class MockDataSource extends DataSourceV2 with ReadSupport {
  override def createReader(options: CaseInsensitiveStringMap): PartitionReaderFactory = {
    new MockReaderFactory()
  }
}

class MockReaderFactory extends PartitionReaderFactory {
  override def createReader(partition: InputPartition): PartitionReader[InternalRow] = {
    new MockReader()
  }
}

class MockReader extends PartitionReader[InternalRow] {
  private var counter = 0
  override def next(): Boolean = counter < 100
  override def get(): InternalRow = {
    counter += 1
    InternalRow(counter, s"row-$counter")
  }
  override def close(): Unit = ()
}

// 使用
spark.read.format("com.bigdata.MockDataSource").load()
```

### 11.5 任务五:Iceberg + Spark SQL 集成

```scala
spark.sql("""
  CREATE TABLE orders_iceberg (
    id BIGINT,
    user_id BIGINT,
    amount DECIMAL(10,2),
    ts TIMESTAMP
  ) USING iceberg
  PARTITIONED BY (days(ts))
""")

spark.sql("""
  INSERT INTO orders_iceberg
  SELECT * FROM orders_source
""")

// Time travel
spark.read.option("snapshot-id", "12345").table("orders_iceberg")
```

---

## 12. 专家面试题

1. **Spark SQL 五阶段编译分别输出什么?**
   *要点*:Parse → Unresolved LogicalPlan;Analyze → LogicalPlan;Optimize → Optimized LogicalPlan;Plan → PhysicalPlan(SparkPlan);Prepare → Executable SparkPlan(含 codegen / exchange)。
2. **Catalyst Optimizer 有多少规则?**
   *要点*:200+,分 Batch(OperatorOptimizations, FinishAnalysis 等),每 Batch 内多个 Rule,FixedPoint=100 迭代。
3. **PushDownPredicate 能推到哪一层?**
   *要点*:三层:Parquet row group level → file scan level → join/scan level。V2 DataSource 支持下推到 storage 层。
4. **Tungsten 的 UnsafeRow 怎么减少 GC?**
   *要点*:定长二进制布局,字段按偏移访问,无需反序列化,堆外内存直接放。`MemoryConsumer#allocateHeap / allocateUnsafe`。
5. **Whole-stage Codegen 的限制?**
   *要点*:Janino 单方法字节码上限 64 KB;大表 + 复杂表达式会 fallback;`spark.sql.codegen.maxFieldsLength` 限制列数。
6. **AQE 在哪个阶段生效?**
   *要点*:PrepareForExecution 阶段,SparkPlanner 之后插入 `AdaptiveSparkPlanExec`,运行时收集统计信息,二次优化 plan。
7. **Spark 3.x 默认开启 AQE 吗?**
   *要点*:`spark.sql.adaptive.enabled=false` 默认 false,但生产强烈建议开。
8. **CBO 需要什么前提?**
   *要点*:必须先 `ANALYZE TABLE` 收集统计信息(行数、列 distinct 值等),否则 CBO 不生效。
9. **Sort Merge Join 为什么 Sort 后再 Merge?**
   *要点*:类似 MapReduce,两边 sort 后,顺序扫描 merge,O(N+M),无需建 hash 表,适合大表。
10. **Broadcast Hash Join 的阈值?**
    *要点*:`spark.sql.autoBroadcastJoinThreshold=10m`(字节),小表广播到所有 Executor,Shuffle 替换为 broadcast exchange。
11. **Hash Aggregate 与 Sort Aggregate 区别?**
    *要点*:Hash Aggregate 不需预排序,基于 hash 聚合;Sort Aggregate 需要先 SortExchange。group key 多用 HashAggregate。
12. **Adaptive Spark Plan 的 query stage 是什么?**
    *要点*:AQE 把 plan 切成多个 query stage,每个 stage 完成后才触发下一阶段 plan 调整。源码 `QueryStageExec`。
13. **Explain 里 `*(1)` 和 `*` 区别?**
    *要点*:`*` 是 codegen 节点(WholeStageCodegenExec),`*(1)` 表示已 codegen + 包含子节点。
14. **Spark SQL 怎么处理 Hive UDF?**
    *要点*:Hive UDF 默认反射调用,无法 codegen;可重写为 Spark 原生 UDF 或用 `HiveUDFWrapper` + `spark.sql.legacy.allowEmptyDatasourceForHiveUDF=true`。

---

## 13. 一张图回顾 Catalyst 五阶段

```
  SQL/DataFrame
       │
       ▼ Parse (ANTLR4)
  Unresolved LogicalPlan
       │
       ▼ Analyzer (100+ rules)
  LogicalPlan
       │
       ▼ Optimizer (RBO + CBO)
  Optimized LogicalPlan
       │
       ▼ SparkPlanner (Strategies)
  PhysicalPlan (SparkPlan)
       │
       ▼ prepareForExecution (InsertAdaptiveSparkPlan + Codegen)
  Executable SparkPlan
       │
       ▼ execute() → RDD[InternalRow]
  Spark Core / DAGScheduler / TaskScheduler
```

---

## 14. 小结与下一章预告

- Spark SQL = Catalyst(优化) + Tungsten(内存) + Codegen(CPU) + AQE(自适应)。
- 生产上 **必须开 AQE + CBO + Whole-stage Codegen**,这三件套提升 2~5 倍性能。
- 下一章 [05-Spark 性能调优],我们把这一章的物理算子、内存模型、调参串起来,讲"数据倾斜 7 种解法"、"Join 策略"、"Shuffle 调优"、"动态资源分配",都是 50K 面试的"必杀题"。