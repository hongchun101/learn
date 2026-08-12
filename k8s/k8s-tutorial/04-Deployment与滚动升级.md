# 04. Deployment 与滚动升级

## 4.1 控制器层级

K8s 用**层级控制器**管理 Pod:

```text
Deployment          ← 业务视角(无状态应用)
    ↓ manages
ReplicaSet          ← 副本数管理(版本选择)
    ↓ manages
Pod                 ← 实际运行
    ↓ contains
Container           ← 业务进程
```

**为什么不直接管理 Pod?**
- Deployment → ReplicaSet → Pod 这种分层让**滚动升级**和**回滚**成为可能
- Deployment 维护"版本"概念(每次升级创建一个新 ReplicaSet)
- 老 ReplicaSet 保留 0-N 副本,出问题可秒回滚

## 4.2 第一个 Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx
  namespace: default
  labels:
    app: nginx
spec:
  replicas: 3
  selector:
    matchLabels:
      app: nginx
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 25%        # 升级时最多超出的副本(25% of 3 = 1)
      maxUnavailable: 25%  # 升级时最多不可用的副本
  template:
    metadata:
      labels:
        app: nginx
    spec:
      containers:
      - name: nginx
        image: nginx:1.25
        ports:
        - { containerPort: 80 }
        resources:
          requests: { cpu: 100m, memory: 128Mi }
          limits:   { cpu: 500m, memory: 512Mi }
        livenessProbe:
          httpGet: { path: /, port: 80 }
          periodSeconds: 10
        readinessProbe:
          httpGet: { path: /, port: 80 }
          periodSeconds: 5
```

```bash
kubectl apply -f nginx.yaml
kubectl get deploy nginx
kubectl get rs -l app=nginx       # 看到 ReplicaSet
kubectl get pods -l app=nginx
```

## 4.3 Deployment 完整字段

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  annotations:                    # 给 kubectl 用
    kubernetes.io/change-cause: "升级到 1.26"
spec:
  replicas: 5                     # 副本数
  revisionHistoryLimit: 10        # 保留多少老 ReplicaSet(默认 10,改 0 节省 etcd)
  progressDeadlineSeconds: 600    # 进度超时(默认 600s,超时报 ProgressDeadlineExceeded)
  minReadySeconds: 0              # Pod ready 后等多久才认为可用(避免抖动)
  paused: false                   # 暂停(配合灰度)
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 25%               # 或 "1"
      maxUnavailable: 25%
  selector:
    matchLabels:
      app: web
    matchExpressions:             # 复杂选择
    - { key: tier, operator: In, values: [frontend] }
  template:                       # 完整 Pod spec
    metadata:
      labels: { app: web }
    spec:
      # Pod spec 所有字段
```

**`spec.selector` 不可变**!改了 selector 等于删了旧的,建了新的。

## 4.4 升级策略

### 4.4.1 RollingUpdate(默认,生产首选)

```yaml
strategy:
  type: RollingUpdate
  rollingUpdate:
    maxSurge: 25%        # 新建时最多超出 replicas 多少
    maxUnavailable: 25%  # 删除时最多不可用多少
```

**升级流程**(以 4 副本为例,`maxSurge=1, maxUnavailable=0`):

```text
0. 初始: 4 个 v1 副本
1. 新建 1 个 v2(共 5 个)
2. 等 v2 ready
3. 删除 1 个 v1(共 4 个)
4. 重复 1-3,直到全部 v2
```

**关键参数**:

| 参数 | 推荐 | 含义 |
|------|------|------|
| `maxSurge: 0` | ❌ 不推荐 | 没有 buffer,容易卡住 |
| `maxSurge: 25%` | ✅ 默认 | 平衡 |
| `maxSurge: 100%` | 内存/启动快 | 快但资源需求峰值高 |
| `maxUnavailable: 0` | 高可用 | 永不减,但升级慢 |
| `maxUnavailable: 25%` | ✅ 默认 | 平衡 |
| `maxUnavailable: 50%` | 敢冒险 | 升级快 |

### 4.4.2 Recreate

```yaml
strategy:
  type: Recreate
```

**全部删完再起**。会**有停机时间**!只在以下场景用:
- StatefulSet 跑老版本不兼容的应用
- 单实例 + 不能并行
- 内存无法支撑双倍资源时

## 4.5 滚动升级实战

