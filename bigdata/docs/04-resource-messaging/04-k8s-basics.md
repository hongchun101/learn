# 04 · Kubernetes 基础与大数据 on K8s

> **本章定位**:从存算分离视角讲 Kubernetes 基础——Pod/Deployment/Service/ConfigMap、PV/PVC、Operator 模式,以及为什么 K8s 是大数据上云的事实标准。
>
> **版本基线**:Kubernetes **1.28+**(已稳定,生产推荐)。
>
> **学习时长**:建议 8 学时(理论 3 + 命令行 3 + 实战 2)。

---

## 1. 为什么大数据要上 Kubernetes?

传统大数据部署依赖 YARN/Mesos,本质是**静态资源池**——按队列划分机器,集群扩容/缩容周期长(以天/周计)。

Kubernetes 提供的范式是**应用视角的资源管理**:

```
YARN 视角(资源池):
┌──────────────────────────────────────────┐
│  Cluster (固定 100 台机器)                │
│   ├── Queue A (30 台)                    │
│   ├── Queue B (50 台)                    │
│   └── Queue Default (20 台)             │
│                                          │
│   Spark Job → 申请资源 → 排队 → 调度     │
│   YARN NodeManager 启动 Container        │
└──────────────────────────────────────────┘

K8s 视角(应用编排):
┌──────────────────────────────────────────┐
│  K8s Cluster (动态 100 ~ 1000 台)        │
│                                          │
│   SparkApplication CR → Operator 监听    │
│                                          │
│   Operator → 创建 Spark Driver Pod       │
│           → 创建 Executor Pods (按需)     │
│                                          │
│   Job 完成 → Pod 自动回收 → 资源释放       │
└──────────────────────────────────────────┘
```

**大数据上 K8s 的三大优势**:

| 维度 | YARN | K8s |
| --- | --- | --- |
| **资源利用率** | 60~70%(队列独占) | 80~90%(动态复用) |
| **扩容速度** | 节点级,小时~天 | Pod 级,秒~分钟 |
| **异构工作负载** | 不友好(队列隔离) | 友好(命名空间/资源标签) |
| **生态** | Hadoop 老牌 | 云原生标准(CI/CD/监控/弹性) |
| **学习曲线** | 低(Hadoop 工程师) | 中(需懂 K8s 概念) |

---

## 2. K8s 核心概念全景

### 2.1 架构总览

```
┌──────────────────────────────────── K8s Cluster ────────────────────────────────────┐
│                                                                                    │
│  ┌─────────────────────── Control Plane ───────────────────────┐                  │
│  │                                                              │                  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐     │                  │
│  │  │ kube-api │  │  etcd    │  │ scheduler│  │controller│     │                  │
│  │  │  server  │  │ (集群状态)│  │  (调度)   │  │ manager  │     │                  │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘     │                  │
│  │                                                              │                  │
│  └──────────────────────────────────────────────────────────────┘                  │
│                                                                                    │
│  ┌─────────────────────────── Worker Nodes ──────────────────────────┐              │
│  │                                                                    │              │
│  │  Node 1                │  Node 2                │  Node N         │              │
│  │  ┌─────────────────┐   │  ┌─────────────────┐  │  ┌──────────┐  │              │
│  │  │ kubelet         │   │  │ kubelet         │  │  │ kubelet  │  │              │
│  │  │ kube-proxy      │   │  │ kube-proxy      │  │  │ kube-proxy│ │              │
│  │  │ container      │   │  │ container      │  │  │container  │ │              │
│  │  │  runtime       │   │  │  runtime       │  │  │ runtime   │ │              │
│  │  └─────────────────┘   │  └─────────────────┘  │  └──────────┘  │              │
│  │       │                │       │                │                 │              │
│  │  ┌────▼────────────┐   │  ┌────▼────────────┐  │                  │              │
│  │  │  Pod (Spark    │   │  │  Pod (Spark     │  │                  │              │
│  │  │   Executor)    │   │  │   Executor)     │  │                  │              │
│  │  └─────────────────┘   │  └─────────────────┘  │                  │              │
│  │                                                                    │              │
│  └────────────────────────────────────────────────────────────────────┘              │
└────────────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 核心对象关系

```
┌────────────────────────────────────────────────────────────────┐
│                        K8s 对象层次                              │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  Namespace (逻辑隔离, e.g. spark, flink)                        │
│  │                                                             │
│  ├── Deployment (无状态应用, e.g. Spark History Server)        │
│  │   └── ReplicaSet (副本数)                                   │
│  │       └── Pod (调度单位)                                     │
│  │           ├── container (Spark Executor)                     │
│  │           ├── container (Sidecar, e.g. 日志采集)             │
│  │           ├── volume (挂载)                                  │
│  │           └── serviceAccount (权限)                          │
│  │                                                             │
│  ├── StatefulSet (有状态应用, e.g. Kafka Broker)                │
│  │   └── Pod (有序部署,稳定网络标识,持久卷)                      │
│  │                                                             │
│  ├── DaemonSet (节点级守护, e.g. 日志/监控 Agent)               │
│  │   └── Pod (每个节点一份)                                     │
│  │                                                             │
│  ├── Job (一次性任务, e.g. ETL)                                 │
│  │   └── Pod (跑完退出)                                         │
│  │                                                             │
│  ├── CronJob (定时任务)                                          │
│  │   └── Job                                                    │
│  │                                                             │
│  ├── Service (网络抽象)                                          │
│  │   ├── ClusterIP (集群内)                                     │
│  │   ├── NodePort (暴露端口)                                    │
│  │   ├── LoadBalancer (云厂商)                                  │
│  │   └── Headless (StatefulSet 用)                              │
│  │                                                             │
│  ├── ConfigMap (配置)                                            │
│  ├── Secret (密钥)                                              │
│  ├── PersistentVolumeClaim (存储申请)                            │
│  └── CustomResourceDefinition (CRD, 自定义资源, e.g. SparkApp)   │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

