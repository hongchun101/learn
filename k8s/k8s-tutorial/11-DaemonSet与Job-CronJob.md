# 11. DaemonSet 与 Job/CronJob

## 11.1 DaemonSet:节点级守护

**核心特征**:**每个节点(或匹配节点)运行一个 Pod**。

| 特性 | 行为 |
|------|------|
| 节点数 | 自动 = 集群中匹配的节点数 |
| 新节点加入 | 自动调度一个 Pod |
| 节点删除 | 自动清理 Pod |
| 用途 | 节点级系统服务 |

### 典型用途

```text
DaemonSet 应用:
├── 日志收集
│   ├── fluentd / fluentbit
│   └── filebeat
├── 节点监控
│   ├── node-exporter (Prometheus)
│   └── datadog-agent
├── 网络
│   ├── calico-node (CNI)
│   ├── cilium
│   └── kube-proxy (部分实现)
├── 存储
│   ├── csi-node-driver-registrar
│   └── ceph / glusterfs
├── 安全
│   ├── falco (运行时安全)
│   └── trivy-operator
└── 系统
    └── nvidia-device-plugin (GPU)
```

## 11.2 第一个 DaemonSet

```yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: fluentd
  labels:
    app: fluentd
spec:
  selector:
    matchLabels:
      app: fluentd
  template:
    metadata:
      labels:
        app: fluentd
    spec:
      # 关键:hostPath 挂节点目录
      volumes:
      - name: varlog
        hostPath:
          path: /var/log
          type: ""
      - name: varlibdockercontainers
        hostPath:
          path: /var/lib/docker/containers
          type: ""
      tolerations:                        # 容忍所有污点,保证跑每个节点
      - effect: NoSchedule
        operator: Exists
      containers:
      - name: fluentd
        image: fluent/fluentd-kubernetes-daemonset:v1.16-debian-cloudnative-1
        resources:
          requests: { cpu: 100m, memory: 200Mi }
          limits:   { cpu: 500m, memory: 1Gi }
        volumeMounts:
        - { name: varlog, mountPath: /var/log }
        - { name: varlibdockercontainers, mountPath: /var/lib/docker/containers, readOnly: true }
        - { name: config, mountPath: /fluentd/etc }
      volumes:
      - name: config
        configMap:
          name: fluentd-config
```

### 关键点

- **不指定 `replicas`**(由节点数决定)
- **必须 `tolerations: NoSchedule Exists`**(容忍所有污点,保证跑每个节点)
- 用 `nodeSelector` 选节点(比如 GPU 节点)
- 用 `updateStrategy` 控制升级

## 11.3 节点选择

```yaml
spec:
  template:
    spec:
      nodeSelector:
        node-role.kubernetes.io/worker: ""    # 只跑 worker 节点
        # disktype: ssd                      # 选 SSD 节点
        # nvidia.com/gpu: "true"              # 只 GPU 节点
      affinity:
        nodeAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
            nodeSelectorTerms:
            - matchExpressions:
              - { key: kubernetes.io/os, operator: In, values: [linux] }
              - { key: zone, operator: In, values: [us-east-1a, us-east-1b] }
```

## 11.4 升级策略

```yaml
spec:
  updateStrategy:
    type: RollingUpdate              # RollingUpdate(默认)/ OnDelete
    rollingUpdate:
      maxSurge: 0                    # 关键!不能超出节点数
      maxUnavailable: 1              # 1 个节点同时升级
      # 或按 node label 分批(更高级)
```

**OnDelete**(保守):
- 升级时**只更新 yaml**,Pod 不自动升级
- 删除一个 Pod,自动建新 Pod
- 适合:不能并行运行的节点级服务

### 按节点分批升级(高级)

```yaml
spec:
  updateStrategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 0
      maxUnavailable: 1
      # 不支持(老 K8s),K8s 1.22+ 用 NodeUpdateStrategy 字段
```

**生产技巧**:
- 节点多:每批 1-2 个,慢但稳
- 节点少:同时全量(快)
- GPU 驱动 / 内核模块升级,通常用 OnDelete

## 11.5 node-exporter DaemonSet 实战

```yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: node-exporter
  namespace: monitoring
  labels:
    app: node-exporter
spec:
  selector:
    matchLabels: { app: node-exporter }
  template:
    metadata:
      labels: { app: node-exporter }
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "9100"
    spec:
      hostNetwork: true                # 用主机网络
      hostPID: true                    # 看主机进程
      tolerations:
      - effect: NoSchedule
        operator: Exists
      containers:
      - name: node-exporter
        image: prom/node-exporter:v1.7.0
        args:
        - '--path.rootfs=/host'
        - '--collector.filesystem.mount-points-exclude=^/(sys|proc|dev|host|etc)($|/)'
        ports:
        - { containerPort: 9100, hostPort: 9100, name: metrics }
        resources:
          requests: { cpu: 100m, memory: 30Mi }
          limits:   { cpu: 200m, memory: 50Mi }
        volumeMounts:
        - { name: root, mountPath: /host, readOnly: true }
      volumes:
      - name: root
        hostPath: { path: / }
```

**注意**:`hostNetwork: true` 和 `hostPID: true` 是高权限,只在监控场景用。

## 11.6 DaemonSet 故障排查

```bash
# 1. 查 Pod
kubectl get pods -n kube-system -l app=fluentd -o wide

# 2. 节点没 Pod?
# - 节点有污点?看 tolerations
# - 节点 label 不匹配?看 nodeSelector
# - 节点 NotReady?DaemonSet 不会调度到 NotReady

# 3. 升级卡住
kubectl rollout status ds fluentd
kubectl describe ds fluentd
```

## 11.7 Job:一次性任务

**核心场景**:
- 数据库迁移
- 批量数据处理
- 测试任务
- 一次性脚本

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: db-migrate
spec:
  completions: 1                    # 总共完成几次(默认 1)
  parallelism: 1                    # 并行 Pod 数(默认 1)
  backoffLimit: 3                   # 失败重试次数
  activeDeadlineSeconds: 600        # 超时
  ttlSecondsAfterFinished: 86400    # 完成后 N 秒删除
  template:
    spec:
      restartPolicy: OnFailure       # 必须:Never 或 OnFailure
      containers:
      - name: migrate
        image: myapp:1.0
        command: ["python", "manage.py", "migrate"]
        resources:
          requests: { cpu: 200m, memory: 256Mi }
          limits:   { cpu: 1, memory: 512Mi }
      backoffLimit: 3                # 也可放 Pod spec
```

### 字段详解

| 字段 | 含义 |
|------|------|
| `completions` | 总成功完成次数 |
| `parallelism` | 并行 Pod 数 |
| `backoffLimit` | 失败重试次数(默认 6) |
| `activeDeadlineSeconds` | 总超时(秒),超时 Job 失败 |
| `ttlSecondsAfterFinished` | 完成后 TTL(自动清理) |
| `completionMode` | `NonIndexed`(默认)/ `Indexed`(每个 Pod 拿到 0..N 索引) |
| `suspend` | true 暂停(手动恢复) |

### 索引 Job(并行处理数据分片)

```yaml
spec:
  completions: 10
  parallelism: 5
  completionMode: Indexed
  template:
    spec:
      containers:
      - name: worker
        image: myapp:1.0
        env:
        - name: JOB_INDEX
          valueFrom: { fieldRef: { fieldPath: metadata.labels['batch.kubernetes.io/job-completion-index'] } }
        command: ["sh", "-c", "process --index=$JOB_INDEX"]
```

**应用**:处理 100 万条数据,分 10 个 Pod,每个处理 10 万条。

## 11.8 Workload 资源(big job 大 Job 模式)

**问题**:Job 跑太久,Pod 失败重启 = 重新跑 5 小时。

**解决**:用 `ttlSecondsAfterFinished` 自动清理老 Pod,`activeDeadlineSeconds` 强超时。

**推荐**:
- 一次性批处理(分钟级):普通 Job
- 中等(小时级):Job + activeDeadlineSeconds
- 长期(天级):CronJob 分片 或 Spark/Flink on K8s

## 11.9 CronJob:定时任务

**类似 crontab**,基于 K8s Job 调度。

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: backup-db
spec:
  schedule: "0 2 * * *"               # 每天 2 点
  timeZone: "Asia/Shanghai"           # K8s 1.27+,时区
  concurrencyPolicy: Forbid           # Forbid/Allow/Replace
  startingDeadlineSeconds: 200        # 启动 deadline
  successfulJobsHistoryLimit: 3       # 保留成功 Job 几个
  failedJobsHistoryLimit: 1           # 保留失败 Job 几个
  suspend: false                      # 暂停
  jobTemplate:
    spec:
      backoffLimit: 2
      activeDeadlineSeconds: 3600
      template:
        spec:
          restartPolicy: OnFailure
          containers:
          - name: backup
            image: postgres:15-alpine
            command:
            - sh
            - -c
            - |
              pg_dump -h $DB_HOST -U $DB_USER $DB_NAME | gzip > /backup/db-$(date +%Y%m%d).sql.gz
            env:
            - name: DB_HOST
              value: postgres
            - name: DB_USER
              value: backup
            - name: PGPASSWORD
              valueFrom:
                secretKeyRef: { name: backup-secret, key: password }
            - name: DB_NAME
              value: myapp
            resources:
              requests: { cpu: 200m, memory: 256Mi }
              limits:   { cpu: 1, memory: 1Gi }
            volumeMounts:
            - { name: backup, mountPath: /backup }
          volumes:
          - name: backup
            persistentVolumeClaim:
              claimName: backup-pvc
```

