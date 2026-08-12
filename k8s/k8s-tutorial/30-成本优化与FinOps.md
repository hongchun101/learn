# 30. 成本优化与 FinOps

## 30.1 FinOps 是什么

**FinOps** = Financial Operations,**云财务运营**。让工程、财务、业务**协作**,在速度、成本、质量间取得平衡。

```text
传统:
  财务: "云费用太高了"
  工程: "我们没用多少"
  → 互相甩锅

FinOps:
  工程 + 财务 + 产品 共同:
  - 实时可见成本
  - 优化决策
  - 持续改进
```

**三大原则**:
1. **团队要负责自己的云成本**(accountability)
2. **业务价值驱动**(不是省越多越好)
3. **集中决策,分散执行**(centralize, federate)

## 30.2 K8s 成本结构

```text
K8s 总成本 = 控制面 + 节点 + 存储 + 流量 + 第三方组件

明细:
  - 计算资源(CPU/内存): 60-70%
  - 存储(EBS/云盘/对象存储): 10-20%
  - 网络流量(LB/出口): 5-10%
  - 第三方组件(LoadBalancer/快照/日志): 5-10%
```

### 成本拆解

```bash
# 1. 单 Pod 成本
pod_cost = (pod_cpu_requests * cpu_price) +
           (pod_memory_requests * mem_price) +
           pod_storage_gb * storage_price +
           network_egress_gb * egress_price

# 2. 单 Namespace
ns_cost = Σ(pod_cost in ns) / Σ(all_pod_cost) * cluster_total_cost

# 3. 单 Team
team_cost = Σ(ns_cost for team)
```

## 30.3 资源成本可视化

### Kubecost(主流工具)

```bash
# 安装
helm repo add kubecost https://kubecost.github.io/cost-analyzer/
helm install kubecost kubecost/cost-analyzer \
  --namespace kubecost --create-namespace
```

**功能**:
- 实时成本分摊(命名空间、label、业务)
- 资源浪费分析(over-provisioned)
- 优化建议
- 预测(forecast)
- Alert(预算超支)

```bash
# 端口转发看 UI
kubectl port-forward -n kubecost svc/kubecost-cost-analyzer 9090:9090
```

### OpenCost(CNCF 开源)

```bash
helm install opencost opencost/opencost \
  --namespace opencost --create-namespace
```

## 30.4 节点级成本优化

### 1. 实例选型

```text
通用实例:
  AWS:  m5/c5
  Azure: Dv3/Dsv3
  GCP:  n2-standard

计算优化:
  AWS:  c5/c6i
  Azure: Fsv2
  GCP:  c2-standard

内存优化:
  AWS:  r5/r6i
  Azure: Ev3/Esv3
  GCP:  m2-ultramem

ARM(性价比):
  AWS:  Graviton2/3(便宜 20%)
  GCP:  Tau T2A
  Azure: Ampere Altra

Spot(便宜 60-90%):
  AWS:  Spot
  GCP:  Spot
  Azure: Spot
```

### 2. Spot/Preemptible 实例

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: batch-job
spec:
  template:
    spec:
      nodeSelector:
        node.kubernetes.io/lifecycle: spot
      tolerations:
      - key: "cloud.google.com/gke-spot"
        operator: "Equal"
        value: "true"
        effect: "NoSchedule"
```

**适合**:无状态、可中断、有副本的应用
**不适合**:数据库主节点、有状态服务

### 3. Karpenter(自动选型)

见 13 章。**Karpenter** 自动选最便宜的实例,比 Cluster Autoscaler 节省 20-30%。

### 4. Reserved Instance / Savings Plan

```text
承诺折扣:
  AWS:  Savings Plan 1 年 27% / 3 年 50%
  GCP:  Committed Use Discount
  Azure: Reserved VM Instances
```

**策略**:
- 稳定负载 → 1 年/3 年承诺(高折扣)
- 弹性负载 → 按需 + Spot
- 混合:60% 承诺 + 30% 按需 + 10% Spot

## 30.5 应用级成本优化

### 1. requests 准确化

```text
问题:
  - requests 设太大 → 浪费 50% 资源
  - requests 设太小 → OOM、性能差
  - requests 不设 → 节点超卖、调度不均
```

**工具**:
- **VPA Recommender**:分析历史,给建议
- **Kube-resource-recommender**:基于 prometheus 数据
- **Kubecost**:实时建议

```bash
# 1. VPA 跑 dry-run,看推荐
kubectl get vpa -A

