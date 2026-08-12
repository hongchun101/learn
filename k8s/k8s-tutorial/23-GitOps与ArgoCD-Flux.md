# 23. GitOps 与 ArgoCD / Flux

## 23.1 什么是 GitOps

**核心思想**:**用 Git 作为应用部署的唯一真实源**。

```text
传统:
   代码 → CI → CD 系统 → kubectl apply → 集群

GitOps:
   代码 → CI → 更新 Git → (Operator 同步) → 集群
                                    ↓
                              集群状态和 Git 一致
```

**三大原则**:
1. **声明式**:应用部署用声明式文件(yaml)
2. **版本化**:全部进 Git(应用代码 + 配置 + 策略)
3. **自动拉取**:Operator 自动同步 Git → 集群

## 23.2 GitOps vs 传统 CD

| 维度 | 传统 CD | GitOps |
|------|---------|--------|
| 部署源 | CI 系统 / 配置文件 | **Git** |
| 谁改集群 | CI / kubectl | **Operator** |
| 回滚 | CI 触发 | **改 Git 回滚** |
| 审计 | 工具不统一 | **Git log = 审计** |
| 漂移 | 可能 | **自动修正** |

## 23.3 GitOps 工具

| 工具 | 特点 |
|------|------|
| **ArgoCD** | 主流,UI 强,多集群 |
| **Flux** | 轻量,GitOps Toolkit,GitOps Working Group 主导 |
| **Jenkins X** | 集成 CI |
| **Atlantis** | Terraform GitOps |

**生产首选 ArgoCD**(UI 友好)或 **Flux**(更云原生)。

## 23.4 ArgoCD 架构

```mermaid
graph TB
    A[Git Repository] -->|watch| B[ArgoCD Controller]
    C[Helm/Kustomize] -->|render| B
    B --> D[Sync to K8s]
    E[ArgoCD UI/CLI] -->|manual sync| B
    F[Application CRD] --> B
    G[App of Apps] --> F
```

**核心组件**:
- **Application Controller**:持续同步
- **Repo Server**:渲染 manifest(Helm/Kustomize)
- **ApplicationSet**:多环境/多集群
- **Notifications**:告警
- **UI/CLI**:操作

## 23.5 安装 ArgoCD

```bash
# 命名空间
kubectl create namespace argocd

# 安装
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# 看状态
kubectl get pods -n argocd
```

**访问 UI**:

```bash
# 端口转发
kubectl port-forward svc/argocd-server 8080:443 -n argocd
# 浏览器 https://localhost:8080
```

**初始密码**:
```bash
# 默认 admin 用户
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 -d
# 或者改密码
argocd account update-password
```

## 23.6 第一个 Application

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: web
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/myorg/myapp-manifests
    targetRevision: HEAD           # 分支 / tag
    path: overlays/prod
    helm:
      releaseName: web
      valueFiles:
      - values-prod.yaml
      parameters:
      - { name: image.tag, value: "1.0.0" }
  destination:
    server: https://kubernetes.default.svc
    namespace: prod
  syncPolicy:
    automated:                      # 自动同步
      prune: true                   # 删 Git 删的
      selfHeal: true                # 漂移自动修复
      allowEmpty: false
    syncOptions:
    - CreateNamespace=true
    retry:
      limit: 5
      backoff:
        duration: 5s
        factor: 2
        maxDuration: 3m
```

```bash
argocd app create web -f app.yaml
argocd app list
argocd app get web
argocd app sync web
argocd app history web
argocd app rollback web
```

## 23.7 ApplicationSet(多环境/多集群)

**一个 CRD 模板**生成多个 Application。

```yaml
apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata:
  name: web
  namespace: argocd
spec:
  generators:
  - list:
      elements:
      - cluster: prod-us
        url: https://prod-us.example.com
        version: "1.0.0"
      - cluster: prod-eu
        url: https://prod-eu.example.com
        version: "1.0.0"
      - cluster: staging
        url: https://staging.example.com
        version: "1.1.0"
  template:
    metadata:
      name: 'web-{{cluster}}'
    spec:
      project: default
      source:
        repoURL: https://github.com/myorg/myapp-manifests
        targetRevision: HEAD
        path: overlays/prod
        helm:
          parameters:
          - { name: image.tag, value: '{{version}}' }
      destination:
        server: '{{url}}'
        namespace: web
      syncPolicy:
        automated: { prune: true, selfHeal: true }
