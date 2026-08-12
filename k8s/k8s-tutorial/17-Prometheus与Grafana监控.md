# 17. Prometheus + Grafana 监控

## 17.1 监控的核心

**三大支柱**:

| 类型 | 工具 | 关注点 |
|------|------|--------|
| **Metrics(指标)** | Prometheus | 系统状态、QPS、延迟 |
| **Logs(日志)** | Loki/EFK | 详细事件、错误 |
| **Traces(追踪)** | Tempo/Jaeger | 调用链、性能瓶颈 |

本章聚焦 Metrics。

## 17.2 Prometheus 架构

```text
┌────────────────────────────────────┐
│  Prometheus Server                 │
│  ┌──────────┐  ┌──────────┐        │
│  │ Retrieval │  │  Storage  │  TSDB │
│  └────┬─────┘  └─────┬────┘        │
└───────┼──────────────┼─────────────┘
        │ scrape        │
        ▼               │
┌────────────────────┐  │
│ Targets:           │  │ remote write
│ - Pods (metrics)   │  │
│ - Nodes            │  │
│ - Services         │  ▼
│ - K8s components   │  ┌──────────┐
└────────────────────┘  │  Thanos  │
                       │  / Mimir │
                       └──────────┘

┌────────────────────┐
│ Alertmanager       │  ← Prometheus 告警
└────────┬───────────┘
         ▼
  email/slack/pagerduty
```

## 17.3 安装 kube-prometheus-stack(Helm)

**kube-prometheus-stack** = Prometheus Operator + Grafana + Alertmanager + 预置 dashboard。

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

helm install kube-prometheus-stack prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace \
  --set grafana.adminPassword=admin \
  --set prometheus.prometheusSpec.retention=30d \
  --set prometheus.prometheusSpec.storageSpec.volumeClaimTemplate.spec.resources.requests.storage=100Gi
```

**包含**:
- Prometheus
- Alertmanager
- Grafana
- kube-state-metrics
- node-exporter(DaemonSet)
- 大量预置 dashboard

## 17.4 ServiceMonitor(自动发现)

**ServiceMonitor** = Prometheus Operator 提供的自动抓取配置。

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: web-monitor
  namespace: monitoring
  labels:
    release: kube-prometheus-stack   # 必须和 Prometheus selector 匹配
spec:
  namespaceSelector:
    any: true                        # 跨 namespace 监控
  selector:
    matchLabels:
      app: web                       # Service label
  endpoints:
  - port: metrics                    # Service 的端口名
    path: /metrics
    interval: 30s
    scrapeTimeout: 10s
  jobLabel: app
```

**前置条件**:
- Service 有 `app=web` label
- Service 有名字为 `metrics` 的端口
- Pod 暴露 `/metrics` 路径

```yaml
# Service
apiVersion: v1
kind: Service
metadata:
  name: web
  labels:
    app: web
spec:
  selector: { app: web }
  ports:
  - name: web
    port: 80
    targetPort: 8080
  - name: metrics                    # 必须名字
    port: 9090
    targetPort: 9090
---
# Pod
spec:
  containers:
  - name: web
    image: web:1.0
    ports:
    - { name: web, containerPort: 8080 }
    - { name: metrics, containerPort: 9090 }   # 暴露指标
```

### PodMonitor(Pod 级别)

**场景**:不需要 Service,直接抓 Pod。

```yaml
apiVersion: monitoring.coreos.com/v1
kind: PodMonitor
metadata:
  name: web-podmon
  namespace: monitoring
  labels:
    release: kube-prometheus-stack
spec:
  namespaceSelector: { any: true }
  selector:
    matchLabels: { app: web }
  podMetricsEndpoints:
  - port: metrics
    path: /metrics
    interval: 30s
```

## 17.5 暴露应用指标(Go/Python/Node.js)

### Go(用 promhttp)

