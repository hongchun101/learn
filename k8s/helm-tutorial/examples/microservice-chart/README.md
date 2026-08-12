# microservice-chart

一个生产级的微服务 Helm Chart 示例,覆盖大部分生产场景。

## 功能特性

- Deployment + Service + Ingress + ConfigMap
- HPA(自动扩缩容)
- PodDisruptionBudget(PDB)
- ServiceAccount + Pod/Container securityContext
- ServiceMonitor(Prometheus 监控)
- NetworkPolicy(网络隔离)
- 滚动升级 + 自动 checksum 触发
- values.schema.json 强类型校验
- 三套环境 values:dev / staging / prod

## 快速开始

```bash
# 1. 检查 chart
helm lint .

# 2. 渲染(不连集群)
helm template myrelease . -f values-dev.yaml

# 3. 部署到 dev
helm install myrelease . \
  -f values-dev.yaml \
  -n dev --create-namespace

# 4. 升级到 staging
helm upgrade myrelease . \
  -f values.yaml \
  -f values-staging.yaml \
  -n staging

# 5. 看 diff
helm diff upgrade myrelease . -f values-prod.yaml

# 6. 回滚
helm history myrelease -n prod
helm rollback myrelease 3 -n prod
```

## 文件结构

```text
microservice-chart/
├── Chart.yaml
├── values.yaml              # 公共默认
├── values-dev.yaml          # dev 覆盖
├── values-staging.yaml      # staging 覆盖
├── values-prod.yaml         # prod 覆盖
├── values.schema.json       # values 强类型校验
├── .helmignore
├── README.md
└── templates/
    ├── _helpers.tpl         # 命名模板
    ├── serviceaccount.yaml
    ├── configmap.yaml
    ├── deployment.yaml
    ├── service.yaml
    ├── ingress.yaml
    ├── hpa.yaml
    ├── poddisruptionbudget.yaml
    ├── servicemonitor.yaml
    ├── networkpolicy.yaml
    └── NOTES.txt
```

## 关键设计点

### 1. 标准化 labels

所有资源都带:

```yaml
helm.sh/chart: microservice-chart-0.1.0
app.kubernetes.io/name: microservice-chart
app.kubernetes.io/instance: <release-name>
app.kubernetes.io/version: 1.0.0
app.kubernetes.io/managed-by: Helm
app.kubernetes.io/part-of: microservice
```

### 2. Selector labels 最小化

只放 name + instance,避免滚动升级时 label change 导致 pod 永远不 Ready。

### 3. 滚动升级触发

`configmap.yaml` 变更 → checksum annotation 变 → 滚动升级。

### 4. 三环境差异

| 项 | dev | staging | prod |
|----|-----|---------|------|
| replicas | 1 | 2 | 5 |
| HPA | 关 | 2-5 | 5-30 |
| PDB | 关 | 1 | 3 |
| TLS | ❌ | ✅ | ✅ |
| NetworkPolicy | ❌ | ✅ | ✅ |
| ServiceMonitor | ❌ | ✅ | ✅ |
| logLevel | debug | info | warn |

## 测试

```bash
# 1. 静态检查
helm lint . --strict

# 2. Schema 校验
helm install test . -f values-dev.yaml --dry-run

# 3. 单元测试(需 helm-unittest)
helm plugin install https://github.com/helm-unittest/helm-unittest
helm unittest .

# 4. 部署到 kind
kind create cluster
helm install myrelease . -f values-dev.yaml
kubectl get all -l app.kubernetes.io/instance=myrelease
```

## 生产清单

- [x] 资源 requests/limits
- [x] HPA
- [x] PDB
- [x] 健康检查
- [x] securityContext
- [x] 滚动升级策略
- [x] 优雅关闭
- [x] ServiceAccount 隔离
- [x] NetworkPolicy
- [x] 多环境 values
- [x] Schema 校验
- [x] 镜像 tag 锁定
- [ ] 镜像签名(cosign)
- [ ] Pod Security Admission
- [ ] Secret 用 SOPS 加密
