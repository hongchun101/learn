# 02. YARN 资源调度与源码

> **本章定位**:把 YARN 的 RM/NM/AM 三层架构、Fair/Capacity 调度器、Container 分配、抢占、FIFO Container 一次性讲透。YARN 是 Spark/Flink on YARN 的基础,**调优 80% 的问题都在 YARN 这一层**,理解后能直接落地生产。

---

## 1. YARN 诞生的背景:为什么 MR1 不够用

MR1 时代(2010 前),JobTracker + TaskTracker 架构两个核心痛点:

1. **单点**:JobTracker 同时负责资源调度 + 任务调度,集群超过 4000 节点后 JobTracker 心跳处理不过来;
2. **资源浪费**:Map slot 与 Reduce slot 分开管理,Map slot 跑满时 Reduce slot 闲置。

YARN(Yet Another Resource Negotiator,2012)的设计原则:
- **解耦资源调度与任务调度** — RM 只管资源,AM 管任务。
- **通用资源抽象** — Container = (memory, vcore, label) 三元组。
- **多租户** — Capacity/Fair Scheduler 隔离队列资源。

---

## 2. YARN 三层架构

```
                          ┌──────────────────────────────────────┐
                          │       ResourceManager (RM)            │
                          │   - Scheduler (Capacity/Fair)         │
                          │   - ApplicationsManager (ASM)         │
                          │   - ResourceTrackerService            │
                          └──────────────┬────────────────────────┘
                                         │ heartbeat (3s)
                  ┌──────────────────────┼──────────────────────┐
                  │                      │                      │
        ┌─────────▼─────────┐  ┌─────────▼─────────┐  ┌─────────▼─────────┐
        │  NodeManager (NM) │  │  NodeManager (NM) │  │  NodeManager (NM) │
        │   - 内存/CPU 监控  │  │   - 容器启停      │  │   - 本地化目录    │
        └────────┬──────────┘  └────────┬──────────┘  └────────┬──────────┘
                 │                     │                     │
                 ▼                     ▼                     ▼
        ┌────────────────────────────────────────────────────────┐
        │       Container 1   Container 2   ... Container N     │
        │  (AppMaster OR Executor)                              │
        └────────────────────────────────────────────────────────┘
```

每个 Application 包含:
- **ApplicationMaster(AM)**:第一个容器,负责向 RM 申请资源、与 NM 通信启停 Task。Spark 的 `Driver` / Flink 的 `JobManager` 都在 AM 中运行。
- **Container(执行容器)**:实际跑 Executor / TaskManager 的进程。

### 2.1 与 K8s Pod 的类比

YARN Container ≈ K8s Pod,都是调度单元。但 K8s 多了 namespace、Service、ConfigMap 这些一等公民抽象,且 Pod 内可以多个 container(共享网络卷)。2024 年后很多大厂把 YARN 迁到 K8s,**调度器对比是面试常考题**:

| 维度 | YARN | K8s + YuniKorn/Kube-Scheduler |
| --- | --- | --- |
| 资源抽象 | Container | Pod + Request/Limit |
| 调度器 | Capacity/Fair Scheduler | Default / YuniKorn / Volcano |
| 多租户 | 队列树 | Namespace + ResourceQuota |
| 队列动态扩缩 | 静态 | HPA / VPA / CronHPA |
| 与存储耦合 | HDFS | CSI / Object Storage |

---

## 3. 核心 RPC 协议

### 3.1 ApplicationClientProtocol(AM ↔ RM)
- `submitApplication`, `getApplicationReport`, `finishApplicationMaster`

### 3.2 ApplicationMasterProtocol(AM ↔ RM)
- `registerApplicationMaster`, `allocate(List[ResourceRequest], List<ContainerId])`, `finishApplicationMaster`

### 3.3 ContainerManagementProtocol(AM ↔ NM)
- `startContainer`, `stopContainer`, `getContainerStatus`

### 3.4 ResourceTrackerProtocol(NM ↔ RM)
- `registerNodeManager`, `nodeHeartbeat`, `unRegisterNodeManager`

源码:`hadoop-yarn-common/src/main/proto/yarn_protos.proto`,所有 RPC 都基于 protobuf。

### 3.5 RPC 客户端

