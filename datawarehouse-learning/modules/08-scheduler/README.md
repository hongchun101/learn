# 模块 08 · 调度系统(Scheduler)

数据仓库的批处理链路一旦离开单机 SQL, 就必须回答一个朴素的问题:
"凌晨 3 点这段 SQL 谁来跑、跑挂了怎么办、漏跑了怎么补?" 调度系统就是
为这个问题而生的中间层。本模块围绕 Apache Airflow 的核心模型, 用一份
纯 Python 的迷你执行器 (`dag_demo.py`) 把 DAG、Operator、Sensor、
SLA、回填、血缘这些概念在同一台笔记本上跑起来, 然后再用一章的篇幅
对比国内更常见的 DolphinScheduler, 帮助你在选型时不被任何一方的宣传
话术绑架。

---

## ch01 · 调度系统概念

"调度"在数据仓库语境里至少有四层含义:

1. **时间触发(trigger by time)** —— `0 3 * * *`, 每天凌晨三点把任务
   拉起来跑。Airflow 的 `schedule_interval`、`start_date`、`catchup`
   三个字段就对应这一层。
2. **依赖触发(trigger by upstream)** —— 上游 Hive 表写完了才允许下游
   Spark 跑, 这是 DAG(有向无环图)存在的原因。Airflow 用
   `set_downstream` / `>>` / `<<` 表达, DolphinScheduler 用画布上的
   箭头。
3. **事件触发(trigger by event)** —— 收到 Kafka 消息、文件落地、
   MySQL binlog 推进等离散事件才启动。Airflow 的
   `S3KeySensor`、`ExternalTaskSensor`, DolphinScheduler 的
   `Kafka` / `HTTP` 节点都属此类。
4. **手动触发(trigger by user)** —— 临时补跑、补数据。Airflow 的
   `airflow dags trigger`, DolphinScheduler 的"补数"按钮对应。

一个成熟的调度系统还必须回答: 任务失败了怎么办 (重试 / 告警 / 跳过),
漏跑了怎么办 (回填 / catchup), 谁先谁后 (并发度 / 资源队列), 谁跑的
(权限 / 租户), 跑得对不对 (数据质量校验 + 血缘)。本模块就是这些问题的
缩影版答案。

---

## ch02 · Airflow 架构

Airflow 的运行时由四个进程组成:

- **Scheduler** —— 周期扫描 DAG 文件, 计算每条任务实例的
  `scheduled_at`, 把"该跑了"的实例丢进 Executor 的队列。
- **Executor** —— 真正拉起 worker 的组件。`SequentialExecutor` 串行
  (仅 debug), `LocalExecutor` 多进程本地, `CeleryExecutor` /
  `KubernetesExecutor` 把任务丢到远端 worker。
- **Webserver** —— Flask + Gunicorn 起的 UI, 展示 DAG 图、运行历史、
  日志、XCom。
- **Metadatabase** —— 一张 Postgres/MySQL, 存 DAG 定义、TaskInstance
  状态、Variable、Connection、XCom、Pool。**没有元数据库, Airflow 就
  不存在**, 这是它和 DolphinScheduler 的一个根本差异。

任务通过 Operator 抽象。Operator 描述"做什么", 任务实例(TaskInstance)
描述"这一次跑得怎么样"。本模块的 `dag_demo.py` 把这一拆分复刻到了
一个 Python 文件里: `PythonOperator`/`SqlOperator`/`EmptyOperator` 是
Operator, `TaskInstance` 是状态机, `DAG.run()` 替代 Scheduler + Executor
的合体, 没有 Metadatabase (用内存里的 dict)。

Airflow 1.x 用 `airflow.cfg` 全局配置, 2.x 起改成
`AIRFLOW__CORE__EXECUTOR=LocalExecutor` 这种环境变量前缀方式,
2.4 之后又引入 TaskFlow API (`@task`), 把 Operator 进一步包成函数。
对学习者来说: 1.x 的 Operator 模型更接近本质, 2.x 的 TaskFlow 更接近
日常 Python, 两者并存看个人偏好。

---

## ch03 · DAG 与 Operator

DAG 是"无环"二字比"有向"二字更值钱。没有环, 才能保证拓扑排序存在,
才能保证不会无限递归。"无环"也意味着所有的依赖都必须用节点之间的边
表达, 不能用 SQL 里的 `INSERT ... SELECT` 隐式串行 — 那种"隐式依赖"
是调度系统最大的天敌, 一旦上游表重跑, 下游表不会跟着重跑, 数据就脏
了。

本模块的 `dag_demo.py` 提供四类 Operator:

| Operator              | 用途                                                |
|-----------------------|----------------------------------------------------|
| `PythonOperator`      | 跑任意 Python 函数, 最通用                         |
| `SqlOperator`         | 跑 DuckDB SQL, 模拟 Hive/Spark 的 `sql` 节点       |
| `EmptyOperator`       | 空节点, 用作依赖汇聚点或 DAG 完成标记              |
| `FileSensor`          | 等文件落地 (`fs.exists`)                            |
| `TableSensor`         | 等表里有数据 (`SELECT COUNT(*) > 0`)               |

