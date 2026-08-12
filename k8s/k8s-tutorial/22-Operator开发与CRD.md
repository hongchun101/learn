# 22. Operator 开发与 CRD

## 22.1 什么是 Operator

**Operator = CRD + Controller** = 用 K8s API 管理工作负载。

```text
K8s 原生:
Pod / Service / Deployment / StatefulSet
↓ 静态行为,内置控制器

Operator:
CRD(自定义资源) + Controller(自定义逻辑)
↓ 你定义类型和行为

优势:
- 像 K8s 资源一样管理应用
- 自动处理运维任务(备份/恢复/升级/扩缩)
- 用 kubectl 操作
- 复用 K8s 生态(RBAC/UI/CLI)
```

**典型 Operator**:
- MySQL Operator(主从切换)
- Redis Operator(集群/哨兵)
- Strimzi(Kafka)
- Prometheus Operator(Servicemonitor/AlertmanagerConfig)
- Cert-manager(证书)
- ArgoCD/Flux(GitOps)

## 22.2 CRD(Custom Resource Definition)

**自定义资源** = 扩展 K8s API。

```yaml
# 1. 定义 CRD
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: websites.example.com
spec:
  group: example.com
  versions:
  - name: v1
    served: true
    storage: true
    schema:
      openAPIV3Schema:
        type: object
        properties:
          spec:
            type: object
            properties:
              image:
                type: string
              replicas:
                type: integer
                minimum: 1
                maximum: 10
  scope: Namespaced
  names:
    plural: websites
    singular: website
    kind: Website
    shortNames: [web]
```

**应用后**:
```bash
kubectl get websites
kubectl get web         # shortName
```

**创建资源**:
```yaml
apiVersion: example.com/v1
kind: Website
metadata:
  name: my-site
spec:
  image: nginx:1.25
  replicas: 3
```

## 22.3 Controller(控制器)

**Controller = 持续调谐循环**,让实际状态趋近期望状态。

```go
// 伪代码
func (r *WebsiteReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
    // 1. 拿到期望状态
    website := &examplecomv1.Website{}
    if err := r.Get(ctx, req.NamespacedName, website); err != nil {
        return ctrl.Result{}, client.IgnoreNotFound(err)
    }

    // 2. 检查 Deployment 是否存在
    deploy := &appsv1.Deployment{}
    err := r.Get(ctx, req.NamespacedName, deploy)
    if err != nil && errors.IsNotFound(err) {
        // 3. 不存在 → 创建
        deploy = r.deploymentForWebsite(website)
        r.Create(ctx, deploy)
        return ctrl.Result{Requeue: true}, nil
    }

    // 4. 存在 → 检查镜像是否匹配
    if !reflect.DeepEqual(deploy.Spec.Template.Spec.Containers[0].Image, website.Spec.Image) {
        deploy.Spec.Template.Spec.Containers[0].Image = website.Spec.Image
        r.Update(ctx, deploy)
        return ctrl.Result{Requeue: true}, nil
    }

    // 5. 检查 Service
    // ...

    return ctrl.Result{}, nil
}
```

## 22.4 kubebuilder 实战

**kubebuilder** = 官方脚手架,生成 Controller 框架。

### 1. 初始化

```bash
# 装 kubebuilder
brew install kubebuilder

# 创建项目
mkdir website-operator && cd website-operator
go mod init github.com/example/website-operator
kubebuilder init --domain example.com --repo github.com/example/website-operator

# 创建 API
kubebuilder create api --group example --version v1 --kind Website
# 创建了:
# - api/v1/website_types.go       (类型定义)
# - internal/controller/website_controller.go  (控制器)
# - config/                        (CRD/RBAC/部署 yaml)
```

### 2. 定义类型

```go
// api/v1/website_types.go
type WebsiteSpec struct {
    Image    string `json:"image"`
    Replicas *int32 `json:"replicas,omitempty"`
}

type WebsiteStatus struct {
    ReadyReplicas int32 `json:"readyReplicas"`
    Phase         string `json:"phase"`
}

//+kubebuilder:object:root=true
//+kubebuilder:subresource:status
type Website struct {
    metav1.TypeMeta   `json:",inline"`
    metav1.ObjectMeta `json:"metadata,omitempty"`
    Spec   WebsiteSpec   `json:"spec,omitempty"`
    Status WebsiteStatus `json:"status,omitempty"`
}
```

### 3. 实现 Reconcile

