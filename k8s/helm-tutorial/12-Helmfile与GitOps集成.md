# 12. Helmfile 与 GitOps 集成

## 12.1 为什么需要 Helmfile

单 chart 用 `helm install/upgrade` 就够了。但生产中:
- 几十上百个 release
- 多个环境(dev / staging / prod)
- 多个团队、多个集群
- 复杂的部署顺序

`helm install` 命令行工具不够用,需要更高层编排。**Helmfile** 是事实标准。

## 12.2 Helmfile 快速上手

### 安装

```bash
# macOS
brew install helmfile

# Linux
curl -L https://github.com/roboll/helmfile/releases/latest/download/helmfile_linux_amd64 -o /usr/local/bin/helmfile
chmod +x /usr/local/bin/helmfile
```

### 第一个 helmfile

```yaml
# helmfile.yaml
repositories:
  - name: bitnami
    url: https://charts.bitnami.com/bitnami

releases:
  # 1. 公共 release
  - name: myapp
    namespace: my-ns
    chart: bitnami/nginx
    version: 13.2.0
    values:
      - values/myapp/values.yaml.gotmpl    # 支持 gotemplate
      - values/myapp/values-{{ .Environment.Name }}.yaml.gotmpl

  # 2. 数据库
  - name: postgres
    namespace: db
    chart: bitnami/postgresql
    version: 12.x.x
    needs:
      - ns/db                             # 依赖 namespace
    values:
      - auth:
          postgresPassword: {{ requiredEnv "POSTGRES_PASSWORD" }}
```

### values 文件用 Go template

`values.yaml.gotmpl` 是渲染过的:

```yaml
# values/myapp/values-prod.yaml.gotmpl
replicaCount: {{ env "REPLICA_COUNT" | default "3" }}
image:
  repository: myorg/myapp
  tag: {{ env "IMAGE_TAG" | required "must set IMAGE_TAG" }}
resources:
  requests:
    cpu: {{ env "CPU_REQUEST" | default "500m" }}
    memory: {{ env "MEM_REQUEST" | default "512Mi" }}
```

### 常用命令

```bash
# 1. 同步(apply 全部)
helmfile sync

# 2. 预览将要执行的 diff
helmfile diff

# 3. 单独 sync 一个 release
helmfile -l name=myapp sync

# 4. 按 selector 过滤
helmfile -l app=myapp sync

# 5. 销毁全部
helmfile destroy

# 6. 列出 release
helmfile list
```

## 12.3 Helmfile 完整字段

```yaml
repositories:
  - name: bitnami
    url: https://charts.bitnami.com/bitnami
    oci: false
  - name: myorg
    url: oci://registry-1.docker.io/myorg
    oci: true

releases:
  - name: myapp
    namespace: myapp-prod
    chart: myorg/myapp
    version: 1.2.3
    installed: true
    wait: true
    timeout: 600
    createNamespace: true
    verify: false
    
    # 依赖顺序
    needs:
      - ns/myapp-prod
      - secrets/myapp-prod
    
    # values
    values:
      - values/myapp/values.yaml.gotmpl
      - values/myapp/values-{{ .Environment.Name }}.yaml.gotmpl
    
    # secrets 加密
    secrets:
      - values/secrets/myapp-secrets.enc.yaml
    
    # hooks
    hooks:
      - events: [prepare, sync]
        command: "./scripts/backup.sh"
        showlogs: true
    
    # labels(过滤用)
    labels:
      app: myapp
      tier: backend
    
    # 环境变量
    env:
      AWS_REGION: us-east-1

environments:
  default:
    values:
      - environments/default.yaml.gotmpl
  prod:
    values:
      - environments/prod.yaml.gotmpl
    secrets:
      - environments/secrets/prod.enc.yaml

# state 存储(默认本地)
state:
  valueFile: state.yaml
```

## 12.4 多环境管理

### 模式 1:一个 helmfile,多 environment

```yaml
# helmfile.yaml
environments:
  dev:
    values:
      - env/dev.yaml.gotmpl
  staging:
    values:
      - env/staging.yaml.gotmpl
  prod:
    values:
      - env/prod.yaml.gotmpl
    secrets:
      - env/secrets/prod.enc.yaml

releases:
  - name: myapp
    namespace: myapp-{{ .Environment.Name }}
    chart: ./myapp
    values:
      - values.yaml
      - env-values/{{ .Environment.Name }}.yaml
```

