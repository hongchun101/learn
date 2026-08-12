# 06 · Flink on K8s / Native Kubernetes

> **本章定位**:讲透 Flink 在 Kubernetes 上的部署——Native Kubernetes Integration、Session vs Application Mode、HA 机制、自定义 Resource、Flink Operator。
>
> **版本基线**:Flink **1.18+** + Kubernetes **1.28+**。
>
> **学习时长**:建议 8 学时(理论 2 + 源码 3 + 实战 3)。

---

## 1. Flink on K8s 的演进

```
┌──────────────────────────────────────────────────────────────────┐
│                    Flink on K8s 演进路线                          │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  阶段 1:Standalone Cluster(早期)                                 │
│  ─────────────────────────────                                   │
│   kubectl apply Flink JobManager + TaskManager Deployment       │
│   手动管理集群生命周期                                            │
│   问题:不能自动扩缩、需手动重启 Job                               │
│                                                                  │
│  阶段 2:Native Kubernetes(Flink 1.10+,推荐)                    │
│  ─────────────────────────────────                               │
│   flink run-application --target kubernetes-application         │
│   Flink 自己管理 K8s 资源(Cluster Client 直连 API Server)        │
│   Job 完成 → 自动清理                                            │
│                                                                  │
│  阶段 3:Flink Kubernetes Operator(Ververica / 阿里)             │
│  ──────────────────────────────────────────                      │
│   kubectl apply -f FlinkDeployment CRD                          │
│   Operator 持续 reconcile                                        │
│   支持 savepoint 调度、状态自动恢复                              │
│   生产标准                                                       │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 2. Native Kubernetes 架构

### 2.1 组件拓扑

```
┌────────────────────────────────────── Flink on K8s (Native) ──────┐
│                                                                      │
│  ┌─────────────── Client (flink run) ──────────────────┐            │
│  │   flink run-application \                              │            │
│  │     --target kubernetes-application \                 │            │
│  │     --class MyJob                                     │            │
│  │     local:///opt/flink/jobs/my-job.jar                │            │
│  └────────────────────────────────────────────────────────┘            │
│        │                                                              │
│        │ 调用 K8s API Server                                          │
│        ▼                                                              │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │                  K8s Cluster                                  │    │
│  │                                                               │    │
│  │   ┌──────────────────────────────────────────────┐           │    │
│  │   │ JobManager Pod (1 个)                         │           │    │
│  │   │ ┌──────────────────────────────────────────┐ │           │    │
│  │   │ │  Flink JobManager (Cluster Master)        │ │           │    │
│  │   │ │   - 接收 Job Graph                       │ │           │    │
│  │   │ │   - Scheduler                            │ │           │    │
│  │   │ │   - Checkpoint 协调                       │ │           │    │
│  │   │ └──────────────────────────────────────────┘ │           │    │
│  │   │ 高可用: JobManager 挂时,K8s 重新拉起(Job 状态丢)  │          │    │
│  │   └──────────────────────────────────────────────┘           │    │
│  │                                                               │    │
│  │   ┌──────────────────────────────────────────────┐           │    │
│  │   │ TaskManager Pods (N 个)                       │           │    │
│  │   │ ┌────────────────┐ ┌────────────────┐        │           │    │
│  │   │ │ TM-1 (Slot=4) │ │ TM-2 (Slot=4) │ ...     │           │    │
│  │   │ │  Task 执行     │ │  Task 执行    │        │           │    │
│  │   │ │  State 后端    │ │  State 后端   │        │           │    │
│  │   │ └────────────────┘ └────────────────┘        │           │    │
│  │   │ Reactive 模式:TM 空闲自动 kill                │           │    │
│  │   └──────────────────────────────────────────────┘           │    │
│  │                                                               │    │
│  │   ┌──────────── Checkpoint/Savepoint ────────────┐           │    │
│  │   │   S3 / HDFS / OSS / NFS(外部持久化)         │           │    │
│  │   └────────────────────────────────────────────┘           │    │
│  └──────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────────┘
```

### 2.2 关键源码类(Native K8s)

```
flink-runtime/
├── src/main/java/org/apache/flink/client/deployment/
│   └── application/
│       └── ApplicationDispatcherBootstrap.java   # Client 端
└── src/main/java/org/apache/flink/kubernetes/    # K8s 集成核心
    ├── KubernetesResourceManagerDriver.java      # Resource Manager Driver
    ├── KubeClientFactory.java                    # K8s Client 工厂
    ├── KubernetesClusterDescriptor.java          # Cluster 描述
    ├── deployment/
    │   ├── K8sJobManagerFactory.java             # 创建 JM Pod
    │   └── K8sTaskManagerFactory.java            # 创建 TM Pods
    ├── taskmanager/
    │   └── KubernetesTaskManagerRunner.java
    ├── jobmanager/
    │   └── KubernetesJobManagerRunner.java
    └── utils/
        ├── KubernetesUtils.java
        └── ...