## 3. Pod / Deployment / Service

### 3.1 Pod —— 调度的最小单位

Pod 是 K8s 的"逻辑主机",**一个 Pod 可以包含多个 Container**(共享网络、存储、生命周期)。

```yaml
# 最简单的 Pod 定义
apiVersion: v1
kind: Pod
metadata:
  name: spark-executor-1
  namespace: spark-jobs
  labels:
    app: spark
    role: executor
spec:
  containers:
  - name: spark-executor
    image: apache/spark:3.5.1
    command: ["/opt/spark/bin/spark-class"]
    args: ["org.apache.spark.executor.CoarseGrainedExecutorBackend"]
    resources:
      requests:
        cpu: "2"
        memory: "8Gi"
      limits:
        cpu: "4"
        memory: "16Gi"
    volumeMounts:
    - name: data-volume
      mountPath: /data
  volumes:
  - name: data-volume
    emptyDir: {}
```

### 3.2 Deployment —— 无状态应用

Deployment 管理 ReplicaSet,提供**滚动升级、回滚、副本控制**。

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: kafka-exporter
  namespace: monitoring
  labels:
    app: kafka-exporter
spec:
  replicas: 2
  selector:
    matchLabels:
      app: kafka-exporter
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  template:
    metadata:
      labels:
        app: kafka-exporter
    spec:
      containers:
      - name: kafka-exporter
        image: danielqsj/kafka-exporter:latest
        args:
          - "--kafka.server=kafka-0.kafka:9092,kafka-1.kafka:9092"
        ports:
        - containerPort: 9308
        resources:
          requests:
            cpu: "100m"
            memory: "128Mi"
          limits:
            cpu: "500m"
            memory: "512Mi"
