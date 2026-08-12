# 03. values.yaml 与多环境配置

## 3.1 values.yaml 设计哲学

**values.yaml 是 Chart 的"用户面"**。一个好的 Chart,80% 的定制能力应该通过 values 暴露,而无需修改模板。

### 核心原则

1. **默认值要合理** — 用户 `helm install` 一下就能跑起来
2. **结构化** — 用嵌套对象组织,不要全平铺
3. **可注释** — 每个字段必须带注释,说明类型、默认值、影响
4. **类型明确** — 数字就是数字,布尔就是布尔,不要全用字符串
5. **可扩展** — 给常用配置(资源限制、副本数、镜像)留好钩子

## 3.2 一个生产级 values.yaml 示例

```yaml
# 镜像配置
image:
  repository: nginx
  tag: ""                    # 留空 → 用 .Chart.AppVersion
  pullPolicy: IfNotPresent
  pullSecrets: []            # imagePullSecrets 列表

# 副本数
replicaCount: 2

# 容器配置
imagePullSecrets: []
nameOverride: ""
fullnameOverride: ""

# ServiceAccount
serviceAccount:
  create: true
  annotations: {}
  name: ""                  # 留空 → 自动生成

# Pod 级注解和标签
podAnnotations: {}
podLabels: {}
podSecurityContext: {}
securityContext: {}

service:
  type: ClusterIP
  port: 80
  annotations: {}

ingress:
  enabled: false
  className: ""
  annotations: {}
  hosts:
    - host: chart-example.local
      paths:
        - path: /
          pathType: ImplementationSpecific
  tls: []

# 资源配置
resources:
  requests:
    cpu: 100m
    memory: 128Mi
  limits:
    cpu: 500m
    memory: 512Mi

# 自动扩缩容
autoscaling:
  enabled: false
  minReplicas: 2
  maxReplicas: 10
  targetCPUUtilizationPercentage: 80
  targetMemoryUtilizationPercentage: 80

# Pod 中断预算
podDisruptionBudget:
  enabled: false
  minAvailable: 1

# nodeSelector / tolerations / affinity
nodeSelector: {}
tolerations: []
affinity: {}

# 探针
livenessProbe:
  httpGet:
    path: /
    port: http
  initialDelaySeconds: 30
  periodSeconds: 10
readinessProbe:
  httpGet:
    path: /
    port: http
  initialDelaySeconds: 5
  periodSeconds: 5

# 应用配置
config:
  logLevel: info
  featureFlags: {}

# 密钥(生产中用 SOPS/sealed-secrets 注入)
secrets: {}
```

## 3.3 values 覆盖的 5 种方式(优先级从高到低)

```bash
# 1. --set(命令行,简单值)
helm install myapp ./mychart --set replicaCount=3

# 2. --set-string(强制字符串)
helm install myapp ./mychart --set-string image.tag=1.25

# 3. --set-file(从文件读)
helm install myapp ./mychart --set-file config.app.conf=./app.conf

# 4. --values / -f(文件覆盖,可多次)
helm install myapp ./mychart \
  -f values.yaml \
  -f values.prod.yaml \
  --set replicaCount=5

# 5. values.yaml(默认值,优先级最低)
```

### 嵌套 key 的 --set 语法

```bash
# 点号表示路径
helm install myapp ./mychart --set resources.limits.cpu=1000m
helm install myapp ./mychart --set ingress.hosts[0].host=app.example.com
helm install myapp ./mychart --set 'ingress.hosts[0].paths[0].path=/api'
```

**生产建议**:用 `-f` 文件而非 `--set`,因为:
- 可审计、可版本控制
- 可注释
- 避免命令行转义噩梦

## 3.4 多环境管理:3 种模式

### 模式 1:同 Chart,多 values 文件(推荐)

```text
myapp/
├── Chart.yaml
├── values.yaml           # 公共默认
├── values-dev.yaml       # 覆盖 dev
├── values-staging.yaml   # 覆盖 staging
└── values-prod.yaml      # 覆盖 prod
```

**values.yaml**(公共)
```yaml
replicaCount: 2
image:
  repository: myorg/myapp
  tag: latest
resources:
  requests: {cpu: 100m, memory: 128Mi}
  limits:   {cpu: 500m, memory: 512Mi}
```