```bash
helmfile -e prod sync
helmfile -e dev diff
```

### 模式 2:每个环境一个 helmfile

```text
helmfiles/
├── helmfile.yaml.gotmpl         # 公共
├── dev/
│   └── helmfile.yaml            # dev 专用
├── staging/
│   └── helmfile.yaml
└── prod/
    └── helmfile.yaml
```

## 12.5 实战:生产级 helmfile

```yaml
# helmfile.yaml
helmDefaults:
  timeout: 900
  wait: true
  createNamespace: true
  verify: false
  recreatePods: false

repositories:
  - name: bitnami
    url: https://charts.bitnami.com/bitnami
  - name: ingress-nginx
    url: https://kubernetes.github.io/ingress-nginx
  - name: myorg
    url: oci://registry-1.docker.io/myorg
    oci: true

environments:
  prod:
    values:
      - env/prod.yaml.gotmpl
    secrets:
      - env/secrets/prod.enc.yaml

releases:
  # 1. Namespace
  - name: ns-platform
    chart: raw
    namespace: kube-system
    manifests:
      - ns/platform.yaml
      - ns/monitoring.yaml

  # 2. 证书管理
  - name: cert-manager
    namespace: cert-manager
    chart: jetstack/cert-manager
    version: v1.13.0
    needs:
      - ns-platform

  # 3. Ingress Controller
  - name: ingress-nginx
    namespace: ingress-nginx
    chart: ingress-nginx/ingress-nginx
    version: 4.8.0
    needs:
      - ns-platform
    values:
      - controller:
          replicaCount: 3
          resources:
            requests: {cpu: 500m, memory: 512Mi}

  # 4. 监控栈
  - name: kube-prometheus
    namespace: monitoring
    chart: prometheus-community/kube-prometheus-stack
    version: 51.0.0
    needs:
      - ingress-nginx
    values:
      - values/monitoring.yaml

  # 5. 业务应用
  - name: myapp
    namespace: myapp
    chart: oci://registry-1.docker.io/myorg/myapp
    version: 1.2.3
    needs:
      - ingress-nginx
      - cert-manager
    values:
      - values/myapp/values.yaml
      - values/myapp/values-prod.yaml
    secrets:
      - values/myapp/secrets-prod.enc.yaml
```

```bash
# 完整发布流程
helmfile -e prod diff           # 预览
helmfile -e prod apply          # 实际部署
```

## 12.6 GitOps:ArgoCD 集成

### ArgoCD Application

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: myapp-prod
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/myorg/infra
    targetRevision: HEAD
    path: helmfiles/prod
    helm:
      valueFiles:
        - values/myapp/values.yaml
        - values/myapp/values-prod.yaml
  destination:
    server: https://kubernetes.default.svc
    namespace: myapp
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
      - ServerSideApply=true
```

### ApplicationSet(多环境)

```yaml
apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata:
  name: myapp
  namespace: argocd
spec:
  generators:
    - list:
        elements:
          - env: dev
            cluster: dev-cluster
            namespace: myapp-dev
          - env: staging
            cluster: staging-cluster
            namespace: myapp-staging
          - env: prod
            cluster: prod-cluster
            namespace: myapp-prod
  template:
    metadata:
      name: 'myapp-{{env}}'
    spec:
      project: default
      source:
        repoURL: https://github.com/myorg/infra
        targetRevision: HEAD
        path: helmfiles/{{env}}
      destination:
        name: '{{cluster}}'
        namespace: '{{namespace}}'
      syncPolicy:
        automated:
          prune: true
```

### ArgoCD 优势

- 自动 sync,Git push 即部署
- drift detection(实际状态偏离 Git 时报警/修复)
- Web UI 看 diff
- 多集群管理
- RBAC 集成

## 12.7 GitOps:Flux HelmRelease

```yaml
# HelmRepository
apiVersion: source.toolkit.fluxcd.io/v1beta2
kind: HelmRepository
metadata:
  name: bitnami
  namespace: flux-system