```

**常用命令**:
```bash
kubectl get deployment -n monitoring
kubectl rollout status deployment/kafka-exporter -n monitoring
kubectl rollout undo deployment/kafka-exporter -n monitoring
kubectl scale deployment/kafka-exporter --replicas=5 -n monitoring
```

### 3.3 Service —— 网络抽象

```
┌──────────────────────────────────────────────────────┐
│              Service 类型对比                          │
├──────────────────────────────────────────────────────┤
│                                                      │
│  ClusterIP (默认)                                    │
│   ┌─────┐      ┌─────┐      ┌─────┐                  │
│   │Pod 1│      │Pod 2│      │Pod 3│                  │
│   └──┬──┘      └──┬──┘      └──┬──┘                  │
│      │            │            │                      │
│      └────────────┼────────────┘                      │
│                   ▼                                   │
│              ┌────────┐                               │
│              │Service │ ClusterIP: 10.96.10.100       │
│              │        │ Port: 80 → TargetPort: 8080   │
│              └────────┘                               │
│                                                      │
│  Headless(给 StatefulSet 用,直接解析 Pod IP)          │
│   ┌─────┐      ┌─────┐      ┌─────┐                  │
│   │Pod 0│      │Pod 1│      │Pod 2│                  │
│   │kafka│      │kafka│      │kafka│                  │
│   └──┬──┘      └──┬──┘      └──┬──┘                  │
│      │            │            │                      │
│      └─── DNS: kafka-0.kafka.default.svc              │
│           kafka-1.kafka.default.svc                   │
│           kafka-2.kafka.default.svc                   │
└──────────────────────────────────────────────────────┘
```

**StatefulSet 用 Headless Service 的好处**:
- 每个 Pod 有稳定的 DNS 名(`kafka-0`, `kafka-1`, `kafka-2`)。
- Pod 重启后,名称不变,客户端连接不变。
- Kafka / ZooKeeper / HDFS NameNode 必备。

### 3.4 StatefulSet —— 有状态应用

```yaml
apiVersion: v1
kind: Service
metadata:
  name: kafka
  namespace: kafka
spec:
  clusterIP: None              # Headless
  selector:
    app: kafka
  ports:
  - port: 9092
    name: kafka
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: kafka
  namespace: kafka
spec:
  serviceName: kafka
  replicas: 3
  selector:
    matchLabels:
      app: kafka
  template:
    metadata:
      labels:
        app: kafka
    spec:
      containers:
      - name: kafka
        image: confluentinc/cp-kafka:7.6.0
        env:
        - name: KAFKA_BROKER_ID
          valueFrom:
            fieldRef:
              fieldPath: metadata.labels['statefulset.kubernetes.io/pod-name']
        - name: KAFKA_ZOOKEEPER_CONNECT
          value: "zookeeper:2181"
        ports:
        - containerPort: 9092
        volumeMounts:
        - name: data
          mountPath: /var/lib/kafka/data
  volumeClaimTemplates:
  - metadata:
      name: data
    spec:
      accessModes: ["ReadWriteOnce"]
      resources:
        requests:
          storage: 100Gi
      storageClassName: ssd-sc
```

**关键点**:
- `volumeClaimTemplates`:每个 Pod 自动创建自己的 PVC。
- `metadata.labels[statefulset.kubernetes.io/pod-name]`:动态注入 Pod 名作为 Kafka Broker ID。
- Headless Service 提供稳定 DNS。

---

## 4. ConfigMap / Secret

### 4.1 ConfigMap

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: spark-config
  namespace: spark-jobs
data:
  spark-defaults.conf: |
    spark.master=k8s://https://k8s-api:443
    spark.executor.instances=10
    spark.executor.memory=8g
    spark.executor.cores=4
    spark.driver.memory=4g
    spark.sql.shuffle.partitions=200
  log4j.properties: |
    log4j.rootLogger=INFO, console
    log4j.appender.console=org.apache.log4j.ConsoleAppender
---
apiVersion: v1
kind: Pod
metadata:
  name: spark-driver
  namespace: spark-jobs
spec:
  containers:
  - name: spark-driver
    image: apache/spark:3.5.1
    volumeMounts:
    - name: config
      mountPath: /opt/spark/conf
  volumes:
  - name: config
    configMap:
      name: spark-config
```

### 4.2 Secret

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: db-credentials
  namespace: spark-jobs
type: Opaque
stringData:
  username: etl_user
  password: "S3cr3t!"
---
# 在 Pod 中使用
envFrom:
- secretRef:
    name: db-credentials
