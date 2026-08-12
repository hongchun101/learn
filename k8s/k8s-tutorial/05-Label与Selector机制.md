# 05. Label 与 Selector 机制

## 5.1 为什么 Label 是 K8s 的基石

**Label 是 K8s 的"群组管理"机制**——所有"选择一群对象"的操作都基于 Label。

| 用 Label 的场景 | 不支持 Label |
|----------------|-------------|
| Service 选 Pod | `kubectl get pods --field-selector`(部分) |
| Deployment 选 Pod 模板 | 直接按名字 |
| HPA 监控 Pod | |
| NetworkPolicy 选 Pod | |
| PDB 保护 Pod | |
| kubectl `-l` 过滤 | |
| 节点亲和性(Pod 选 Node) | |
| topology 打散 | |

**没有 Label,K8s 寸步难行。**

## 5.2 Label 是什么

**键值对**(`key=value`),附在对象上(metadata):

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: web-1
  labels:
    app: web
    env: prod
    tier: frontend
    version: "1.25"
    owner: team-a
```

### 约束

- **Key**:`前缀(可选)/名称`,前缀 DNS 子域名 ≤253 字符,名称 ≤63 字符
- **Value**:`空` 或 ≤63 字符,首尾字母数字,可含 `-` `_` `.`
- **保留前缀**:`kubernetes.io/` `k8s.io/` 保留给 K8s 自己(比如 `node-role.kubernetes.io/control-plane`)

## 5.3 推荐标签(从 01 提的)

```yaml
labels:
  app.kubernetes.io/name: <应用名>            # 必填
  app.kubernetes.io/instance: <release 名>    # 多实例区分
  app.kubernetes.io/version: "<语义版本>"      # 升级时用
  app.kubernetes.io/component: <组件>          # db / cache / frontend
  app.kubernetes.io/part-of: <系统>           # 所属大系统
  app.kubernetes.io/managed-by: <工具>        # helm / kubectl / argocd
```

**示例**:

```yaml
metadata:
  labels:
    app.kubernetes.io/name: nginx
    app.kubernetes.io/instance: nginx-prod
    app.kubernetes.io/version: "1.25.3"
    app.kubernetes.io/component: frontend
    app.kubernetes.io/part-of: ecommerce
    app.kubernetes.io/managed-by: helm