```go
// internal/controller/website_controller.go
func (r *WebsiteReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
    log := log.FromContext(ctx)

    // 1. 拿 Website
    website := &examplecomv1.Website{}
    if err := r.Get(ctx, req.NamespacedName, website); err != nil {
        return ctrl.Result{}, client.IgnoreNotFound(err)
    }

    // 2. 创建/更新 Deployment
    deploy := r.deploymentForWebsite(website)
    if err := controllerutil.SetControllerReference(website, deploy, r.Scheme); err != nil {
        return ctrl.Result{}, err
    }

    found := &appsv1.Deployment{}
    if err := r.Get(ctx, req.NamespacedName, found); err != nil {
        if errors.IsNotFound(err) {
            log.Info("Creating Deployment", "website", website.Name)
            if err := r.Create(ctx, deploy); err != nil {
                return ctrl.Result{}, err
            }
            return ctrl.Result{Requeue: true}, nil
        }
        return ctrl.Result{}, err
    }

    // 3. 镜像变化 → 更新
    if !reflect.DeepEqual(deploy.Spec.Template.Spec.Containers[0].Image,
                         found.Spec.Template.Spec.Containers[0].Image) {
        found.Spec.Template.Spec.Containers[0].Image = deploy.Spec.Template.Spec.Containers[0].Image
        if err := r.Update(ctx, found); err != nil {
            return ctrl.Result{}, err
        }
        return ctrl.Result{Requeue: true}, nil
    }

    // 4. 更新 status
    website.Status.ReadyReplicas = found.Status.ReadyReplicas
    website.Status.Phase = "Running"
    if err := r.Status().Update(ctx, website); err != nil {
        return ctrl.Result{}, err
    }

    return ctrl.Result{}, nil
}
```

### 4. 部署

```bash
# 生成 yaml
make manifests

# 装 CRD
make install

# 本地跑(调试)
make run

# 打包镜像并部署
make docker-build docker-push IMG=myreg/website-operator:v1
make deploy IMG=myreg/website-operator:v1
```

## 22.5 Operator SDK(Kubebuilder 之外)

```bash
# Operator SDK(Red Hat 主导)
operator-sdk init --domain example.com --repo github.com/example/website-operator
operator-sdk create api --group example --version v1 --kind Website
```

**kubebuilder vs Operator SDK**:
- kubebuilder:简洁,K8s 官方风格
- Operator SDK:更老,支持 Helm/Ansible Operator(非 Go)

### Helm Operator(快速)

```bash
operator-sdk create api --group example --version v1 --kind Website --helm-chart
# 用 chart 当作逻辑
```

**场景**:简单包管理,无复杂逻辑。

## 22.6 controller-runtime 核心概念

```go
// Manager
mgr, _ := ctrl.NewManager(ctrl.GetConfigOrDie(), ctrl.Options{})

// Reconciler
r := &WebsiteReconciler{Client: mgr.GetClient()}

// 注册到 Manager
ctrl.NewControllerManagedBy(mgr).
    For(&examplecomv1.Website{}).
    Owns(&appsv1.Deployment{}).
    Complete(r)
```

**关键模式**:
- **Watch**:监听资源变化(主资源 + 关联资源)
- **Predicate**:过滤事件
- **Reconcile**:调谐逻辑
- **Owner Reference**:父子关系(删除父自动删除子)
- **Status Subresource**:分离 status 写入,避免竞态

## 22.7 Finalizer(预删除钩子)

**问题**:用户 `kubectl delete website` 时,Controller 怎么知道要"清理资源"?

**Finalizer 机制**:
```go
const websiteFinalizer = "website.example.com/finalizer"

func (r *WebsiteReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
    website := &examplecomv1.Website{}
    if err := r.Get(ctx, req.NamespacedName, website); err != nil {
        return ctrl.Result{}, client.IgnoreNotFound(err)
    }

    // 检查是否删除中
    if !website.DeletionTimestamp.IsZero() {
        if controllerutil.ContainsFinalizer(website, websiteFinalizer) {
            // 清理外部资源
            if err := r.cleanupExternalResources(website); err != nil {
                return ctrl.Result{}, err
            }
            // 移除 finalizer
            controllerutil.RemoveFinalizer(website, websiteFinalizer)
            if err := r.Update(ctx, website); err != nil {
                return ctrl.Result{}, err
            }
        }
        return ctrl.Result{}, nil
    }

    // 加 finalizer
    if !controllerutil.ContainsFinalizer(website, websiteFinalizer) {
        controllerutil.AddFinalizer(website, websiteFinalizer)
        if err := r.Update(ctx, website); err != nil {
            return ctrl.Result{}, err
        }
    }

    // 正常调谐...
    return ctrl.Result{}, nil
}
```

**用途**:
- 清理云资源(数据库实例)
- 备份数据
- 通知外部系统
- 解绑服务发现

## 22.8 Webhook(准入控制)

**Validating Webhook**:验证(读)
**Mutating Webhook**:修改(写)

```go
// +kubebuilder:webhook:path=/mutate-example-com-v1-website,mutating=true
// +kubebuilder:rbac:groups=example.com,resources=websites,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups=example.com,resources=websites/status,verbs=get;update;patch

func (r *Website) Default() {
    if r.Spec.Replicas == nil {
        r.Spec.Replicas = ptr.To(int32(1))
    }
}

func (r *Website) ValidateCreate() (admission.Warnings, error) {
    if r.Spec.Replicas != nil && *r.Spec.Replicas > 10 {
        return nil, fmt.Errorf("replicas 不能超过 10")
    }
    return nil, nil
}
```

