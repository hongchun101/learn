# 05 · Spark on K8s Operator 原理

> **本章定位**:讲透 Spark on Kubernetes 的 Operator 模式——Google Spark Operator(原生)、Spark Operator(社区)、Cluster Mode vs Client Mode、Dynamic Allocation。
>
> **版本基线**:Spark **3.5.x** + Kubernetes **1.28+**。
>
> **学习时长**:建议 8 学时(理论 2 + 源码 3 + 实战 3)。

---

## 1. Spark on K8s 的两条路线

Spark 在 K8s 上运行,有两种主要路径:

```
┌─────────────────────────────────────────────────────────────────┐
│                  Spark on K8s 两种路线                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  路线 1:spark-submit 原生支持(Spark 2.3+)                       │
│  ─────────────────────────────────────────                      │
│   spark-submit \                                               │
│     --master k8s://https://k8s-api:443 \                       │
│     --deploy-mode cluster \                                    │
│     --conf spark.executor.instances=10 \                        │
│     --conf spark.kubernetes.container.image=spark:3.5 \        │
│     local:///path/to/app.jar                                    │
│                                                                 │
│   流程:                                                         │
│   spark-submit → K8s API Server → 创建 Driver Pod              │
│   Driver Pod 内部 → 创建 Executor Pods                           │
│   Job 结束 → Pod 清理                                            │
│                                                                 │
│  路线 2:Kubernetes Operator(Spark Operator / GCP Operator)     │
│  ─────────────────────────────────────────                      │
│   kubectl apply -f spark-app.yaml                              │
│                                                                 │
│   apiVersion: sparkoperator.k8s.io/v1beta2                      │
│   kind: SparkApplication                                        │
│   spec:                                                         │
│     driver: {...}                                               │
│     executor: {...}                                             │
│                                                                 │
│   流程:                                                         │
│   Operator Controller 监听 CRD                                  │
│   → 提交 spark-submit 到 Pod                                    │
│   → 监控 Driver / Executor 状态                                  │
│   → 完成清理                                                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**对比**:

| 维度 | 原生 spark-submit | Spark Operator |
| --- | --- | --- |
| **接口** | spark-submit CLI | kubectl apply CRD |
| **生命周期管理** | 无(JOB 失败靠人工) | Operator 持续 reconcile |
| **依赖** | 无 | 需部署 Operator |
| **生产推荐** | 测试 / 临时任务 | 生产标准 |
| **告警** | 需自己接 | CRD Status 自动暴露 |

---

## 2. 原生 spark-submit on K8s(Cluster Mode)

### 2.1 部署模式对比

```
┌──────────────────┬─────────────────────────────────────────────┐
│   Client Mode    │   spark-submit 在本地启动 Driver             │
│   (传统 YARN)    │   Driver 与 Executor 在 K8s Pod 中通信       │
│                  │   Driver 退出 = Job 失败                    │
├──────────────────┼─────────────────────────────────────────────┤
│   Cluster Mode   │   spark-submit 只创建 Driver Pod             │
│   (K8s 推荐)     │   Driver 在 Pod 内运行                      │
│                  │   Driver 退出 = Pod 退出 = Job 结束          │
│                  │   客户端不需要保持连接                        │
└──────────────────┴─────────────────────────────────────────────┘
```

### 2.2 Cluster Mode 工作流程

```
1. spark-submit 启动 (本地)
   │
   ├── 调用 K8s API Server (REST)
   │   提交 SparkApplication (Spark 内部 CRD)
   │   或直接通过 SparkK8sSchedulerBackend 创建 Driver Pod
   │
   ▼
2. K8s Scheduler 调度 Driver Pod
   │
   ▼
3. Driver Pod 启动
   ├── Spark Driver 进程启动
   ├── Driver 与 K8s API Server 通信
   ├── 请求创建 Executor Pods (spark.executor.instances 个)
   │
   ▼
4. Executor Pods 创建并启动
   ├── Executor 注册到 Driver
   ├── Driver 调度 Task
   ├── Executor 执行 Task
   │
   ▼
5. Job 完成
   ├── Executor Pods 退出
   ├── Driver Pod 退出
   └── spark-submit 收到退出码