- `org.apache.hadoop.yarn.api.impl.pb.client.ResourceManagerPBClientImpl` — RM 客户端封装。
- `org.apache.hadoop.yarn.client.api.AMRMClient` — AM ↔ RM 高级封装,Spark 的 `YarnSchedulerBackend` 用它。
- `org.apache.hadoop.yarn.client.api.NMClient` — AM ↔ NM 启动容器。

---

## 4. RM 内部结构

### 4.1 三大组件
- **Scheduler**:资源调度核心,接收 `ApplicationMaster#allocate` 调用,从 `SchedulerNode` 列表里挑合适的 Container。
- **ApplicationsManager(ASM)**:Application 生命周期管理。
- **ResourceTrackerService**:NM 心跳处理,每 3s 收一次 `nodeHeartbeat`,把 NM 上报的资源使用写回 `SchedulerNode`。
- **RMAppManager**:Application 状态机(`NEW → SUBMITTED → ACCEPTED → RUNNING → FINISHED`)。

### 4.2 Scheduler 关键类
- `org.apache.hadoop.yarn.server.resourcemanager.scheduler.AbstractScheduler`
- `org.apache.hadoop.yarn.server.resourcemanager.scheduler.capacity.CapacityScheduler`
- `org.apache.hadoop.yarn.server.resourcemanager.scheduler.fair.FairScheduler`

### 4.3 状态机源码
源码:`RMAppImpl#RmAppTransitionedEvent`,核心 transitions:

```
NEW → RMAppEventType.START → SUBMITTED
SUBMITTED → AppAddedSchedulerEvent → ACCEPTED
ACCEPTED → AppAttemptAddedSchedulerEvent → RUNNING(AM 已注册)
RUNNING → RMAppEventType.KILL / FINISH → FINISHING → FINISHED / FAILED / KILLED
```

---

## 5. Container 分配全链路

```
                  ┌──────────────────────────────────────────┐
                  │              ApplicationMaster           │
                  │     Spark Driver / Flink JobManager       │
                  └──────────────┬───────────────────────────┘
                                 │ RPC: allocate(List<ResourceRequest>)
                                 ▼
       ┌──────────────────────────────────────────────────────┐
       │        ResourceManager.Scheduler.allocate()          │
       │                                                      │
       │  1. 校验 AM 配额 (queue capacity)                     │
       │  2. 遍历 ResourceRequest,匹配节点(NodeManager)        │
       │  3. 按 Locality 排序: NODE_LOCAL > RACK_LOCAL > ANY  │
       │  4. 占用 Container,写到 SchedulerNode               │
       │  5. 返回 AllocateResponse(List<Container>)          │
       └─────────────────────┬────────────────────────────────┘
                             ▼
       ┌──────────────────────────────────────────────────────┐
       │       ApplicationMaster 接收到 Container            │
       │       RPC: startContainer(NMToken, Container, cmd)   │
       └─────────────────────┬────────────────────────────────┘
                             ▼
                  ┌──────────────────────────┐
                  │   NodeManager.ContainersLauncher  │
                  │   Container 进程 fork + exec        │
                  └──────────────────────────┘
```

### 5.1 ResourceRequest 关键字段

```protobuf
message ResourceRequest {
  optional Priority priority = 1;
  optional string resource_name = 2;   // "*"=any, "/rack1"=rack, "host1"=node
  optional Resource capability = 3;    // memory + vcore
  optional int32 num_containers = 4;
  optional bool relax_locality = 5;
}
```

### 5.2 调度器选节点算法

源码:`AbstractScheduler#nodeLocalAssignments` → `CapacityScheduler#tryAssignNodeLocalContainers`

```
for each Node in cluster:
   for each pending ResourceRequest:
        if (rr.resource_name == node.getNodeName())
            assign container to this node
        else if (rr.resource_name == "*")
            assign to ANY node (fallback)
```

### 5.3 Spark / Flink 在 YARN 上的"注册 AM"

Spark 代码片段(`YarnSchedulerBackend#start`):

