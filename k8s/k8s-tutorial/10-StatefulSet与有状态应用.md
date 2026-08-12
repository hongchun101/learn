# 10. StatefulSet 与有状态应用

## 10.1 为什么需要 StatefulSet

**Deployment 的"无状态"假设**:
- Pod 名字随机(`web-5d4f8b9c-xyz`)
- Pod IP 动态
- Pod 之间无身份区别
- 共享 PVC(所有 Pod 用同一份)

**但很多应用需要"稳定身份"**:
- 数据库(MySQL/Postgres/Redis):副本间需复制,主从关系固定
- 分布式系统(etcd/Zookeeper/Kafka):节点 ID 固定
- 消息队列(Kafka):Partition → Broker 绑定

**StatefulSet** = 给 Pod 提供**稳定身份**的工作负载。

## 10.2 StatefulSet vs Deployment

| 维度 | Deployment | StatefulSet |
|------|-----------|-------------|
| Pod 名 | 随机 hash | `<name>-0/1/2/...(稳定序号)` |
| Pod IP | 动态 | 动态(但通过 DNS 可解析) |
| 扩缩 | 并行 | 串行(0→1→2;缩反向) |
| 启停 | 任意顺序 | 严格顺序 |
| 存储 | 共享 PVC | **每个 Pod 独立 PVC** |
| 滚动升级 | 任意顺序 | 严格倒序(N → N-1 → ... → 0) |
| Headless Service | 可选 | **必须** |
| 适用 | 无状态 Web | 数据库/消息队列 |

## 10.3 Headless Service(必须)

StatefulSet 必须配 **Headless Service**(`clusterIP: None`):

```yaml
apiVersion: v1
kind: Service
metadata: { name: mysql }
spec:
  clusterIP: None          # 关键!
  selector:
    app: mysql
  ports:
  - { port: 3306, name: mysql }
```

**DNS 解析**:
```text
mysql-0.mysql.default.svc.cluster.local → Pod 0 IP
mysql-1.mysql.default.svc.cluster.local → Pod 1 IP
mysql-2.mysql.default.svc.cluster.local → Pod 2 IP
mysql.default.svc.cluster.local → 所有 Pod IP(负载均衡?)
```

## 10.4 第一个 StatefulSet

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata: { name: mysql }
spec:
  serviceName: mysql                 # 必须,对应 Headless Service
  replicas: 3
  selector:
    matchLabels: { app: mysql }
  template:
    metadata:
      labels: { app: mysql }
    spec:
      containers:
      - name: mysql
        image: mysql:8.0
        ports:
        - { containerPort: 3306, name: mysql }
        env:
        - name: MYSQL_ROOT_PASSWORD
          valueFrom:
            secretKeyRef:
              name: mysql-pass
              key: password
        volumeMounts:
        - { name: data, mountPath: /var/lib/mysql }
        - { name: conf, mountPath: /etc/mysql/conf.d }
        resources:
          requests: { cpu: 500m, memory: 1Gi }
          limits:   { cpu: 2, memory: 4Gi }
        readinessProbe:
          exec:
            command: ["mysqladmin", "ping", "-h", "localhost"]
          initialDelaySeconds: 30
          periodSeconds: 10
  volumeClaimTemplates:                # 每个 Pod 自动创建 PVC
  - metadata: { name: data }
    spec:
      accessModes: [ReadWriteOnce]
      storageClassName: fast-ssd
      resources: { requests: { storage: 100Gi } }
  - metadata: { name: conf }
    spec:
      accessModes: [ReadWriteOnce]
      storageClassName: standard
      resources: { requests: { storage: 1Gi } }
```

**自动创建的资源**:
```text
Pod:
  mysql-0
  mysql-1
  mysql-2

PVC:
  data-mysql-0
  data-mysql-1
  data-mysql-2
  conf-mysql-0
  conf-mysql-1
  conf-mysql-2
```

## 10.5 Pod 管理策略

```yaml
spec:
  podManagementPolicy:
    OrderedReady          # 默认:严格顺序(0 → 1 → 2)
    Parallel              # 并行(像 Deployment)