```

**其他生成器**:
- `git`:扫 Git 目录
- `cluster`:扫集群注册
- `matrix`:cross product

## 23.8 App of Apps Pattern

**场景**:管理整个集群的所有应用。

```text
my-cluster/
├── apps/
│   ├── argo-cd.yaml              # Application: argo-cd 自身
│   ├── prometheus.yaml           # Application: 监控
│   ├── cert-manager.yaml
│   ├── web.yaml
│   └── api.yaml
```

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: apps
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/myorg/k8s-manifests
    targetRevision: HEAD
    path: apps
  destination:
    server: https://kubernetes.default.svc
    namespace: argocd
  syncPolicy:
    automated: { prune: true, selfHeal: true }
```

**效果**:`apps` Application 拉 `apps/` 目录,每个 yaml 又是一个 Application。**一个入口管所有**。

## 23.9 Kustomize 集成

ArgoCD 原生支持 Kustomize:

```yaml
source:
  repoURL: https://github.com/myorg/myapp-manifests
  targetRevision: HEAD
  path: overlays/prod    # Kustomize 目录
```

```text
manifests/
├── base/
│   ├── deployment.yaml
│   ├── service.yaml
│   └── kustomization.yaml
└── overlays/
    ├── prod/
    │   ├── kustomization.yaml
    │   ├── patch-replicas.yaml
    │   └── ingress.yaml
    └── staging/
        └── kustomization.yaml
```

```yaml
# overlays/prod/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: web
resources:
- ../../base
patchesStrategicMerge:
- patch-replicas.yaml
images:
- name: web
  newTag: "1.0.0"
replicas:
- name: web
  count: 5
```

**优势**:
- 一个 base,多个 overlay(env)
- 不用复制粘贴
- K8s 原生(argoCD/Helm/Flux 都支持)

## 23.10 Helm 集成

ArgoCD 直接渲染 Helm chart:

```yaml
source:
  repoURL: https://charts.bitnami.com/bitnami
  chart: nginx
  targetRevision: 13.2.0
  helm:
    releaseName: nginx
    valueFiles:
    - $VALUES/values-prod.yaml
    parameters:
    - { name: service.type, value: LoadBalancer }
```

**支持类型**:
- Helm chart(远程 repo)
- Helm chart(本地 path)
- Kustomize
- Ksonnet
- Jsonnet
- Plain yaml
- 目录

## 23.11 Secret 管理(GitOps 中)

**问题**:GitOps 要把 Secret 进 Git,但 Secret 不能明文。

**解决**:
1. **Sealed Secrets**(Bitnami)
2. **SOPS**(Mozilla,加密 YAML)
3. **External Secrets Operator**
4. **Helm Secrets**

### 1. Sealed Secrets

```bash
helm install sealed-secrets sealed-secrets/sealed-secrets -n kube-system
brew install kubeseal
```

```bash
# 加密
echo -n "mypassword" | kubectl create secret generic db-pass \
  --dry-run=client --from-file=password=/dev/stdin -o yaml | \
  kubeseal --controller-name=sealed-secrets --controller-namespace=kube-system \
  > sealed-secret.yaml
```

```yaml
# 推到 Git
apiVersion: bitnami.com/v1alpha1
kind: SealedSecret
metadata: { name: db-pass, namespace: prod }
spec:
  encryptedData:
    password: AgBqxh...
```

### 2. SOPS

```bash
brew install sops
# 配置加密 key(AWS KMS / GCP KMS / age / PGP)
```

```bash
# 加密
sops --encrypt --kms 'arn:aws:kms:...' secret.yaml > secret.enc.yaml
# 提交 .enc.yaml 到 Git
# 应用时解密
sops --decrypt secret.enc.yaml | kubectl apply -f -
```

**ArgoCD + SOPS 集成**:

```yaml
# 1. 安装 sops plugin
# 2. 配置 Plugin.yaml
apiVersion: v1
kind: Secret
metadata: { name: sops-gpg, namespace: argocd }
type: Opaque
stringData:
  # GPG private key
  sops.asc: |
    -----BEGIN PGP PRIVATE KEY BLOCK-----
    ...
```

## 23.12 Notifications(告警)

```yaml
# 1. 通知服务(模板)
apiVersion: v1
kind: ConfigMap
metadata:
  name: argocd-notifications-cm
  namespace: argocd
data:
  service.slack: |
    token: $slack-token
  template.app-deployed: |
    message: |
      {{.app.metadata.name}} deployed
    slack:
      attachments: |
        [{
          "title": "{{.app.metadata.name}}",
          "title_link": "{{.context.argocdUrl}}/applications/{{.app.metadata.name}}",
          "color": "#18be52",
          "fields": [
            { "title": "Sync Status", "value": "{{.app.status.sync.status}}" },
            { "title": "Repository", "value": "{{.app.spec.source.repoURL}}" }
          ]
        }]
  trigger.on-deployed: |
    - when: app.status.operationState.phase in ['Succeeded'] and any(app.status.conditions, {.type == 'Synced' && .status == 'True'})
      send: [app-deployed]
---
# 2. 订阅
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: web
  annotations:
    notifications.argoproj.io/subscribe.on-deployed.slack: my-channel
spec:
  ...
```

## 23.13 SSO 集成(OIDC)

```yaml
# argocd-cm
data:
  url: https://argocd.example.com
  dex.config: |
    connectors:
    - type: oidc
      id: oidc
      name: OIDC
      config:
        issuer: https://keycloak.example.com/realms/k8s
        clientID: argocd
        clientSecret: $oidc.clientSecret
  oidc.config: |
    name: OIDC
    issuer: https://keycloak.example.com/realms/k8s
    clientID: argocd
    clientSecret: $oidc.clientSecret
    requestedScopes: ["openid", "profile", "email", "groups"]
```

**RBAC**:

```yaml
# argocd-rbac-cm
data:
  policy.csv: |
    p, role:developers, applications, get, */*, allow
    p, role:developers, applications, sync, */*, allow
    g, my-team, role:developers
```

## 23.14 多集群管理

```bash
# 加集群
argocd cluster add prod-us-context
argocd cluster list
```

**ApplicationSet 跨集群**:
```yaml
destination:
  server: '{{cluster-server}}'   # cluster generator
  namespace: web
```

## 23.15 Flux(轻量 GitOps)

```bash
# 安装
brew install fluxcd/tap/flux

flux bootstrap github \
  --owner=myorg \
  --repository=fleet-infra \
  --branch=main \
  --path=clusters/prod
```

```yaml
# GitRepository(类似 ArgoCD Application source)
apiVersion: source.toolkit.fluxcd.io/v1
kind: GitRepository
metadata: { name: web, namespace: flux-system }
spec:
  interval: 1m
  url: https://github.com/myorg/myapp
  ref:
    branch: main
  secretRef:
    name: github-creds
---
# Kustomization(类似 destination + sync)
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata: { name: web, namespace: flux-system }
spec:
  interval: 10m
  sourceRef:
    name: web
  path: ./overlays/prod
  prune: true
  wait: true
  timeout: 5m
```

**Flux 组件**:
- **Source Controller**:Git/Helm/OCI 源
- **Kustomize Controller**:应用 Kustomize
- **Helm Controller**:Helm chart
- **Notification Controller**:告警
- **Image Automation Controller**:镜像自动更新

### Flux 自动更新镜像

```yaml
apiVersion: image.toolkit.fluxcd.io/v1beta2
kind: ImageRepository
metadata: { name: web, namespace: flux-system }
spec:
  image: myreg/web
  interval: 5m
---
apiVersion: image.toolkit.fluxcd.io/v1beta2
kind: ImagePolicy
metadata: { name: web, namespace: flux-system }
spec:
  imageRepositoryRef:
    name: web
  policy:
    semver:
      range: ">=1.0.0 <2.0.0"
---
apiVersion: image.toolkit.fluxcd.io/v1beta1
kind: ImageUpdateAutomation
metadata: { name: web, namespace: flux-system }
spec:
  interval: 1m
  sourceRef: { kind: GitRepository, name: web }
  git:
    checkout:
      ref: main
    commit:
      author: { email: flux@example.com, name: flux }
    push:
      branch: main
  update:
    path: ./overlays/prod
    strategy: Setters
```