```scala
val amClient = AMRMClientAsync.createAMRMClientAsync[ContainerRequest]()
amClient.init(conf)
amClient.start()
amClient.registerApplicationMaster(driverHost, driverPort, trackingUrl)
// 每 1s 调一次 allocate,问 RM 要 Container
import scala.collection.JavaConverters._
amClient.addContainerRequest(containerReq.asJava)
```

---

## 6. Capacity Scheduler

### 6.1 队列树模型

```
                       root
                        │
        ┌───────────────┼────────────────┐
        │               │                │
      prod            dev              test (容量 10%)
   (容量 60%)       (容量 30%)            │
        │                                │
   ┌────┴─────┐                  ┌──────┴──────┐
   │          │                  │             │
 prod_etl  prod_olap          test_a/b     test_visualization
```

### 6.2 关键配置

`capacity-scheduler.xml`:

```xml
<property>
  <name>yarn.scheduler.capacity.root.queues</name>
  <value>prod,dev,test</value>
</property>
<property>
  <name>yarn.scheduler.capacity.root.prod.capacity</name>
  <value>60</value>
</property>
<property>
  <name>yarn.scheduler.capacity.root.prod.maximum-capacity</name>
  <value>80</value>
</property>
<property>
  <name>yarn.scheduler.capacity.root.prod.user-limit-factor</name>
  <value>1.5</value>  <!-- 单用户可用队列资源的 1.5 倍 -->
</property>
<property>
  <name>yarn.scheduler.capacity.resource-calculator</name>
  <value>org.apache.hadoop.yarn.util.resource.DominantResourceCalculator</value>
</property>
<property>
  <name>yarn.scheduler.capacity.node-locality-delay</name>
  <value>40</value>  <!-- 节点本地性等待心跳数 -->
</property>
```

### 6.3 资源计算器

- `DefaultResourceCalculator`:只看 memory。
- `DominantResourceCalculator`:memory + vcore 的"主导份额"。生产推荐后者。

### 6.4 队列动态管理

```bash
# 添加队列
yarn rmadmin -addQueue "root.prod.prod_ai"
# 修改队列容量
yarn rmadmin -updateQueueCapacity root.prod.prod_ai 30
# 注意:必须先在 capacity-scheduler.xml 中预声明,否则 addQueue 失败
```

---

## 7. Fair Scheduler

### 7.1 与 Capacity 的关键差异

| 维度 | Capacity Scheduler | Fair Scheduler |
| --- | --- | --- |
| 资源分配 | 队列容量上限 | 公平份额动态分配 |
| 多用户 | 按 user-limit-factor | 按 minShare/preemption |
| 抢占 | 仅队列间抢占 | 可抢占超额队列的容器 |
| 调度延迟 | 批量分配 | 增量分配(更平滑) |
| 适用场景 | 多租户硬隔离 | 共享集群弹性 |

### 7.2 关键配置

`fair-scheduler.xml`:

```xml
<allocations>
  <queue name="prod">
    <weight>2.0</weight>
    <minResources>100 gb, 50 vcores</minResources>
  </queue>
  <queue name="dev">
    <weight>1.0</weight>
  </queue>
  <queue name="interactive">
    <weight>4.0</weight>
    <minSharePreemptionTimeout>60s</minSharePreemptionTimeout>
  </queue>
  <defaultQueueSchedulingPolicy>fair</defaultQueueSchedulingPolicy>
</allocations>
```

源码:`org.apache.hadoop.yarn.server.resourcemanager.scheduler.fair.FairScheduler#attemptScheduling`,分配逻辑核心:
- 计算每个 queue 的 `fairShare`(理想份额)。
- 优先给低于 `fairShare` 的 queue 分配。
- 同 queue 内按 fair 算法平均。

### 7.3 FairScheduler 的"两阶段调度"

源码:`FairScheduler#attemptAllocation` 简化:
1. **Sort queues by deficit**: `deficit = fairShare - currentUsage`,deficit 大的优先分配。
2. **Compute steady fair shares**: 用加权最大最小算法(WMM),满足各队列权重。
3. **Allocate from underutilized queue to overutilized queue** 的容器。

---

## 8. Container 与 FIFO Container

### 8.1 Container 概念

Container = (resource, token, env, cmd) 四元组,本质是一个进程容器,由 `DefaultContainerExecutor` 或 `LinuxContainerExecutor` 启动。

