# 31. 多集群管理(Cluster API / Rancher / KubeFed)

## 31.1 为什么需要多集群

```text
单集群问题:
  - 爆炸半径: 一个集群挂 = 所有业务挂
  - 多团队: 资源争抢
  - 多区域: 单 region 不够
  - 多云: 厂商绑定风险
  - 隔离: 测试/生产/合规分离

多集群场景:
  - 业务高可用(同应用跑多个集群)
  - 灾备(主集群挂了切备集群)
  - 地理分布(美东/美西/欧洲)
  - 蓝绿部署(新旧集群并存)
  - 多云/混合云
```

**多集群架构模式**:

| 模式 | 描述 | 场景 |
|------|------|------|
| **Active-Passive** | 一个主,一个备 | 灾备 |
| **Active-Active** | 多个同时服务 | 全球化 |
| **Geographically Distributed** | 区域独立 | 法规要求 |
| **Multi-cloud** | 多云 | 防厂商绑定 |

## 31.2 多集群管理工具全景

| 工具 | 特点 | 适用 |
|------|------|------|
| **Cluster API (CAPI)** | K8s 官方,声明式管理集群生命周期 | 自建多云 |
| **Rancher** | 商业友好,多 K8s 发行版,UI 强 | 企业 |
| **KubeFed**(v2) | 官方 Federation,但 KEP 重启 | 暂不推荐 |
| **Karmada** | 多集群编排,华为出品 | 国内 |
| **Admiralty** | 跨集群调度 | 学术 |
| **Liqo** | 跨集群 Pod | 边缘 |
| **Clusterpedia** | 多集群资源搜索 | 资源发现 |
| **Istio Multi-Primary** | 跨集群 Service Mesh | 服务网格 |
| **ArgoCD** | 多集群 GitOps | 应用分发 |

## 31.3 Cluster API (CAPI)

**Cluster API** = 用 K8s API 风格管理**集群生命周期**(创建/扩缩/升级/删除)。

```text
Bootstrap 集群(临时) → CAPI 控制器 → 创建 workload 集群
              ↓
        集群描述 = Cluster/Machine/MachineDeployment CRD
```

### 核心 CRD

```text
Cluster               集群描述
├─ MachineDeployment  节点组(类似 Deployment)
├─ MachineSet         节点集(类似 ReplicaSet)
├─ Machine            单个节点(类似 Pod)
├─ KubeadmControlPlane 控制面模板
├─ KubeadmConfigTemplate  启动配置
└─ AWSCluster/AzureCluster  厂商适配
```

### 安装

```bash
# 1. 准备 bootstrap 集群(可用 kind)
kind create cluster --name=capi-bootstrap

# 2. 装 clusterctl
curl -L https://github.com/kubernetes-sigs/cluster-api/releases/download/v1.7.0/clusterctl-darwin-amd64 -o clusterctl
sudo install -o root -g root -m 0755 clusterctl /usr/local/bin/clusterctl

# 3. 初始化(以 AWS 为例)
clusterctl init --infrastructure aws

# 4. 生成集群定义
clusterctl generate cluster my-cluster \
  --kubernetes-version v1.30.0 \
  --control-plane-machine-count 3 \
  --worker-machine-count 3 \
  > cluster.yaml

# 5. 应用
kubectl apply -f cluster.yaml
```

### Cluster 定义

```yaml
apiVersion: cluster.x-k8s.io/v1beta1
kind: Cluster
metadata:
  name: prod-cluster
  namespace: default
spec:
  clusterNetwork:
    pods:
      cidrBlocks: ["192.168.0.0/16"]
    serviceDomain: "cluster.local"
  infrastructureRef:
    apiVersion: infrastructure.cluster.x-k8s.io/v1beta2
    kind: AWSCluster
    name: prod-cluster
  controlPlaneRef:
    apiVersion: controlplane.cluster.x-k8s.io/v1beta1
    kind: KubeadmControlPlane
    name: prod-cluster-control-plane
---
apiVersion: infrastructure.cluster.x-k8s.io/v1beta2
kind: AWSCluster
metadata:
  name: prod-cluster
spec:
  region: us-east-1
  sshKeyName: default
---
apiVersion: controlplane.cluster.x-k8s.io/v1beta1
kind: KubeadmControlPlane
metadata: { name: prod-cluster-control-plane }
spec:
  replicas: 3
  version: v1.30.0
  infrastructureTemplate:
    apiVersion: infrastructure.cluster.x-k8s.io/v1beta2
    kind: AWSMachineTemplate
    name: prod-cluster-control-plane
  kubeadmConfigSpec:
    initConfiguration:
      nodeRegistration:
        kubeletExtraArgs:
          cloud-provider: aws
```