# 2. 应用建议
kubectl patch vpa my-vpa --type merge -p '{"spec":{"updatePolicy":{"updateMode":"Auto"}}}'
```

### 2. HPA/VPA/KEDA(见 13 章)

让 Pod 数 / 资源**跟着负载走**。

```text
HPA 缩容: 节省 30-50% (低峰期缩)
VPA 缩 requests: 节省 10-20%
KEDA 事件驱动: 节省 60-80% (突发负载)
```

### 3. 镜像优化

```dockerfile
# ❌ 1.5GB
FROM ubuntu:latest
RUN apt-get update && apt-get install -y python3

# ✅ 50MB
FROM python:3.12-slim

# ✅ 20MB
FROM gcr.io/distroless/python3-debian12

# ✅ 10MB
FROM cgr.dev/chainguard/python:latest
```

**节省**:10x 存储 + 10x 拉取速度 + 减少攻击面

### 4. 节点池隔离

```text
节点池设计:
  system-pool: 系统组件(GPU 节点不需要,固定数量)
  app-pool:   应用(常规)
  spot-pool:  Spot 实例(批处理)
  gpu-pool:   GPU 任务(昂贵)
  db-pool:    数据库(本地 SSD)
```

**好处**:
- 单独优化每种池
- 数据库节点用本地 SSD 比 EBS 便宜
- 批处理用 Spot 节省 70%

## 30.6 存储成本

### 存储类型

```text
高性能(贵):
  AWS:  io2 Block Express
  GCP:  pd-extreme
  Azure: Premium SSD v2
  
通用(中等):
  AWS:  gp3
  GCP:  pd-balanced
  Azure: Premium SSD
  
容量优化(便宜):
  AWS:  st1(sc1 更便宜)
  GCP:  pd-standard
  Azure: Standard HDD

归档(最便宜):
  AWS:  S3 Glacier
  GCP:  Coldline/Archive
  Azure: Archive Storage
```

### 优化策略

```yaml
# 1. 用合适类型
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata: { name: fast-ssd }
provisioner: ebs.csi.aws.com
parameters:
  type: gp3
  iops: "3000"
  throughput: "125"

---
# 2. 自动扩容 + 自动缩容(部分 CSI 支持)
allowVolumeExpansion: true
volumeBindingMode: WaitForFirstConsumer
```

```text
节省技巧:
  - 日志用 S3/OSS(对象存储,便宜)
  - 备份用 IA/Archive
  - 临时数据用 emptyDir(无存储成本)
  - 数据库考虑 PolarDB/RDS(比 K8s 自建 DB 便宜)
```

## 30.7 网络成本

```bash
# 1. 跨可用区流量(AZ 间,贵)
# 解决: 用 topology spread 减少跨 AZ

# 2. 出口流量(出云,贵)
# 解决: CloudFront/CDN 缓存、压缩

# 3. NAT 网关(AWS 贵)
# 解决: VPC Endpoint 减少 NAT 调用
```

**实战:避免跨 AZ 流量**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata: { name: web }
spec:
  template:
    spec:
      topologySpreadConstraints:
      - maxSkew: 1
        topologyKey: topology.kubernetes.io/zone  # 同 AZ
        whenUnsatisfiable: DoNotSchedule
```

## 30.8 成本监控与告警

### Prometheus + Kubecost

```yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: cost-alerts
spec:
  groups:
  - name: cost
    rules:
    - alert: CostOverBudget
      expr: kubecost_cluster_costs > 5000  # 月度预算 $5000
      for: 1h
      annotations:
        summary: "集群成本超预算"
    
    - alert: LowUtilization
      expr: |
        (
          sum(kube_node_status_allocatable{resource="cpu"})
          -
          sum(kubecost_cluster_cpu_allocatable - kubecost_cluster_cpu_used)
        ) / sum(kube_node_status_allocatable{resource="cpu"}) < 0.3
      for: 24h
      annotations:
        summary: "集群 CPU 利用率 < 30%,考虑缩容"
```

### Grafana Dashboard

```bash
# 导入 Kubecost Dashboard(ID: 9614)
# 关键面板:
#  - 集群总成本趋势
#  - 命名空间成本排名
#  - 资源浪费率
#  - 各 team 成本
```

## 30.9 FinOps 治理流程