```protobuf
message Container {
  optional ContainerId id = 1;
  optional Resource resource = 2;
  optional Priority priority = 3;
  optional string nodeId = 4;
  optional string nodeHttpAddress = 5;
}
```

### 8.2 FIFO Container(顺序分配)

源码:`CapacityScheduler#tryFifoAssignment`(FIFO 模式):

```scala
// 1. 取队列下 ApplicationMasterList 中第一个 app
// 2. 顺序满足其 ResourceRequest
// 3. 不考虑 locality 权重,先到先得
```

**为什么有 FIFO?** 在小集群(≤ 50 节点)且 Application 数少时,FIFO 简单可控;大集群(>500 节点)会带来"长作业饿死短作业"问题,所以生产几乎不用。

### 8.3 Container Token 安全

`ContainerTokenIdentifier` 由 RM 用 master key 签名,NM 校验后才启动 Container,防止其他租户"伪造"。

源码:`ContainerToken#decode`,过程:
1. RM 用 `ContainerTokenSecretManager` 生成 token,签名:HMAC-SHA1(masterKey, containerId+resource+timestamp)。
2. AM 拿 token 后用 NM token 提交 startContainer RPC。
3. NM 用同一 masterKey 验证 token,合法才启动。

生产配置:`yarn.resourcemanager.container-tokens.master-key-rolling-interval-seconds=86400` (24h 滚动一次)。

### 8.4 LinuxContainerExecutor 与 cgroup

源码:`LinuxContainerExecutor#launchContainer`,关键步骤:
1. 用 setuid 切换到提交用户(避免 root 启动用户进程)。
2. 写入 cgroup:`/sys/fs/cgroup/cpu/yarn/$containerId/cpu.cfs_quota_us = cores * 100000`。
3. fork 子进程执行 `LocalScriptsRunner`,启动用户命令。

生产配置:

```xml
<property>
  <name>yarn.nodemanager.container-executor.class</name>
  <value>org.apache.hadoop.yarn.server.nodemanager.LinuxContainerExecutor</value>
</property>
<property>
  <name>yarn.nodemanager.linux-container-executor.resources-handler.class</name>
  <value>org.apache.hadoop.yarn.server.nodemanager.util.CgroupsLCEResourcesHandler</value>
</property>
<property>
  <name>yarn.nodemanager.linux-container-executor.cgroups.hierarchy</name>
  <value>/sys/fs/cgroup/cpu,yarn</value>
</property>
```

---

## 9. 抢占(Preemption)

### 9.1 Capacity Scheduler 抢占

源码:`CapacityScheduler#preempt`,触发条件:
- queue 使用量 < guaranteed capacity,且持续 `yarn.scheduler.capacity.preemption.monitor-interval-ms=3000` 没改善。
- RM 找出超额队列的容器,优先抢占最近启动的。

### 9.2 Fair Scheduler 抢占

更激进,支持 **逐出 + 公平抢占**:
- `fairSharePreemptionTimeout`(默认 60s):低于 fair share 这么久开始抢占。
- `minSharePreemptionTimeout`:低于 min share 这么久立刻抢占。

### 9.3 抢占的副作用

- 容器被 kill 后,AM 重新申请,任务可能从头跑(Flink checkpoint 可以恢复)。
- 集群 CPU/IO 抖动,生产建议:**非紧急情况关闭抢占**,用 quota + reservation 解决。

### 9.4 ReservationSystem

```xml
<property>
  <name>yarn.resourcemanager.reservation-system.enable</name>
  <value>true</value>
</property>
```

- 用户可以"预约"未来的容量,适合 SLA 高的作业。
- 提交方式:`yarn rmadmin -addReservation` 或通过 `ReservationSubmissionPBClientImpl`。

---

## 10. NodeManager 关键源码

源码:`org.apache.hadoop.yarn.server.nodemanager.NodeManager`

```
NodeManager 启动:
   ├─ NodeResourceMonitor(检测磁盘/CPU)
   ├─ NodeHealthChecker(磁盘空间 < yarn.nodemanager.disk-health-checker.min-healthy-disks = 25% → UNHEALTHY)
   ├─ ContainerManagerImpl(接收 AM 启停 Container 请求)
   ├─ NodeStatusUpdater(向 RM 发心跳)
   ├─ ShuffleService(mapreduce_shuffle/spark_shuffle 辅助服务)
   └─ WebServer(NM Web UI: http://nm-host:8042)
```