### MachineDeployment(节点组)

```yaml
apiVersion: cluster.x-k8s.io/v1beta1
kind: MachineDeployment
metadata:
  name: prod-cluster-md-0
  namespace: default
spec:
  clusterName: prod-cluster
  replicas: 3
  selector:
    matchLabels: { cluster.x-k8s.io/cluster-name: prod-cluster }
  template:
    spec:
      clusterName: prod-cluster
      version: v1.30.0
      infrastructureRef:
        name: prod-cluster-md-0
        apiVersion: infrastructure.cluster.x-k8s.io/v1beta2
        kind: AWSMachineTemplate
---
apiVersion: infrastructure.cluster.x-k8s.io/v1beta2
kind: AWSMachineTemplate
metadata: { name: prod-cluster-md-0 }
spec:
  template:
    spec:
      instanceType: m5.large
      amiSelector:
        terms:
        - id: ami-0abcdef1234567890  # Ubuntu 22.04
      iamInstanceProfile: control-plane.cluster-api-provider-aws.sigs.k8s.io
      sshKeyName: default
```

### 升级集群

```bash
# 1. 改 controlPlane version
kubectl patch kubeadmcontrolplane prod-cluster-control-plane --type=merge -p '{"spec":{"version":"v1.31.0"}}'

# 2. 改 MachineDeployment version
kubectl patch machinedeployment prod-cluster-md-0 --type=merge -p '{"spec":{"template":{"spec":{"version":"v1.31.0"}}}}'
```

CAPI 会滚动升级,先升级 control plane,再 worker。

## 31.4 Karmada(多集群编排)

**Karmada** = 把多个 K8s 集群当成一个"超级集群"使用。

```bash
helm install karmada karmada/karmada --namespace karmada-system --create-namespace
```

### PropagationPolicy(资源分发)

```yaml
apiVersion: policy.karmada.io/v1alpha1
kind: PropagationPolicy
metadata:
  name: nginx-policy
  namespace: default
spec:
  resourceSelectors:
  - apiVersion: apps/v1
    kind: Deployment
    name: nginx
  placement:
    clusterAffinity:
      clusterNames:
      - prod-us
      - prod-eu
    replicaDistribution:
      replicas: { name: nginx }
      rules:
      - weight: 1
        clusterNames: [prod-us]
      - weight: 1
        clusterNames: [prod-eu]
  spreadConstraints:
  - spreadByField: cluster
    minGroups: 2  # 至少 2 个集群
```

### OverridePolicy(差异化配置)

```yaml
apiVersion: policy.karmada.io/v1alpha1
kind: OverridePolicy
metadata:
  name: nginx-override
  namespace: default
spec:
  resourceSelectors:
  - apiVersion: apps/v1
    kind: Deployment
    name: nginx
  overrides:
  - clusterName: prod-eu
    overrides:
    - path: "/spec/template/spec/containers/0/env"
      op: add
      value:
      - name: REGION
        value: eu
```

## 31.5 Rancher(企业级多集群)

**Rancher** = 商业友好的多集群管理平台,UI 强。

```bash
# 单命令安装
docker run -d --restart=unless-stopped -p 80:80 -p 443:443 --privileged \
  rancher/rancher:latest
```

### 核心能力

- **导入/创建集群**:任何 K8s 集群都能纳入管理
- **统一 UI**:所有集群一个界面
- **RBAC**:跨集群权限
- **Fleet**:多集群 GitOps
- **监控/告警**:统一可观测
- **应用商店**:Helm chart 一键部署
- **CIS 扫描**:安全基线

