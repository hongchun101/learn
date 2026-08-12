# 07 · Airflow / DolphinScheduler 调度原理

> **本章定位**:讲透大数据调度的核心——Airflow 与 DolphinScheduler 的设计差异、有向无环图(DAG)调度、Backfill、SLA、Sentry 告警。
>
> **版本基线**:Airflow **2.8+** + DolphinScheduler **3.1+**。
>
> **学习时长**:建议 6 学时(理论 2 + 实战 4)。

---

## 1. 为什么需要"调度系统"?

单条 SQL / 单个 Spark Job 可以手动 `crontab`,但生产场景需要:

```
场景:每天凌晨 2:00 跑批,共 100 个依赖任务
   T1 (拉取订单) ──▶ T2 (清洗) ──▶ T3 (Join 商品) ──▶ T4 (聚合) ──▶ T5 (入仓)
                                          │
                                          └─▶ T6 (告警分析)
   依赖关系:层级 DAG
   失败处理:重试 / 跳过 / 告警
   SLA:T5 必须 6:00 前完成
   历史:Task Instance 保留 90 天,便于排查
   补数:昨天 T3 失败,今天 0 点手动从 T3 开始重跑

手动 crontab 的痛点:
   ❌ 依赖关系无法表达
   ❌ 失败重试策略缺位
   ❌ 没有可视化
   ❌ 无法 SLA 告警
   ❌ 无法并行化

调度系统的本质:把"100 个 Job 的依赖关系 + 时间 + 失败处理"集中管理
```

---

## 2. Airflow vs DolphinScheduler 全景对比

### 2.1 项目定位

| 维度 | Apache Airflow | Apache DolphinScheduler |
| --- | --- | --- |
| **起源** | Airbnb(2014) | 易观(2017) |
| **语言** | Python | Java + Vue |
| **架构** | 单体 + DAG Folder + Web Server | 微服务 + ZooKeeper |
| **DAG 定义** | Python 代码(DAG File) | 拖拽式(Web UI) |
| **任务类型** | Operator 抽象 | 插件式 |
| **扩展性** | Python 生态丰富 | Java 生态,中文社区 |
| **运维** | 需熟悉 Python DAG | 一键部署,Web 化运维 |
| **学习曲线** | 中(需懂 Python) | 低(可视化) |
| **生产成熟度** | 高(全球 90%+ 公司) | 高(国内 80% 中大厂) |
| **云原生** | 友好(KubernetesExecutor) | 较友好 |

### 2.2 架构对比

```
┌─────────────────────────── Airflow 架构 ──────────────────────────┐
│                                                                      │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐         │
│  │ Web Server   │     │ Scheduler    │     │  Executors   │         │
│  │  (UI/API)    │     │  (DAG 调度)  │     │ (Task 执行) │         │
│  └──────┬───────┘     └──────┬───────┘     └──────┬───────┘         │
│         │                    │                     │                 │
│         └─────────┬──────────┴──────────┬──────────┘                 │
│                   │                     │                            │
│              ┌────▼─────┐         ┌────▼──────┐                       │
│              │ Metadata │         │  Broker   │ (CeleryExecutor)     │
│              │ Database │         │  (Redis/  │                       │
│              │  (Postgres│         │  RabbitMQ)│                       │
│              │  / MySQL) │         └───────────┘                       │
│              └───────────┘                                              │
└──────────────────────────────────────────────────────────────────────┘

┌─────────────────────── DolphinScheduler 架构 ─────────────────────┐
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │ API Server   │  │ Master       │  │  Worker      │              │
│  │  (REST)      │  │ (DAG 调度)   │  │ (Task 执行) │              │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘              │
│         │                 │                 │                        │
│         └─────────┬───────┴────────┬────────┘                        │
│                   │                │                                  │
│              ┌────▼─────┐    ┌────▼──────┐                            │
│              │  ZooKeeper│   │  Database │                            │
│              │ (集群协调)│   │ (Postgres/ │                            │
│              │          │   │   MySQL)  │                            │
│              └──────────┘   └───────────┘                            │
│                                                                      │
│  Alert Service / Logger / UI(独立 Vue 进程)                        │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 3. Airflow 核心原理

### 3.1 核心概念

```
DAG (Directed Acyclic Graph)
├── Task (节点)
│   ├── Operator (任务类型)
│   │   ├── BashOperator (执行 shell)
│   │   ├── PythonOperator (Python 函数)
│   │   ├── SparkSubmitOperator (Spark 提交)
│   │   ├── KubernetesPodOperator (K8s Pod)
│   │   └── ... 200+
│   └── Task Instance (某次执行实例)
├── DAG Run (一次工作流执行)
├── Task Instance (DAG Run 中的某 Task 一次执行)
├── Connection (外部连接配置)
├── Variable (全局变量)
└── Pool / Slot (资源限制)
```

### 3.2 一个 DAG 示例

```python
# dags/etl_daily.py
from airflow import DAG
from airflow.operators.bash import BashOperator
from airflow.operators.python import PythonOperator
from airflow.providers.spark.operators.spark_submit import SparkSubmitOperator
from datetime import datetime, timedelta