```

**生产建议**:
- Secret **必须加密**(KMS / Vault)。
- 默认 base64 编码不等于加密。
- 用 [External Secrets Operator](https://external-secrets.io/) 集成 Vault/AWS Secrets Manager。

---

## 5. PV / PVC / StorageClass

### 5.1 存储模型

```
┌────────────────────────────────────────────────────────┐
│                    K8s 存储抽象                        │
├────────────────────────────────────────────────────────┤
│                                                        │
│  PersistentVolume (PV) ←── 集群管理员预创建的存储      │
│      │                                                 │
│      │ 绑定                                             │
│      ▼                                                 │
│  PersistentVolumeClaim (PVC) ←── 应用申请的存储        │
│      │                                                 │
│      │ 挂载到 Pod                                       │
│      ▼                                                 │
│  Pod Volume                                            │
│                                                        │
│  StorageClass ←── 动态供给(如 EBS、Local SSD)          │
│      │                                                 │
│      │ PVC 指定 storageClassName → 自动创建 PV          │
│      ▼                                                 │
│  PV (自动)                                             │
│                                                        │
└────────────────────────────────────────────────────────┘
```

### 5.2 StorageClass 动态供给

```yaml
# 阿里云 NAS / EBS 示例(简化)
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: ebs-sc
provisioner: ebs.csi.alibabacloud.com
parameters:
  type: cloud_ssd
  fsType: ext4
reclaimPolicy: Delete
volumeBindingMode: WaitForFirstConsumer
```

**StorageClass 类型选择**:

| 类型 | 场景 | RWO/RWX | 性能 |
| --- | --- | --- | --- |
| **Local SSD**(hostPath) | Kafka Bookie 缓存 | RWO | 最高 |
| **EBS gp3** | Spark 临时数据 | RWO | 高 |
| **NAS / NFS** | 多 Pod 共享 | RWX | 中 |
| **OSSFS / S3 CSI** | Spark 数据湖 | RWX | 低延迟读,高延迟写 |
| **CephFS** | 大数据冷存储 | RWX | 中 |

### 5.3 大数据存储选型

```
Kafka 集群:
   ├── 系统盘:节点本地 SSD
   ├── 数据盘:节点本地 NVMe(RWO,高性能)
   └── Kafka 自身实现多副本,不依赖 PV 持久化

Spark on K8s:
   ├── Shuffle 中间数据 → EmptyDir / 本地 SSD
   ├── 外部数据源 → S3 / OSS / HDFS
   └── 不需要长期持久卷(Job 结束资源释放)

Flink on K8s:
   ├── Checkpoint → S3 / OSS(RWX)
   ├── RocksDB State Backend → 本地 SSD(性能)
   └── TM 日志 → NFS 或 PV

HDFS on K8s:
   ├── DataNode 数据 → 本地 SSD(RWO)
   ├── NameNode 元数据 → EBS 持久卷
   └── JournalNode → EBS 持久卷(3 副本)
```

### 5.4 实战 PV/PVC

```yaml
# StorageClass
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: local-ssd
provisioner: kubernetes.io/no-provisioner
volumeBindingMode: WaitForFirstConsumer
---
# PV(本地 SSD,手动创建)
apiVersion: v1
kind: PersistentVolume
metadata:
  name: pv-local-node1
spec:
  capacity:
    storage: 1Ti
  accessModes: ["ReadWriteOnce"]
  persistentVolumeReclaimPolicy: Retain
  storageClassName: local-ssd
  local:
    path: /mnt/ssd1
  nodeAffinity:
    required:
      nodeSelectorTerms:
      - matchExpressions:
        - key: kubernetes.io/hostname
          operator: In
          values: ["node-1"]
---
# Pod 使用
spec:
  volumes:
  - name: kafka-data
    persistentVolumeClaim:
      claimName: kafka-data-pvc
```

---

## 6. Operator 模式

### 6.1 什么是 Operator?

Operator = **CRD + Controller** = K8s 原生 API + 自定义控制器。

```
传统 K8s 资源:
   kubectl apply -f kafka.yaml       ← 静态描述
   K8s 创建 Pod,但 Kafka 集群初始化、副本同步
   需要人工操作或外部脚本。

Operator:
   kubectl apply -f kafka-cluster.yaml  ← 声明期望状态
   CRD: KafkaCluster(spec.replicas=3)
         │
         ▼
   Controller 监听 CRD 变更
         │
         ├── 创建 3 个 StatefulSet(Pod)
         ├── 等待 Pod 就绪
         ├── 初始化 Kafka 集群(选 Controller、Format)
         ├── 持续 reconcile(监控实际状态,纠正偏差)
         └── 暴露 endpoint 给应用访问