```go
import (
    "github.com/prometheus/client_golang/prometheus"
    "github.com/prometheus/client_golang/prometheus/promhttp"
)

var (
    requestsTotal = prometheus.NewCounterVec(
        prometheus.CounterOpts{
            Name: "http_requests_total",
            Help: "Total number of HTTP requests",
        },
        []string{"method", "path", "status"},
    )
    requestDuration = prometheus.NewHistogramVec(
        prometheus.HistogramOpts{
            Name:    "http_request_duration_seconds",
            Help:    "HTTP request duration",
            Buckets: prometheus.DefBuckets,
        },
        []string{"method", "path"},
    )
)

func init() {
    prometheus.MustRegister(requestsTotal, requestDuration)
}

func main() {
    http.Handle("/metrics", promhttp.Handler())
    http.ListenAndServe(":9090", nil)
}
```

### Python(用 prometheus_client)

```python
from prometheus_client import Counter, Histogram, start_http_server

REQUESTS = Counter('http_requests_total', 'HTTP requests', ['method', 'endpoint'])
LATENCY = Histogram('http_request_duration_seconds', 'Request latency', ['endpoint'])

start_http_server(9090)  # 暴露 /metrics
```

### Node.js(用 prom-client)

```javascript
const client = require('prom-client');
client.collectDefaultMetrics();
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});
```

## 17.6 核心指标体系(RED/USE/四黄金信号)

### RED(服务级)

```text
Rate:        请求速率      rate(http_requests_total[1m])
Errors:      错误率        sum(rate(http_requests_total{status=~"5.."}[1m])) / sum(rate(http_requests_total[1m]))
Duration:    延迟          histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))
```

### USE(资源级)

```text
Utilization: 利用率     1 - rate(node_cpu_seconds_total{mode="idle"}[5m])
Saturation: 饱和度     node_load5 / count(node_cpu_seconds_total)
Errors:      错误       node_filesystem_files_free
```

### 四黄金信号(Google SRE)

```text
Latency:     响应时间
Traffic:     请求量
Errors:      错误率
Saturation:  饱和度
```

## 17.7 Grafana Dashboard

### 访问

```bash
# port-forward
kubectl port-forward svc/kube-prometheus-stack-grafana 3000:80 -n monitoring
# http://localhost:3000
# admin / admin
```

### 导入预置 Dashboard

| Dashboard | ID | 用途 |
|-----------|-----|------|
| Kubernetes / Cluster | 7249 | 集群总览 |
| Kubernetes / Pods | 6417 | Pod 资源 |
| Node Exporter | 1860 | 节点资源 |
| Prometheus | 3662 | Prometheus 自监控 |
| etcd | 3070 | etcd 监控 |

### 自定义 Dashboard

**示例:Web 应用 RED Dashboard**

```json
{
  "title": "Web RED",
  "panels": [
    {
      "title": "Request Rate",
      "targets": [
        { "expr": "sum(rate(http_requests_total[1m]))" }
      ]
    },
    {
      "title": "Error Rate",
      "targets": [
        { "expr": "sum(rate(http_requests_total{status=~\"5..\"}[1m])) / sum(rate(http_requests_total[1m]))" }
      ]
    },
    {
      "title": "Latency P99",
      "targets": [
        { "expr": "histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))" }
      ]
    }
  ]
}
```

## 17.8 PrometheusRule(告警规则)

```yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: web-alerts
  namespace: monitoring
  labels:
    release: kube-prometheus-stack
spec:
  groups:
  - name: web
    interval: 30s
    rules:
    # 1. 错误率过高
    - alert: HighErrorRate
      expr: |
        sum(rate(http_requests_total{app="web",status=~"5.."}[5m]))
        /
        sum(rate(http_requests_total{app="web"}[5m])) > 0.05
      for: 5m
      labels:
        severity: critical
      annotations:
        summary: "Web 错误率 > 5%"
        description: "过去 5 分钟,web 错误率 {{ $value | humanizePercentage }}"

    # 2. 延迟过高
    - alert: HighLatency
      expr: |
        histogram_quantile(0.99,
          sum(rate(http_request_duration_seconds_bucket{app="web"}[5m])) by (le)
        ) > 1
      for: 10m
      labels:
        severity: warning

    # 3. Pod OOM
    - alert: ContainerOOMKilled
      expr: |
        increase(kube_pod_container_status_last_terminated_reason{reason="OOMKilled"}[10m]) > 0
      for: 0m
      labels:
        severity: critical

    # 4. Pod 重启
    - alert: PodCrashLooping
      expr: |
        rate(kube_pod_container_status_restarts_total[10m]) * 60 * 5 > 0
      for: 5m
      labels:
        severity: critical
```