### Fleet(多集群 GitOps)

```yaml
# fleet.yaml
helm:
  releaseName: myapp
  chart:
    repo: https://charts.example.com
    name: myapp
    version: 1.0.0
  values:
    replicas: 3
---
# target 集群
targets:
- clusterSelector:
    matchLabels:
      env: prod
```

## 31.6 ArgoCD 多集群管理

### 注册集群

```bash
# 1. 登录 ArgoCD
argocd login argocd.example.com

# 2. 拿 target 集群凭证
argocd cluster add prod-cluster-context
```

```yaml
# 3. 或用 secret 方式
apiVersion: v1
kind: Secret
metadata:
  name: prod-cluster-secret
  namespace: argocd
  labels:
    argocd.argoproj.io/secret-type: cluster
type: Opaque
stringData:
  name: prod-cluster
  server: https://prod-cluster.example.com
  config: |
    {
      "bearerToken": "xxx",
      "tlsClientConfig": {
        "insecure": false,
        "caData": "..."
      }
    }
```

### ApplicationSet 多集群

```yaml
apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata:
  name: multi-cluster
spec:
  generators:
  - clusters:
      selector:
        matchLabels:
          env: prod
  template:
    metadata: { name: 'web-{{name}}' }
    spec:
      project: default
      source:
        repoURL: https://github.com/myorg/manifests
        path: overlays/prod
      destination:
        server: '{{serverUrl}}'
        namespace: web
      syncPolicy:
        automated: { prune: true, selfHeal: true }
```

## 31.7 Istio 多集群(Multi-Primary)

```yaml
# istio-cluster1.yaml
apiVersion: install.istio.io/v1alpha1
kind: IstioOperator
metadata: { name: istio }
spec:
  values:
    global:
      meshID: mesh1
      multiCluster:
        clusterName: cluster-1
      network: network-1
```

**多主模式**:
- 多个集群都是 primary
- 服务跨集群直接通信
- 需共享 root CA 或用 SPIFFE

## 31.8 多集群网络

### Submariner(跨集群 Pod 直接通信)

```bash
# cluster-1
submariner install --cluster-id cluster-1 --service-cidr 10.96.0.0/16

# cluster-2  
submariner join --cluster-id cluster-2 ...
```

**能力**:
- Pod IP 跨集群可路由
- ServiceExport/ServiceImport
- 支持 IPSec 加密

### Skupper(L7 代理)

```bash
# 应用层连接,不暴露网络
skupper init --site-name cluster-1
skupper token create token.yaml

# 在 cluster-2
skupper link create token.yaml
```

## 31.9 多集群可观测性

### Prometheus Federation

```yaml
# 中心 Prometheus 抓取各集群
scrape_configs:
- job_name: 'federate-cluster-1'
  honor_labels: true
  metrics_path: '/federate'
  params:
    'match[]':
    - '{job="kubernetes-pods"}'
    - '{__name__="up"}'
  static_configs:
  - targets: ['prometheus-cluster-1:9090']
```

### Thanos / Cortex(全局视图)

```text
集群 Prometheus
    ↓ (Sidecar 推到对象存储)
Thanos Store Gateway
    ↓
统一查询层(Thanos Querier)
```

### Grafana 多数据源

```yaml
# 每个集群一个数据源
datasources:
- name: cluster-1
  type: prometheus
  url: http://prometheus-cluster-1:9090
- name: cluster-2
  type: prometheus
  url: http://prometheus-cluster-2:9090
```

## 31.10 多集群灾难恢复

### Active-Passive

```text
正常:
  用户 → LB → 集群 A (active)

故障:
  用户 → LB → 集群 B (passive,顶上)
```

```yaml
# 1. Velero 备份到对象存储(跨集群)
velero backup create daily --include-namespaces prod

# 2. 定时同步
velero schedule create daily-2am --schedule "0 2 * * *"

# 3. 故障时恢复
velero restore create --from-backup daily-20250120
```

### Active-Active(双写)