### 10.1 ContainerExecutor 启动 Container 流程

```
ContainerManagerImpl#startContainer:
   ├─ 校验 token(NMToken)
   ├─ 检查本地化目录(yarn.nodemanager.local-dirs)
   ├─ 写入 Container 目录: <local-dir>/nm-local-dir/usercache/$user/appcache/$appId/container_$cid/
   │    ├─ launch_container.sh
   │    ├─ container.pid
   │    └─ container_tokens
   ├─ ContainerExecutor.launchContainer 真正 fork 进程
   └─ Container 进程 stdout/stderr 重定向到 <log-dir>/$userlogs/$appId/$cid/{stdout,stderr}
```

### 10.2 本地化目录与磁盘健康

```xml
<property>
  <name>yarn.nodemanager.local-dirs</name>
  <value>/data1/yarn/nm-local-dir,/data2/yarn/nm-local-dir</value>
</property>
<property>
  <name>yarn.nodemanager.log-dirs</name>
  <value>/data1/yarn/userlogs,/data2/yarn/userlogs</value>
</property>
<property>
  <name>yarn.nodemanager.disk-health-checker.enable</name>
  <value>true</value>
</property>
<property>
  <name>yarn.nodemanager.disk-health-checker.min-healthy-disks</name>
  <value>0.25</value>
</property>
```

---

## 11. Container 实战参数

`yarn-site.xml`:

```xml
<!-- NodeManager 资源 -->
<property>
  <name>yarn.nodemanager.resource.memory-mb</name>
  <value>65536</value>  <!-- 64 GB -->
</property>
<property>
  <name>yarn.nodemanager.resource.cpu-vcores</name>
  <value>32</value>
</property>
<property>
  <name>yarn.nodemanager.resource.detect-hardware-capabilities</name>
  <value>true</value>
</property>

<!-- Scheduler 配置 -->
<property>
  <name>yarn.scheduler.maximum-allocation-mb</name>
  <value>16384</value>  <!-- 单 container 最大内存 -->
</property>
<property>
  <name>yarn.scheduler.maximum-allocation-vcores</name>
  <value>8</value>
</property>

<!-- Container Executor -->
<property>
  <name>yarn.nodemanager.container-executor.class</name>
  <value>org.apache.hadoop.yarn.server.nodemanager.LinuxContainerExecutor</value>
</property>

<!-- Shuffle Service -->
<property>
  <name>yarn.nodemanager.aux-services</name>
  <value>mapreduce_shuffle,spark_shuffle</value>
</property>
<property>
  <name>yarn.nodemanager.aux-services.spark_shuffle.class</name>
  <value>org.apache.spark.network.yarn.YarnShuffleService</value>
</property>

<!-- Log Aggregation -->
<property>
  <name>yarn.log-aggregation-enable</name>
  <value>true</value>
</property>
<property>
  <name>yarn.nodemanager.remote-app-log-dir</name>
  <value>/tmp/logs</value>
</property>

<!-- RM HA -->
<property>
  <name>yarn.resourcemanager.ha.enabled</name>
  <value>true</value>
</property>
<property>
  <name>yarn.resourcemanager.ha.rm-ids</name>
  <value>rm1,rm2</value>
</property>
<property>
  <name>yarn.resourcemanager.zk-address</name>
  <value>zk1:2181,zk2:2181,zk3:2181</value>
</property>
```

---

## 12. 生产实战任务

### 12.1 任务一:Spark on YARN 部署

```bash
# code/spark/spark-on-yarn.sh
spark-submit \
  --master yarn \
  --deploy-mode cluster \
  --name "WordCount-Yarn" \
  --queue prod \
  --num-executors 50 \
  --executor-memory 8g \
  --executor-cores 4 \
  --conf spark.yarn.maxAppAttempts=2 \
  --conf spark.task.maxFailures=4 \
  --conf spark.yarn.driver.memoryOverhead=2g \
  --conf spark.yarn.executor.memoryOverhead=3g \
  --class com.bigdata.tutorial.SparkWordCount \
  hdfs:///apps/spark-wordcount.jar \
  hdfs:///data/input hdfs:///data/output
```

