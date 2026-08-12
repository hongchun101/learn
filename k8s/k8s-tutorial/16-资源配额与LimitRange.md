# 16. 资源配额与 LimitRange

## 16.1 多租户下的资源问题

```text
team-a 部署 100 个 Pod,每个 request 1Gi 内存
team-b 部署 50 个 Pod,每个 request 2Gi 内存
team-c 部署 200 个 Pod,每个 request 4Gi 内存
→ 节点资源耗尽,大家都跑不起来
→ 没责任主体,相互扯皮
```

**没有配额 = 资源无序竞争**。

## 16.2 三大资源控制对象

| 对象 | 作用 | 范围 |
|------|------|------|
| **ResourceQuota** | 命名空间总配额 | namespace |
| **LimitRange** | 单个对象限制(默认 / 最大 / 最小) | namespace |
| **PriorityClass** | 调度优先级 | cluster |

## 16.3 ResourceQuota(命名空间配额)

```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: team-a-quota
  namespace: team-a
spec:
  hard:
    # 计算资源
    requests.cpu: "20"             # 所有 Pod requests 总和 ≤ 20 核
    requests.memory: 40Gi
    limits.cpu: "40"
    limits.memory: 80Gi
    # 存储
    requests.storage: 100Gi
    persistentvolumeclaims: "10"   # 最多 10 个 PVC
    requests.ephemeral-storage: 10Gi
    # 资源对象数量
    pods: "50"
    services: "50"
    services.nodeports: "0"        # 禁用 NodePort
    services.loadbalancers: "2"    # 最多 2 个 LB
    secrets: "100"
    configmaps: "100"
    deployments.apps: "50"
    statefulsets.apps: "20"
    jobs.batch: "20"
    cronjobs.batch: "10"
    # 限制特定 SC
    ssd.storageclass.storage.k8s.io/persistentvolumeclaims: "5"
```

**效果**:
- 命名空间内所有 Pod 的 `requests.cpu` 总和不能超过 20
- 不能创建超过 50 个 Pod
- 不能创建超过 5 个 ssd 类的 PVC

### 完整字段速查

```yaml
spec:
  hard:
    # CPU / 内存 / 存储
    requests.cpu
    requests.memory
    limits.cpu
    limits.memory
    requests.storage
    limits.storage
    requests.ephemeral-storage
    limits.ephemeral-storage
    persistentvolumeclaims
    # 对象数量
    pods
    replicationcontrollers
    services
    services.nodeports
    services.loadbalancers
    secrets
    configmaps
    ingresses.networking.k8s.io
    # 业务资源
    deployments.apps
    statefulsets.apps
    daemonsets.apps
    replicasets.apps
    jobs.batch
    cronjobs.batch
    # SC 限定
    <storageclass-name>.storageclass.storage.k8s.io/persistentvolumeclaims
    <storageclass-name>.storageclass.storage.k8s.io/requests.storage
```

## 16.4 LimitRange(默认/最大/最小限制)

**作用**:给 namespace 设"默认资源",防止用户忘写 `requests`。

```yaml
apiVersion: v1
kind: LimitRange
metadata:
  name: default-limits
  namespace: team-a
spec:
  limits:
  # 1. Container 默认/最大
  - type: Container
    default:                          # limits 默认值
      cpu: 500m
      memory: 512Mi
    defaultRequest:                   # requests 默认值
      cpu: 100m
      memory: 128Mi
    min:                              # 单个容器最小
      cpu: 50m
      memory: 64Mi
    max:                              # 单个容器最大
      cpu: 2
      memory: 4Gi
    maxLimitRequestRatio:             # limits/requests 比值
      cpu: 4
      memory: 2
  # 2. Pod 总和
  - type: Pod
    max:
      cpu: 4
      memory: 8Gi
  # 3. PVC 限制
  - type: PersistentVolumeClaim
    min:
      storage: 1Gi
    max:
      storage: 100Gi
```

**关键作用**:

| 字段 | 行为 |
|------|------|
| `default` | 用户没写 `limits` 时,用这个 |
| `defaultRequest` | 用户没写 `requests` 时,用这个 |
| `min`/`max` | 用户必须在这个范围内,否则拒绝 |
| `maxLimitRequestRatio` | 限制 limits 不能比 requests 大太多 |

### 实战:ResourceQuota + LimitRange 组合