```

**核心类**:
- `KubernetesResourceManagerDriver`:Driver 端,管理 K8s 资源。
- `KubernetesClusterDescriptor`:描述 Flink Cluster。
- `KubernetesStandaloneClusterDescriptor`:创建 standalone 模式集群。

---

## 3. Session vs Application Mode

### 3.1 三大部署模式对比

```
┌─────────────────────────────────────────────────────────────────────┐
│          Session Mode(共享集群)                                       │
│  ─────────────────────────                                           │
│                                                                      │
│  flink-session.sh &                                                 │
│     启动 1 个 JM Cluster(常驻)                                       │
│     启动 N 个 TM Pods(常驻)                                         │
│                                                                      │
│  Client → 提交 Job → JM 分配 Slot                                    │
│                                                                      │
│  多 Job 共享 TM Slots                                                │
│                                                                      │
├─────────────────────────────────────────────────────────────────────┤
│          Application Mode(推荐,Job 独享 JM)                          │
│  ─────────────────────────────────────                               │
│                                                                      │
│  flink run-application \                                            │
│    --target kubernetes-application                                  │
│                                                                      │
│  每个 Job 一个 JM (专享)                                             │
│  TMs 按 Job 启动(按需)                                              │
│                                                                      │
│  main() 在 Client 端执行 → 创建 JM Pod → 在 JM Pod 内 main()        │
│  → 启动 TM Pods                                                     │
│                                                                      │
├─────────────────────────────────────────────────────────────────────┤
│          Per-Job Mode(已废弃,1.18+ 不推荐)                           │
│  ─────────────────────────────────────                               │
│  兼容老版本,与 Application 类似,但 main() 在 Client 端               │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 模式对比表

| 维度 | Session | Application |
| --- | --- | --- |
| **JM 启动** | 预先启动(集群常驻) | Job 提交时启动 |
| **TM 启动** | 预先启动(N 个常驻) | Job 提交时按需启动 |
| **资源隔离** | 弱(JM/TM 多 Job 共享) | 强(独享 JM + 独立 TM) |
| **资源利用率** | 中(集群空转) | 高(按需) |
| **Job 启动速度** | 快(无需启动 JM) | 慢(30~60s 启动 JM) |
| **故障域** | 大(JM 挂影响所有 Job) | 小(JM 挂影响当前 Job) |
| **适用场景** | 开发调试、多 Job 并行 | 生产标准 |
| **生产推荐** | ❌ 不推荐 | ✅ 强烈推荐 |

### 3.3 实战命令对比

**Session Mode**:
```bash
# 1. 启动 Session Cluster
kubectl apply -f flink-session-cluster.yaml
# 或 kubectl apply -f https://raw.githubusercontent.com/apache/flink/master/flink-kubernetes/src/main/resources/flink-session-cluster.yaml

# 2. 提交 Job
kubectl port-forward svc/flink-session-cluster 8081:8081 &

flink run \
  --class com.example.MyJob \
  --target kubernetes-session \
  --detached \
  local:///opt/flink/jobs/my-job.jar
```

**Application Mode**:
```bash
# 直接提交,K8s 自动创建 JM + TM
flink run-application \
  --target kubernetes-application \
  --class com.example.MyJob \
  -Dkubernetes.cluster-id=my-job-cluster \
  -Dtaskmanager.numberOfTaskSlots=4 \
  -Dkubernetes.taskmanager.cpu=2 \
  -Dkubernetes.taskmanager.memory=8g \
  -Dkubernetes.namespace=flink-jobs \
  -Dkubernetes.container.image=my-registry/flink:1.18 \
  local:///opt/flink/jobs/my-job.jar
```