**生产必备告警**(参考):

```yaml
# K8s 节点
- NodeNotReady       # 节点 NotReady
- NodeMemoryPressure # 节点内存压力
- NodeDiskPressure   # 节点磁盘压力
- NodePIDPressure    # 节点 PID 压力
- KubeNodeNotReady   # 节点 ready 失败

# Pod
- PodCrashLooping
- ContainerOOMKilled
- ImagePullBackOff
- PodPending         # 超过 15min

# Deployment
- DeploymentReplicasMismatch  # 副本数不匹配

# API Server
- KubeAPILatencyHigh
- KubeClientErrors
```

## 17.9 Alertmanager 配置

```yaml
# alertmanager.yaml
global:
  resolve_timeout: 5m

route:
  receiver: default
  group_by: [alertname, cluster]
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  routes:
  - match:
      severity: critical
    receiver: pagerduty
    continue: true
  - match:
      severity: warning
    receiver: slack

receivers:
- name: default
  webhook_configs:
  - url: 'http://example.com/alert'

- name: slack
  slack_configs:
  - api_url: 'https://hooks.slack.com/services/xxx'
    channel: '#alerts'

- name: pagerduty
  pagerduty_configs:
  - service_key: 'xxx'
    description: '{{ .CommonAnnotations.summary }}'
```

## 17.10 K8s 关键指标

```promql
# 集群级
# CPU 利用率
sum(rate(node_cpu_seconds_total{mode!="idle"}[5m])) / count(node_cpu_seconds_total{mode="idle"})

# 内存利用率
1 - sum(node_memory_MemAvailable_bytes) / sum(node_memory_MemTotal_bytes)

# 节点数
count(kube_node_info)

# Pod 数
count(kube_pod_info)

# 节点磁盘使用率
1 - sum(node_filesystem_avail_bytes{mountpoint="/"}) / sum(node_filesystem_size_bytes{mountpoint="/"})

# 节点状态
sum by (condition) (kube_node_status_condition{condition="Ready",status="true"})

# Pod 重启
rate(kube_pod_container_status_restarts_total[15m])

# Deployment 健康
kube_deployment_status_replicas_available / kube_deployment_spec_replicas
```

## 17.11 应用指标 PromQL 速查

```promql
# QPS
sum(rate(http_requests_total[1m]))

# 按 endpoint 拆分
sum by (endpoint) (rate(http_requests_total[1m]))

# 错误率
sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m]))

# 延迟
histogram_quantile(0.5,  sum(rate(http_request_duration_seconds_bucket[5m])) by (le))
histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))
histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))

# 饱和度(并发)
sum(http_requests_in_progress)

# GC 次数(java)
rate(jvm_gc_collection_seconds_count[5m])
```

## 17.12 长存储(Thanos / Cortex / Mimir)

**问题**:Prometheus 本地 TSDB,数据多了爆。

**解决**:远程存储

```text
Prometheus
  ↓ remote_write
Thanos / Mimir
  ↓
对象存储(S3/GCS/OSS)
```

**Mimir**(Grafana Labs):
- 水平扩展
- 多租户
- 长期存储
- 全球查询

**Thanos**:
- 兼容 Prometheus
- 对象存储
- 全局查询
- 边车模式

```yaml
# Prometheus remote_write
remote_write:
- url: "http://mimir-distributor:9009/api/v1/push"
```

## 17.13 监控应用的全流程

```text
1. 应用代码埋点(Prometheus client library)
2. Pod 暴露 /metrics
3. ServiceMonitor/PodMonitor 配抓取
4. Prometheus 抓取 + 存储
5. Grafana 查 / 展示
6. PrometheusRule 配告警
7. Alertmanager 发 alert
8. 接收器(钉钉/飞书/企业微信/PagerDuty)
```

## 17.14 实战:完整可观测性栈