### 12.2 任务二:队列资源限制

```bash
# 查看队列使用
yarn queue -status prod
# 限制用户使用
yarn rmadmin -addToUserQueueMappings user1:prod,user2:dev
# 限制用户最大 AM 数
yarn rmadmin -addToUserAclMappings user1:max_apps=10
```

### 12.3 任务三:YARN 抢占演练

```bash
# 1. 在 prod 队列跑大作业(占用全部资源)
spark-submit --queue prod --num-executors 200 ...

# 2. 在 interactive 队列跑小作业
spark-submit --queue interactive --num-executors 10 ...

# 3. 观察 interactive 队列启动慢,等到 60s 后开始抢占
# YARN RM UI: http://rm-host:8088/cluster/scheduler
```

### 12.4 任务四:Container Token 调试

```bash
# 抓取 NM 上某个 Container 启动失败的日志
yarn logs -applicationId application_xxx_yyy -log_files stderr
# 常见报错: InvalidTokenException - 多半是 NM 未同步 RM master key
# 解决: yarn rmadmin -refreshSuperUserGroupsConfiguration
```

### 12.5 任务五:Spark Dynamic Allocation on YARN

```bash
# 1. 启用外部 Shuffle Service
# yarn-site.xml:
# yarn.nodemanager.aux-services.spark_shuffle.class=org.apache.spark.network.yarn.YarnShuffleService
#
# 2. spark-submit 开启动态分配
spark-submit \
  --master yarn \
  --conf spark.dynamicAllocation.enabled=true \
  --conf spark.shuffle.service.enabled=true \
  --conf spark.dynamicAllocation.minExecutors=2 \
  --conf spark.dynamicAllocation.maxExecutors=100 \
  --conf spark.dynamicAllocation.initialExecutors=10 \
  --conf spark.dynamicAllocation.executorIdleTimeout=60s \
  --conf spark.dynamicAllocation.schedulerBacklogTimeout=10s \
  ...
```

**核心原理**:Spark AM 检测到任务积压时,调 `YarnSchedulerBackend#requestTotalExecutors` 增加 Executor;空闲超 `executorIdleTimeout` 后回收。

### 12.6 任务六:Fair Scheduler 抢占调优

```xml
<!-- fair-scheduler.xml -->
<allocations>
  <queue name="interactive">
    <weight>4.0</weight>
    <minResources>10 gb, 4 vcores</minResources>
    <minSharePreemptionTimeout>10s</minSharePreemptionTimeout>
    <fairSharePreemptionTimeout>30s</fairSharePreemptionTimeout>
  </queue>
  <queue name="batch">
    <weight>1.0</weight>
    <schedulingPolicy>fifo</schedulingPolicy>
  </queue>
</allocations>
```

核心点:`interactive` 队列触发抢占后,batch 队列的容器被 SIGTERM,Spark Executor 收到 `killed by YARN` 异常,Driver 自动重申请。

### 12.7 任务七:RM HA 部署

```bash
# 1. 启动 ZK
zkServer.sh start

# 2. 在 RM 节点初始化 ZooKeeper 状态
yarn rmadmin -formatZK -force

# 3. 在两台 RM 上分别启动
yarn-daemon.sh start resourcemanager

# 4. 验证 HA 状态
yarn rmadmin -getServiceState rm1
# 输出: ACTIVE / STANDBY
yarn rmadmin -transitionToStandby rm1
yarn rmadmin -transitionToActive rm2
```

---

## 13. 专家面试题

1. **RM 在 YARN 中的角色,为什么不直接由 NM 调度?**
   *要点*:全局视角。NM 只看到本机资源,RM 看到全集群资源;集中调度可以做队列配额、抢占、DRF。
2. **ApplicationMaster 失败,YARN 怎么处理?**
   *要点*:RM 通过 `SchedulerApplicationAttempt` 跟踪 AM 状态,AM 失败次数超 `yarn.resourcemanager.am.max-attempts` 后整个 Application 失败。
3. **Container 是线程还是进程?**
   *要点*:是进程。`DefaultContainerExecutor` fork 子进程跑命令,`LinuxContainerExecutor` 用 cgroup 隔离资源。