spec:
  url: https://charts.bitnami.com/bitnami
  interval: 5m
---
# HelmRelease
apiVersion: helm.toolkit.fluxcd.io/v2beta1
kind: HelmRelease
metadata:
  name: myapp
  namespace: myapp
spec:
  interval: 5m
  chart:
    spec:
      chart: myapp
      version: "1.x"
      sourceRef:
        kind: HelmRepository
        name: myorg
        namespace: flux-system
  values:
    replicaCount: 3
    image:
      tag: 1.2.3
  valuesFrom:
    - kind: Secret
      name: myapp-values
      valuesKey: values.yaml
```

```bash
# Flux 强制同步
flux reconcile helmrelease myapp
```

### Flux vs ArgoCD

| 维度 | Flux | ArgoCD |
|------|------|--------|
| 架构 | K8s controller,声明式 | K8s controller,声明式 |
| UI | ❌ 需 Weave GitOps Enterprise | ✅ 内置 Web UI |
| Helm 原生 | ✅ 一等公民 | ✅ 支持 |
| 学习曲线 | 较陡 | 较缓 |
| 多集群 | 通过 Kustomization 编排 | ApplicationSet |
| 社区 | CNCF Graduated | CNCF Graduated |

## 12.8 CI/CD 流水线集成

### GitHub Actions

```yaml
# .github/workflows/deploy.yml
name: Deploy
on:
  push:
    branches: [main]
    paths: ['helmfiles/**', 'charts/**']

jobs:
  diff:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Helm
        uses: azure/setup-helm@v3
        with:
          version: v3.14.0
      
      - name: Setup Helmfile
        run: |
          curl -L https://github.com/roboll/helmfile/releases/download/v0.155.0/helmfile_linux_amd64 -o /usr/local/bin/helmfile
          chmod +x /usr/local/bin/helmfile
      
      - name: Diff
        env:
          KUBECONFIG: ${{ secrets.KUBECONFIG }}
        run: |
          helmfile -e prod diff
```

```yaml
# 手动批准后 apply
  deploy:
    needs: diff
    runs-on: ubuntu-latest
    environment: production   # 需手动 approve
    steps:
      - uses: actions/checkout@v4
      - name: Apply
        env:
          KUBECONFIG: ${{ secrets.KUBECONFIG }}
        run: |
          helmfile -e prod apply
```

### GitLab CI

```yaml
# .gitlab-ci.yml
deploy:prod:
  stage: deploy
  image: alpine:3.18
  before_script:
    - apk add --no-cache curl bash
    - curl -L https://get.helm.sh/helm-v3.14.0-linux-amd64.tar.gz | tar xz
    - mv linux-amd64/helm /usr/local/bin/
    - curl -L https://github.com/roboll/helmfile/releases/latest/download/helmfile_linux_amd64 -o /usr/local/bin/helmfile
    - chmod +x /usr/local/bin/helmfile
  script:
    - helmfile -e prod diff
    - helmfile -e prod apply
  environment:
    name: production
  only:
    - main
```

## 12.9 生产规范总结

```text
1. 所有 values 文件版本控制(Git)
2. 至少两人 review 合并
3. CI 中必跑 helm diff + helm lint + helm unittest
4. 敏感信息用 SOPS 加密
5. 生产部署手动批准(environment gate)
6. 镜像 tag 固定,不允许 latest
7. Chart.lock 提交,锁定版本
8. 监控 release 状态(helm status / ArgoCD app health)
9. 回滚流程演练(每月一次)
10. 文档化 values 所有字段(helm-docs 自动生成)
```

### 自动生成 values 文档

```bash
helm-docs --chart-search-root=.
# 自动生成 README.md 的 values 表格
```

## 12.10 本章小结

- **Helmfile** = 多 release / 多环境的声明式编排
- **ArgoCD** = GitOps,Git push 触发自动部署
- **Flux** = 同 ArgoCD,Helm 原生体验
- CI 必经:`helmfile diff` + `helm lint` + `helm unittest`
- 敏感信息 SOPS 加密
- 手动 approve 才能进生产
- `helm-docs` 自动维护 values 文档