```

### 6.2 Operator SDK 三件套

```go
// 1. CRD 定义(Go)
type KafkaClusterSpec struct {
    Replicas      int32                  `json:"replicas"`
    Image         string                 `json:"image"`
    Storage       StorageSpec            `json:"storage"`
    Brokers       []BrokerSpec           `json:"brokers"`
}

type KafkaClusterStatus struct {
    Phase         string                 `json:"phase"`        // Pending/Running/Failed
    ReadyReplicas int32                  `json:"readyReplicas"`
    Brokers       []BrokerStatus         `json:"brokers"`
}

// 2. Controller 逻辑
func (r *KafkaClusterReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
    // 1. 获取 CR
    kafka := &KafkaCluster{}
    if err := r.Get(ctx, req.NamespacedName, kafka); err != nil {
        return ctrl.Result{}, client.IgnoreNotFound(err)
    }
    
    // 2. 创建 StatefulSet(如不存在)
    if err := r.reconcileStatefulSet(kafka); err != nil {
        return ctrl.Result{RequeueAfter: 30*time.Second}, err
    }
    
    // 3. 等待 Pod Ready
    if err := r.waitForReady(kafka); err != nil {
        return ctrl.Result{RequeueAfter: 10*time.Second}, nil
    }
    
    // 4. 更新 Status
    kafka.Status.Phase = "Running"
    r.Status().Update(ctx, kafka)
    
    return ctrl.Result{RequeueAfter: 60*time.Second}, nil
}

// 3. CRD 注册
func SetupWithMain(mgr ctrl.Manager) error {
    return ctrl.NewControllerManagedBy(mgr).
        For(&KafkaCluster{}).
        Owns(&appsv1.StatefulSet{}).
        Complete(&KafkaClusterReconciler{})
}
```

### 6.3 大数据 Operator 全景

| Operator | 厂商/项目 | 状态 |
| --- | --- | --- |
| **Strimzi** | Red Hat | Kafka(KRaft)事实标准 |
| **Confluent Operator** | Confluent | Kafka 商业版 |
| **Pulsar Operator** | StreamNative | Pulsar |
| **Spark Operator** | GCP / KDP | Spark on K8s |
| **Flink Kubernetes Operator** | Ververica / 阿里 | Flink |
| **Airflow Operator** | Astronomer | Airflow |
| **HDFS Operator** | Apache HDFS | 试验性 |
| **Presto Operator** | (社区) | Presto |
| **Trino Operator** | (社区) | Trino |
| **Redis Operator** | Spotahome | Redis |
| **MinIO Operator** | MinIO | 对象存储 |

---

## 7. 存算分离视角看 K8s

### 7.1 K8s 是"应用视角的存算分离"

**YARN 时代**:**资源视角**
- 集群是**机器的集合**。
- 资源按队列划分,**机器物理归属**某个队列。
- 跨队列调度需要"打孔"(YARN Label / Node Label)。

**K8s 时代**:**应用视角**
- 集群是**Pod 的集合**(抽象层)。
- 资源按 Namespace/Request 划分,**机器只是基础设施**。
- 任何 Pod 可以调度到任何节点(只要满足资源请求和亲和性)。

```
YARN 时代:                          K8s 时代:
┌─────────────┐                    ┌─────────────┐
│ Queue A     │                    │ Namespace   │
│  ├─Node1   │                    │  │         │
│  ├─Node2   │  ← 静态             │  ├─Pod1    │
│  ├─Node3   │                    │  ├─Pod2    │ ← 动态
│             │                    │  └─Pod3    │
├─────────────┤                    ├─────────────┤
│ Queue B     │                    │ Namespace   │
│  ├─Node4   │                    │  │         │
│  ├─Node5   │  ← 静态             │  ├─PodA    │
│             │                    │  └─PodB    │ ← 动态
└─────────────┘                    └─────────────┘
```

### 7.2 存算分离在 K8s 的实现

**计算侧**(Stateless Worker):
- Spark Executor Pod、Flink TaskManager Pod。
- 资源请求(requests)+ 上限(limits)。
- **不需要 PV 持久化**(中间数据可重建)。

**存储侧**(Stateful Storage):
- HDFS DataNode / Kafka Bookie / MinIO Node。
- 用 StatefulSet + 本地 SSD。
- 持久化逻辑由应用自己处理(多副本 / 纠删码)。

**元数据侧**(Coordination):
- ZooKeeper / etcd / NameNode。
- 用 StatefulSet + 3 副本 HA。

```
存算分离的 K8s 拓扑
┌─────────────────────────────────────────────────────────┐
│ K8s Cluster                                              │
│                                                          │
│  ┌────────────── 存储层 (StatefulSet) ────────────────┐ │
│  │  HDFS DataNode  │  Kafka Broker  │  MinIO Node    │ │
│  │  本地 SSD 挂载   │  本地 SSD       │  持久卷         │ │
│  └────────────────────────────────────────────────────┘ │
│  ┌────────────── 计算层 (Deployment/Job) ─────────────┐ │
│  │  Spark Executor │  Flink TM     │  Spark Driver  │ │
│  │  EmptyDir 卷    │  无 PV         │  无 PV          │ │
│  └────────────────────────────────────────────────────┘ │
│  ┌────────────── 元数据层 (StatefulSet) ───────────────┐ │
│  │  ZooKeeper(3)  │  HDFS NameNode(2 HA)  │  etcd(3)   │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### 7.3 资源调度策略