```bash
# 1. 修改镜像(用 set)
kubectl set image deploy/nginx nginx=nginx:1.26

# 2. 编辑 yaml 然后 apply
kubectl edit deploy nginx
# 或
vim nginx.yaml && kubectl apply -f nginx.yaml

# 3. 看进度
kubectl rollout status deploy/nginx

# 4. 看历史
kubectl rollout history deploy/nginx
REVISION  CHANGE-CAUSE
1         <none>
2         <none>
3         升级到 1.26

# 5. 回滚
kubectl rollout undo deploy/nginx              # 上一版
kubectl rollout undo deploy/nginx --to-revision=2  # 指定版本
```

### `kubectl rollout` 完整命令

```bash
kubectl rollout status deploy/nginx
kubectl rollout history deploy/nginx
kubectl rollout undo deploy/nginx
kubectl rollout undo deploy/nginx --to-revision=2
kubectl rollout pause deploy/nginx             # 暂停
kubectl rollout resume deploy/nginx            # 恢复
kubectl rollout restart deploy/nginx           # 重启(rollout 全新版本)
```

## 4.6 蓝绿部署(Blue/Green)

**本质**:跑两套 Deployment,切流量。

```yaml
# blue-v1.yaml
kind: Deployment
metadata: { name: web-v1 }
spec:
  replicas: 3
  template:
    spec:
      containers:
      - { name: app, image: myapp:1.0 }
---
# green-v2.yaml
kind: Deployment
metadata: { name: web-v2 }
spec:
  replicas: 3
  template:
    spec:
      containers:
      - { name: app, image: myapp:2.0 }
```

```bash
# Service 通过 selector 切流量
apiVersion: v1
kind: Service
metadata: { name: web }
spec:
  selector:
    app: web
    version: v1        # 改 v2 就切过去了
  ports:
  - { port: 80, targetPort: 8080 }
```

**流程**:
1. 部署 v1,流量走 v1
2. 部署 v2(测试),v1 仍接流量
3. 测试 v2 OK
4. 改 Service selector `version: v2`,流量秒切
5. 观察,出问题改回 v1
6. 删 v1

**优点**:秒级回滚,**零停机**。
**缺点**:资源翻倍(同时跑两套),DB 兼容性问题。

## 4.7 金丝雀(Canary)

**本质**:新版先放少量副本,逐步加量。

### 方法 1:两个 Deployment + Service

```yaml
# 稳定版
kind: Deployment
metadata: { name: web-stable }
spec:
  replicas: 9
  template:
    metadata:
      labels: { app: web, track: stable }
    spec:
      containers:
      - { name: app, image: myapp:1.0 }
---
# 金丝雀
kind: Deployment
metadata: { name: web-canary }
spec:
  replicas: 1
  template:
    metadata:
      labels: { app: web, track: canary }
    spec:
      containers:
      - { name: app, image: myapp:2.0 }
---
apiVersion: v1
kind: Service
metadata: { name: web }
spec:
  selector:
    app: web            # 包含 stable 和 canary
  ports:
  - { port: 80, targetPort: 8080 }
```

**流量分配**:10% 流量(1/10)到 canary。

逐步加量:`web-canary` 改 `replicas: 2`(20%), 3(30%)..., 最后删除 `web-stable`,`web-canary` 改名为 `web-stable`。

### 方法 2:Istio / Linkerd / SMI(推荐)

```yaml
# 用 Service Mesh 按权重切流量(详见 15 章)
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata: { name: web }
spec:
  hosts: [web]
  http:
  - route:
    - destination: { host: web-stable }
      weight: 90
    - destination: { host: web-canary }
      weight: 10
```

### 方法 3:K8s 1.18+ 基于 Header 的流量切分(实验)

需要 Service Mesh 支持。

## 4.8 Deployment 自动伸缩

### HPA(水平,水平增加 Pod 数量)

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata: { name: web-hpa }
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: web
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: AverageValue
        averageValue: 500Mi
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 0
      policies:
      - type: Percent
        value: 100
        periodSeconds: 30
    scaleDown:
      stabilizationWindowSeconds: 300    # 慢缩(防抖动)
      policies:
      - type: Percent
        value: 10
        periodSeconds: 60