```text
用户 → LB → 集群 A
            → 集群 B
       (数据双向同步)
```

**实现**:
- 数据库:双向同步(复杂,慎用)
- 应用:Stateless 容易,Stateful 难
- DNS: 智能解析(geolocation)

## 31.11 多集群安全

### 凭证管理

```bash
# 用 Vault 集中管理多集群凭证
vault write database/roles/k8s-cluster \
  db_name=k8s \
  creation_statements="CREATE LOGIN ..."
  default_ttl="1h"
```

### mTLS 跨集群(Istio)

```yaml
meshConfig:
  defaultConfig:
    meshMTLS:
      minProtocolVersion: TLSv1_3
```

## 31.12 Cluster API 实战

### 完整 CAPI 集群生命周期

```bash
# 1. 创建集群
kubectl apply -f cluster.yaml

# 2. 等待 ready
kubectl get cluster -w
# NAME           PHASE         AGE   VERSION
# prod-cluster   Provisioned   5m    v1.30.0

# 3. 获取 kubeconfig
clusterctl get kubeconfig prod-cluster > prod-cluster.kubeconfig

# 4. 验证
KUBECONFIG=prod-cluster.kubeconfig kubectl get nodes

# 5. 升级
clusterctl upgrade apply --version v1.7.0

# 6. 扩缩 MachineDeployment
kubectl scale machinedeployment prod-cluster-md-0 --replicas=10

# 7. 删除集群
kubectl delete cluster prod-cluster
```

## 31.13 多集群管理最佳实践

```text
1. 集群命名:
   {region}-{env}-{purpose}
   prod-us-east-1, prod-eu-west-1, staging-us-east-1

2. 集群标签:
   env: prod
   region: us-east-1
   tier: critical
   cost-center: "C-1001"

3. 网络规划:
   - Pod CIDR 每个集群不同
   - Service CIDR 也不重叠(若用 Submariner)
   - 提前规划 IP 段

4. 资源池:
   - 控制面独立(etcd 高可用)
   - 节点池分离(system/app/spot)

5. 可观测:
   - 每个集群独立监控
   - 中心化统一视图
   - 跨集群告警

6. 灾备:
   - 至少 2 个 AZ / Region
   - 定期 DR 演练(季度)
   - 备份跨区域

7. 安全:
   - 集群间网络隔离
   - mTLS 跨集群
   - 集中审计日志
```

## 31.14 选型决策

| 需求 | 推荐 |
|------|------|
| 自建多云集群 | **Cluster API** |
| 企业多 K8s 发行版 | **Rancher** |
| 国内多集群编排 | **Karmada** |
| 多集群 GitOps | **ArgoCD + Cluster** |
| 多集群 Service Mesh | **Istio Multi-Primary** |
| 跨集群 Pod 通信 | **Submariner** |
| 跨集群资源发现 | **Clusterpedia** |
| 简单灾备 | **Velero** |
| Active-Active DB | 双向同步(谨慎) |

## 31.15 专家清单

- [ ] 理解多集群架构模式(Active-Passive/Active-Active)
- [ ] 部署 Cluster API 至少一个云厂商
- [ ] 用 ArgoCD 管理 3+ 集群
- [ ] 配置 Velero 跨集群备份
- [ ] 实施至少一次 DR 演练
- [ ] 跨集群监控(Thanos 或 Federation)
- [ ] 跨集群网络(Submariner 或 Istio)
- [ ] 多集群 RBAC 统一
- [ ] 集群标签标准化
- [ ] 季度多集群 review

## 31.16 本章小结

- 多集群 = 解决爆炸半径、地理、合规、多云
- 工具:**Cluster API**(生命周期)/ **Karmada**(编排)/ **Rancher**(管理)/ **ArgoCD**(GitOps)
- 网络:**Submariner**(L3)/ **Istio Multi-Primary**(L7)
- 灾备:Velero + 跨区域对象存储
- 监控:Thanos/Cortex 全局视图
- 实战:从 2 集群开始,逐步扩展到多 region/多云
- 与 20 章 HA、23 章 GitOps 紧密集成