```

### 2.3 实战 spark-submit

```bash
spark-submit \
  --master k8s://https://k8s-api.example.com:6443 \
  --deploy-mode cluster \
  --name spark-pi \
  --class org.apache.spark.examples.SparkPi \
  --conf spark.executor.instances=5 \
  --conf spark.executor.memory=4g \
  --conf spark.executor.cores=2 \
  --conf spark.driver.memory=2g \
  --conf spark.kubernetes.container.image=apache/spark:3.5.1 \
  --conf spark.kubernetes.authenticate.driver.serviceAccountName=spark \
  --conf spark.kubernetes.namespace=spark-jobs \
  --conf spark.kubernetes.driver.pod.name=spark-pi-driver \
  --conf spark.kubernetes.executor.podNamePrefix=spark-pi-exec \
  local:///opt/spark/examples/jars/spark-examples_2.13-3.5.1.jar \
  1000
```

**关键参数**:
- `--master k8s://...`:使用 K8s 作为集群管理器。
- `--deploy-mode cluster`:Driver 在 Pod 内运行。
- `spark.kubernetes.container.image`:Executor 镜像。
- `spark.kubernetes.namespace`:命名空间。
- `spark.kubernetes.authenticate.driver.serviceAccountName`:Driver 用 SA 鉴权。

### 2.4 源码类(Spark 原生 K8s 集成)

```
spark/
├── resource-managers/
│   ├── kubernetes/
│   │   └── src/main/scala/org/apache/spark/deploy/k8s/
│   │       ├── SparkKubernetesClientFactory.scala
│   │       ├── submit/
│   │       │   ├── KubernetesClientApplication.scala
│   │       │   └── MainAppResource.scala
│   │       └── submitsteps/
│   │           └── ...
│   └── yarn/
│       └── ...
```

**核心类**:
- `KubernetesClientApplication`(Cluster Mode 入口)
- `SparkKubernetesClientFactory`(K8s 客户端工厂)
- `DriverPodSpec`(Driver Pod 规格构造)
- `ExecutorPodSpec`(Executor Pod 规格构造)
- `KubernetesClusterSchedulerBackend`(Driver 与 K8s 交互核心)

---

## 3. Google Spark Operator(社区版本)

