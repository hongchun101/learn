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
## 22.17 Leader Election(多副本 HA)

### 核心问题

```text
Operator 跑多副本时:
  - 多个副本同时 Reconcile 同一资源
  - 重复创建子资源
  - 资源竞争

Leader Election:
  - 同一时间只有一个 active
  - 其他 standby
  - Active 挂了,standby 抢锁
```

### kubebuilder 启用 Leader Election

```go
// main.go
func main() {
    var enableLeaderElection bool
    flag.BoolVar(&enableLeaderElection, "leader-elect", true, "")
    
    mgr, err := ctrl.NewManager(ctrl.GetConfigOrDie(), ctrl.Options{
        Scheme:             scheme,
        Metrics:            metricsserver.Options{BindAddress: metricsAddr},
        HealthProbeBindAddress: probeAddr,
        LeaderElection:          enableLeaderElection,
        LeaderElectionID:        "website-operator-leader",
        LeaderElectionResourceLock: "leases",  // 用 Lease 资源
    })
    
    if err = (&controller.WebsiteReconciler{
        Client: mgr.GetClient(),
        Scheme: mgr.GetScheme(),
    }).SetupWithManager(mgr); err != nil {
        os.Exit(1)
    }
}
```

### Lease 锁机制

```text
锁对象: lease/website-operator-leader
  holder-identity: pod-0  (active)
  acquire-time: 2024-01-15T10:00:00Z
  renew-time: 2024-01-15T10:00:15Z
  lease-duration-seconds: 15
  
选举流程:
  1. Pod-0 拿到 lease, 变 active
  2. Pod-1/2 看到 lease 已被持, standby
  3. Pod-0 每 15s 续约
  4. Pod-0 挂了,15s 后 lease 过期
  5. Pod-1/2 抢到 lease,变 active
```

### 性能优化:Per-Resource Lease

```go
// 大集群(10000+ CR),全局锁成瓶颈
// 用 per-resource lease
func (r *Reconciler) SetupWithManager(mgr ctrl.Manager) error {
    return ctrl.NewControllerManagedBy(mgr).
        For(&examplev1.Website{}).
        WithOptions(controller.Options{
            MaxConcurrentReconciles: 5,
        }).
        Complete(r)
}
```

## 22.18 Operator 高级测试

### 测试金字塔

```text
        E2E (慢, 真实集群)
           ↑
     Integration (envtest, 真实 API)
           ↑
        Unit (快, mock)
```

### 单元测试(Fake Client)

```go
func TestWebsiteReconciler_CreateDeployment(t *testing.T) {
    scheme := runtime.NewScheme()
    _ = examplev1.AddToScheme(scheme)
    _ = appsv1.AddToScheme(scheme)
    
    fakeClient := fake.NewClientBuilder().
        WithScheme(scheme).
        WithObjects(&examplev1.Website{
            ObjectMeta: metav1.ObjectMeta{Name: "my-site", Namespace: "default"},
            Spec: examplev1.WebsiteSpec{
                Image:    "nginx:1.25",
                Replicas: ptr.To(int32(3)),
            },
        }).
        Build()
    
    r := &WebsiteReconciler{Client: fakeClient, Scheme: scheme}
    
    // 第一次 Reconcile - 创建 Deployment
    res, err := r.Reconcile(context.TODO(), reconcile.Request{
        NamespacedName: types.NamespacedName{Name: "my-site", Namespace: "default"},
    })
    assert.NoError(t, err)
    assert.True(t, res.Requeue)
    
    // 验证 Deployment 被创建
    deploy := &appsv1.Deployment{}
    err = fakeClient.Get(context.TODO(),
        types.NamespacedName{Name: "my-site", Namespace: "default"},
        deploy)
    assert.NoError(t, err)
    assert.Equal(t, "nginx:1.25", deploy.Spec.Template.Spec.Containers[0].Image)
}
```

### envtest 集成测试

```go
// envtest 用 etcd + kube-apiserver 二进制
var testEnv *envtest.Environment

func TestMain(m *testing.M) {
    testEnv = &envtest.Environment{
        CRDDirectoryPaths:     []string{filepath.Join("..", "config", "crd", "bases")},
        ErrorIfCRDPathMissing: true,
    }
    
    cfg, err := testEnv.Start()
    if err != nil {
        panic(err)
    }
    
    code := m.Run()
    testEnv.Stop()
    os.Exit(code)
}
```