```yaml
# 1. 命名空间
apiVersion: v1
kind: Namespace
metadata: { name: team-a }
---
# 2. 默认值 + 范围
apiVersion: v1
kind: LimitRange
metadata:
  name: default-limits
  namespace: team-a
spec:
  limits:
  - type: Container
    default: { cpu: 500m, memory: 512Mi }
    defaultRequest: { cpu: 100m, memory: 128Mi }
    min: { cpu: 50m, memory: 64Mi }
    max: { cpu: 2, memory: 4Gi }
---
# 3. 总配额
apiVersion: v1
kind: ResourceQuota
metadata:
  name: team-a-quota
  namespace: team-a
spec:
  hard:
    requests.cpu: "20"
    requests.memory: 40Gi
    limits.cpu: "40"
    limits.memory: 80Gi
    pods: "50"
    services.loadbalancers: "2"
```

**效果**:
- 用户忘写 `resources` → 用 LimitRange 默认值
- 用户写超 `max` → 创建失败
- namespace 总用量超 ResourceQuota → 创建失败

## 16.5 PriorityClass(调度优先级)

**作用**:节点资源不够时,优先级低的先被驱逐。

```yaml
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: high-priority
value: 1000000
globalDefault: false
description: "Critical system pods"
preemptionPolicy: PreemptLowerPriority
```

### 系统默认 PriorityClass

```text
system-node-critical     value: 2000000999  (system daemonset)
system-cluster-critical  value: 2000000000  (cluster-essential)
system-medium            value: 100          (默认 if not set)
system-low               value: 999999999    (驱逐时优先)
```

### Pod 用

```yaml
spec:
  priorityClassName: high-priority
```

**Preemption**(抢占):

```text
场景:
- 节点 100% 满了
- 高优先级 Pod 无法调度
- 调度器找优先级低的 Pod
- 驱逐低优先级 Pod(优雅删除)
- 高优先级 Pod 调度成功
```

**生产注意**:
- 高优先级 Pod 必须有**资源 requests**(否则调度器无法算)
- 配合 **PDB** 防止驱逐关键服务
- **不要滥用**——所有 Pod 都"高优先级"等于没优先级

### PriorityClass 实战:核心/普通/批处理分层

```yaml
# 1. 核心服务
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata: { name: production-critical }
value: 1000
globalDefault: false
preemptionPolicy: PreemptLowerPriority
description: "生产核心,最低优先级"
---
# 2. 重要服务
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata: { name: production-normal }
value: 100
globalDefault: true                 # 默认
preemptionPolicy: PreemptLowerPriority
description: "生产普通服务"
---
# 3. 批处理
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata: { name: batch-low }
value: -100
globalDefault: false
preemptionPolicy: Never             # 批处理不抢占
description: "批处理,被驱逐无影响"
```

## 16.6 实战:多租户完整方案

```yaml
# 1. 命名空间
apiVersion: v1
kind: Namespace
metadata:
  name: team-a
  labels:
    team: a
    environment: production
---
# 2. LimitRange(防止忘写资源)
apiVersion: v1
kind: LimitRange
metadata:
  name: default
  namespace: team-a
spec:
  limits:
  - type: Container
    default: { cpu: 1, memory: 1Gi }
    defaultRequest: { cpu: 100m, memory: 128Mi }
    min: { cpu: 50m, memory: 64Mi }
    max: { cpu: 4, memory: 8Gi }
---
# 3. ResourceQuota
apiVersion: v1
kind: ResourceQuota
metadata:
  name: team-a
  namespace: team-a
spec:
  hard:
    requests.cpu: "40"
    requests.memory: 80Gi
    limits.cpu: "100"
    limits.memory: 200Gi
    pods: "100"
    services: "100"
    services.loadbalancers: "3"
    secrets: "200"
    configmaps: "200"
    persistentvolumeclaims: "20"
    requests.storage: 500Gi
    ssd.storageclass.storage.k8s.io/persistentvolumeclaims: "5"
    ssd.storageclass.storage.k8s.io/requests.storage: 200Gi
---
# 4. RBAC
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: team-a-developers
  namespace: team-a
subjects:
- { kind: Group, name: team-a-dev, apiGroup: rbac.authorization.k8s.io }
roleRef:
  kind: ClusterRole
  name: team-developer         # 自定义 ClusterRole
  apiGroup: rbac.authorization.k8s.io
```

## 16.7 Pod QoS 与驱逐

K8s **节点资源紧张时**驱逐 Pod 的顺序:

```text
QoS BestEffort  →  先杀
QoS Burstable   →  中间
QoS Guaranteed  →  最后
```

**强制 OOM 时**:
- `Guaranteed` 最后杀
- `BestEffort` 最先杀
- 内存 `requests == limits` 的优先保留

**生产铁律**:**关键服务用 Guaranteed**。

## 16.8 高级:Kube-Resource-Recommender

**问题**:人工设置资源太难,设多浪费,设少 OOM。