### 调度语法

```
┌───────────── 分钟 (0 - 59)
│ ┌───────────── 小时 (0 - 23)
│ │ ┌───────────── 日 (1 - 31)
│ │ │ ┌───────────── 月 (1 - 12)
│ │ │ │ ┌───────────── 星期 (0 - 6)(周日=0)
│ │ │ │ │
* * * * *
```

```text
*/5 * * * *        # 每 5 分钟
0 */2 * * *        # 每 2 小时
0 0 * * 0          # 每周日 0 点
0 2 * * 1-5        # 工作日 2 点
0 0 1 * *          # 每月 1 日 0 点
30 14 * * 1-5      # 工作日 14:30
```

### concurrencyPolicy(并发策略)

| 值 | 行为 |
|----|------|
| `Allow`(默认) | 允许重叠(可能多个 Job 同时跑) |
| `Forbid` | 新 Job 跳过(不丢) |
| `Replace` | 取消老 Job 跑新 |

**推荐**:
- 备份/迁移:`Forbid`(避免数据竞争)
- 监控/通知:`Allow`
- 计算任务:`Replace`(用最新数据)

### CronJob 失败原因

```bash
# 看事件
kubectl describe cronjob backup-db

# 看 Job
kubectl get jobs -l owner=backup-db
# COMPLETIONS   DURATION   AGE
# 0/1           10s        5m    # 失败

# 看 Pod
kubectl get pods -l job-name=backup-xxxxx
kubectl logs <pod>
```

### CronJob 的限制

- **最小粒度 1 分钟**(K8s 限制)
- **不保证准时**(ControllerManager 每 10s 检查,可能延迟)
- 多个 CronJob 同时到点(整点),会有 spike

## 11.10 Job 并发与限流

```yaml
# Pod 间资源竞争?
# 1. 错开 schedule
# 2. 用 semaphore(init container 拿锁,Job 间互斥)
# 3. 排队(自建)

# 简单实现:用 ConfigMap 当锁
apiVersion: v1
kind: ConfigMap
metadata: { name: job-lock }
data:
  lock: "false"
---
# Pod 里
initContainers:
- name: acquire-lock
  image: busybox
  command:
  - sh
  - -c
  - |
    while true; do
      LOCK=$(kubectl get cm job-lock -o jsonpath='{.data.lock}')
      if [ "$LOCK" = "false" ]; then
        kubectl patch cm job-lock -p '{"data":{"lock":"true"}}'
        break
      fi
      sleep 5
    done
```

**生产**:**用 Argo Workflows / Apache Airflow / Temporal** 替代裸 Job。

## 11.11 实战:K8s 跑批数据 ETL

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: etl-daily
spec:
  backoffLimit: 2
  activeDeadlineSeconds: 7200
  ttlSecondsAfterFinished: 86400
  template:
    spec:
      restartPolicy: OnFailure
      serviceAccountName: etl-sa      # 有 S3 写权限的 SA
      containers:
      - name: etl
        image: my-etl:1.0
        command: ["python", "etl.py"]
        env:
        - name: DATE
          value: "$(date +%Y-%m-%d)"   # 不行!K8s 不会替换
        # 正确做法:用 init container 算 date
        resources:
          requests: { cpu: 1, memory: 2Gi }
          limits:   { cpu: 4, memory: 8Gi }
        volumeMounts:
        - { name: data, mountPath: /data }
      volumes:
      - name: data
        persistentVolumeClaim: { claimName: etl-data }
```

**配合 CronJob 调度**:

```yaml
apiVersion: batch/v1
kind: CronJob
metadata: { name: etl-daily }
spec:
  schedule: "0 3 * * *"        # 每天 3 点
  concurrencyPolicy: Forbid
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 1
  jobTemplate:
    spec:
      backoffLimit: 2
      activeDeadlineSeconds: 7200
      template: { ... }