---

## 4. Native K8s 配置详解

### 4.1 JM/TM Pod Spec

```yaml
# flink-configuration-configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: flink-config
  namespace: flink-jobs
data:
  flink-conf.yaml: |
    jobmanager.rpc.address: localhost
    jobmanager.rpc.port: 6123
    jobmanager.memory.process.size: 4096m
    
    taskmanager.memory.process.size: 8192m
    taskmanager.numberOfTaskSlots: 4
    
    # K8s 配置
    kubernetes.namespace: flink-jobs
    kubernetes.cluster-id: my-job-cluster
    kubernetes.service-account: flink
    
    # HA(ZK 或 Kubernetes-native)
    high-availability: org.apache.flink.kubernetes.highavailability.KubernetesHaServicesFactory
    high-availability.storageDir: s3://my-bucket/flink-ha/
    
    # Checkpoint
    state.backend: rocksdb
    state.checkpoints.dir: s3://my-bucket/flink-checkpoints/
    state.savepoints.dir: s3://my-bucket/flink-savepoints/
    execution.checkpointing.interval: 60s
    
    # 日志
    kubernetes.log.dir: /opt/flink/log
```

### 4.2 ServiceAccount + RBAC

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: flink
  namespace: flink-jobs
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: flink-role
  namespace: flink-jobs
rules:
- apiGroups: [""]
  resources: ["pods", "services", "configmaps", "events"]
  verbs: ["get", "list", "watch", "create", "delete", "patch"]
- apiGroups: ["apps"]
  resources: ["deployments"]
  verbs: ["get", "list", "watch", "create", "delete", "patch"]