```

**OrderedReady**(默认):
- 启动:mysql-0 ready → mysql-1 ready → mysql-2 ready
- 缩容:mysql-2 删 → mysql-1 删 → mysql-0 删
- **升级**:从大到小倒序(2 → 1 → 0)

**Parallel**:
- 启动:全部并行(快)
- 适合**无主从关系**的应用(无状态集群、etcd?)
- 不依赖严格启动顺序的应用

## 10.6 升级策略

```yaml
spec:
  updateStrategy:
    type: RollingUpdate     # RollingUpdate / OnDelete
    rollingUpdate:
      partition: 0          # 只更新 ordinal ≥ partition 的
      maxUnavailable: 1
```

### RollingUpdate(默认)

```text
3 副本(mysql-0,1,2),升级到新版本:
  1. 升级 mysql-2(最大 ordinal)
  2. mysql-2 ready
  3. 升级 mysql-1
  4. mysql-1 ready
  5. 升级 mysql-0
  6. mysql-0 ready
```

**为什么倒序?**让已经就绪的副本承接流量(假设客户端用 mysql-2 服务)。

### partition(金丝雀)

```yaml
spec:
  updateStrategy:
    type: RollingUpdate
    rollingUpdate:
      partition: 2          # 只升级 ordinal ≥ 2,即只升级 mysql-2
```

**应用**:
1. 镜像更新到新版本
2. partition=2,只升 mysql-2
3. 验证 mysql-2 OK
4. partition 改 1(升 mysql-1 和 mysql-2)
5. 验证 OK
6. partition 改 0(全升)

### OnDelete

```yaml
spec:
  updateStrategy:
    type: OnDelete
```

**手动升级**——只更新 image,**Pod 删除时才拉新镜像**。

**用途**:严格控制升级时机(等运维准备好)。

## 10.7 数据库实战:MySQL 主从

**挑战**:主从关系 + 数据同步 + 写时主、读时从。

### 方案 1:自建(高级,推荐学)

**Init Container 探测主从**:

```yaml
initContainers:
- name: init-mysql
  image: mysql:8.0
  command:
  - bash
  - -c
  - |
    set -ex
    # 从 ordinal 推断:0 是主,>0 是从
    [[ $HOSTNAME =~ -([0-9]+)$ ]] || exit 1
    ordinal=${BASH_REMATCH[1]}
    if [[ $ordinal -eq 0 ]]; then
      # 主:初始化
      if [ ! -f /var/lib/mysql/mysql-init ]; then
        # 启动 mysqld
        # 写 my.cnf
        touch /var/lib/mysql/mysql-init
      fi
    else
      # 从:等主就绪,做初始同步
      until mysql -h mysql-0.mysql -u root -p${MYSQL_ROOT_PASSWORD} -e "SELECT 1"; do
        sleep 5
      done
      # 拷贝主的数据 + 配置复制
    fi
```

**完整实战见官方文档**(太复杂,生产建议用 Operator)。

### 方案 2:Operator(强烈推荐生产)

```bash
# MySQL Operator
helm install mysql-operator mysql-operator/mysql-operator
```

```yaml
apiVersion: mysql.oracle.com/v2
kind: InnoDBCluster
metadata: { name: mycluster }
spec:
  instances: 3
  router:
    instances: 1
  secretName: mysql-root-password
  version: "8.0.33"
  storage:
    size: 100Gi
  tls:
    useSelfSigned: true