```text
1. 可视化(Visibility):
   - Kubecost/OpenCost 部署
   - 每个 team 有 dashboard
   - 每周成本 review

2. 优化(Optimization):
   - 资源 request 准确化
   - Spot/Preemptible 使用
   - 节点池分离
   - 存储分层
   - 自动扩缩

3. 运营(Operation):
   - 预算管理(每 team 预算)
   - 超支告警
   - 异常费用检测
   - 资源标签(chargeback)

4. 文化(Culture):
   - 工程师培训
   - 成本目标纳入 KPI
   - 持续改进
```

## 30.10 成本标签与分摊

```yaml
# 1. 在 Pod/namespace 加业务标签
metadata:
  labels:
    app.kubernetes.io/component: api
    team: payment
    cost-center: "C-1001"
    project: "ecommerce"
    env: production
```

```bash
# 2. 用 Kubecost 分摊
# Kubecost 自动按 label 分摊
# kubectl-cost 工具
kubectl cost namespace prod
kubectl cost deployment web --namespace prod
```

## 30.11 Spot 实例高级用法

### Spot 节点组

```yaml
# 1. Spot 节点组
apiVersion: karpenter.sh/v1alpha5
kind: NodePool
metadata: { name: spot }
spec:
  template:
    spec:
      nodeClassRef:
        name: default
      requirements:
      - key: karpenter.sh/capacity-type
        operator: In
        values: ["spot"]
```

### 混部 Spot + On-Demand

```text
比例: 70% Spot + 30% On-Demand
- Spot 副本 = 70% * total
- On-Demand = 30% * total(打底)

中断处理:
  - 监听 Node termination notice
  - 5 分钟内排空(K8s 触发)
  - Pod 调度到其他节点(PDB 保护)
```

### 实战:批处理 Spot 化

```yaml
apiVersion: batch/v1
kind: Job
metadata: { name: batch-etl }
spec:
  template:
    spec:
      nodeSelector:
        node.kubernetes.io/lifecycle: spot
      tolerations:
      - key: "spot"
        operator: "Equal"
        value: "true"
        effect: "NoSchedule"
      restartPolicy: OnFailure
      containers:
      - name: etl
        image: etl:v1
```

## 30.12 真实案例

### 案例 1:大厂成本优化 50%

```text
背景: 1000 节点集群,月成本 $300K
优化:
  1. VPA 准确化 requests → 节省 $30K
  2. Spot 批处理 → 节省 $20K
  3. 节点池拆分 + 实例选型 → 节省 $40K
  4. 存储分层(日志/备份归档) → 节省 $25K
  5. 镜像优化 + 减少基础镜像 → 节省 $20K
  6. HPA 精细化 → 节省 $15K
合计: $150K(50%)
```

### 案例 2:Savings Plan 决策

```text
负载特征:
  基础负载: 100 节点(永远在跑)
  弹性负载: 0-50 节点(看时间)

决策:
  基础 → Savings Plan 1 年(40% off)
  弹性 → On-Demand(高峰期 Spot)

结果: 整体节省 35%
```

## 30.13 成本工具栈

| 工具 | 用途 | 开源 |
|------|------|------|
| **Kubecost** | K8s 成本分析 | 部分 |
| **OpenCost** | CNCF 开源替代 | ✅ |
| **kubectl-cost** | CLI 成本查询 | ✅ |
| **Cast.ai** | 自动优化 | 商业 |
| **Spot.io** | Spot 编排 | 商业 |
| **CloudHealth** | 多云 | 商业 |
| **Vantage** | 多云 FinOps | 商业 |
| **Cloudability** | 企业 | 商业 |

## 30.14 成本优化清单

- [ ] 部署 Kubecost 或 OpenCost
- [ ] 用 VPA recommender 准确化 requests
- [ ] 配置 HPA + KEDA 弹性扩缩
- [ ] 拆分节点池(system/app/spot/gpu)
- [ ] 镜像用 distroless/chainguard
- [ ] 存储分层(SSD/HDD/Object)
- [ ] Spot 实例用于无状态/批处理
- [ ] 业务标签完整(team/cost-center)
- [ ] 预算告警 + 异常检测
- [ ] 季度成本 review

## 30.15 本章小结

- FinOps = 工程+财务+业务协作管云成本
- K8s 成本主项:计算(60-70%)+ 存储(10-20%)+ 网络
- 工具:**Kubecost**(主流)/ **OpenCost**(开源)
- 优化手段:VPA/HPA/KEDA、Spot、节点池拆分、镜像瘦身
- 节省 30-50% 是常见水平,优秀团队 60%+
- 关键是:可视化 → 优化 → 持续运营
- 与 SRE/GitOps 配合,形成完整治理体系