**工具**:[kube-resource Recommender](https://github.com/kubecost/cost-model) (VPA recommender) 分析历史,给推荐值。

```bash
# 用 VPA recommender 模式(不自动改,只推荐)
helm install vpa autoscaler/vertical-pod-autoscaler --namespace vpa
# 在 vpa-recommender deployment 上加 --recommender-mode=off(看推荐)
```

```bash
# 查推荐
kubectl describe vpa web-vpa
# Recommendation:
#   Container Recommendations:
#     Target:
#       Cpu:     250m
#       Memory:  262144k
#     Lower Bound:
#       Cpu:     25m
#       Memory:  26214k
#     Upper Bound:
#       Cpu:     587m
#       Memory:  700Mi
```

## 16.9 配额监控

```bash
# 1. 查配额状态
kubectl describe resourcequota -n team-a
# Name:       team-a
# Resource    Used    Hard
# --------    ----    ----
# pods        23      100
# requests.cpu    5.2  40

# 2. 配额耗尽时
# Pod 创建会报错:
# Error creating: pods "web" is forbidden:
#   exceeded quota: team-a-quota,
#   requested: requests.cpu=2, used: requests.cpu=40, limited: requests.cpu=40

# 3. Prometheus 抓取
# metric: kube_resourcequota{resource="requests.cpu", type="used"}
```

## 16.10 容量规划方法论

### 步骤

```text
1. 业务梳理
   - 多少应用 / 多少 Pod
   - 业务重要性(核心/重要/普通/批处理)
2. 资源估算
   - 单 Pod CPU/内存 / 磁盘
   - 高峰/平均/低谷
3. 配额分配
   - 核心:10% 资源(高优先级)
   - 重要:30% 资源
   - 普通:40% 资源
   - 批处理:20% 资源(低优先级)
4. 集群规划
   - 节点数 = (总资源 / 单节点资源) × 1.3 (HA)
   - 节点类型:通用(8C32G) + 内存型(8C64G) + GPU
5. HPA/Karpenter
   - 自动扩缩应对突发
   - 节点池按业务类型分
```

### 公式

```text
集群总 CPU = 业务 CPU 总和 × 1.3
集群总内存 = 业务内存总和 × 1.5 (内存更难扩)
节点数 = 集群总 CPU / 单节点 CPU
```

## 16.11 故障案例

### 案例 1:Pod 一直 Pending

```bash
# Error: 0/3 nodes are available:
#   1 Insufficient cpu,
#   2 Preemption is not helpful for scheduling.

# 原因:
# 1. 集群资源满了
# 2. 优先级不够,被高优先级抢占
# 3. ResourceQuota 用尽

# 解决:
# 1. 加节点 / 调小请求
# 2. 升级 PriorityClass
# 3. 扩 ResourceQuota
```

### 案例 2:LimitRange 限制导致 Pod 创建失败

```bash
# 错误: Pod "web" is invalid:
#   spec.containers[0].resources.limits.cpu: Invalid value: "10":
#   must be less than or equal to limit: cpu=4 (from LimitRange)

# 解决:
# 1. 改 limit ≤ 4
# 2. 改 LimitRange max
```

### 案例 3:驱逐后服务不可用

```text
# 现象: 节点内存紧张,Pod 被杀
# 关键服务也死了

# 原因: 没配 PDB + 优先级低

# 解决:
# 1. 关键服务 PriorityClass 高
# 2. PodDisruptionBudget
# 3. requests 调准(避免频繁 OOM)
```

## 16.12 专家清单

- [ ] 每个 namespace 配 ResourceQuota
- [ ] LimitRange 设默认值,防止忘写 resources
- [ ] 关键服务用 Guaranteed QoS
- [ ] PriorityClass 分层(核心/普通/批处理)
- [ ] 监控配额使用率
- [ ] 容量规划:核心业务预留 10% 资源
- [ ] 配合 HPA/Karpenter 自动扩
- [ ] 关键服务设 PDB
- [ ] 用 VPA recommender 看推荐值
- [ ] 定期 review(配额不够及时扩)

## 16.13 本章小结

- 三大资源控制:ResourceQuota(总配额)+ LimitRange(默认/范围)+ PriorityClass(优先级)
- ResourceQuota:namespace 总资源上限
- LimitRange:容器/Pod/PVC 默认值 + 范围
- PriorityClass:调度优先级,资源紧张时低优先级先被杀
- 三层防御:Quota 限总量、Range 限单对象、Priority 限优先级
- 关键服务 Guaranteed QoS + 高 PriorityClass + PDB
- 容量规划:核心预留、批处理低优、HPA/Karpenter 弹性
- 监控配额使用率,定期调整