4. **FIFO Container 在生产中为什么不推荐?**
   *要点*:小作业被大作业饿死,延迟不可控;生产都用 Fair/Capacity。
5. **Capacity Scheduler 的 user-limit-factor 是干嘛的?**
   *要点*:单用户在队列内最多可用的资源倍数。默认 1(只能占队列份额),调到 2 允许"超级用户"。
6. **Fair Scheduler 的 preempt 怎么避免误杀?**
   *要点*:`minSharePreemptionTimeout` 默认 60s,低于 min share 这么久才触发;而且优先抢最近启动的容器,降低任务损失。
7. **Container Token 为什么必须由 RM 签发?**
   *要点*:防止租户间的越权访问;只有 RM 拥有 masterKey,NM 持副本,验证后启动 Container。
8. **YARN 节点心跳 3s 一次,会有什么副作用?**
   *要点*:网络抖动 → NM 假死 → AM 申请容器失败 → 任务延迟。生产可以调成 1s,但 RM 心跳处理压力上升。
9. **Spark on YARN 的 cluster 模式和 client 模式,AM 各跑在哪?**
   *要点*:cluster 模式 AM 在 NM 容器中跑 Driver,client 模式 AM 在提交机器跑 Driver。生产推荐 cluster 模式,client 模式适合调试。
10. **YARN 抢占和 Kubernetes preemption 的区别?**
    *要点*:YARN 抢占是 RM 主动 kill 容器,Task 重新申请;K8s 是 kube-scheduler 在调度阶段拒绝优先级低的 Pod。
11. **DRF 调度器是什么?**
    *要点*:Dominant Resource Fairness,多资源类型(memory + vcore)同时调度时,按主导资源分配,Google 论文《Dominant Resource Fairness: Fair Allocation of Multiple Resource Types》提出。
12. **NM 资源上报不准会带来什么后果?**
    *要点*:RM 分配超过 NM 实际容量,Container 启动失败;建议开启 `yarn.nodemanager.resource.detect-hardware-capabilities=true`,自动探测 cgroup 限制。
13. **YARN 上线故障排查顺序?**
    *要点*:1) RM UI 看 application 状态;2) 看 NM log(SSH 到节点);3) `yarn logs -applicationId` 抓用户日志;4) `jstack` 锁住 RM 线程栈;5) `jmap -heap` 看 JVM 堆。
14. **YARN Container 与 K8s Pod 的本质区别?**
    *要点*:K8s Pod 是"逻辑主机",可以多容器共享网络卷;YARN Container 是单进程。K8s 的解耦(调度+存储+网络)在云原生场景更灵活。
15. **ReservationSystem 适合什么场景?**
    *要点*:SLA 严格的批作业(凌晨跑 ETL,必须 6 点前完成),可以提前一周预约资源。

---

## 14. 一张图回顾 YARN 核心流程

```
  Client              RM               NM                AM
    │                 │                 │                  │
    │ submitApplication                 │                  │
    ├────────────────►│                 │                  │
    │                 │ allocate       │                  │
    │                 │   AM Container  │                  │
    │                 ├────────────────►│ startContainer  │
    │                 │                 ├─────────────────►│
    │                 │                 │                  │ run Driver
    │                 │                 │                  │
    │                 │   allocate       │   startContainer │
    │                 │◄────────────────┼─────────────────┤
    │                 ├────────────────►│                  │
    │                 │                 │                  │
    │                 │   nodeHeartbeat  │                  │
    │                 │◄────────────────┤                  │
```

---

## 15. 小结与下一章预告

- YARN 是 **大数据资源的"操作系统"**,所有引擎(Spark/Flink/MapReduce/Tez)都跑在它之上。
- **生产调优 80% 的精力在 YARN 层**:队列配额、Container 大小、抢占策略。
- 深入理解 cgroup、token 安全、preempt 算法、RM HA,是面试和故障排查的硬通货。
- **下一章 [03-Spark 核心原理]** 进入 Spark 的内部:DAGScheduler / TaskScheduler / SchedulerBackend 三层调度、RDD 五要素、Stage 切分、Shuffle 流程、BlockManager。