Operator 的 `retries` / `retry_delay` / `sla` 是 Airflow 重试与超时
语义的最小集: `retries=3` 表示失败后最多重试 3 次 (一共 4 次执行),
`retry_delay=timedelta(minutes=5)` 表示重试间隔, `sla=timedelta(hours=1)`
表示超过 1 小时仍未完成就标记 SLA miss (但不会让任务失败)。本模块的
`test_task_with_retries_eventually_succeeds` 测试就验证了"前两次失败
第三次成功"的语义, `test_task_with_retries_exhausted_fails` 验证了
"4 次都失败则 FAILED"。

---

## ch04 · Sensor 与 Trigger

Sensor 是"等条件成立才往下走"的任务, 它和普通 Operator 的区别是:

- 它通常 *reschedule* 或者 *poke*, 而不是 `sleep` —— 否则会一直占着
  worker slot。
- 它失败不代表上游挂了, 只代表"现在还没准备好", 所以 retry 通常设得
  比 Operator 多 (`retries=24`、`retry_delay=timedelta(minutes=5)` 表示
  等 2 小时)。
- 它和 Operator 可以用 `>>` 串起来, 所以"等文件 -> 跑 Hive -> 跑 Spark"
  是常规链路。

本模块的 `FileSensor` 用了最朴素的实现: 文件不存在直接抛
`FileNotFoundError`, 由 DAG runner 的重试机制来"过一会儿再试"。
生产 Airflow 里有三种 `mode`:
`mode='poke'` (worker 阻塞 sleep)、`mode='reschedule'` (worker 让出 slot,
下一次再调度)、`mode='smart'`, 不同 mode 适合不同的等待长度和 worker
成本。

Trigger 是更广义的概念, 指"触发一次 DAG run"的事件。Airflow 2.2 起
支持 `Trigger` 抽象 (Deferred Operator), 让 Sensor 不再独占 worker,
而是用一个事件循环在 Triggers 进程里等, 事件来了再唤醒 worker。
本模块是教学版本, 暂时不实现 Trigger, 但保留这个延伸点。

---

## ch05 · 回填与 SLA

**回填 (Backfill)** = 给历史日期补跑。Airflow 的实现方式是:

1. 用户指定 `start_date` / `end_date`;
2. Scheduler 算出每一天的 `execution_date`;
3. 对每一天都跑一遍完整的 DAG, 写入独立的 DagRun。

本模块的 `DAG.backfill(start, end)` 就是这个算法的直白实现: 一个
while 循环, 每天调一次 `DAG.run()`。`test_backfill_runs_once_per_day`
验证连续 3 天的回填会生成 3 个独立 DagRun, 每个 scheduled_at 落在
对应的日期。

回填有几个常踩的坑:

- **重复跑** —— 如果你的 SQL 不是 `CREATE OR REPLACE` 而是 `INSERT INTO`,
  回填就会把同一天的数据写两遍。Airflow 不会替你检查幂等性, 必须在 SQL
  层用日期分区 (`WHERE dt = '{{ ds }}'`) 来保证。
- **并发度** —— `max_active_runs=3` 表示同一时刻最多 3 个 DagRun 并行,
  超出的排队。生产集群这个值要看下游 Hive 队列和 Spark 队列的吞吐。
- **回填 vs 补数** —— Airflow 习惯用 "backfill" 指补历史, "rerun" 指
  补单次; DolphinScheduler 把这两个都叫"补数", 入口是同一个 UI 按钮。

**SLA (Service Level Agreement)** = 任务必须在这段时间内跑完。Airflow
的实现是"过期就标记 `sla_miss=True`, 触发 email/告警, 但不中断任务"。
本模块的 `_execute_task` 末段就是这段逻辑: `ti.end_ts - ti.start_ts >
sla` 时打日志并把 `sla_miss=True`。生产 Airflow 里 SLA 告警会写到
Metadatabase 的 `sla_miss` 表, 再由 `airflow.cfg` 里的
`email_on_failure` / `slack_on_failure` 钩子发出去。

---

## ch06 · 任务依赖

任务依赖是 DAG 的边, 但具体怎么连大有讲究:

1. **`>>` 与 `set_downstream`** —— 语法糖, 等价于加一条边。
2. **`depends_on_past`** —— 同一个 task_id 的上一次 run 必须成功,
   本次才能跑。常用于"昨天那个 ETL 跑成功了今天的才能跑"。
3. **`wait_for_downstream`** —— 同理但反方向: 下游必须成功上游才算
   完成。常用于"等所有分片落地才能汇报"。
4. **`trigger_rule`** —— 默认 `all_success`, 可改成 `one_success`
   (任一上游成功即可)、`all_done` (上游全部结束, 不论成败)、
   `none_failed` (上游无失败即可, 跳过也算)。
5. **ExternalTaskSensor** —— 跨 DAG 依赖, 同步等"另一个 DAG 的某个
   task" 跑完, 是多团队协作的标准答案。