default_args = {
    'owner': 'data-team',
    'depends_on_past': False,
    'email': ['oncall@example.com'],
    'email_on_failure': True,
    'email_on_retry': False,
    'retries': 3,
    'retry_delay': timedelta(minutes=5),
    'sla': timedelta(hours=2),
}

with DAG(
    dag_id='daily_etl',
    default_args=default_args,
    description='Daily ETL pipeline',
    schedule_interval='0 2 * * *',         # 每天凌晨 2 点
    start_date=datetime(2026, 1, 1),
    catchup=False,                            # 不补跑历史
    tags=['etl', 'production'],
) as dag:

    # Task 1: 抽取订单
    extract_orders = BashOperator(
        task_id='extract_orders',
        bash_command='python /opt/airflow/jobs/extract_orders.py {{ ds }}',
    )

    # Task 2: Spark 清洗
    clean_orders = SparkSubmitOperator(
        task_id='clean_orders',
        application='/opt/spark/jars/etl.jar',
        java_class='com.example.CleanOrders',
        arguments=['{{ ds }}'],
        conf={
            'spark.executor.instances': 5,
            'spark.executor.memory': '8g',
        },
    )

    # Task 3: 写 Iceberg
    write_iceberg = SparkSubmitOperator(
        task_id='write_iceberg',
        application='/opt/spark/jars/etl.jar',
        java_class='com.example.WriteIceberg',
        arguments=['{{ ds }}'],
    )

    # Task 4: 数据质量校验
    def quality_check(**context):
        ds = context['ds']
        # ...检查逻辑...
        if fail:
            raise ValueError("Data quality failed")

    check_quality = PythonOperator(
        task_id='check_quality',
        python_callable=quality_check,
    )

    # 依赖关系
    extract_orders >> clean_orders >> write_iceberg >> check_quality
```

### 3.3 调度器工作流程

```
┌───────────────────────────── Airflow Scheduler ────────────────────────┐
│                                                                          │
│  主循环(每秒一次):                                                       │
│                                                                          │
│  1. 扫描 dags/ 目录                                                       │
│     └── 解析 Python 文件 → DAG 对象(内存缓存)                            │
│                                                                          │
│  2. DagFileProcessor(每 N 秒)                                             │
│     └── 检查 DAG 是否到期                                                  │
│         └── schedule_interval + start_date + last_run                    │
│             → 创建 DagRun(serialized 到 DB)                               │
│                                                                          │
│  3. SchedulerJob(后台线程)                                                │
│     └── 查询 DagRun 状态                                                  │
│         └── 查询 TaskInstance 状态                                       │
│             ├── 找到上游都已 success 的 TaskInstance                       │
│             ├── 检查 Pool 资源(slot 是否可用)                            │
│             └── 提交到 Executor                                           │
│                                                                          │
│  4. Executor(CeleryExecutor / KubernetesExecutor)                         │
│     └── 接收 Task Instance                                                │
│         └── 启动 Worker 执行                                              │
│             └── 回调 Scheduler 报告状态                                    │
│                                                                          │
│  5. 状态机:Task Instance                                                  │
│     none → scheduled → queued → running → success / failed / up_for_retry│
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### 3.4 关键源码类

```
airflow/
├── models/
│   ├── dag.py                              # DAG 类
│   ├── taskinstance.py                     # TaskInstance
│   ├── dagrun.py                           # DagRun
│   └── connection.py
├── schedulers/
│   └── job_scheduler.py                    # Scheduler 主类
├── executors/
│   ├── base_executor.py
│   ├── celery_executor.py
│   ├── kubernetes_executor.py              # K8s Executor
│   └── ...
├── operators/
│   ├── bash.py
│   ├── python.py
│   └── ...
├── providers/
│   ├── spark/
│   ├── docker/
│   └── ...
└── api/
```

