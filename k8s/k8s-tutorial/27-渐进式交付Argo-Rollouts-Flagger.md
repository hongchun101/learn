# 27. 渐进式交付(Argo Rollouts / Flagger)

## 27.1 渐进式交付(Progressive Delivery)

**渐进式交付** = 在部署过程中**逐步放量** + **自动验证** + **失败自动回滚**。

```text
传统部署:
  v1 → v2  (一次性切换,出问题全炸)

渐进式交付:
  v1 ─┬─→ 1% v2 ─[验证]→ 10% v2 ─[验证]→ 50% v2 ─[验证]→ 100% v2
       │                      │                │                 │
     监控告警          失败自动回滚    失败自动回滚       完成发布
```

**核心能力**:
- **金丝雀**(Canary):逐步增加新版本流量
- **蓝绿**(Blue/Green):瞬间切换,快速回滚
- **A/B 测试**:基于 header/cookie 分流
- **自动分析**:用 Prometheus 指标自动判断成功/失败

## 27.2 Argo Rollouts 架构

**Argo Rollouts** = Kubernetes 的渐进式交付 Controller + CRD。

```text
┌──────────────────┐
│ Rollout Resource │  (替代 Deployment)
└────────┬─────────┘
         │ 控制
         ▼
┌──────────────────┐
│ ReplicaSets      │  (v1 stable + v2 canary)
└────────┬────────┘
         │
         ▼
┌──────────────────┐
│ ServiceSelector  │  (流量切换)
└──────────────────┘
```

### 安装

```bash
kubectl create namespace argo-rollouts
kubectl apply -n argo-rollouts -f https://github.com/argoproj/argo-rollouts/releases/latest/download/install.yaml

# 安装 kubectl plugin
curl -LO https://github.com/argoproj/argo-rollouts/releases/latest/download/kubectl-argo-rollouts-darwin-amd64
chmod +x kubectl-argo-rollouts-darwin-amd64
sudo mv kubectl-argo-rollouts-darwin-amd64 /usr/local/bin/kubectl-argo-rollouts
```

## 27.3 第一个 Rollout(金丝雀)

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: web
  namespace: default
spec:
  replicas: 5
  revisionHistoryLimit: 3
  selector:
    matchLabels:
      app: web
  strategy:
    canary:
      steps:
      - setWeight: 10           # 10% 流量
      - pause: { duration: 5m } # 观察 5 分钟
      - setWeight: 30
      - pause: { duration: 5m }
      - setWeight: 60
      - pause: { duration: 5m }
      - setWeight: 100
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
      - name: web
        image: nginx:1.25
        ports: [{ containerPort: 80 }]
        resources:
          requests: { cpu: 100m, memory: 128Mi }
---
# Service 引用 stable + canary
apiVersion: v1
kind: Service
metadata:
  name: web
spec:
  selector:
    app: web
  ports:
  - port: 80
    targetPort: 80
```

### 触发金丝雀

```bash
# 修改镜像触发更新
kubectl argo rollouts set image web web=nginx:1.26

# 看状态
kubectl argo rollouts get rollout web --watch

# 手动 promote
kubectl argo rollouts promote web

# 回滚
kubectl argo rollouts undo web

# 暂停/恢复
kubectl argo rollouts pause web
kubectl argo rollouts resume web
```

## 27.4 蓝绿部署

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: web-bluegreen
spec:
  replicas: 4
  selector:
    matchLabels:
      app: web-bg
  strategy:
    blueGreen:
      activeService: web-active      # 接收生产流量
      previewService: web-preview    # 预发(测试)
      autoPromotionEnabled: false    # 手动 promote
      scaleDownDelaySeconds: 30      # 切换后 30s 缩容老版本
  template:
    metadata:
      labels: { app: web-bg }
    spec:
      containers:
      - name: web
        image: nginx:1.25
```

```bash
# 触发新版本 → 跑在 preview
kubectl argo rollouts set image web-bluegreen web=nginx:1.26

# 测试 preview
curl web-preview.default.svc

# 切流量
kubectl argo rollouts promote web-bluegreen
```