**应用**:
- 默认值填充
- 字段验证
- 跨字段约束
- 资源限制

## 22.9 实战:简单的 Memcached Operator

**整体流程**:
1. 定义 CRD Memcached
2. Controller 监听 Memcached
3. 变化时创建/更新 Deployment(replicas)
4. 更新 status(readyReplicas)
5. 删除时清理

**完整代码见** [kubernetes/sample-controller](https://github.com/kubernetes/sample-controller)。

## 22.10 真实生产 Operator 案例:PostgreSQL

**Zalando PostgreSQL Operator**:
```bash
helm install postgres-operator postgres-operator-charts/postgres-operator
```

```yaml
apiVersion: "acid.zalan.do/v1"
kind: "postgresql"
metadata:
  name: my-db
spec:
  teamId: "team-a"
  volume:
    size: 100Gi
    storageClass: fast-ssd
  numberOfInstances: 3
  users:
    myapp: []
  databases:
    mydb: myapp
  postgresql:
    version: "15"
  resources:
    requests: { cpu: 100m, memory: 100Mi }
    limits: { cpu: 4, memory: 4Gi }
```

**Operator 做什么**:
- 自动建 StatefulSet + Service
- 配流复制(主从)
- 配 Patroni(自动 failover)
- 自动备份(S3/WAL)
- 监控指标(Prometheus)
- 滚动升级(主从切换)
- 扩缩容(主从增减)

## 22.11 Operator 生态

| 类别 | Operator |
|------|----------|
| 数据库 | MySQL, PostgreSQL, Redis, MongoDB, Cassandra, ClickHouse |
| 消息 | Kafka, RabbitMQ, NATS, Pulsar |
| 存储 | Rook(Ceph), MinIO, Velero, CSI drivers |
| 监控 | Prometheus, Grafana, Loki, Tempo |
| 安全 | cert-manager, Vault, Falco |
| 网络 | Istio, Cilium, Calico |
| GitOps | ArgoCD, Flux |
| 其他 | Knative, KEDA, Crossplane |

## 22.12 Operator 设计模式

### 1. 协调循环(Reconcile)

```text
观察 → 比对 → 行动 → 再观察
```

### 2. 关注点分离

```text
- CRD 定义(类型 + schema)
- Controller 逻辑(调谐)
- Admission Webhook(验证/默认值)
- Conversion Webhook(版本转换)
- Finalizer(清理)
- Status(状态)
```

### 3. 不可变 spec + 可变 status

```yaml
spec:
  image: nginx:1.25      # 用户改
status:
  readyReplicas: 3        # Operator 改
```

### 4. 事件驱动

```text
- Watch 主资源(Website)
- Watch 关联资源(Deployment, Service)
- 任意变化触发 Reconcile
- 避免轮询
```

## 22.13 测试 Operator

### 单元测试

```go
func TestReconcile(t *testing.T) {
    // 用 envtest(fake apiserver + etcd)
    testEnv := &envtest.Environment{
        CRDDirectoryPaths:     []string{filepath.Join("..", "config", "crd")},
        ErrorIfCRDPathMissing: true,
    }
    cfg, _ := testEnv.Start()
    defer testEnv.Stop()

    mgr, _ := ctrl.NewManager(cfg, ctrl.Options{})
    mgr.GetClient()

    // 测 Reconcile 逻辑
}
```

### 端到端测试

```go
// envtest + 创建资源 + 验证
```

### 集成测试

```bash
# kind 集群
make test-e2e
```

## 22.14 Operator 部署

```yaml
# 1. 镜像
docker build -t myreg/website-operator:v1 .
docker push myreg/website-operator:v1

# 2. RBAC
kubectl apply -f config/rbac/role.yaml
kubectl apply -f config/rbac/role_binding.yaml

# 3. CRD
kubectl apply -f config/crd/bases/

# 4. Deployment
kubectl apply -f config/manager/manager.yaml
```

## 22.15 专家清单

- [ ] 理解 K8s 控制器模式
- [ ] 能用 kubebuilder 起项目
- [ ] 写简单 CRD + Controller
- [ ] Finalizer 处理清理
- [ ] Webhook 加验证/默认值
- [ ] Status subresource 分离
- [ ] 单元测试 + 集成测试
- [ ] Helm 部署 Operator
- [ ] 用现成 Operator(MySQL/PG/Redis/Kafka)
- [ ] 监控 Operator(自身 + 管理的资源)
- [ ] 安全:Operator SA 最小权限

## 22.16 本章小结

- Operator = CRD + Controller,把运维知识编码
- kubebuilder 是事实标准
- controller-runtime 提供 Manager/Reconciler/Client
- Finalizer 处理删除前清理
- Webhook 加验证/默认值
- Status subresource 分离期望/实际
- 主流数据库/消息/存储都有成熟 Operator
- 复杂应用先用 Operator,别自己造
- 测试:envtest + 端到端测试
- 部署:Helm/Operator Lifecycle Manager