```

**专家法则**:
- **业务/团队用**:`app.kubernetes.io/*`
- **运维用**:`team`, `cost-center`, `environment` 等
- **临时用**:`do-not-delete` 等,加到对象上防止误删

## 5.4 Label Selector(选择器)

### 等值选择

```yaml
selector:
  matchLabels:
    app: web
    env: prod
```

**含义**:`app=web AND env=prod`。

### 集合选择(更强大)

```yaml
selector:
  matchExpressions:
  - { key: app, operator: In, values: [web, api] }
  - { key: env, operator: NotIn, values: [dev] }
  - { key: tier, operator: Exists }                  # 存在
  - { key: legacy, operator: DoesNotExist }
```

| Operator | 含义 |
|----------|------|
| `In` | key 在 values 列表中 |
| `NotIn` | key 不在 values 列表中 |
| `Exists` | key 存在(忽略 value) |
| `DoesNotExist` | key 不存在 |

**复合规则**:
- 多个表达式之间是 **AND**
- `In`/`NotIn` 内的 values 是 **OR**

### 复杂示例

```yaml
# app 是 web 或 api
# env 是 prod 或 staging
# tier 不等于 db
selector:
  matchExpressions:
  - { key: app, operator: In, values: [web, api] }
  - { key: env, operator: In, values: [prod, staging] }
  - { key: tier, operator: NotIn, values: [db] }
```

## 5.5 kubectl label 命令

```bash
# 加/改
kubectl label pod web-1 env=prod
kubectl label pod web-1 team=backend --overwrite    # 改已存在

# 批量
kubectl label pods -l app=web env=prod

# 删
kubectl label pod web-1 env-

# 看
kubectl get pod web-1 --show-labels
kubectl get pods -L env                             # env 作为列
kubectl get pods -L app,env,version
```

## 5.6 kubectl 用 selector 过滤

```bash
# 等值
kubectl get pods -l app=web
kubectl get pods -l 'app=web,env=prod'              # AND

# 集合
kubectl get pods -l 'app in (web,api)'
kubectl get pods -l 'app notin (db)'
kubectl get pods -l 'env'                           # 存在 env
kubectl get pods -l '!env'                          # 不存在 env

# 混合
kubectl get pods -l 'app=web,env in (prod,staging)'
```

## 5.7 Label 在控制器中的关键作用

### Deployment → ReplicaSet → Pod

```text
Deployment.spec.selector: { app: web }
     ↓ selects ReplicaSet
ReplicaSet.spec.selector: { app: web }
     ↓ selects Pod
Pod.metadata.labels: { app: web }
```

**核心约束**:
- **Deployment selector 和 Pod template labels 必须有重叠**(否则找不到 Pod)
- **Reconciler 流程**:Deployment 拿 selector 找 ReplicaSet → 拿 selector 找 Pod

**常见坑**:改了 `template.labels` 但没改 `spec.selector.matchLabels`,导致老 Pod "孤儿"。

```bash
# 查 deployment 当前匹配的 pod
kubectl get pods -l <deployment-selector>
# 如果 0,说明 selector 错了
```

## 5.8 Service Selector(最关键的应用)

```yaml
apiVersion: v1
kind: Service
metadata: { name: web }
spec:
  selector:
    app: web
  ports:
  - { port: 80, targetPort: 8080 }
```

**Service 用 selector 持续"认领"Pod,自动维护 Endpoints**:
- Pod 加上 `app=web` label → 自动加入 Endpoints
- Pod 删 label → 自动从 Endpoints 移除

**没 selector 的 Service**:必须手动维护 Endpoints 对象(很少用)。

```bash
# 看 Endpoints
kubectl get endpoints web
# 或
kubectl get ep web -o yaml
```

## 5.9 Service 用 matchLabels 还是 matchExpressions

两种都可以,但 `matchLabels` 更简洁:

```yaml
# 推荐:matchLabels
spec:
  selector:
    matchLabels:
      app: web
      env: prod

# 复杂时用 matchExpressions
spec:
  selector:
    matchExpressions:
    - { key: app, operator: In, values: [web, api] }
```

**Service selector 一旦设了不能改**!(要改只能删了重建)

## 5.10 Annotation vs Label

| | Label | Annotation |
|--|-------|-----------|
| 作用 | **标识 / 选择** | **元数据 / 工具信息** |
| 数量 | 建议 ≤ 几十 | 可以上百 |
| 选择 | ✅ 可以 | ❌ 不可以 |
| 用例 | `app: web` | `prometheus.io/scrape: "true"` |

```yaml
metadata:
  labels:
    app: web                 # 标识
    env: prod
  annotations:
    prometheus.io/scrape: "true"           # 给 Prometheus Operator 用
    prometheus.io/port: "8080"
    kubernetes.io/change-cause: "升级到 1.26"
    description: "支付服务,owner: team-a"
    contact: "team-a@example.com"
```

**Annotation 用途**:
- 工具集成(Prometheus 抓取注解、Service Mesh 注入、备份工具标记)
- 自动化信息(change-cause、描述)
- 非标识元数据

## 5.11 节点 Label 与节点选择

```bash
# 看节点标签
kubectl get nodes --show-labels

# 常见内置标签
# node-role.kubernetes.io/control-plane
# node-role.kubernetes.io/worker
# kubernetes.io/arch=amd64
# kubernetes.io/os=linux
# topology.kubernetes.io/region=us-east-1
# topology.kubernetes.io/zone=us-east-1a
# node.kubernetes.io/instance-type=m5.large

# 打自定义标签
kubectl label node node1 disktype=ssd
kubectl label node node1 gpu=true
kubectl label node node1 env=prod --overwrite

# 删
kubectl label node node1 disktype-
```

**生产建议**:
- `disktype=ssd/hdd`
- `gpu=true/false`
- `env=prod/staging/dev`
- `role=web/db/cache`
- `zone=us-east-1a`(云厂商自动打)

详见 12 章调度篇。

## 5.12 Topology Labels(拓扑)

K8s 用 `topology.kubernetes.io/region` 和 `topology.kubernetes.io/zone` 表达节点所在的"区域":

```bash
kubectl get nodes -L topology.kubernetes.io/zone
NAME      STATUS   ZONE
node1     Ready    us-east-1a
node2     Ready    us-east-1a
node3     Ready    us-east-1b
node4     Ready    us-east-1c
```

**用于**:region/zone 亲和性、多可用区部署。

## 5.13 实战:用 Label 改造应用

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: payment-api
  labels:
    app.kubernetes.io/name: payment
    app.kubernetes.io/instance: payment-prod
    app.kubernetes.io/version: "2.1.0"
    app.kubernetes.io/component: backend
    app.kubernetes.io/part-of: ecommerce
    app.kubernetes.io/managed-by: helm
    env: prod
    team: payments
spec:
  replicas: 5
  selector:
    matchLabels:
      app.kubernetes.io/name: payment
      app.kubernetes.io/instance: payment-prod
  template:
    metadata:
      labels:
        app.kubernetes.io/name: payment
        app.kubernetes.io/instance: payment-prod
        app.kubernetes.io/version: "2.1.0"
        app.kubernetes.io/component: backend
        app.kubernetes.io/part-of: ecommerce
        app.kubernetes.io/managed-by: helm
        env: prod
        team: payments
    spec:
      containers:
      - name: payment
        image: payment:2.1.0
```

**注意**:`spec.selector.matchLabels` 是 Deployment 的关键约束:
- 改 `template.labels` 但不改 selector → 旧 Pod 保留,新 Pod 不会被 Deployment 管
- 改 `selector` → 不可变,必须删了重建

## 5.14 标签选择最佳实践

### 命名规范

```text
app.kubernetes.io/<name>      # 标准
team/<team-name>               # 自定义:team/payments
env/<env-name>                 # 自定义:env/prod
project/<project-name>         # 自定义
```

### 一致性

- **同一类对象**用相同 label schema
- 团队统一约定,写进文档/CI
- 自动化校验(kube-linter、polaris)

### 数量控制

- **避免无意义 label**(浪费 etcd、混淆选择)
- **临时 label 用完即删**
- **敏感信息不要放 label**(会出现在事件、审计、UI)

## 5.15 Label Slector 实战命令集

```bash
# 选所有 prod 的 pod
kubectl get pods -A -l env=prod

# 选所有 web 类(多 app)
kubectl get pods -A -l 'app.kubernetes.io/component in (frontend,api)'

# 找没有 app label 的 pod(配置错误)
kubectl get pods -A -l '!app.kubernetes.io/name'

# 用 label 创建 service
kubectl expose deploy web --port=80 --target-port=8080

# 批量加 label
kubectl label pods -l app=web version=2.0 --overwrite

# 批量删 label
kubectl label pods -l app=web version-

# JSONPath 提取
kubectl get pods -A -o jsonpath='{range .items[?(@.metadata.labels.app=="web")]}{.metadata.name}{"\n"}{end}'
```

## 5.16 常见错误与排查

### 错误 1:Deployment 找不到 Pod

```bash
# 现象:
kubectl get deploy web
NAME   READY   UP-TO-DATE   AVAILABLE   AGE
web    0/3     0            0           5m

# 原因:selector 改了,但 template 没改
# 查 pod label
kubectl get pods --show-labels
# 查 deploy selector
kubectl get deploy web -o jsonpath='{.spec.selector.matchLabels}'
```

### 错误 2:Service 没 Endpoints

```bash
kubectl get ep web
NAME   ENDPOINTS   AGE
web    <none>      5m

# 原因:Pod label 和 Service selector 不匹配
kubectl get pods --show-labels
kubectl get svc web -o jsonpath='{.spec.selector}'
```

### 错误 3:Label 拼写错

```bash
# Service selector 写 app=web,但 Pod 打了 app=Web(大写)
# K8s 区分大小写,不会匹配
```

## 5.17 Well-Known Labels 速查

| 类别 | 标签 | 用途 |
|------|------|------|
| 推荐 | `app.kubernetes.io/name` | 应用名 |
| 推荐 | `app.kubernetes.io/instance` | 实例名 |
| 推荐 | `app.kubernetes.io/version` | 版本 |
| 推荐 | `app.kubernetes.io/component` | 组件 |
| 推荐 | `app.kubernetes.io/part-of` | 所属 |
| 推荐 | `app.kubernetes.io/managed-by` | 管理工具 |
| 节点 | `kubernetes.io/arch` | 架构 |
| 节点 | `kubernetes.io/os` | 操作系统 |
| 节点 | `node-role.kubernetes.io/<role>` | 角色 |
| 拓扑 | `topology.kubernetes.io/region` | 区域 |
| 拓扑 | `topology.kubernetes.io/zone` | 可用区 |
| 拓扑 | `topology.kubernetes.io/hostname` | 节点名 |

## 5.18 高级:Field Selector

K8s 还支持**字段选择器**(非 label):

```bash
kubectl get pods --field-selector=status.phase=Running
kubectl get pods --field-selector=status.phase!=Running,spec.restartPolicy=Always
kubectl get events --field-selector type=Warning
kubectl get nodes --field-selector=spec.unschedulable=true
kubectl get configmaps --field-selector=metadata.namespace!=kube-system
```

**和 label selector 区别**:
- label:用户自定义,灵活
- field:K8s 字段,有限但稳定

## 5.19 本章小结

- Label 是 K8s 的"群组管理",所有"选一群对象"的操作都靠它
- 格式:`key=value`,遵循 DNS 命名规范
- Selector 两种:等值(`matchLabels`)和集合(`matchExpressions`)
- **强烈推荐** `app.kubernetes.io/*` 六个标准标签
- Annotation 给工具用(Prometheus、CI),不参与选择
- Service/Deployment/HPA/PDB/NetworkPolicy 全部用 selector
- selector 改不了,改只能删了重建
- 节点 label 表达"角色/硬件/位置",调度全靠它