```yaml
# Spark Executor Pod:反亲和(分散到不同节点)
affinity:
  podAntiAffinity:
    preferredDuringSchedulingIgnoredDuringExecution:
    - weight: 100
      podAffinityTerm:
        labelSelector:
          matchLabels:
            app: spark-executor
        topologyKey: kubernetes.io/hostname

# Kafka Broker:反亲和 + 同节点本地 SSD
affinity:
  podAntiAffinity:
    requiredDuringSchedulingIgnoredDuringExecution:
    - labelSelector:
        matchLabels:
          app: kafka
      topologyKey: kubernetes.io/hostname
  nodeAffinity:
    requiredDuringSchedulingIgnoredDuringExecution:
      nodeSelectorTerms:
      - matchExpressions:
        - key: disktype
          operator: In
          values: ["nvme"]

# Flink TM:容忍污点(专有节点)
tolerations:
- key: flink
  operator: Equal
  value: "true"
  effect: NoSchedule
```

---

## 8. K8s 必装组件

### 8.1 必备插件(最小化生产集群)

```
必备:
   ├── CNI 网络插件
   │   ├── Calico(推荐,NetworkPolicy)
   │   ├── Cilium(eBPF,性能高)
   │   └── Flannel(简单)
   │
   ├── DNS
   │   └── CoreDNS(默认)
   │
   ├── Ingress Controller
   │   ├── NGINX Ingress(常用)
   │   ├── Traefik
   │   └── Kong
   │
   ├── Metrics
   │   ├── Metrics Server(基础 HPA)
   │   └── Prometheus + node-exporter(完整)
   │
   ├── 日志
   │   ├── Fluent Bit(节点级采集)
   │   └── Loki(集中存储)
   │
   ├── 自动扩缩
   │   ├── Cluster Autoscaler(节点级)
   │   └── KEDA(事件驱动)
   │
   └── 存储
       ├── CSI Driver(EBS/NAS/OSS)
       └── Rook Ceph(自建分布式存储)
```

### 8.2 大数据工作负载建议

```
HDFS 集群:
   - NameNode:StatefulSet,3 副本,本地 SSD(EBS),JVM Heap 16GB
   - DataNode:StatefulSet,N 副本,本地 NVMe(RWO)
   - ZKFC:Zookeeper + ZKFC,3 副本

Kafka 集群:
   - Broker:StatefulSet,本地 NVMe,RWO,KRaft 模式
   - Kraft Controller:StatefulSet,3 副本

Spark History Server:Deployment,2 副本,挂载 PV(Spark Event Log)

Airflow:Deployment,Webserver + Scheduler + Worker + Executor

Prometheus + Grafana:Deployment,挂载 PV 持久化指标
```

---

## 9. 关键源码类索引

| 组件 | 项目 | 核心类 |
| --- | --- | --- |
| **Kube-controller-manager** | Kubernetes | `pkg/controller/*` |
| **Scheduler** | Kubernetes | `pkg/scheduler/framework/plugins/*` |
| **Kubelet** | Kubernetes | `pkg/kubelet/kubelet.go` |
| **Spark Operator** | spark-on-k8s-operator | `internal/controller/sparkapplication/sparkapplication_controller.go` |
| **Strimzi Kafka Operator** | strimzi-kafka-operator | `cluster-operator/src/main/java/io/strimzi/operator/cluster/operator/assembly/KafkaAssemblyOperator.java` |
| **Flink Operator** | flink-kubernetes-operator | `flink-kubernetes-operator/src/main/java/org/apache/flink/kubernetes/operator/FlinkOperator.java` |