- apiGroups: ["coordination.k8s.io"]
  resources: ["leases"]
  verbs: ["get", "list", "watch", "create", "delete", "patch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: flink-rolebinding
  namespace: flink-jobs
subjects:
- kind: ServiceAccount
  name: flink
  namespace: flink-jobs
roleRef:
  kind: Role
  name: flink-role
  apiGroup: rbac.authorization.k8s.io
```

### 4.3 Pod Template(自定义 JM/TM)

```yaml
# jobmanager-pod-template.yaml
spec:
  containers:
  - name: jobmanager
    env:
    - name: JVM_ARGS
      value: "-XX:+UseG1GC -XX:MaxGCPauseMillis=200"
    resources:
      requests:
        cpu: "1"
        memory: "2Gi"
      limits:
        cpu: "2"
        memory: "4Gi"
    volumeMounts:
    - name: flink-config-volume
      mountPath: /opt/flink/conf
  volumes:
  - name: flink-config-volume
    configMap:
      name: flink-config

# taskmanager-pod-template.yaml 类似
spec:
  containers:
  - name: taskmanager
    resources:
      requests:
        cpu: "2"
        memory: "4Gi"
      limits:
        cpu: "4"
        memory: "8Gi"
```

---

## 5. HA 机制

### 5.1 两种 HA 方案

```
方案 1:ZooKeeper HA(传统,Flink 1.x 推荐)
┌────────────────────────────────────────────────┐
│   ZK Ensemble (3 节点)                          │
│   ├── /flink/default/leader/latch (JM leader) │
│   ├── /flink/default/jobgraphs/ (Job Graph)    │
│   └── /flink/default/checkpoints/              │
│                                                  │
│   JM 1 (主) ──┐                                  │
│   JM 2 (备) ──┤ 选举 (ZK)                       │
│   TM 1        │                                  │
│   TM 2 ──────┘                                  │
└────────────────────────────────────────────────┘

方案 2:Kubernetes-native HA(Flink 1.13+,推荐)
┌────────────────────────────────────────────────┐
│   K8s ConfigMap(集群元数据)                      │
│   ├── "leader" key: 当前活跃 JM Pod 名          │
│                                                  │
│   K8s Lease(协调,coordination.k8s.io)            │
│   ├── Lease 对象: JM leader 选举                │
│   ├── 30s TTL,每 10s 更新                       │
│   └── 适合 2~10 JM                              │
│                                                  │
│   Storage Dir(存储 Job State,必须外部持久化)     │
│   ├── S3/OSS/NFS                                │
│   └── JobGraphs / CompletedCheckpoints          │
│                                                  │
│   JM 1 (主) ──┐                                  │
│   JM 2 (备) ──┤ Lease 选举                      │
│   TM Pods ────┘                                  │
└────────────────────────────────────────────────┘
```

### 5.2 K8s-native HA 关键源码

```
flink-kubernetes/
├── src/main/java/org/apache/flink/kubernetes/highavailability/
│   ├── KubernetesHaServicesFactory.java
│   ├── KubernetesLeaderElectionDriver.java       # 基于 Lease
│   ├── KubernetesStateStore.java                  # 基于 ConfigMap
│   └── KubernetesRunningJobsRegistry.java
```

**核心类**:
- `KubernetesLeaderElectionDriver`:基于 `coordination.k8s.io/v1` Lease。
- `KubernetesStateStore`:基于 ConfigMap 持久化 JobGraph。
- `KubernetesRunningJobsRegistry`:维护运行中 Job 列表。

### 5.3 HA 配置

```yaml
# flink-conf.yaml
high-availability: org.apache.flink.kubernetes.highavailability.KubernetesHaServicesFactory
high-availability.storageDir: s3://my-bucket/flink-ha/
high-availability.cluster-id: my-job-cluster

# 启动两个 JM(可选)
-Dkubernetes.jobmanager.replicas=2

# 生产:2 个 JM,1 主 1 备,故障自动切换 < 30s
```

---

## 6. Reactive Mode / 自适应资源

### 6.1 Reactive Mode

```
Flink 1.13+ 引入,**自动响应 K8s 资源变化**。
当 TaskManager Pod 被 K8s 驱逐(资源紧张),Flink 自动:
   1. 标记 Slot 为不可用
   2. 重新调度失败 Task
   3. 申请新 TM Pod(Reactive Scheduler)

关键配置:
   cluster.evenly-spread-out-slots: true
   kubernetes.taskmanager.allocate-slot-on-request: true
```

### 6.2 Adaptive Scheduler(实验,Flink 1.18+)

```
AdaptiveScheduler:
   - 自动根据数据量调整并行度
   - 不需要固定 Slot 数
   - 自动 Rebalance 倾斜

配置:
   scheduler-mode: adaptive

效果:
   - 小数据量 → 少 TM,节省资源
   - 大数据量 → 多 TM,扩展能力
   - 倾斜 → 自动 Rebalance
```

---

## 7. Flink Kubernetes Operator(Ververica / 阿里)

### 7.1 架构

```
┌───────────────────────────────────── Flink Operator ───────────────┐
│                                                                      │
│  kubectl apply -f flink-deployment.yaml                             │
│       │                                                              │
│       ▼                                                              │
│  FlinkDeployment CR 创建                                            │
│       │                                                              │
│       ▼                                                              │
│  FlinkDeploymentController 收到 Reconcile                            │
│       │                                                              │
│       ├── 创建 / 更新 JobManager Deployment                         │
│       ├── 创建 / 更新 TaskManager Deployment                        │
│       ├── 提交 Job(可选,spec.job.mode 决定)                        │
│       ├── 监控 Status(Flink REST API)                                │
│       │                                                              │
│       │   ┌─────────────────┐                                       │
│       │   │ Flink Cluster   │                                       │
│       │   │   JM Pod        │                                       │
│       │   │   TM Pods       │                                       │
│       │   │   Flink REST    │◀──── Reconcile 轮询                   │
│       │   └─────────────────┘                                       │
│       │                                                              │
│       └── 更新 CR.Status 字段                                        │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### 7.2 FlinkDeployment CRD

```yaml
apiVersion: flink.apache.org/v1beta1
kind: FlinkDeployment
metadata:
  name: basic-example
  namespace: flink-jobs
spec:
  image: my-registry/flink:1.18
  flinkVersion: v1_18
  ingress:
    domain: flink.example.com
  serviceAccount: flink
  jobManager:
    resource:
      memory: "2048m"
      cpu: 1
    replicas: 1   # 或 2(HA)
  taskManager:
    resource:
      memory: "4096m"
      cpu: 2
    replicas: 3
  job:
    jarURI: local:///opt/flink/jobs/my-job.jar
    parallelism: 4
    upgradeMode: stateless   # 或 savepoint(升级保留状态)
    state: running
    savepointTriggerNonce: 0
```

### 7.3 关键功能

**Savepoint 调度**:
```yaml
spec:
  job:
    upgradeMode: savepoint
    savepointTriggerNonce: 1   # 每次升级 +1,触发 Savepoint
```

**状态自动恢复**:
```yaml
spec:
  job:
    initialSavepointPath: s3://my-bucket/flink-savepoints/savepoint-abc123
```

**滚动升级**:
- Operator 触发 Savepoint → 停止 Job → 升级镜像 → 启动 → Restore
- 全自动,无需手动干预。

---

## 8. Flink SQL Gateway on K8s

### 8.1 架构

```
┌──────────────┐  ┌──────────────┐
│  Client      │  │  BI / Web    │
│ (JDBC/CLI)   │  │  (Superset)  │
└──────┬───────┘  └──────┬───────┘
       │                 │
       │ JDBC            │ REST
       ▼                 ▼
┌──────────────────────────────────┐
│   Flink SQL Gateway              │
│   (Deployment,无状态,可扩缩)     │
└──────────────┬───────────────────┘
               │ SQL → JobGraph
               ▼
┌──────────────────────────────────┐
│   Flink Session Cluster          │
│   (FlinkDeployment CR)           │
└──────────────────────────────────┘
```

### 8.2 部署

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: flink-sql-gateway
  namespace: flink-jobs
spec:
  replicas: 2
  selector:
    matchLabels:
      app: sql-gateway
  template:
    metadata:
      labels:
        app: sql-gateway
    spec:
      containers:
      - name: sql-gateway
        image: flink:1.18
        args: ["sql-gateway"]
        ports:
        - containerPort: 8083
        env:
        - name: FLINK_PROPERTIES
          value: |
            jobmanager.rpc.address: flink-jobmanager
            rest.address: flink-jobmanager
---
apiVersion: v1
kind: Service
metadata:
  name: flink-sql-gateway
spec:
  selector:
    app: sql-gateway
  ports:
  - port: 8083
    targetPort: 8083
```

---

## 9. 关键源码类索引

| 组件 | 项目 | 核心类 |
| --- | --- | --- |
| **Flink Native K8s** | flink-kubernetes | `KubernetesClusterDescriptor.java` |
| K8s RM Driver | flink-kubernetes | `KubernetesResourceManagerDriver.java` |
| JM Runner | flink-kubernetes | `KubernetesJobManagerRunner.java` |
| TM Runner | flink-kubernetes | `KubernetesTaskManagerRunner.java` |
| K8s HA | flink-kubernetes | `KubernetesLeaderElectionDriver.java` |
| **Flink Operator** | flink-kubernetes-operator | `FlinkDeploymentController.java` |
| FlinkDeployment CRD | flink-kubernetes-operator-api | `FlinkDeploymentSpec.java` |
| Savepoint | flink-runtime | `SavepointCoordinator.java` |
| Checkpoint | flink-runtime | `CheckpointCoordinator.java` |
| Adaptive Scheduler | flink-runtime | `AdaptiveScheduler.java` |

**源码阅读路线**:
1. `KubernetesClusterDescriptor.deployCluster` → 构造 JM/TM Pod → K8s API
2. `KubernetesResourceManagerDriver.onNewLeader` → 选举 Leader → Lease
3. `CheckpointCoordinator.triggerCheckpoint` → 协调 Checkpoint → 写 S3

---

## 10. 生产配置基线

### 10.1 flink-conf.yaml

```yaml
# 基础
parallelism.default: 4

# JobManager
jobmanager.memory.process.size: 4096m
jobmanager.memory.jvm-metaspace.size: 512m
jobmanager.rpc.address: localhost
jobmanager.rpc.port: 6123
jobmanager.web.port: 8081

# TaskManager
taskmanager.memory.process.size: 8192m
taskmanager.memory.task.heap.size: 4g
taskmanager.memory.network.min: 1g
taskmanager.memory.network.max: 1g
taskmanager.memory.managed.size: 512m
taskmanager.numberOfTaskSlots: 4
taskmanager.cpu.cores: 4.0

# State Backend
state.backend: rocksdb
state.checkpoints.dir: s3://my-bucket/flink-checkpoints/
state.savepoints.dir: s3://my-bucket/flink-savepoints/
state.backend.incremental: true
state.backend.local-recovery: true

# Checkpoint
execution.checkpointing.interval: 60s
execution.checkpointing.timeout: 10min
execution.checkpointing.min-pause: 30s
execution.checkpointing.max-concurrent-checkpoints: 1
execution.checkpointing.externalized-checkpoint-retention: RETAIN_ON_CANCELLATION

# Restart Strategy
restart-strategy: fixed-delay
restart-strategy.fixed-delay.attempts: 3
restart-strategy.fixed-delay.delay: 10s

# K8s HA
high-availability: org.apache.flink.kubernetes.highavailability.KubernetesHaServicesFactory
high-availability.storageDir: s3://my-bucket/flink-ha/

# 网络
taskmanager.network.netty.num-arenas: 4
taskmanager.network.netty.server.numThreads: 4
taskmanager.network.netty.client.numThreads: 4

# RocksDB
state.backend.rocksdb.localdir: /tmp/rocksdb

# Metrics
metrics.reporter.prom.factory.class: org.apache.flink.metrics.prometheus.PrometheusReporterFactory
metrics.reporter.prom.port: 9249
metrics.latency.interval: 5000
```

### 10.2 JobManager Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: flink-jobmanager
  namespace: flink-jobs
spec:
  replicas: 1
  selector:
    matchLabels:
      app: flink
      component: jobmanager
  template:
    metadata:
      labels:
        app: flink
        component: jobmanager
    spec:
      containers:
      - name: jobmanager
        image: my-registry/flink:1.18
        args:
        - jobmanager
        ports:
        - containerPort: 6123
          name: rpc
        - containerPort: 8081
          name: webui
        env:
        - name: FLINK_PROPERTIES
          valueFrom:
            configMapKeyRef:
              name: flink-config
              key: flink-conf.yaml
        resources:
          requests:
            cpu: "1"
            memory: "4Gi"
          limits:
            cpu: "2"
            memory: "4Gi"
        volumeMounts:
        - name: flink-config-volume
          mountPath: /opt/flink/conf
      volumes:
      - name: flink-config-volume
        configMap:
          name: flink-config
```

### 10.3 TaskManager Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: flink-taskmanager
  namespace: flink-jobs
spec:
  replicas: 3
  selector:
    matchLabels:
      app: flink
      component: taskmanager
  template:
    metadata:
      labels:
        app: flink
        component: taskmanager
    spec:
      containers:
      - name: taskmanager
        image: my-registry/flink:1.18
        args:
        - taskmanager
        ports:
        - containerPort: 6121
          name: rpc
        - containerPort: 6122
          name: data
        env:
        - name: FLINK_PROPERTIES
          valueFrom:
            configMapKeyRef:
              name: flink-config
              key: flink-conf.yaml
        resources:
          requests:
            cpu: "2"
            memory: "8Gi"
          limits:
            cpu: "4"
            memory: "8Gi"
```

---

## 11. 专家面试题

> **Q1**:**Session vs Application Mode 的本质区别?为什么生产推荐 Application?**
>
> **参考答案**:
> - **Session**:**集群先启动,Job 后提交**,多个 Job 共享 TM Slots。
> - **Application**:**Job 一开始,集群才启动**,每个 Job 独享 JM 和 TM。
> - **生产推荐 Application 的原因**:
>   1. **资源隔离**:一个 Job 的 bug/异常不会影响其他 Job。
>   2. **故障域小**:JM 故障只影响当前 Job,其他 Job 不受牵连。
>   3. **资源利用率高**:Job 完成后 TM 自动释放,不留常驻。
>   4. **CI/CD 友好**:Operator 每次升级重建 JM/TM,无历史状态污染。
> - **Session 唯一适用**:Flink SQL Gateway 多个用户并发查询(共享 TM 池)。

> **Q2**:**Flink on K8s 与 Flink on YARN 的对比?**
>
> **参考答案**:
> - **YARN**:Flink Cluster 常驻,Application Mode 难以做到(每次重建 Cluster),Session Mode 主流。
> - **K8s**:Application Mode 天然契合,JM/TM 每次任务都是新建 Pod。
> - **YARN 优势**:与 Hadoop 生态集成(MR、Spark、Hive);**YARN 痛点**:资源静态划分(队列)、Container 启动慢。
> - **K8s 优势**:Pod 启动快(秒级)、弹性扩缩、丰富 Operator;**K8s 痛点**:Stateful 工作负载管理复杂(Checkpoint 在 S3)。

> **Q3**:**Flink K8s-native HA 与 ZooKeeper HA 的对比?**
>
> **参考答案**:
> - **ZK HA**:基于 ZK 临时节点 + Watcher,运维额外组件(3/5 节点多数派)。
> - **K8s-native HA**:基于 Lease(coordination.k8s.io)+ ConfigMap,**无需额外组件**。
> - **K8s-native HA 限制**:
>   1. 必须配合外部持久化(S3/OSS)存 JobGraph,Pod 删除后数据不丢。
>   2. JM 选举有 10~30s 延迟(K8s Lease 30s TTL)。
>   3. 仅在 K8s 集群内有效(Job 不能跨集群迁移)。
> - **生产推荐**:K8s-native(更简单)。

> **Q4**:**Checkpoint 与 Savepoint 区别?**
>
> **参考答案**:
> - **Checkpoint**:**运行时自动触发**(Flink 自管),用于故障恢复,生命周期短。
> - **Savepoint**:**用户手动触发**(Flink Operator 调度),用于版本升级、状态备份,生命周期长。
> - **Checkpoint 格式**:`/flink-checkpoints/<job-id>/chk-<n>/`,依赖运行版本。
> - **Savepoint 格式**:`/flink-savepoints/savepoint-<uuid>/`,**可跨版本**恢复(但建议同版本)。
> - **生产建议**:升级时用 Savepoint 备份;运行用 Checkpoint 自愈。

> **Q5**:**Flink 作业在 K8s 上的"杀手级"优化是什么?**
>
> **参考答案**:
> 1. **本地 SSD State Backend**:`state.backend.rocksdb.localdir=/mnt/ssd`,RocksDB 在本地 SSD 上比网络卷(EBS)快 10 倍。
> 2. **Reactive Mode**:TM 被驱逐时,Flink 自动重调度,无需手动干预。
> 3. **Adaptive Scheduler**:根据数据量自动调整并行度。
> 4. **Operator Savepoint Upgrade**:升级时自动 Savepoint + Restore,无停机。
> 5. **细粒度资源**:在 K8s 上可以每个 TM 不同 CPU/Memory(Flink 1.18+),针对性优化。

---

## 12. 生产实战清单

- [ ] **Step 1:本地 K8s 部署 Flink** — 用 `kind` 或 `minikube` 跑单机 K8s,部署 Flink Native。
- [ ] **Step 2:Application Mode 测试** — `flink run-application --target kubernetes-application`,观察 JM/TM 自动创建与清理。
- [ ] **Step 3:Session Mode 测试** — 启动 Session Cluster,跑 2 个 Job 共享 TM Slots。
- [ ] **Step 4:HA 验证** — 2 个 JM,K8s-native HA,kill 主 JM,验证 30s 内备 JM 接管。
- [ ] **Step 5:Checkpoint 配置** — 配 S3,跑流式 WordCount,验证 Checkpoint 自动创建。
- [ ] **Step 6:Savepoint 演练** — 手动触发 Savepoint,kill Job,从 Savepoint 恢复。
- [ ] **Step 7:Flink Operator 部署** — 安装 Ververica Operator,提交 FlinkDeployment CR。
- [ ] **Step 8:Savepoint Upgrade** — 修改 SQL,触发 Savepoint + 升级镜像 + 状态恢复。
- [ ] **Step 9:Flink SQL Gateway** — 部署 SQL Gateway,用 JDBC 客户端连入。
- [ ] **Step 10:监控接入** — Prometheus + Grafana,Flink Dashboard 出图。

**完成标志**:能在 30 分钟内通过 Operator 提交一个生产级 Flink 流式作业,并能演示"Savepoint → 升级 → 恢复"流程。

---

## 13. 一句话总结

> **Flink on K8s 的本质,是把"集群管理"交给 K8s、把"Job 管理"交给 Flink Operator。** Operator 是连接 K8s 声明式 API 与 Flink 状态化作业的桥梁,生产环境的 Flink 作业几乎都应该跑在 K8s 上。

---

**下一章预告**:**[07-Airflow / DolphinScheduler 调度原理](./07-scheduler.md)** —— 有向无环图调度、Backfill、SLA、Sentry 告警。