## 27.5 A/B 测试(Header/Cookie 路由)

```yaml
strategy:
  canary:
    canaryService: web-canary
    stableService: web-stable
    trafficRouting:
      nginx:
        additionalIngressAnnotations:
          canary-by-header: X-Canary
          canary-by-header-value: enroll
        stableIngress: web-stable
    steps:
    - setWeight: 20
    - pause: { duration: 10m }
    - setWeight: 100
```

**效果**:
- `curl -H "X-Canary: enroll" http://web` → 100% 新版本
- `curl http://web` → 20-100% 新版本(看 stage)

## 27.6 自动分析(AnalysisTemplate)

**核心**:用 Prometheus 指标**自动判断**金丝雀是否成功,失败自动 abort。

```yaml
apiVersion: argoproj.io/v1alpha1
kind: AnalysisTemplate
metadata:
  name: success-rate
  namespace: default
spec:
  metrics:
  - name: success-rate
    interval: 30s
    count: 5
    successCondition: result[0] >= 0.95
    failureLimit: 2
    provider:
      prometheus:
        address: http://prometheus.monitoring.svc:9090
        query: |
          sum(rate(
            http_requests_total{job="web",status=~"2..",rollout=~"{{args.canary-hash}}"}[2m]
          ))
          /
          sum(rate(
            http_requests_total{job="web",rollout=~"{{args.canary-hash}}"}[2m]
          ))
  - name: error-rate
    interval: 30s
    count: 3
    successCondition: result[0] <= 0.01
    failureLimit: 1
    provider:
      prometheus:
        address: http://prometheus.monitoring.svc:9090
        query: |
          sum(rate(
            http_requests_total{job="web",status=~"5..",rollout=~"{{args.canary-hash}}"}[2m]
          ))
          /
          sum(rate(
            http_requests_total{job="web",rollout=~"{{args.canary-hash}}"}[2m]
          ))
```

```yaml
# 在 Rollout 中引用
strategy:
  canary:
    steps:
    - setWeight: 10
    - analysis:
        templates:
        - templateName: success-rate
    - setWeight: 30
    - analysis:
        templates:
        - templateName: success-rate
```

**自动行为**:
- 指标通过 → 进入下一步
- 指标失败 → 自动 abort + 回滚

## 27.7 流量路由集成

### Nginx Ingress

```yaml
strategy:
  canary:
    trafficRouting:
      nginx:
        stableIngress: web-stable
        additionalIngressAnnotations:
          canary-weight: "10"   # 动态覆盖
```

### Istio

```yaml
strategy:
  canary:
    trafficRouting:
      istio:
        virtualService:
          name: web
        destinationRule:
          name: web
          canarySubsetName: canary
        stableSubsetName: stable
```

### AWS ALB / GCP / Traefik / Ambassador

均原生支持,参考官方文档。

## 27.8 Argo Rollouts Dashboard

```bash
# 启动 dashboard
kubectl argo rollouts dashboard

# 浏览器访问 https://localhost:3100
```

**功能**:
- 可视化 rollout 进度
- 手动 promote/abort
- 历史回看
- 实时指标

## 27.9 Flagger(替代方案)

**Flagger** = 用 App Mesh/Istio/NGINX 做的渐进式交付,自动分析更简单。

### 安装

```bash
helm repo add flagger https://flagger.app
helm install flagger flagger/flagger \
  --namespace istio-system \
  --set metricsServer=http://prometheus.istio-system:9090
```

### 第一个 Canary

```yaml
apiVersion: flagger.app/v1beta1
kind: Canary
metadata:
  name: web
  namespace: default
spec:
  provider: istio
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: web
  progressDeadlineSeconds: 60
  service:
    name: web
    port: 80
  analysis:
    interval: 30s
    threshold: 5
    maxWeight: 50
    stepWeight: 10
    metrics:
    - name: request-success-rate
      thresholdRange:
        min: 99
      interval: 30s
    - name: request-duration
      thresholdRange:
        max: 500
      interval: 30s
```