**values-dev.yaml**
```yaml
replicaCount: 1
ingress:
  enabled: true
  hosts:
    - host: dev.myapp.local
      paths: [/{path: /, pathType: Prefix}]
resources:
  requests: {cpu: 50m, memory: 64Mi}
```

**values-prod.yaml**
```yaml
replicaCount: 5
autoscaling:
  enabled: true
  minReplicas: 5
  maxReplicas: 20
ingress:
  enabled: true
  hosts:
    - host: api.myapp.com
      paths: [/{path: /, pathType: Prefix}]
  tls:
    - hosts: [api.myapp.com]
      secretName: api-myapp-tls
resources:
  requests: {cpu: 500m, memory: 512Mi}
  limits:   {cpu: 2000m, memory: 2Gi}
```

部署:
```bash
helm install myapp-dev    ./myapp -f values.yaml -f values-dev.yaml -n dev
helm install myapp-prod   ./myapp -f values.yaml -f values-prod.yaml -n prod
```

### 模式 2:用父 Chart 包多个子 Chart(适合微服务)

```yaml
# umbrella-chart/Chart.yaml
dependencies:
  - name: myapp
    version: 1.x.x
  - name: postgresql
    version: 12.x.x
```

```yaml
# umbrella-chart/values.yaml
myapp:
  replicaCount: 3
postgresql:
  enabled: true
  auth:
    password: secret
```

```bash
helm install my-stack ./umbrella-chart
```

### 模式 3:Helmfile(更专业的多环境管理,详见 12 章)

## 3.5 强类型校验:values.schema.json

JSON Schema 可以在 `helm install` 时校验 values 合法性。

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["replicaCount", "image", "service"],
  "properties": {
    "replicaCount": {
      "type": "integer",
      "minimum": 1,
      "maximum": 100,
      "description": "Pod 副本数"
    },
    "image": {
      "type": "object",
      "required": ["repository"],
      "properties": {
        "repository": {"type": "string", "minLength": 1},
        "tag": {"type": "string"},
        "pullPolicy": {
          "type": "string",
          "enum": ["Always", "IfNotPresent", "Never"]
        }
      }
    },
    "service": {
      "type": "object",
      "properties": {
        "type": {
          "type": "string",
          "enum": ["ClusterIP", "NodePort", "LoadBalancer"]
        },
        "port": {"type": "integer", "minimum": 1, "maximum": 65535}
      }
    }
  }
}
```

```bash
# 校验失败会报错
helm install myapp ./mychart -f bad-values.yaml
# Error: values don't meet the specifications of the schema: ...
```

**专家技巧**:在 CI 流水线里加 `helm lint --strict` + schema 校验,values 出问题直接挂掉。

## 3.6 values 引用语法

在模板中,4 个顶层对象:

| 名称 | 含义 |
|------|------|
| `.Values` | values.yaml 内容 |
| `.Chart` | Chart.yaml 内容 |
| `.Release` | Release 信息(name/namespace/Service等) |
| `.Files` | Chart 内的文件(用于挂载/读取) |

```yaml
# 模板中
metadata:
  name: {{ include "myapp.fullname" . }}
  labels:
    app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
    app.kubernetes.io/managed-by: {{ .Release.Service }}
spec:
  replicas: {{ .Values.replicaCount }}
  template:
    spec:
      containers:
        - name: {{ .Chart.Name }}
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}"
          env:
            - name: LOG_LEVEL
              value: {{ .Values.config.logLevel | quote }}
```

## 3.7 常见反模式

| 反模式 | 问题 | 修正 |
|--------|------|------|
| 把所有配置塞一个超大 values | 难以维护 | 按组件分组 |
| 字符串当数字 `"replicaCount: "3"` | 类型判断错误 | 用整数 |
| 镜像 tag 写 `latest` | 不可复现、滚动失败 | 固定版本 |
| 敏感信息明文放 values | 泄漏风险 | 用 SOPS/external-secrets |
| values 文件无注释 | 不可读 | 每个字段加注释 |
| 不同环境用不同 Chart | 维护成本 | 同 Chart + 多 values |

## 3.8 本章小结

- values 是 Chart 的"配置 API",设计好坏决定可复用性
- 4 种覆盖方式,生产用 `-f` 文件 + 版本控制
- 多环境用"一个 Chart + 多 values"模式
- 加 `values.schema.json` 在 CI 中拦截错误
- 4 个内置对象:`.Values`、`.Chart`、`.Release`、`.Files`