```

**自动处理**:
- 主从选举
- 故障切换
- 备份恢复
- 滚动升级
- 监控指标

**主流 Operator**:

| 工具 | 适用 |
|------|------|
| **MySQL Operator** (Oracle) | MySQL |
| **Postgres Operator** (Zalando) | PostgreSQL |
| **Redis Operator** (Spotahome) | Redis |
| **Strimzi** | Kafka |
| **Cass Operator** | Cassandra |
| **etcd-operator** | etcd |
| **RabbitMQ Operator** | RabbitMQ |
| **MongoDB Operator** | MongoDB |

## 10.8 Redis 实战(单实例 + 持久化)

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata: { name: redis }
spec:
  serviceName: redis
  replicas: 1
  selector: { matchLabels: { app: redis } }
  template:
    metadata: { labels: { app: redis } }
    spec:
      containers:
      - name: redis
        image: redis:7.2-alpine
        command: ["redis-server", "/conf/redis.conf"]
        ports:
        - { containerPort: 6379, name: redis }
        volumeMounts:
        - { name: data, mountPath: /data }
        - { name: conf, mountPath: /conf }
        resources:
          requests: { cpu: 100m, memory: 256Mi }
          limits:   { cpu: 500m, memory: 1Gi }
        livenessProbe:
          tcpSocket: { port: 6379 }
          initialDelaySeconds: 15
        readinessProbe:
          exec:
            command: ["redis-cli", "ping"]
      volumes:
      - name: conf
        configMap:
          name: redis-config
          defaultMode: 0644
  volumeClaimTemplates:
  - metadata: { name: data }
    spec:
      accessModes: [ReadWriteOnce]
      storageClassName: standard
      resources: { requests: { storage: 10Gi } }
```

## 10.9 ZooKeeper / etcd 集群

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata: { name: zk }
spec:
  serviceName: zk
  replicas: 3
  selector: { matchLabels: { app: zk } }
  template:
    metadata: { labels: { app: zk } }
    spec:
      containers:
      - name: zk
        image: zookeeper:3.9
        ports:
        - { containerPort: 2181, name: client }
        - { containerPort: 2888, name: peer }
        - { containerPort: 3888, name: leader }
        env:
        - name: ZOO_MY_ID
          valueFrom:
            fieldRef: { fieldPath: metadata.name }  # zk-0, zk-1, zk-2
        - name: ZOO_SERVERS
          value: "server.1=zk-0.zk:2888:3888;2181 server.2=zk-1.zk:2888:3888;2181 server.3=zk-2.zk:2888:3888;2181"
        - name: ZOO_4LW_COMMANDS_WHITELIST
          value: "*"
        volumeMounts:
        - { name: data, mountPath: /data }
        - { name: dlog, mountPath: /datalog }
        resources:
          requests: { cpu: 250m, memory: 512Mi }
  volumeClaimTemplates:
  - metadata: { name: data }
    spec:
      accessModes: [ReadWriteOnce]
      storageClassName: standard
      resources: { requests: { storage: 20Gi } }
  - metadata: { name: dlog }
    spec:
      accessModes: [ReadWriteOnce]
      storageClassName: standard
      resources: { requests: { storage: 5Gi } }
```

**关键点**:
- `ZOO_MY_ID` 从 Pod 名取(`zk-0` → id 0)
- `ZOO_SERVERS` 用 `zk-N.zk` 域名(Pod 间 DNS 解析)
- 3 副本是奇数,适合选举

## 10.10 Kafka 实战(用 Strimzi Operator)

```bash
helm install strimzi strimzi/strimzi-kafka-operator \
  -n kafka --create-namespace
```

```yaml
apiVersion: kafka.strimzi.io/v1beta2
kind: Kafka
metadata: { name: my-cluster, namespace: kafka }
spec:
  kafka:
    version: 3.6.0
    replicas: 3
    storage:
      type: persistent-claim
      size: 100Gi
      class: fast-ssd
    config:
      offsets.topic.replication.factor: 3
      transaction.state.log.replication.factor: 3
      transaction.state.log.min.isr: 2
      default.replication.factor: 3
      min.insync.replicas: 2
    listeners:
    - name: plain
      port: 9092
      type: internal
      tls: false
    - name: tls
      port: 9093
      type: internal
      tls: true
  zookeeper:
    replicas: 3
    storage:
      type: persistent-claim
      size: 10Gi
---
apiVersion: kafka.strimzi.io/v1beta2
kind: KafkaTopic
metadata: { name: my-topic, namespace: kafka, labels: { strimzi.io/cluster: my-cluster } }
spec:
  partitions: 3
  replicas: 3
  config:
    retention.ms: 604800000