> **注意**:Google 在 2020 年停止维护 Google Spark Operator,后来由 [kubeflow/spark-operator](https://github.com/kubeflow/spark-operator) 继续维护,现称 **Spark Operator**(Kubeflow)。

### 3.1 CRD 定义

```yaml
apiVersion: sparkoperator.k8s.io/v1beta2
kind: SparkApplication
metadata:
  name: spark-pi
  namespace: spark-jobs
spec:
  type: Scala
  mode: cluster
  image: "apache/spark:3.5.1"
  imagePullPolicy: Always
  mainClass: org.apache.spark.examples.SparkPi
  mainApplicationFile: "local:///opt/spark/examples/jars/spark-examples_2.13-3.5.1.jar"
  arguments:
    - "1000"
  
  sparkVersion: "3.5.1"
  restartPolicy:
    type: OnFailure
    onFailureRetries: 3
    onFailureRetryInterval: 10
    onSubmissionFailureRetries: 5
    onSubmissionFailureRetryInterval: 10
  
  driver:
    cores: 1
    coreLimit: "1200m"
    memory: "2g"
    serviceAccount: spark
    labels:
      version: "3.5.1"
    env:
      - name: SPARK_DRIVER_LOG4J
        value: "log4j.rootCategory=INFO,console"
  
  executor:
    cores: 2
    instances: 5
    memory: "4g"
    labels:
      version: "3.5.1"
    javaOptions: "-XX:+UseG1GC"
  
  monitoring:
    metrics:
      properties:
        metrics.properties: |
          *.sink.prometheusServlet.class=org.apache.spark.metrics.sink.PrometheusServlet
          *.sink.prometheusServlet.path=/metrics
          master.sink.prometheusServlet.path=/metrics
          applications.sink.prometheusServlet.path=/metrics
      prometheus:
        port: 9090
```

### 3.2 Operator 工作流程

```
┌────────────────────────────────────────────────────────────────────┐
│                Spark Operator 工作流程                              │
│                                                                     │
│  kubectl apply -f spark-app.yaml                                    │
│       │                                                             │
│       ▼                                                             │
│  SparkApplication CR 创建                                           │
│       │                                                             │
│       ▼                                                             │
│  SparkApplicationController 收到 Reconcile 请求                    │
│       │                                                             │
│       ├── 检查 SparkApplication 状态                                │
│       ├── 如果 SubmittingState/SubmittedState                       │
│       │   → 调用 spark-submit 启动 Driver Pod                      │
│       │                                                             │
│       ├── 如果 RunningState                                         │
│       │   → 监控 Driver/Executor Pods 状态                          │
│       │                                                             │
│       ├── 如果 FailedState/SucceededState                            │
│       │   → 清理 Pods(可选保留)                                    │
│       │   → 更新 Status                                              │
│       │                                                             │
│       ▼                                                             │
│  CR.Status 字段更新(供 kubectl describe 查询)                      │
└────────────────────────────────────────────────────────────────────┘
```

### 3.3 关键源码类(Spark Operator)

```
spark-operator/
├── main.go                                  # Operator 入口
├── internal/
│   └── controller/
│       └── sparkapplication/
│           ├── sparkapplication_controller.go  # 主 Controller
│           ├── spark_driver.go                 # Driver 提交
│           ├── spark_executor.go               # Executor 状态
│           └── spark_monitor.go                # 健康检查
├── api/
│   └── v1beta2/
│       └── sparkapplication_types.go          # CRD 类型定义
```

**核心类**:
- `SparkApplicationController`:Controller 入口,负责 Reconcile。
- `SparkDriver`:封装 spark-submit。
- `submissionState`:`Submittable/SkipSubmission/SubmittedState/RunningState`。

### 3.4 安装 Spark Operator

```bash
# Helm 安装
helm install spark-operator spark-operator/spark-operator \
  --namespace spark-operator \
  --create-namespace \
  --set webhook.enable=true \
  --set metrics.enable=true

# 验证
kubectl get crd | grep spark

# 提交 SparkApplication
kubectl apply -f spark-app.yaml
kubectl describe sparkapplication spark-pi -n spark-jobs
kubectl logs -f spark-pi-driver -n spark-jobs
```

---

## 4. GCP Spark Operator(原 Google,现已归档)

> **GCP 仍在使用,但 Spark Operator(社区版)更主流**。本章简单介绍。

GCP 提供商业版 Spark on K8s 方案([GCP Dataproc on GKE](https://cloud.google.com/dataproc/docs/concepts/jobs/spark-on-k8s)),与 Spark Operator 接口相似,但额外集成了 GCS、Sentinel、IAM 等。

**核心差异**:
- 自动注入 GCS 凭证。
- 与 GCP Monitoring 集成。
- 支持 **Spark History Server 自动部署**。
- **Regional Persistent Disk**(比社区版多 PV 性能)。

---

## 5. Cluster Mode vs Client Mode 深度对比

### 5.1 架构差异

```
Client Mode(传统 YARN,本地):
┌────────────────────────────────────────────────────┐
│  本地机器                                            │
│  ┌─────────────────────────────────────────────┐   │
│  │ spark-submit (启动 Driver 在本地)            │   │
│  │  └─ Spark Driver (主进程)                    │   │
│  │      └─ 与远端 Executors RPC                 │   │
│  └─────────────────────────────────────────────┘   │
│                                                    │
│  K8s Cluster                                        │
│  ┌──────────────┐ ┌──────────────┐                 │
│  │ Executor Pod │ │ Executor Pod │                 │
│  │ (Spark       │ │ (Spark       │                 │
│  │  Executor)   │ │  Executor)   │                 │
│  └──────────────┘ └──────────────┘                 │
└────────────────────────────────────────────────────┘
  问题:本地机器和 Cluster 网络断开 → Job 失败

Cluster Mode(K8s 推荐):
┌────────────────────────────────────────────────────┐
│  本地机器:spark-submit → 只创建 Driver Pod          │
│                                                    │
│  K8s Cluster                                        │
│  ┌──────────────┐                                  │
│  │ Driver Pod    │                                  │
│  │ ┌──────────┐ │                                  │
│  │ │ Spark    │ │   创建 Executor Pods              │
│  │ │ Driver   │ ├──────▶ ┌──────────────┐          │
│  │ └──────────┘ │       │ Executor Pod │          │
│  └──────────────┘       │  (Spark      │          │
│                          │   Executor)  │          │
│                          └──────────────┘          │
└────────────────────────────────────────────────────┘
  优势:本地断开不影响 Job
```

### 5.2 选型决策

| 维度 | Client Mode | Cluster Mode |
| --- | --- | --- |
| **适用** | 本地调试、IDE 开发 | 生产作业、CI/CD |
| **Driver 位置** | 本地进程 | K8s Pod |
| **网络要求** | 本地到 K8s 稳定 | 集群内自洽 |
| **故障恢复** | 无(Driver 挂则 Job 失败) | K8s 自动重启 Driver(需配置) |
| **日志查看** | 本地 stdout | kubectl logs |
| **监控接入** | 需手动配 | Operator 自动配 |

**生产建议**:永远用 **Cluster Mode**。

---

## 6. Dynamic Allocation on K8s

### 6.1 静态 vs 动态分配

```
静态分配(默认):
   spark.executor.instances=10   ← 固定 10 个 Executor
   整个 Job 周期都是 10 个

动态分配(Dynamic Allocation):
   初始 0 个 Executor
   有 Task 排队 → 创建 Executor(上限 spark.dynamicAllocation.maxExecutors)
   Executor 空闲 → 回收 Executor(下限 spark.dynamicAllocation.minExecutors)
```

**配置**:
```properties
spark.dynamicAllocation.enabled=true
spark.dynamicAllocation.minExecutors=2
spark.dynamicAllocation.maxExecutors=20
spark.dynamicAllocation.initialExecutors=5
spark.dynamicAllocation.executorIdleTimeout=60s
spark.dynamicAllocation.schedulerBacklogTimeout=1s
spark.dynamicAllocation.sustainedSchedulerBacklogTimeout=5s
```

### 6.2 External Shuffle Service

Dynamic Allocation 需要 **External Shuffle Service**(ESS),因为回收的 Executor 数据需要保留供后续 Task 读取。

```
┌──────────────────────────────────────────────────────────┐
│   K8s 上的 Spark ESS 架构                                  │
│                                                           │
│   Driver Pod                                               │
│   ├── Driver 进程                                          │
│   └── External Shuffle Service 进程(CoarseGrainedExecutorBackend 内部的 Shuffle Service) │
│                                                           │
│   Executor Pod 1 (临时)                                    │
│   ├── Executor 进程                                        │
│   └── Shuffle 数据写本地 SSD → Driver ESS 缓存?            │
│                                                           │
│   关键:K8s 上 ESS 通常和 Driver 同 Pod                     │
└──────────────────────────────────────────────────────────┘
```

**关键源码**:`org.apache.spark.network.shuffle.ExternalShuffleBlockResolver`,`org.apache.spark.deploy.ExternalShuffleService`。

### 6.3 K8s 特有的 ESS 配置

```properties
# spark-submit
--conf spark.shuffle.service.enabled=true
--conf spark.kubernetes.driver.pod.featureSteps=org.apache.spark.deploy.k8s.features.LocalDiskShuffleCleanerFeatureStep
```

**LocalDiskShuffleCleaner**:Driver Pod 退出时,自动清理 Shuffle 数据,避免占用 PV。

---

## 7. 大数据 on K8s 实战:Spark Iceberg Pipeline

### 7.1 场景描述

每天凌晨 2 点,跑一个 Spark Job:
1. 读取 MySQL 订单表 → 写入 Iceberg `ods.orders`(CDC 增量)
2. Join 用户表 → 写入 Iceberg `dwd.user_orders`
3. 聚合 → 写入 Iceberg `dws.daily_orders`

### 7.2 SparkApplication YAML

```yaml
apiVersion: sparkoperator.k8s.io/v1beta2
kind: ScheduledSparkApplication
metadata:
  name: iceberg-etl-daily
  namespace: spark-jobs
spec:
  schedule: "0 2 * * *"
  concurrencyPolicy: Forbid
  successfulRunHistoryLimit: 3
  failedRunHistoryLimit: 3
  template:
    type: Scala
    mode: cluster
    image: "my-registry/spark-iceberg:3.5.1"
    imagePullPolicy: IfNotPresent
    mainClass: com.company.etl.DailyETL
    mainApplicationFile: "local:///opt/spark/jars/etl-job.jar"
    
    sparkVersion: "3.5.1"
    restartPolicy:
      type: OnFailure
      onFailureRetries: 2
    
    driver:
      cores: 2
      coreLimit: "2400m"
      memory: "4g"
      serviceAccount: spark
      labels:
        app: iceberg-etl
    
    executor:
      cores: 4
      instances: 10
      memory: "16g"
      labels:
        app: iceberg-etl
    
    deps:
      packages:
        - org.apache.iceberg:iceberg-spark-runtime-3.5_2.13:1.5.0
        - mysql:mysql-connector-java:8.0.33
        - org.apache.spark:spark-sql-kafka-0-10_2.13:3.5.1
    
    conf:
      spark.sql.extensions: "org.apache.iceberg.spark.extensions.IcebergSparkSessionExtensions"
      spark.sql.catalog.iceberg: "org.apache.iceberg.spark.SparkCatalog"
      spark.sql.catalog.iceberg.type: "hadoop"
      spark.sql.catalog.iceberg.warehouse: "s3a://my-bucket/iceberg/"
      spark.hadoop.fs.s3a.endpoint: "https://s3.amazonaws.com"
      spark.hadoop.fs.s3a.access.key: "${AWS_ACCESS_KEY_ID}"
      spark.hadoop.fs.s3a.secret.key: "${AWS_SECRET_ACCESS_KEY}"
      spark.dynamicAllocation.enabled: "true"
      spark.dynamicAllocation.maxExecutors: "50"
      spark.shuffle.service.enabled: "true"
```

### 7.3 监听与告警

```bash
# 查看运行状态
kubectl get sparkapplication iceberg-etl-daily -n spark-jobs

# 查看历史
kubectl get sparkapplication -l app=iceberg-etl -n spark-jobs

# 监控指标
# Prometheus 抓取 Spark Operator Metrics
# http://spark-operator:8080/metrics
```

**Prometheus 抓取**:
```yaml
scrape_configs:
  - job_name: spark-operator
    kubernetes_sd_configs:
      - role: service
    relabel_configs:
      - source_labels: [__meta_kubernetes_service_label_app]
        regex: spark-operator
        action: keep
```

---

## 8. 关键源码类索引

| 组件 | 项目 | 核心类 |
| --- | --- | --- |
| **Spark 原生 K8s** | spark/kubernetes | `KubernetesClientApplication.scala` |
| Spark K8s Scheduler | spark/kubernetes | `KubernetesClusterSchedulerBackend.scala` |
| Spark K8s Driver Pod | spark/kubernetes | `DriverPodSpec.scala` |
| Spark K8s Executor Pod | spark/kubernetes | `ExecutorPodSpec.scala` |
| **Spark Operator** | spark-operator | `sparkapplication_controller.go` |
| SparkApplication CRD | spark-operator/api | `sparkapplication_types.go` |
| Spark Driver | spark/core | `SparkSubmit.scala` |
| Spark Dynamic Allocation | spark/core | `DynamicAllocation.scala` |
| External Shuffle Service | spark/network | `ExternalShuffleService.scala` |

**源码阅读路线**:
1. `KubernetesClientApplication.start` → `client.createDriverPod` → `K8s API`
2. `DriverPodSpec` 解析 conf → 构造 Pod Spec → API 提交
3. `sparkapplication_controller.Reconcile` → `submitSparkApplication` → spark-submit

---

## 9. 生产配置基线

### 9.1 ServiceAccount(Operator 必装)

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: spark
  namespace: spark-jobs
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: spark-role
  namespace: spark-jobs
rules:
- apiGroups: [""]
  resources: ["pods", "services", "configmaps", "persistentvolumeclaims"]
  verbs: ["get", "list", "watch", "create", "delete"]
- apiGroups: ["sparkoperator.k8s.io"]
  resources: ["sparkapplications"]
  verbs: ["get", "list", "watch", "create", "delete", "patch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: spark-rolebinding
  namespace: spark-jobs
subjects:
- kind: ServiceAccount
  name: spark
  namespace: spark-jobs
roleRef:
  kind: Role
  name: spark-role
  apiGroup: rbac.authorization.k8s.io
```

### 9.2 Spark 关键配置

```properties
# Spark 3.5 on K8s 基线
spark.master=k8s://https://k8s-api:6443
spark.deploy.mode=cluster

# Driver
spark.driver.cores=2
spark.driver.memory=4g
spark.kubernetes.driver.limit.cores=2

# Executor
spark.executor.instances=10           # 初始值,Dynamic Allocation 时可设 0
spark.executor.cores=4
spark.executor.memory=16g
spark.kubernetes.executor.limit.cores=4

# 镜像
spark.kubernetes.container.image=my-registry/spark:3.5.1
spark.kubernetes.container.image.pullPolicy=Always

# 鉴权
spark.kubernetes.authenticate.driver.serviceAccountName=spark
spark.kubernetes.namespace=spark-jobs

# Shuffle
spark.shuffle.service.enabled=true     # Dynamic Allocation 需要
spark.kubernetes.shuffle.namespace=spark-jobs

# 动态分配
spark.dynamicAllocation.enabled=true
spark.dynamicAllocation.minExecutors=2
spark.dynamicAllocation.maxExecutors=50
spark.dynamicAllocation.executorIdleTimeout=60s
spark.dynamicAllocation.schedulerBacklogTimeout=1s

# 监控
spark.metrics.conf=/opt/spark/conf/metrics.properties
spark.ui.prometheus.enabled=true

# 网络
spark.kubernetes.driver.podTemplateFile=/opt/spark/conf/driver-pod-template.yaml
spark.kubernetes.executor.podTemplateFile=/opt/spark/conf/executor-pod-template.yaml
```

### 9.3 Driver Pod Template

```yaml
# driver-pod-template.yaml
spec:
  nodeSelector:
    workload-class: compute
  affinity:
    podAntiAffinity:
      preferredDuringSchedulingIgnoredDuringExecution:
      - weight: 100
        podAffinityTerm:
          labelSelector:
            matchLabels:
              spark-role: driver
          topologyKey: kubernetes.io/hostname
  tolerations:
  - key: dedicated
    operator: Equal
    value: spark
    effect: NoSchedule
  containers:
  - name: spark-kubernetes-driver
    env:
    - name: JAVA_OPTS
      value: "-XX:+UseG1GC -XX:MaxGCPauseMillis=200"
    resources:
      requests:
        cpu: "1"
        memory: "2Gi"
      limits:
        cpu: "2"
        memory: "4Gi"
```

---

## 10. 专家面试题

> **Q1**:**Spark Operator 和原生 spark-submit 在 K8s 上有什么本质区别?**
>
> **参考答案**:
> - **spark-submit**:客户端进程调用 K8s API 创建 Driver Pod,Job 周期由客户端负责(spark-submit 退出 = Job 结束)。
> - **Operator**:声明式 CRD,Controller 持续 reconcile,Job 状态写入 CR 的 `.status` 字段。
> - **Operator 优势**:与 K8s 生态深度集成(告警、监控、CI/CD);失败自动重试;提交历史可查。
> - **spark-submit 优势**:无额外组件依赖,轻量。
> - **生产推荐**:用 Operator,CI/CD 中提交 `kubectl apply`。

> **Q2**:**Dynamic Allocation 在 K8s 上有什么坑?**
>
> **参考答案**:
> 1. **External Shuffle Service 必须开启**,否则回收的 Executor 丢失 Shuffle 数据。
> 2. **Local PV/Shuffle 数据残留**:Executor Pod 关闭后,EmptyDir 会清空,但 PV 数据需要显式清理(`LocalDiskShuffleCleanerFeatureStep`)。
> 3. **External Shuffle Service 带宽瓶颈**:ESS 与 Executor 在 K8s 内需要高带宽。
> 4. **不适合超短作业**(< 5 min):Dynamic Allocation 本身有调度延迟,得不偿失。
> 5. **缓存(RDD/DataFrame cache)**:cache 在 Executor 上,回收会丢,需调高 `cachedExecutorIdleTimeout`。

> **Q3**:**为什么生产上 Spark on K8s 普遍用 Operator,而不用 spark-submit?**
>
> **参考答案**:
> 1. **可观测**:CR 的 Status 字段直接暴露 `submitState / applicationState / lastSubmissionAttemptTime`,配合 `kubectl describe` 可视化。
> 2. **故障恢复**:Operator 监听 Pod 状态,Pod 被 K8s 驱逐(节点故障)时自动重新提交。
> 3. **批量管理**:一个 Operator 管 100 个 SparkApplication CR,无需逐个 spark-submit。
> 4. **权限模型**:ServiceAccount + RBAC 比 spark-submit 的 kubeconfig 文件安全。
> 5. **依赖管理**:SparkApplication 的 deps/packages 字段与镜像分离,无需重建镜像。

> **Q4**:**Spark Iceberg Job on K8s,数据倾斜怎么调优?**
>
> **参考答案**:
> 1. **数据倾斜检测**:Spark UI / Ganglia 监控 Stage 耗时,看各 Task 耗时方差。
> 2. **倾斜 Join 优化**:`--conf spark.sql.adaptive.enabled=true`,开启 AQE(Auto Query Execution),自动拆分倾斜 Partition。
> 3. **手动拆分**:`spark.sql.adaptive.skewJoin.skewedPartitionFactor=10`(超过均值 10 倍视为倾斜),`skewedPartitionThresholdInBytes=256MB`。
> 4. **Broadcast Join**:`spark.sql.autoBroadcastJoinThreshold=10485760`(10MB,小表直接广播)。
> 5. **Iceberg 隐藏分区**:`partitioned by days(event_time)`,按时间分片避免热分区。
> 6. **资源隔离**:用 Dynamic Allocation,倾斜 Stage 临时扩容 Executor。

> **Q5**:**Spark Operator 与 Airflow / Argo Workflows 怎么配合?**
>
> **参考答案**:
> - **Airflow**:`SparkKubernetesOperator` 提交 SparkApplication CR,Airflow 监听 CR Status 判断成功/失败。
> - **Argo Workflows**:`Submit SparkApplication`(Argo Steps 提交 SparkApplication CR,Argo 等待 Pod 完成)。
> - **DolphinScheduler**:DolphinScheduler 的 `Spark` 任务类型支持 K8s 模式,内部调用 spark-submit 或 Operator API。
> - **生产建议**:Airflow/Argo 负责 DAG 编排,Spark Operator 负责 Spark 作业生命周期。**职责分层**。

---

## 11. 生产实战清单

- [ ] **Step 1:本地部署 Spark Operator** — Helm 安装 `spark-operator/spark-operator`,验证 CRD 注册。
- [ ] **Step 2:SparkApplication 部署** — 提交 Pi 示例,验证 Driver/Executor Pod 创建、Job 完成、清理。
- [ ] **Step 3:ScheduledSparkApplication** — 提交定时作业,验证 Cron 调度。
- [ ] **Step 4:Dynamic Allocation 验证** — 提交 Shuffle 多的作业,观察 Executor 数量随 Stage 变化。
- [ ] **Step 5:Iceberg Pipeline 跑通** — 端到端测试 MySQL → Iceberg ETL,验证 S3 写入成功。
- [ ] **Step 6:故障演练** — kill Driver Pod,观察 Operator 自动重新提交。
- [ ] **Step 7:监控接入** — Spark Operator Metrics + Prometheus + Grafana,出看板。
- [ ] **Step 8:与 Airflow 集成** — 用 Airflow SparkKubernetesOperator 触发 SparkApplication。
- [ ] **Step 9:权限调优** — 配置最小权限 ServiceAccount,验证 Operator 仅能管指定 Namespace。
- [ ] **Step 10:大规模压测** — 100 个并发 SparkApplication,验证 Operator 调度性能。

**完成标志**:能在 30 分钟内通过 YAML 提交一个生产可用的 Spark Iceberg 作业,并能用 kubectl describe 看到完整状态。

---

## 12. 一句话总结

> **Spark Operator 是 Spark on K8s 的"生产级胶水",它把"声明式 API"理念带入 Spark 作业生命周期管理。** 本质上是把 spark-submit 的"一次性命令"变成 K8s 原生的"持续 reconcile",让大数据作业与云原生生态深度集成。

---

**下一章预告**:**[06-Flink on K8s / Native K8s](./06-flink-k8s.md)** —— Flink Native Kubernetes、Session vs Application Mode、HA、自定义 Resource。