### E2E 测试

```go
var _ = Describe("Website Controller", func() {
    Context("When creating a Website", func() {
        It("Should create a Deployment", func() {
            By("Creating Website")
            website := &examplev1.Website{
                Spec: examplev1.WebsiteSpec{Image: "nginx:1.25"},
            }
            Expect(k8sClient.Create(ctx, website)).To(Succeed())
            
            By("Waiting for Deployment")
            Eventually(func() bool {
                deploy := &appsv1.Deployment{}
                _ = k8sClient.Get(ctx,
                    types.NamespacedName{Name: website.Name, Namespace: "default"},
                    deploy)
                return deploy.Status.ReadyReplicas == 3
            }, "60s", "5s").Should(BeTrue())
        })
    })
})
```

### 表驱动测试

```go
func TestReconcile(t *testing.T) {
    tests := []struct {
        name    string
        website *examplev1.Website
        want    reconcile.Result
        wantErr bool
    }{
        {
            name: "create deployment",
            website: &examplev1.Website{
                Spec: examplev1.WebsiteSpec{Image: "nginx:1.25", Replicas: ptr.To(int32(3))},
            },
            want: reconcile.Result{Requeue: true},
        },
        {
            name: "image change updates deployment",
            website: &examplev1.Website{
                Spec: examplev1.WebsiteSpec{Image: "nginx:1.26", Replicas: ptr.To(int32(3))},
            },
            want: reconcile.Result{Requeue: true},
        },
    }
    
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            // run test
        })
    }
}
```

## 22.19 Webhook 高级用法

### ValidatingWebhook(验证)

```go
// api/v1/website_webhook.go
func (r *Website) ValidateCreate() (admission.Warnings, error) {
    websitelist := r.Spec.Image
    if !strings.HasPrefix(websitelist, "registry.company.com/") {
        return nil, fmt.Errorf("镜像必须来自 registry.company.com")
    }
    return nil, nil
}

func (r *Website) ValidateUpdate(old runtime.Object) (admission.Warnings, error) {
    if r.Spec.Replicas != nil && *r.Spec.Replicas > 10 {
        return nil, fmt.Errorf("副本数不能超过 10")
    }
    return nil, nil
}
```

### MutatingWebhook(默认值)

```go
func (r *Website) Default() {
    if r.Spec.Replicas == nil {
        r.Spec.Replicas = ptr.To(int32(1))
    }
    if r.Spec.Image == "" {
        r.Spec.Image = "nginx:1.25"
    }
}
```

### Conversion Webhook(版本转换)

```go
// v1 ↔ v2 转换
func (r *Website) ConvertTo(toRaw conversion.Hub) error {
    return Convert_v1_To_v2(r, toRaw.(*WebsiteV2))
}
func (r *Website) ConvertFrom(fromRaw conversion.Hub) error {
    return Convert_v2_To_v1(fromRaw.(*WebsiteV2), r)
}
```

## 22.20 Operator 可观测性

### Controller Runtime Metrics

```go
// 暴露 Prometheus 指标
import ctrlmetrics "sigs.k8s.io/controller-runtime/pkg/metrics"

var reconciles = ctrlmetrics.NewCounterVec(
    prometheus.CounterOpts{
        Name: "website_reconciles_total",
        Help: "Total reconciles",
    },
    []string{"result"},
)

func (r *Reconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
    start := time.Now()
    defer func() {
        reconciles.WithLabelValues("success").Inc()
    }()
    
    // ...
}
```

### 业务指标

```go
// 用 metrics-server 暴露业务状态
var (
    websitesReady = prometheus.NewGaugeVec(
        prometheus.GaugeOpts{
            Name: "website_ready_replicas",
            Help: "Number of ready replicas",
        },
        []string{"website"},
    )
)
```

### Operator 健康检查

```go
// main.go
mgr, _ := ctrl.NewManager(cfg, ctrl.Options{
    HealthProbeBindAddress: ":8081",
    // ...
})

// 注册健康检查
if err := mgr.AddHealthzCheck("ping", healthz.Ping); err != nil {
    os.Exit(1)
}
if err := mgr.AddReadyzCheck("ping", healthz.Ping); err != nil {
    os.Exit(1)
}
```

## 22.21 Operator 部署最佳实践

### Operator Lifecycle Manager(OLM)