**核心类**:
- `DAG`:`airflow/models/dag.py`
- `TaskInstance`:`airflow/models/taskinstance.py`
- `SchedulerJob`:`airflow/jobs/scheduler_job.py`
- `KubernetesExecutor`:`airflow/executors/kubernetes_executor.py`

---

## 4. DolphinScheduler 核心原理

### 4.1 核心概念

```
DolphinScheduler 概念树
├── Tenant (租户)
├── Project (项目)
│   └── Workflow (DAG 定义)
│       ├── Task (节点,5 类)
│       │   ├── Shell (shell 脚本)
│       │   ├── SQL (SQL 任务)
│       │   ├── Python (Python 函数)
│       │   ├── Spark (Spark 任务)
│       │   ├── Flink (Flink 任务)
│       │   ├── MR / Hive / Sub_Process
│       │   └── HTTP / Conditions (条件)
│       ├── Task Relation (依赖关系)
│       └── Workflow Instance (运行实例)
├── Schedule (定时)
├── Command (参数)
└── Worker Group (资源池)
```

### 4.2 DolphinScheduler 调度架构

```
┌──────────────────────── DolphinScheduler Master ──────────────────────┐
│                                                                          │
│  1. 定时扫描(Quartz)                                                     │
│     └── Cron 触发的 Schedule 任务                                         │
│         └── 创建 Workflow Instance                                       │
│                                                                          │
│  2. DAG 切分(CommandDispatcher)                                          │
│     └── 解析 Workflow Definition                                         │
│         └── 拆分成可独立执行的 Task 实例                                    │
│                                                                          │
│  3. Master Exec Thread                                                   │
│     └── 维护 Task Instance 状态机                                         │
│         ├── TaskState: SUBMITTED → DISPATCH → RUNNING → SUCCESS/FAILURE │
│         ├── 监听上游 Task 完成                                            │
│         ├── 分配 Worker Group / Worker                                    │
│         └── 发送 Task 到 Worker                                           │
│                                                                          │
│  4. ZK 协调                                                               │
│     ├── Master 选举(ZK ephemeral node)                                   │
│     ├── Worker 注册                                                      │
│     └── 容错(故障 Master 重新选举)                                       │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
┌──────────────────────── DolphinScheduler Worker ─────────────────────┐
│                                                                          │
│  1. Task 接收                                                            │
│  2. 启动 Task 进程                                                       │
│     └── 本地命令 / 远程命令(Spark/Flink on YARN/K8s)                    │
│  3. 状态回报                                                             │
│  4. 日志上报                                                             │
└──────────────────────────────────────────────────────────────────────────┘
```

### 4.3 关键源码类

```
dolphinscheduler/
├── master/
│   ├── MasterServer.java
│   ├── processor/
│   │   └── TaskAckProcessor.java
│   ├── dispatch/
│   │   └── HostManager.java              # Worker 选择
│   └── scheduler/
│       └── Scheduler.java
├── worker/
│   ├── WorkerServer.java
│   ├── processor/
│   │   └── TaskExecuteProcessor.java
│   └── task/
│       └── ...
├── api/
├── service/
├── dao/
└── ui/                                    # Vue 前端
```

**核心类**:
- `MasterServer`:`dolphinscheduler-master/src/main/java/org/apache/dolphinscheduler/server/master/MasterServer.java`
- `Scheduler`:`dolphinscheduler-master/src/main/java/org/apache/dolphinscheduler/server/master/scheduler/Scheduler.java`
- `TaskPriorityQueueConsumerThread`:Task 优先级队列消费线程。

---

## 5. DAG 调度原理

### 5.1 DAG 表达与解析

**Airflow DAG(Python 表达)**:
```python
# 线性依赖
task_a >> task_b >> task_c

# 多依赖
[task_a, task_b] >> task_c

# 复杂依赖
task_a >> task_b
task_a >> task_c
task_b >> task_d
task_c >> task_d
```