**效果**:`myreg/web:1.2.0` push → Flux 自动更新 Git → 同步到集群。

## 23.16 ArgoCD vs Flux

| 维度 | ArgoCD | Flux |
|------|--------|------|
| UI | ✅ 强 | ❌ 无(CLI only) |
| 多集群 | ✅ ApplicationSet | ✅ 多个 Flux instance |
| 镜像自动更新 | ❌ 需要 argocd-image-updater | ✅ 内置 |
| Helm 集成 | ✅ | ✅ |
| Kustomize 集成 | ✅ | ✅ |
| GitOps Working Group | 不 | ✅ 主导 |
| 学习曲线 | 较易 | 较陡 |
| 适合 | 入门、UI 友好 | 自动化、CI 集成 |

## 23.17 实战:完整的 GitOps 仓库结构

```text
myorg/
├── apps/                          # 各个应用(ApplicationSet 模板)
│   ├── web/
│   │   ├── base/
│   │   │   ├── deployment.yaml
│   │   │   ├── service.yaml
│   │   │   └── kustomization.yaml
│   │   └── overlays/
│   │       ├── prod/
│   │       │   ├── kustomization.yaml
│   │       │   └── ingress.yaml
│   │       └── staging/
│   │           └── kustomization.yaml
│   ├── api/
│   └── database/
├── infra/                         # 基础设施
│   ├── prometheus/
│   ├── cert-manager/
│   └── ingress-nginx/
└── clusters/                      # 集群
    ├── prod/
    │   ├── appset.yaml            # 全部应用
    │   └── infra.yaml
    └── staging/
        ├── appset.yaml
        └── infra.yaml
```

## 23.18 GitOps 安全

| 措施 | 说明 |
|------|------|
| **Branch Protection** | main 分支必须 PR review |
| **签名提交** | GPG / SSH 签名 |
| **钩子验证** | pre-commit 钩子校验 |
| **Secret 加密** | Sealed Secrets / SOPS |
| **Git 凭证** | Deploy key,不用密码 |
| **Image 签名** | cosign 验证 |
| **Policy as Code** | OPA / Kyverno 验证 yaml |
| **ArgoCD RBAC** | 按项目分权限 |

## 23.19 GitOps 排错

```bash
# ArgoCD 状态
argocd app list
argocd app get web
argocd app history web
argocd app manifests web
argocd app diff web

# 看同步状态
kubectl get application -n argocd
kubectl describe application web -n argocd

# 看 controller 日志
kubectl logs -n argocd deploy/argocd-application-controller

# 强制重同步
argocd app sync web --force
argocd app sync web --replace
```

## 23.20 专家清单

- [ ] 仓库组织(apps/infra/clusters)
- [ ] ArgoCD / Flux 二选一部署
- [ ] 自动同步(prune + selfHeal)
- [ ] 多环境(overlays/ApplicationSet)
- [ ] Secret 用 Sealed Secrets / SOPS
- [ ] 镜像签名(cosign)
- [ ] Kyverno / OPA 验证
- [ ] 通知(Notifications)
- [ ] SSO + RBAC
- [ ] 多集群管理
- [ ] 镜像自动更新(Flux)
- [ ] Branch 保护
- [ ] 监控 ArgoCD / Flux 自身

## 23.21 本章小结

- GitOps = Git 作为唯一真实源
- ArgoCD 主流,Flux 轻量
- ArgoCD 三大概念:Application/ApplicationSet/App of Apps
- Kustomize + Helm 都原生支持
- 多环境:overlays 目录
- Secret:Sealed Secrets / SOPS 加密
- 通知:Slack/PagerDuty 集成
- 镜像自动更新:Flux 内置,ArgoCD 需插件
- RBAC + SSO 集成
- 完整仓库结构:apps/infra/clusters
- 安全:branch 保护 / 签名 / 加密 / 验证