```

详见 13 章。

## 4.9 ProgressDeadlineExceeded 排查

当升级卡住超过 `progressDeadlineSeconds`(默认 10 分钟)会触发:

```bash
kubectl describe deploy nginx
# Conditions:
#   Type: Progressing
#   Status: False
#   Reason: ProgressDeadlineExceeded
#   Message: Deployment does not have minimum availability.
```

**常见原因**:
1. **新 Pod 一直 not ready**(`readinessProbe` 失败 / 镜像拉取失败 / 资源不足)
2. **maxSurge=0 + maxUnavailable=0**:升级根本不动
3. **没有 resources request**:新 Pod Pending 等调度
4. **maxSurge 太低 + 集群资源不足**

```bash
# 查具体什么卡住了
kubectl get pods -l app=nginx
kubectl describe pods -l app=nginx
kubectl get events --sort-by=.lastTimestamp
```

## 4.10 `revisionHistoryLimit` 与 etcd

每次升级创建一个 ReplicaSet,`revisionHistoryLimit` 决定保留多少老 RS:

- 默认 10
- 设 5:滚动 5 次后,最老的 RS 会被删
- 设 0:**完全不留**,回滚只回 `current` 的上一版

**生产建议**:
- 关键服务:5-10(回滚要留余地)
- 内存紧 / 部署频繁:2-3

**节省 etcd**:
- 1000 部署 × 5 RS × 平均 50KB spec ≈ 250MB etcd 存储,不大,但积少成多

## 4.11 Pause & Resume(配合金丝雀)

```bash
# 1. 起 deployment 但暂停
kubectl apply -f deploy.yaml
kubectl rollout pause deploy/nginx

# 2. 改镜像(不会触发升级,因为 pause)
kubectl set image deploy/nginx nginx=myapp:2.0
# 此时 status 还是老版本

# 3. 切流量(用 Service selector)
# 比如先放 5% 流量过去

# 4. 验证 OK,resume
kubectl rollout resume deploy/nginx

# 5. 升级完成
```

**专家用法**:
- 配合 Service Mesh 的"流量染色",可以**完全无侵入**地金丝雀

## 4.12 镜像版本最佳实践

```yaml
# ❌ 错误
image: nginx              # 默认 latest,镜像变了不升级
image: nginx:1.25         # OK,但有歧义
image: myapp:latest       # 大忌

# ✅ 正确
image: nginx:1.25.3       # 具体版本
image: nginx@sha256:abc...# 镜像 digest(最稳,但 yaml 长)

# 推荐:tag + digest 一起
image: nginx:1.25.3@sha256:abc...
```

**镜像 digest 的价值**:
- 同一个 tag 重新 push 不会更新 digest
- 保证你跑的就是你测试时的镜像

## 4.13 Probes 在滚动升级中的作用

**专家级技巧**:

```yaml
# 关键:readiness 要等到应用真正"准备好接流量"
# 比如 Spring Boot + 注册中心:
readinessProbe:
  httpGet:
    path: /actuator/health/readiness   # 只检查注册成功、依赖就绪
    port: 8080
  periodSeconds: 5
  failureThreshold: 3

livenessProbe:
  httpGet:
    path: /actuator/health/liveness    # 只检查进程活着
    port: 8080
  periodSeconds: 30
  failureThreshold: 3
```

**升级时**:
- 老 Pod 收到 SIGTERM → preStop 跑完 → readiness 失败 → 摘流
- 新 Pod ready 后才接流
- **这两步必须都正确,才能零停机升级**

## 4.14 真实案例:Dockerfile + Deployment 协同

```dockerfile
# 极简镜像 + 优雅退出
FROM eclipse-temurin:17-jre-alpine
COPY app.jar /app.jar
EXPOSE 8080
USER 65532:65532            # 非 root
STOPSIGNAL SIGTERM          # 显式声明(默认就是 SIGTERM)
ENTRYPOINT ["java", "-jar", "/app.jar"]
```

```yaml
# Deployment 配合
spec:
  terminationGracePeriodSeconds: 30   # 给 JVM 收尾
  containers:
  - name: app
    image: myapp:1.0
    lifecycle:
      preStop:
        exec:
          command: ["sh", "-c", "sleep 10"]   # 等 endpoint 摘流
```

## 4.15 本章小结

- Deployment 管 ReplicaSet,ReplicaSet 管 Pod
- `strategy`:RollingUpdate(默认)/ Recreate
- 滚动升级:`maxSurge` + `maxUnavailable` 控制节奏
- `kubectl rollout status/undo/history/pause/resume/restart`
- 蓝绿:两套 Deployment + Service selector 切换
- 金丝雀:权重切流量,两个 Deployment + 一个 Service
- `revisionHistoryLimit` 控制历史,默认 10
- `progressDeadlineSeconds` 默认 10 分钟,超时需查 Pod
- 镜像用具体 tag 或 digest,永远不用 `latest`
- 优雅升级 = 正确 preStop + readiness + Service 摘流时序配合