```

## 11.12 真实生产 Job/CronJob 案例

### 1. 数据库备份(CronJob)

```bash
# 每天 0 点,pg_dump → S3
# 保留 7 天 S3 备份
# 用 lifecycle policy 自动清理
```

### 2. SSL 证书续期(CronJob)

```yaml
# cert-manager bot
apiVersion: batch/v1
kind: CronJob
metadata: { name: renew-certs }
spec:
  schedule: "0 0 * * *"
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          containers:
          - name: renew
            image: certbot/certbot
            command: ["certbot", "renew"]
```

### 3. 临时调试 Job

```bash
# 一次性进入 Pod 调试(替代 kubectl exec,需重置环境)
kubectl run debug --rm -it --image=alpine --restart=Never -- sh
```

### 4. Init 容器跑 setup(可被 CronJob 复用)

```yaml
initContainers:
- name: wait-db
  image: postgres:15
  command:
  - sh
  - -c
  - "until pg_isready -h postgres; do sleep 2; done"
```

## 11.13 高级:Init Container 做 Job 编排

**场景**:Job A 跑完才能跑 Job B。

```yaml
# 用同一个 Job,两个 init container
apiVersion: batch/v1
kind: Job
metadata: { name: two-stage }
spec:
  template:
    spec:
      restartPolicy: OnFailure
      initContainers:
      - name: stage-a
        image: myapp
        command: ["sh", "-c", "do-stage-a && touch /shared/done-a"]
        volumeMounts:
        - { name: shared, mountPath: /shared }
      - name: stage-b
        image: myapp
        command: ["sh", "-c", "until [ -f /shared/done-a ]; do sleep 2; done; do-stage-b"]
        volumeMounts:
        - { name: shared, mountPath: /shared }
      containers:
      - name: main
        image: myapp
        command: ["sh", "-c", "do-main"]
        volumeMounts:
        - { name: shared, mountPath: /shared }
      volumes:
      - { name: shared, emptyDir: {} }
```

**生产**:**用 Argo Workflows** 处理复杂 DAG(条件分支、并行、超时、重试)。

## 11.14 完整对比:5 种工作负载

| 场景 | 用 |
|------|-----|
| 无状态 Web/API/微服务 | **Deployment** |
| 数据库/有状态集群 | **StatefulSet** + Operator |
| 节点级系统服务(日志/监控/CNI) | **DaemonSet** |
| 一次性任务(迁移/批处理) | **Job** |
| 定时任务(备份/清理) | **CronJob** |

## 11.15 专家清单

部署前:

- [ ] DaemonSet 配 `tolerations: Exists` 保证每个节点
- [ ] DaemonSet 配 `hostNetwork` 仅在必要时
- [ ] DaemonSet 升级策略选 RollingUpdate 小批次
- [ ] Job 配 `activeDeadlineSeconds`(避免挂死)
- [ ] Job 配 `ttlSecondsAfterFinished`(自动清理)
- [ ] Job 配 `backoffLimit`(默认 6 次可能太多)
- [ ] CronJob 配 `concurrencyPolicy: Forbid`(避免竞争)
- [ ] CronJob 配历史限制,免得 history Job 太多
- [ ] 数据库迁移用 Job,不用裸 kubectl exec
- [ ] 资源 `requests` 必设,否则调度到小节点 OOM
- [ ] Job 完成后用 `kubectl delete job --field-selector status.successful=1` 清理
- [ ] 复杂批处理用 Argo Workflows,别自己拼 Job

## 11.16 本章小结

- **DaemonSet** = 节点级守护,自动跟节点数,适合日志/监控/CNI
- DaemonSet 必须配 tolerations + nodeSelector
- DaemonSet 升级:OnDelete(手动) / RollingUpdate(默认)
- **Job** = 一次性任务,restartPolicy: OnFailure/Never
- Job 关键参数:completions/parallelism/backoffLimit/activeDeadline/ttl
- **CronJob** = 定时任务,基于 K8s Job
- CronJob 调度:crontab 语法(分时日月周),K8s 1.27+ 支持时区
- 并发策略:Forbid(推荐)/ Allow / Replace
- 复杂场景用 Argo Workflows,别自己堆 Job
- 配合 `activeDeadlineSeconds` + `ttlSecondsAfterFinished` 自动清理