**自动流程**:
1. 改 Deployment 镜像
2. Flagger 创建 canary Deployment(10% 流量)
3. 跑 30s 分析(success rate + latency)
4. 通过 → 步进到 20%、30%... 50%
5. 通过 → 全量;失败 → 回滚

## 27.10 Argo Rollouts vs Flagger

| 维度 | Argo Rollouts | Flagger |
|------|---------------|---------|
| CRD 类型 | Rollout(替代 Deployment) | Canary(包装 Deployment) |
| 流量切换 | Nginx/Istio/ALB | Istio/AppMesh/Nginx/SMI |
| 蓝绿 | 原生 | 原生 |
| A/B | Header/Cookie | Header/Cookie |
| 自动分析 | AnalysisTemplate(PromQL 灵活) | 内置指标,简单配置 |
| Dashboard | 有 | 无(用 Grafana) |
| 复杂度 | 中 | 低 |
| 推荐场景 | 复杂金丝雀 + 多指标 | 标准化金丝雀 |

## 27.11 实战:数据库迁移 + 金丝雀

**场景**:发布新版本,要执行 DB migration。

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: api
spec:
  strategy:
    canary:
      steps:
      - prePromotionAnalysis:        # 切流量前的预检
          templates:
          - templateName: db-migration-check
        analysis:
          templates:
          - templateName: success-rate
      - setWeight: 10
      - pause: { duration: 5m }
      - setWeight: 50
      - pause: { duration: 5m }
      - setWeight: 100
  template:
    spec:
      containers:
      - name: api
        image: api:2.0
        lifecycle:
          preStop:
            exec:
              command: ["/bin/sh", "-c", "python migrate.py down"]  # 失败回滚
```

## 27.12 真实案例

### 案例 1:金丝雀 + 自动回滚

```text
场景: 新版 API 错误率上升
触发: AnalysisTemplate 监测 success-rate < 99%
过程:
  10:00 - 部署 v2
  10:01 - 切 10% 流量
  10:02 - 指标采集(30s)
  10:03 - success-rate 跌到 97%
  10:03 - 触发 failureLimit, Argo 自动 abort
  10:04 - 回滚到 v1,流量 100%
  10:05 - 报警通知开发
```

### 案例 2:基于地理位置的金丝雀

```yaml
# Istio 路由 - 国内先发布
apiVersion: networking.istio.io/v1alpha3
kind: VirtualService
metadata:
  name: web
spec:
  http:
  - match:
    - headers:
        x-country:
          exact: CN
    route:
    - destination: { host: web, subset: canary }
      weight: 100
    - destination: { host: web, subset: stable }
      weight: 0
  - route:
    - destination: { host: web, subset: stable }
      weight: 100
    - destination: { host: web, subset: canary }
      weight: 0
```

## 27.13 渐进式交付的指标

| 阶段 | 指标 | 阈值示例 |
|------|------|---------|
| 预发布 | 启动时间 | < 30s |
| 预发布 | 健康检查 | 100% 通过 |
| 切流量 | 错误率 | < 1% |
| 切流量 | P99 延迟 | < 基线 +20% |
| 切流量 | CPU 内存 | < limit 80% |
| 业务 | 业务核心指标 | (订单成功率 > 99.5% 等) |

## 27.14 专家清单

- [ ] 理解渐进式交付 vs 传统部署
- [ ] 部署 Argo Rollouts 或 Flagger
- [ ] 配置 Canary + AnalysisTemplate
- [ ] 集成 Prometheus 自动分析
- [ ] 集成 Istio/Nginx 流量路由
- [ ] 配置蓝绿/A/B 策略
- [ ] 知道 DB migration 与金丝雀的协调
- [ ] 写好失败自动回滚的 Runbook

## 27.15 本章小结

- 渐进式交付 = 金丝雀 + 蓝绿 + A/B + 自动分析
- **Argo Rollouts**:灵活,需手动配置 AnalysisTemplate
- **Flagger**:开箱即用,适合标准化场景
- 核心:Prometheus 指标驱动决策,失败自动回滚
- 集成 Nginx/Ingress/Istio 做流量切分
- 与 SLO 紧密结合(见 25 章)