```bash
# 一键装全套
helm install kube-prometheus-stack prometheus-community/kube-prometheus-stack \
  --namespace monitoring --create-namespace \
  --set grafana.adminPassword=admin \
  --set prometheus.prometheusSpec.retention=30d \
  --set prometheus.prometheusSpec.storageSpec.volumeClaimTemplate.spec.resources.requests.storage=100Gi \
  --set prometheus.prometheusSpec.remoteWrite[0].url=http://mimir-distributor:9009/api/v1/push

# 加 Loki(日志)
helm install loki grafana/loki-stack \
  --namespace monitoring \
  --set promtail.enabled=true

# 加 Tempo(trace)
helm install tempo grafana/tempo \
  --namespace monitoring
```

## 17.15 监控排错

```bash
# 1. Prometheus 状态
kubectl get prometheus -n monitoring
kubectl get prometheusrules -n monitoring
kubectl get servicemonitor -A

# 2. 看 targets
# 端口转发 prometheus
kubectl port-forward svc/kube-prometheus-stack-prometheus 9090 -n monitoring
# 浏览器 http://localhost:9090/targets
# 看每个 target 状态(up/down)

# 3. 查 metric
# http://localhost:9090/graph
# 输入: up{job="..."}

# 4. 查告警
# http://localhost:9090/alerts

# 5. 查 Prometheus 自身
prometheus_tsdb_head_series   # 序列数
prometheus_target_sync_failed_total  # 抓取失败
```

### 常见问题

```text
1. target down
   - 网络不通(pod-to-prometheus)
   - 端口/路径错
   - ServiceMonitor selector 错

2. 无数据
   - ServiceMonitor/PodMonitor 没生效
   - relabel_configs 过滤掉了
   - 指标没暴露

3. 告警不触发
   - 表达式错
   - for 时间太短
   - Alertmanager 没配 route

4. 磁盘满
   - retention 调小
   - 加 remote_write
   - 加 storage
```

## 17.16 SLO 监控(进阶)

```yaml
# ServiceLevelObjective
apiVersion: sloth.slok.dev/v1alpha1
kind: ServiceLevelObjective
metadata: { name: web-slo }
spec:
  service: web
  labels:
    tier: frontend
  slos:
  - name: availability
    objective: 99.9
    description: "99.9% of requests are successful"
    sli:
      events:
        error_query: sum(rate(http_requests_total{job="web",status=~"5.."}[{{.window}}]))
        total_query: sum(rate(http_requests_total{job="web"}[{{.window}}]))
```

**SLI/SLO/SLA**:
- **SLI**(指标):如错误率、延迟
- **SLO**(目标):99.9% 可用性
- **SLA**(协议):对外承诺,达不到赔钱

**Error Budget**: 100% - SLO = 允许的故障时间
- 99.9% SLO = 每月 43.2 分钟停机时间

## 17.17 专家清单

- [ ] 应用埋点(RED 指标)
- [ ] ServiceMonitor/PodMonitor 配全
- [ ] Grafana 仪表盘(核心服务都有)
- [ ] 告警规则(关键告警 5-10 条,不要太多)
- [ ] 告警分级(severity: critical / warning / info)
- [ ] 接收器集成(钉钉/飞书/PagerDuty)
- [ ] 长存储(Thanos/Mimir)
- [ ] SLO 定义 + 监控
- [ ] 容量监控(节点资源、配额、磁盘)
- [ ] 黑盒监控(从外部 ping /metrics)
- [ ] 告警疲劳(定期 review,清理噪音)

## 17.18 本章小结

- 三大可观测性:Metrics / Logs / Traces
- Prometheus 主导 metrics,Operator 模式管理
- ServiceMonitor/PodMonitor 自动发现
- RED 指标 + USE 资源 + 四黄金信号
- Grafana 仪表盘 + 告警
- PrometheusRule 配告警,Alertmanager 发送
- 长存储:Thanos / Mimir + 对象存储
- 关键告警:Pod 重启 / OOM / 节点 / 错误率
- 进阶:SLO/SLI/Error Budget 监控
- 避免告警疲劳,定期 review