---

## 10. 生产配置基线

### 10.1 kubeadm init(Control Plane)

```bash
# kubeadm-config.yaml
apiVersion: kubeadm.k8s.io/v1beta4
kind: InitConfiguration
localAPIEndpoint:
  advertiseAddress: 1.2.3.4
  bindPort: 6443
nodeRegistration:
  criSocket: unix:///run/containerd/containerd.sock
---
apiVersion: kubeadm.k8s.io/v1beta4
kind: ClusterConfiguration
kubernetesVersion: v1.28.6
controlPlaneEndpoint: "lb.internal:6443"
networking:
  podSubnet: 10.244.0.0/16
  serviceSubnet: 10.96.0.0/16
  dnsDomain: cluster.local
etcd:
  local:
    dataDir: /var/lib/etcd
```

### 10.2 Pod 资源基线

```yaml
# 生产 Pod 标准模板
spec:
  containers:
  - name: app
    image: myapp:1.0
    resources:
      requests:                    # 调度基线(K8s 据此选节点)
        cpu: "500m"
        memory: "2Gi"
      limits:                      # 硬上限(cgroup 强杀)
        cpu: "2"
        memory: "4Gi"
    livenessProbe:                 # 探活(重启 Pod)
      httpGet:
        path: /health
        port: 8080
      initialDelaySeconds: 30
      periodSeconds: 10
    readinessProbe:                # 就绪(是否加入 Service)
      httpGet:
        path: /ready
        port: 8080
      initialDelaySeconds: 10
      periodSeconds: 5
    securityContext:
      runAsNonRoot: true
      runAsUser: 1000
      allowPrivilegeEscalation: false
      capabilities:
        drop: ["ALL"]
      readOnlyRootFilesystem: true
```

### 10.3 大数据工作负载资源估算

| 组件 | CPU Request | Memory Request | 备注 |
| --- | --- | --- | --- |
| Spark Driver | 2 | 4 Gi | 小 Job 1 CPU, 2 Gi |
| Spark Executor | 4 | 8 Gi | 比例 1:2 |
| Flink JobManager | 2 | 4 Gi | HA 部署 2 副本 |
| Flink TaskManager | 4 | 16 Gi | TM 内多个 Slot |
| Kafka Broker | 4 | 8 Gi | 留内存给 Page Cache |
| HDFS NameNode | 8 | 16 Gi | 大集群 32 Gi+ |
| HDFS DataNode | 4 | 8 Gi | 留内存给 OS |

---

## 11. 专家面试题

> **Q1**:**K8s 是怎么解决"存算分离"问题的?**
>
> **参考答案**:
> 1. **计算层**:Pod 无状态,Job 结束资源回收,无 PV 持久化。
> 2. **存储层**:StatefulSet + PVC + 本地 SSD,数据持久化在 Pod 重启后保留。
> 3. **元数据层**:ZooKeeper/etcd 通过 StatefulSet 部署,3 副本 HA。
> 4. **解耦**:Pod 重启 ≠ 数据丢失,Pod 迁移 ≠ 集群搬迁。
> 5. **核心**:K8s 把"资源"抽象为 API 对象,而不是物理机器。

> **Q2**:**为什么 Kafka on K8s 比 Kafka on YARN 更难?**
>
> **参考答案**:
> - Kafka 是**有状态应用**(ZAB/Raft 协议依赖稳定网络标识、磁盘)。
> - **YARN 上**:YARN Container 是临时资源,常用于 Spark/Flink;Kafka 通常直接用物理机。
> - **K8s 上**:用 StatefulSet 提供稳定标识,Headless Service 提供 DNS,本地 SSD 提供高性能 IO。
> - **挑战**:PV 性能不如裸盘;Pod 调度延迟;节点故障恢复时间长。
> - **生产建议**:大流量 Kafka(>50 万 TPS)仍推荐物理机或专用 EC2/ECS。