```bash
# OLM 安装
curl -sL https://github.com/operator-framework/operator-lifecycle-manager/releases/download/v0.28.0/install.sh | bash -s v0.28.0
```

```yaml
# ClusterServiceVersion(CSV)
apiVersion: operators.coreos.com/v1alpha1
kind: ClusterServiceVersion
metadata:
  name: website-operator.v1.0.0
spec:
  displayName: Website Operator
  description: Manage website deployments
  keywords: [website, deployment]
  version: 1.0.0
  install:
    strategy: deployment
    spec:
      permissions:
      - serviceAccountName: website-operator
        rules: [...]
      deployments:
      - name: website-operator
        spec:
          replicas: 2  # 多副本
          template:
            spec:
              containers:
              - name: operator
                image: myreg/website-operator:v1.0.0
                resources:
                  requests: { cpu: 100m, memory: 128Mi }
                  limits:   { cpu: 500m, memory: 512Mi }
  customresourcedefinitions:
    owned:
    - name: websites.example.com
      version: v1
      kind: Website
```

### Helm Chart(简化部署)

```yaml
# templates/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: website-operator
spec:
  replicas: 2
  selector:
    matchLabels: { app: website-operator }
  template:
    metadata:
      labels: { app: website-operator }
    spec:
      serviceAccountName: website-operator
      containers:
      - name: operator
        image: myreg/website-operator:v1.0.0
        args:
        - --leader-elect
        - --leader-election-id=website-operator
        ports:
        - name: metrics
          containerPort: 8080
        - name: health
          containerPort: 8081
        readinessProbe:
          httpGet: { path: /readyz, port: 8081 }
        livenessProbe:
          httpGet: { path: /healthz, port: 8081 }
```

## 22.22 性能优化

### 减少 Reconcile 次数

```go
// 1. Predicate 过滤不关心的事件
func (r *Reconciler) SetupWithManager(mgr ctrl.Manager) error {
    return ctrl.NewControllerManagedBy(mgr).
        For(&examplev1.Website{}, builder.WithPredicates(predicate.Or(
            predicate.GenerationChangedPredicate{},  // 只在 spec 变化时
            predicate.LabelChangedPredicate{},        // label 变化
        ))).
        Owns(&appsv1.Deployment{}).
        Complete(r)
}
```

### 缓存优化

```go
// 用本地缓存,减少 API 调用
// 限制 watch 范围
mgr, _ := ctrl.NewManager(cfg, ctrl.Options{
    Cache: cache.Options{
        ByObject: map[client.Object]cache.ByObject{
            &corev1.Secret{}: {
                Label: labels.SelectorFromSet(labels.Set{"managed-by": "my-operator"}),
            },
        },
    },
})
```

### 批量 Reconcile

```go
// 多个变化合并处理
func (r *Reconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
    // 用 workqueue 批量处理
    if r.batchHandler != nil {
        r.batchHandler.Handle(req)
        return ctrl.Result{Requeue: true}, nil
    }
    // ... 正常处理
}
```

## 22.23 专家清单(终极版)

### 开发能力
- [ ] 完整 CRD + Controller
- [ ] Webhook(Validating + Mutating)
- [ ] Finalizer
- [ ] Status subresource
- [ ] Conversion webhook(多版本)

### 质量
- [ ] 单元测试(>80% 覆盖)
- [ ] 集成测试(envtest)
- [ ] E2E 测试
- [ ] 性能测试
- [ ] 安全扫描(Gosec)

### 生产
- [ ] Leader Election 启用
- [ ] 多副本 + PodDisruptionBudget
- [ ] Helm/OLM 部署
- [ ] 监控指标(业务 + 控制器)
- [ ] 健康检查
- [ ] 日志结构化

### 生态
- [ ] 用现成 Operator 优先
- [ ] Operator Hub 订阅
- [ ] 关注 Operator Maturity Model

## 22.24 本章小结(终极版)

- Operator = CRD + Controller + 运维知识
- kubebuilder + controller-runtime 事实标准
- **Leader Election** = 多副本 HA
- **测试**:Unit(Fake)→ Integration(envtest)→ E2E
- **Webhook**:Validating + Mutating + Conversion
- **生产**:OLM/Helm 部署 + 监控 + 健康检查
- 性能:Predicate 过滤 + 缓存 + 批量
- 现成 Operator 优先(MySQL/PG/Redis/Kafka)