本模块的 `DAG.run()` 只实现了 `all_success` 这一种 rule, 但保留了
`TriggerRule` 枚举和 `task.trigger_rule` 字段, 留作扩展点。如果想
自己加 `one_success`, 只改 `run()` 里那一段 `if` 判断就行。

DAG 越复杂, 依赖越容易烂。最佳实践:

- **每条边都用 `task_id` 显式声明**, 不要在 SQL 里隐式 JOIN。
- **失败路径也要画在图上**, 用 `trigger_rule='all_done'` 让下游
  的"清理任务"一定跑起来, 而不是被父失败短路。
- **跨 DAG 依赖用 Sensor**, 不要在同一个 DAG 里塞 30 个
  ExternalTaskSensor — 拆成多个小 DAG。

---

## ch07 · 血缘与监控

**血缘 (Lineage)** 是数据仓库里"治理"的起点: 给一张表, 回答它从
哪些表来、经过哪些 SQL、由哪个任务在何时写入。Airflow 自己不存血缘,
但通过 [OpenLineage](https://openlineage.io/) 集成 Marquez 或
DataHub, 让每个 Operator 在跑成功时 emit 一条
`(job, inputs=[..], outputs=[..], run_id, event_time)` 事件。

本模块的 `LineageTracker` 把这条事件序列化成 SQLite 一行,
`(dag_id, task_id, scheduled_at, artifact, kind, ts)`。
`test_warehouse_dag_runs_in_topological_order` 跑完后会留下 6 条
血缘记录 (每个 SUCCESS 节点一条), 用 Marquez UI 看就是一张点线图。

监控分三个层级:

- **任务级** —— duration 趋势、try_number 分布、SLA miss 频率。
- **DAG 级** —— 单次 run 的总时长、任务并行度、是否 catchup。
- **平台级** —— scheduler 延迟 (新 run 该跑却没跑多久才被发现)、
  executor 队列堆积、Metadatabase 连接数。

Airflow 自带的 `airflow dags report` 给出 DAG 级概览,
`airflow tasks states-for-dag-run` 给出单 run 详情。
DolphinScheduler 的 `/ui/master/index` 默认大盘更接近 Grafana 风格,
内置任务时长/成功率/Worker 负载三件套, 对运维更友好。

---

## ch08 · DolphinScheduler 对比

DolphinScheduler (海豚调度) 是国产开源调度系统, 在国内中大型互联网
公司占据相当份额, 选型时常常和 Airflow 二选一。两者核心模型都对齐
DAG, 但工程取向不同:

| 维度              | Airflow                              | DolphinScheduler                  |
|-------------------|--------------------------------------|------------------------------------|
| 配置方式          | Python 文件 (`dag.py`)               | Web UI 画布, 可选 YAML/JSON        |
| 元数据库          | 必须, Postgres/MySQL                 | 必须, Postgres/MySQL               |
| 租户/权限         | RBAC + Role, 但偏单租户              | 原生多租户 (`tenant_id`), 适合集团|
| 任务类型          | Operator 库丰富, 自定义靠 Python     | 内建 Shell/Python/SQL/HTTP/Spark 等几十种 |
| 告警              | 邮件/Slack/PagerDuty, 靠 plugin      | 内建邮件/钉钉/微信/WebHook         |
| 血缘              | 靠 OpenLineage, 需自行集成 Marquez   | 原生支持, UI 上能直接看            |
| 集群规模          | 单 Scheduler 节点易成为瓶颈, 2.5 起 HA | Master/Worker + ZooKeeper HA, 大集群更稳 |
| 学习曲线          | Python 友好, 但 Operator 概念重      | Web 拖拽, 业务人员也能上手         |
| 国际化 / 中文文档 | 英文为主, 翻译滞后                   | 中文文档/社区活跃                  |

一句话总结: **Airflow 像 Python, DolphinScheduler 像 BPMN**。
如果你团队是 Python 工程师为主、要做复杂自定义, Airflow 更顺手;
如果团队是 SQL 工程师 / 业务分析师为主、要做大量跨部门审批与告警,
DolphinScheduler 上手更快。

实际落地时常见的混搭姿势:

- 业务 DAG 用 DolphinScheduler 编排, 复杂 ETL 子任务用 Airflow 嵌入
  作为 Sub-DAG。
- 用 DolphinScheduler 做"调度入口 + 告警 + 补数", 用 Airflow 做
  "数据科学 / ML 训练 DAG"。
- 二者都把血缘统一写到 Atlas / DataHub, 避免出现两套血缘系统。

---

## 运行本模块

```bash
# 跑测试
cd datawarehouse-learning
D:/env/anaconda3/python.exe -m pytest modules/08-scheduler/tests/ -v

# 直接跑 DAG(单次)
D:/env/anaconda3/python.exe -m modules.08-scheduler.src.dag_demo \
    --data-dir data/small --backfill-days 3
```

`dag_demo.py` 是完整的纯 Python 调度执行器, 实现 Operator / Sensor /
依赖 / 重试 / SLA / 血缘 / 回填, 代码约 600 行, 单文件无第三方依赖
(除 `duckdb`)。