> **Q3**:**Operator 和 Helm Chart 有什么区别?**
>
> **参考答案**:
> - **Helm Chart**:**模板化部署**,执行 `kubectl apply -f` 一次性创建资源,**无持续调和**。
> - **Operator**:**声明式 + 持续 reconcile**,声明期望状态,Controller 持续监控并纠正偏差。
> - **适用**:Helm 适合无状态服务;Operator 适合有状态、复杂生命周期管理(如 Kafka、ZK、数据库)。
> - **本质**:Helm 是"一次执行",Operator 是"持续守护"。

> **Q4**:**HPA / VPA / Cluster Autoscaler 区别?**
>
> **参考答案**:
> - **HPA**(Horizontal Pod Autoscaler):**水平扩缩 Pod 副本数**,基于 CPU/Memory/自定义指标。
> - **VPA**(Vertical Pod Autoscaler):**垂直调整 Pod 资源 Request/Limit**,基于历史用量推荐。
> - **Cluster Autoscaler**:扩缩**节点数**(创建/删除 EC2),当 Pod 因资源不足 Pending 时触发。
> - **大数据建议**:Spark 用 KEDA Driver(基于任务队列);Kafka 不用 HPA(扩容需要 rebalance)。

> **Q5**:**StatefulSet 和 Deployment 有什么区别?何时用哪个?**
>
> **参考答案**:
> - **Deployment**:无状态,Pod 可互换,无持久标识(`web-1`, `web-2` 互换无差别)。
> - **StatefulSet**:有状态,Pod 有稳定标识(`kafka-0`, `kafka-1`, `kafka-2`),重启后名称不变。
> - **何时用 StatefulSet**:
>   - 需要稳定网络标识(Kafka Broker、ZK、ZKFC、Redis Master、MySQL)。
>   - 需要持久化存储(PVC 与 Pod 1:1 绑定)。
>   - 有序部署/扩缩(0 → 1 → 2,而非随机)。
> - **何时用 Deployment**:无状态服务(Web API、Spark History Server、Airflow Webserver)。

---

## 12. 生产实战清单

- [ ] **Step 1:部署 K8s 集群** — kubeadm init 1 个 Control Plane + 3 个 Worker,Calico CNI。
- [ ] **Step 2:必备插件** — 安装 Metrics Server、CoreDNS、Ingress NGINX。
- [ ] **Step 3:PV/PVC 验证** — 创建 StorageClass,动态供给 PVC,挂载到 Pod。
- [ ] **Step 4:Deployment 部署** — 部署 Kafka Exporter、Spark History Server,验证滚动升级。
- [ ] **Step 5:StatefulSet 部署** — 部署 3 副本 Kafka(KRaft)+ ZK(可选),验证稳定标识。
- [ ] **Step 6:ConfigMap/Secret** — 通过 ConfigMap 注入 Spark 配置,Secret 注入 DB 密码。
- [ ] **Step 7:Operator 安装** — 安装 Strimzi Kafka Operator,通过 CR 创建 Kafka 集群。
- [ ] **Step 8:存算分离拓扑** — 部署 HDFS(NameNode StatefulSet + DataNode StatefulSet),测试读写。
- [ ] **Step 9:资源调度** — 用 Node Affinity、Pod Anti-Affinity、Taints/Tolerations 调度大数据组件。
- [ ] **Step 10:监控接入** — Prometheus 抓取 K8s 指标,kube-state-metrics,Grafana 看板。

**完成标志**:能在 30 分钟内通过 kubectl 创建完整的大数据组件(Kafka、Spark Driver、HDFS)并跑通端到端流程。

---

## 13. 一句话总结

> **K8s 不是 YARN 的替代品,而是"应用视角的资源操作系统"。** 它把"机器"变成"Pod",把"部署"变成"声明式 API",把"扩容"变成"自动弹性"。大数据上 K8s 的本质,是把 YARN 的"队列 + 资源池"模型换成 K8s 的"Namespace + 资源请求"模型,获得更高的资源利用率和更强的弹性。

---

**下一章预告**:**[05-Spark on K8s Operator 原理](./05-spark-k8s-operator.md)** —— Kubernetes Operator for Spark、Google Spark Operator、Cluster Mode vs Client Mode、Dynamic Allocation。