**DolphinScheduler DAG(Web 拖拽)**:
- UI 上拖拽节点,连线表达依赖。
- 存数据库(`t_ds_process_definition` / `t_ds_task_relation`)。
- 启动时 Master 加载,拆分为 Task Instance。

### 5.2 拓扑排序

```
DAG:                拓扑排序:
   A                Level 0: A
   │                
   ├──▶ B           Level 1: B, C
   │     │
   │     └──▶ D     Level 2: D
   │                
   └──▶ C           Level 3: E
         │
         └──▶ E     
```

**算法**(Kahn's Algorithm):
```python
def topo_sort(graph):
    in_degree = {node: 0 for node in graph.nodes}
    for edge in graph.edges:
        in_degree[edge.to] += 1
    
    queue = [node for node, deg in in_degree.items() if deg == 0]
    result = []
    
    while queue:
        node = queue.pop(0)
        result.append(node)
        for next_node in graph.successors(node):
            in_degree[next_node] -= 1
            if in_degree[next_node] == 0:
                queue.append(next_node)
    
    return result
```

**关键源码**:
- Airflow:`DAG.topological_sort()`
- DolphinScheduler:`DagHelperService` 的 BFS/DFS 解析。

### 5.3 并行调度

```
DAG: A → B → D
     A → C → D
     B → E

调度时间线:
t=0:   A 启动
t=10:  A 完成,B 和 C 同时启动
t=20:  B 完成,E 启动; C 完成
t=30:  D 启动(D 需等 B + C 都完成)
t=40:  D 完成
t=50:  E 完成

并行度:同时最多 2 个 Task(B + C),资源池需要 ≥ 2 slot
```

**调度关键参数**:

| 参数 | Airflow | DolphinScheduler |
| --- | --- | --- |
| Worker 并行数 | `executor.parallelism` | `worker.exec-threads` |
| Slot 限制 | `Pool.slots` | `Worker Group` 资源 |
| 任务优先级 | `priority_weight` | `Task Priority` |
| 抢占 | 不支持 | 支持 |

---

## 6. Backfill(补数)机制

### 6.1 Airflow Backfill

```bash
# 补跑 2026-01-01 到 2026-01-07
airflow dags backfill \
  --start-date 2026-01-01 \
  --end-date 2026-01-07 \
  --reset-dagruns \
  daily_etl
```

**内部流程**:
1. 创建每个日期的 DagRun(并发可控)。
2. 每个 DagRun 按 DAG 拓扑执行 Task。
3. `--reset-dagruns` 会清空已有 DagRun。
4. `--max-active-runs` 控制并发 DagRun 数。

**关键参数**:
- `catchup=False`:DAG 不自动补历史。
- `catchup=True`:DAG 自动补历史(慎用)。
- `max_active_runs=1`:最多 1 个并发 DagRun。

### 6.2 DolphinScheduler Backfill(补数)

```
Web UI:
工作流定义 → "补数" 按钮
   │
   ├── 选择起止时间
   ├── 并行度
   └── 提交

内部流程:
1. 生成 N 个 Workflow Instance(每个日期一个)
2. 并行调度(Worker Group 资源限制)
3. 串行/并行执行 DAG
4. 状态可查
```

### 6.3 补数陷阱

```
陷阱 1:并发爆炸
   补 90 天的 DagRun,每个 100 Task,共 9000 个 Task 同时跑。
   解决:控制 `--max-active-runs` 或 DolphinScheduler 的"补数并行度"。

陷阱 2:资源竞争
   多个补数 + 日常调度同时跑,资源池满。
   解决:用不同 Worker Group / Pool。

陷阱 3:幂等性
   Task 必须幂等(可重复执行)。
   解决:写 Iceberg overwrite partition 而不是 append。

陷阱 4:时间依赖
   补昨天数据时,SQL 引用 `{{ ds }}` 是昨天还是今天?
   解决:补数时使用 logical_date,Airflow 默认使用逻辑时间。
```

---

## 7. SLA 监控

### 7.1 Airflow SLA

```python
default_args = {
    'sla': timedelta(hours=2),   # 该 Task 应在 DAG Run 时间后 2 小时内完成
}
```

**机制**:
- Scheduler 每分钟扫描 Task Instance。
- 如果 `scheduled_time + sla < now()` 且未 success → **missed SLA**。
- 触发 `sla_miss_callback` 函数(发邮件、告警)。

```python
def sla_miss_callback(dag, task_list, blocking_task_list, slas, blocking_tis):
    # 自定义告警
    send_sentry_alert(f"SLA missed: {task_list}")

dag = DAG(
    'my_dag',
    sla_miss_callback=sla_miss_callback,
    ...
)
```

### 7.2 DolphinScheduler SLA

```
任务级别 SLA:
   期望完成时间 / 超时告警
   自定义告警插件

工作流级别 SLA:
   "工作流必须在 06:00 前完成"
   否则触发告警 + 短信
```

### 7.3 Sentry 告警集成

**Airflow 集成 Sentry**:
```bash
pip install sentry-sdk

# airflow.cfg
[metrics]
sentry_on = True
sentry_dsn = https://<key>@sentry.io/<project>
```

```python
# 在 Task 中手动捕获异常
import sentry_sdk

def my_task():
    try:
        run_job()
    except Exception as e:
        with sentry_sdk.push_scope() as scope:
            scope.set_extra("dag_id", context['dag'].dag_id)
            sentry_sdk.capture_exception(e)
        raise
```

**DolphinScheduler 集成 Sentry**:
- 通过 WebHook 推送告警到 Sentry。
- 或使用 Alert Plugin(自定义开发)。

---

## 8. 生产配置对比

### 8.1 Airflow 配置

```ini
# airflow.cfg
[core]
executor = CeleryExecutor              # 或 KubernetesExecutor
parallelism = 32
dag_concurrency = 16
max_active_runs_per_dag = 16

[scheduler]
job_heartbeat_sec = 5
scheduler_heartbeat_sec = 5
min_file_process_interval = 30
parsing_processes = 4

[celery]
broker_url = redis://redis:6379/0
result_backend = redis://redis:6379/1
worker_concurrency = 16
```

### 8.2 DolphinScheduler 配置

```properties
# dolphinscheduler_env.sh
export DATABASE=postgres
export SPRING_DATASOURCE_URL=jdbc:postgresql://postgres:5432/dolphinscheduler

# application-master.yml
server.port: 12345
master.exec-threads: 100
master.dispatch-task-number: 3
master.host-selector: RANDOM         # 或 LOWER_OFFSET

# application-worker.yml
worker.exec-threads: 100
worker.tenant-autoregister: false
```

---

## 9. 关键源码类索引

| 组件 | 项目 | 核心类 |
| --- | --- | --- |
| **Airflow DAG** | airflow | `airflow/models/dag.py` |
| Airflow Scheduler | airflow | `airflow/jobs/scheduler_job.py` |
| Airflow Executor | airflow | `airflow/executors/kubernetes_executor.py` |
| Airflow K8s Pod Operator | airflow/providers | `kubernetes/pod.py` |
| **DS Master** | dolphinscheduler | `MasterServer.java` |
| DS Worker | dolphinscheduler | `WorkerServer.java` |
| DS API | dolphinscheduler | `ApiApplicationServer.java` |
| DS Scheduler | dolphinscheduler | `Scheduler.java` |

---

## 10. 专家面试题

> **Q1**:**Airflow 的 DAG 和 DolphinScheduler 的 Workflow 有什么本质区别?**
>
> **参考答案**:
> - **Airflow DAG**:Python 代码定义,**版本管理友好**(Git),**代码即 DAG**。
> - **DolphinScheduler Workflow**:Web 拖拽,存数据库,**可视化好**,**版本管理差**(只能导出 JSON)。
> - **Airflow 优势**:代码审计、CI/CD、单元测试、动态生成 DAG、Python 生态。
> - **DolphinScheduler 优势**:拖拽学习成本低、运维面板丰富、任务参数化可视化、权限管理(项目/租户)。
> - **生产选型**:**数据团队工程化强**选 Airflow;**业务分析师 / 数据应用团队**选 DolphinScheduler。

> **Q2**:**Airflow CeleryExecutor 和 KubernetesExecutor 的区别?何时用哪个?**
>
> **参考答案**:
> - **CeleryExecutor**:Worker 是固定进程池,Task 在 Worker 进程内执行,**资源静态**。
> - **KubernetesExecutor**:每个 Task 启动一个 Pod,**资源弹性**。
> - **K8s Executor 优势**:
>   1. 每个 Task 可指定不同资源(CPU/Memory/GPU)。
>   2. 隔离性强,Task 失败不影响其他。
>   3. 资源用完即释放。
> - **CeleryExecutor 优势**:启动快,适合轻量短任务(秒级)。
> - **生产推荐**:**数据团队 / 大任务**选 K8sExecutor;**简单 ETL / 运维脚本**选 CeleryExecutor。

> **Q3**:**Backfill 时如何避免"补数爆炸"?**
>
> **参考答案**:
> - **Airflow**:
>   - `catchup=False` 关闭自动补。
>   - `max_active_runs_per_dag=5` 控制并发 DagRun。
>   - Pool `slots` 限制 Task 并发。
>   - 手动 `airflow dags backfill --max-active-runs 3`。
> - **DolphinScheduler**:
>   - 补数 UI 设置并行度。
>   - Worker Group 资源限制。
> - **关键**:**Task 必须幂等**(推荐 Iceberg overwrite / 主键 upsert)。

> **Q4**:**调度系统的 SLA 告警和 Prometheus 告警怎么配合?**
>
> **参考答案**:
> - **调度系统 SLA**(Airflow sla_miss / DS 超时):**应用层告警**,业务语义明确。
> - **Prometheus 告警**(基于 metrics):**系统层告警**,Scheduler 挂 / DB 慢查询 / Worker 死。
> - **生产建议**:
>   - **调度系统**:监 DAG Run / Task Instance 状态,failed / sla_miss 发邮件 / 短信。
>   - **Prometheus**:监 `airflow_scheduler_heartbeat`, `airflow_task_instance_failed`, `ds_master_alive`。
>   - **Sentry**:监 Exception,关联到具体 Task / DAG。

> **Q5**:**如果让你设计一个新调度系统,你会怎么做?**
>
> **参考答案**(开放式):
> 1. **DAG 定义**:Kotlin DSL + Web 可视化双模式(类似 Argo)。
> 2. **存储**:用 CRD(Operator 模式),K8s 原生 + GitOps。
> 3. **调度**:DAG 拓扑排序 + 资源池(类似 Volcano Scheduling)。
> 4. **执行**:每个 Task 一个 Pod,K8s 弹性。
> 5. **状态**:CRD `.status` 字段 + 不依赖外部 DB。
> 6. **告警**:基于 Status Condition + Event Bus + AlertManager。
> 7. **Backfill**:GitOps 风格,用 `WorkflowTemplate` 历史。
> 8. **参考项目**:Argo Workflows、Flyte、Prefect。

---

## 11. 生产实战清单

- [ ] **Step 1:Airflow 本地部署** — `docker-compose` 启动 Airflow,跑通示例 DAG。
- [ ] **Step 2:DolphinScheduler 本地部署** — `docker-compose` 启动 DS,Web UI 创建 Workflow。
- [ ] **Step 3:Spark Task** — 两种调度系统都接入 SparkSubmit,提交 Spark Job。
- [ ] **Step 4:K8s Executor** — Airflow 配置 KubernetesExecutor,每个 Task 一个 Pod。
- [ ] **Step 5:Backfill 演练** — 故意删除 7 天的 DagRun,触发补数,观察并发控制。
- [ ] **Step 6:SLA 告警** — 配置 SLA Miss 告警,故意延迟 Task 触发告警。
- [ ] **Step 7:Sentry 集成** — 在 Task 中抛异常,验证 Sentry 收到。
- [ ] **Step 8:权限管理** — DolphinScheduler 配置租户 / 项目 / 资源权限。
- [ ] **Step 9:监控接入** — Prometheus 抓取 Airflow / DS Metrics,Grafana 看板。
- [ ] **Step 10:对比总结** — 同一 DAG 在两个系统跑通,记录差异、性能、运维成本。

**完成标志**:能向团队讲清楚"为什么我们选 DolphinScheduler 而不选 Airflow"(或反之),并能基于此推荐生产部署。

---

## 12. 一句话总结

> **Airflow 是"代码即 DAG"的工程派调度系统,DolphinScheduler 是"拖拽即 DAG"的运维派调度系统。** 两者各有优势,选型的核心是判断"你的团队工程化能力强,还是业务侧更倾向于可视化"。

---

**下一章预告**:**[08-数据血缘与可观测性](./08-lineage-observability.md)** —— OpenLineage 数据血缘、OpenTelemetry、Prometheus + Grafana、FluentBit + Loki。