```

## 10.11 有状态服务常见问题

### 1. 升级失败回滚

```bash
# StatefulSet 升级失败,Pod 卡在 NotReady
# 不能直接回滚镜像(可能丢数据)

# 安全流程:
# 1. 看 Pod 日志
kubectl logs mysql-1
# 2. 手动回滚镜像
kubectl set image statefulset/mysql mysql=mysql:8.0.31
# 3. 等待升级完成
kubectl rollout status statefulset/mysql
```

### 2. 节点故障 / Pod 漂移

```bash
# Pod 漂移到新节点,PVC 自动重挂
# 但 Local PV 必须等节点恢复
kubectl get pvc -l app=mysql
# STATUS:Bound(即使 Pod 不在原节点,PVC 仍可挂到新节点)
```

### 3. 数据不一致

```bash
# 多副本同时写 → 数据竞争
# 解决:1 主 N 从(应用层)
# 主挂了 → 自动选主(MySQL Group Replication, etcd Raft, Kafka KRaft)
```

### 4. 缩容数据丢失

```bash
# kubectl scale statefulset mysql --replicas=2
# → 删 mysql-2 + pvc-data-mysql-2
# 数据没了!

# 解决:
# 1. 缩容前手动备份(逻辑 / snapshot)
# 2. 副本数 = 数据保留要求
# 3. 永远不要缩容后立即扩容(PVC 状态可能不一致)
```

## 10.12 StatefulSet + Operator 的哲学

**生产铁律**:
- 数据库、消息队列等**核心有状态服务**,永远用 **Operator**
- 自己写 StatefulSet + init container 维护,问题多、bug 多
- Operator 处理了**几乎所有边角案例**(故障切换、备份、监控、升级)

**Operator 解决的问题**:
- 自动初始化(主从选举、集群引导)
- 故障自动恢复
- 滚动升级(主从角色切换)
- 备份与恢复
- 监控指标
- 配置变更(动态改参数)
- 弹性扩缩

## 10.13 Headless Service + 普通 Pod

Headless Service 不只给 StatefulSet 用,**任何需要 DNS 解析到 Pod 的场景**:

```yaml
apiVersion: v1
kind: Service
metadata: { name: my-app }
spec:
  clusterIP: None
  selector: { app: my-app }
```

**用途**:
- StatefulSet(主)
- 自己实现的集群发现
- 客户端需要连所有 Pod(如爬虫节点)
- 调试(直接连某个 Pod)

## 10.14 专家清单

部署有状态服务前:

- [ ] 用 **Operator**(别自己造轮子)
- [ ] StorageClass 选择(高 IO 场景用 Local PV + 高速云盘)
- [ ] `volumeBindingMode: WaitForFirstConsumer`
- [ ] 反亲和性(podAntiAffinity,副本跨节点)
- [ ] PodDisruptionBudget(防止 drain 时挂)
- [ ] 备份策略(snapshot / Velero / WAL archive)
- [ ] 监控指标(Prometheus exporter)
- [ ] 告警规则(主从状态、replication lag、磁盘)
- [ ] 升级演练(测试环境 → 预发 → 生产)
- [ ] 灾难恢复(RPO / RTO 明确)
- [ ] 容量规划(存储增长、CPU/内存)

## 10.15 本章小结

- StatefulSet 给 Pod 提供**稳定身份**(固定名字 + DNS)
- 必须配 **Headless Service**(`clusterIP: None`)
- `podManagementPolicy`:OrderedReady(严格)/ Parallel(并行)
- `updateStrategy`:RollingUpdate(默认)/ OnDelete(手动)
- 用 `partition` 做金丝雀升级
- `volumeClaimTemplates` 给每个 Pod 独立 PVC
- **生产强烈推荐用 Operator**(MySQL/Postgres/Redis/Kafka)
- 升/缩容要谨慎(数据可能丢,先备份)
- 必备:反亲和、PDB、备份、监控
