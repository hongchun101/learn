# 08. ConfigMap 与 Secret 配置管理

## 8.1 为什么需要配置管理

**12-factor app 第 3 条**:配置和代码分离。

| 不分离 | 分离后 |
|--------|--------|
| 改 DB 密码要重新打镜像 | 改 ConfigMap 即可 |
| 测试/生产配置混在代码 | 同一镜像,不同 ConfigMap |
| 密钥进 git,泄露风险 | Secret + 加密 + 注入 |

## 8.2 ConfigMap 入门

**ConfigMap** 存**非敏感**配置(普通配置、文件名、命令行参数)。

```bash
# 创建
kubectl create configmap app-config --from-literal=key1=value1 --from-literal=key2=value2
kubectl create configmap app-config --from-file=app.properties
kubectl create configmap app-config --from-file=key1=/path/to/file1
kubectl create configmap app-config --from-env-file=.env

# 查看
kubectl get cm app-config -o yaml
```

```yaml
# 直接写 yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
  namespace: default
data:
  log.level: info                       # 字符串
  database.url: postgres://db:5432/myapp
  cache.ttl: "60"                       # 数字(用字符串)
  features.json: |                      # 多行
    {
      "featureA": true,
      "featureB": false
    }
  nginx.conf: |                         # 完整配置文件
    server {
      listen 80;
      location / {
        proxy_pass http://app:8080;
      }
    }
```

## 8.3 ConfigMap 注入 Pod 的 4 种方式

### 1. 环境变量

```yaml
apiVersion: v1
kind: Pod
metadata: { name: app }
spec:
  containers:
  - name: app
    image: myapp:1.0
    env:
    - name: LOG_LEVEL                # 单个值
      valueFrom:
        configMapKeyRef:
          name: app-config
          key: log.level
    - name: DB_URL
      valueFrom:
        configMapKeyRef:
          name: app-config
          key: database.url
    envFrom:                          # 整张 map 全注入
    - configMapRef:
        name: app-config
    # 所有 data 里的 key 都会变成环境变量
    # 但 key 包含 `.`(如 log.level)需要改名为 LOG_LEVEL
```

**缺点**:改 ConfigMap 不会更新已运行的 Pod 环境变量(需要重启)。

### 2. volume 挂载整个 ConfigMap

```yaml
spec:
  containers:
  - name: app
    volumeMounts:
    - name: config
      mountPath: /etc/config            # 每个 key 变文件名
  volumes:
  - name: config
    configMap:
      name: app-config
      items:                            # 可选:只挂部分
      - key: nginx.conf
        path: nginx.conf
      - key: features.json
        path: features.json
      defaultMode: 0644
```

**目录结构**:
```text
/etc/config/
├── log.level              # value 是文件内容
├── database.url
├── features.json
└── nginx.conf
```

### 3. 单文件挂载

```yaml
spec:
  containers:
  - name: nginx
    volumeMounts:
    - name: nginx-config
      mountPath: /etc/nginx/conf.d/default.conf   # 文件路径
      subPath: default.conf                       # ConfigMap 的 key
  volumes:
  - name: nginx-config
    configMap:
      name: nginx-config
      items:
      - key: default.conf
        path: default.conf
```

**用途**:只覆盖某个具体配置文件,保留容器里其他内容。

### 4. projected(可挂多源到同一目录)

```yaml
volumes:
- name: all-config
  projected:
    sources:
    - configMap:
        name: cm1
    - secret:
        name: secret1
    - downwardAPI:
        items:
        - path: pod-name
          fieldRef: { fieldPath: metadata.name }
```

## 8.4 ConfigMap 热更新

**关键特性**:
- `volume` 挂载的 ConfigMap **会自动更新**(K8s 用 inotify 监听)
- **环境变量不会更新**(需要重启 Pod)

**更新机制**:
- K8s 检测到 ConfigMap 变化 → kubelet 周期性 sync(默认 60-90s)
- 实际文件被替换(原子 rename)
- **应用需要 watch 文件**才能感知(inotify、config reload)

### 实战:Nginx 热加载配置

```yaml
# 1. ConfigMap
apiVersion: v1
kind: ConfigMap
metadata: { name: nginx-config }
data:
  default.conf: |
    server {
      listen 80;
      location / {
        proxy_pass http://app:8080;
      }
    }
---
# 2. Deployment(用 subPath 防止 reload 影响其他文件)
spec:
  template:
    spec:
      containers:
      - name: nginx
        image: nginx:1.25
        volumeMounts:
        - name: config
          mountPath: /etc/nginx/conf.d/default.conf
          subPath: default.conf
      volumes:
      - name: config
        configMap:
          name: nginx-config
```

```bash
# 更新
kubectl edit cm nginx-config
# 等待 60s,文件更新;但 nginx 不会自动 reload
# 手动 reload 或加 sidecar
```

**坑**:用 `subPath` 时,K8s 不会自动 reload 应用(应用不知道)。

**解决**:
```yaml
# sidecar 监听配置文件变化,sighup nginx
containers:
- name: reload
  image: alpine
  command: ['sh', '-c', 'while inotifywait -e modify /etc/nginx/conf.d/default.conf; do nginx -s reload; done']
```

## 8.5 Secret 入门

**Secret** 存**敏感**配置(密码、token、证书)。

**类型**:

| 类型 | 用途 |
|------|------|
| `Opaque` | 默认,通用键值对 |
| `kubernetes.io/tls` | TLS 证书 |
| `kubernetes.io/dockerconfigjson` | 镜像仓库凭证 |
| `kubernetes.io/service-account-token` | SA token(自动) |
| `kubernetes.io/basic-auth` | Basic Auth |
| `kubernetes.io/ssh-auth` | SSH 私钥 |
| `bootstrap.kubernetes.io/token` | 节点引导 |

### 创建 Secret

```bash
# 1. 命令行
kubectl create secret generic db-pass --from-literal=password=xxx
kubectl create secret generic app-secret --from-file=.env

# 2. docker registry
kubectl create secret docker-registry regcred \
  --docker-server=https://index.docker.io/v1/ \
  --docker-username=user \
  --docker-password=pass \
  --docker-email=email@example.com

# 3. TLS
kubectl create secret tls app-tls --cert=tls.crt --key=tls.key

# 4. yaml(注意:要先 base64 编码)
echo -n 'mypassword' | base64     # bXlwYXNzd29yZA==
```

```yaml
apiVersion: v1
kind: Secret
metadata: { name: db-pass }
type: Opaque
stringData:                  # 原始值,自动 base64
  password: mypassword
  username: admin
# data:                       # 已 base64
#   password: bXlwYXNzd29yZA==
```

**推荐**:`stringData` 写明文,K8s 自动编码。

## 8.6 Secret 注入 Pod

### 1. 环境变量

```yaml
env:
- name: DB_PASSWORD
  valueFrom:
    secretKeyRef:
      name: db-pass
      key: password
envFrom:
- secretRef:
    name: db-pass
```

### 2. 挂载为文件

```yaml
volumeMounts:
- name: db-secret
  mountPath: /etc/secrets
  readOnly: true
volumes:
- name: db-secret
  secret:
    secretName: db-pass
    defaultMode: 0400
```

文件内容是原始值(base64 解码后)。

### 3. 镜像拉取凭证

```yaml
spec:
  imagePullSecrets:
  - name: regcred
  containers:
  - name: app
    image: registry.example.com/myapp:1.0
```

## 8.7 Secret 的安全(重要!)

**默认行为**:
- etcd 里**明文存储**(etcd 没加密的话)
- 任何能 list secrets 的人都能看
- kubectl describe 看不到 value(只显示 `<set to the N keys>`)

**生产必做**:

```bash
# 1. etcd 静态加密(K8s 1.13+)
# 见 https://kubernetes.io/docs/tasks/administer-cluster/encrypt-data/

# 2. RBAC 严格控制
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata: { namespace: prod, name: secret-reader }
rules:
- apiGroups: [""]
  resources: ["secrets"]
  verbs: ["get"]              # 只能 get,不能 list
  resourceNames: ["allowed-secret"]
```

**不要**:
- 在 UI 暴露 Secret
- 把 Secret 写到普通 ConfigMap
- 用 git 存明文 Secret
- 让应用日志打印 Secret

## 8.8 Secret 替代方案(更安全)

| 方案 | 特点 |
|------|------|
| **External Secrets Operator** | 同步外部 Vault/AWS SSM/GCP Secret Manager |
| **Sealed Secrets** | 加密进 git(bitnami) |
| **SOPS** | Mozilla,Mozilla SOPS 加密 YAML/JSON |
| **HashiCorp Vault** | 动态 Secret,租约管理 |
| **AWS Secrets Manager / SSM** | 云厂商托管 |
| **Azure Key Vault** | Azure 托管 |
| **GCP Secret Manager** | GCP 托管 |

### External Secrets Operator(ESO)示例

```bash
helm install external-secrets external-secrets/external-secrets \
  -n external-secrets --create-namespace
```

```yaml
# SecretStore
apiVersion: external-secrets.io/v1beta1
kind: SecretStore
metadata: { name: vault-backend }
spec:
  provider:
    vault:
      server: "https://vault.example.com"
      path: "secret/data"
      version: "v2"
      auth:
        kubernetes:
          mountPath: "kubernetes"
          role: "myapp"
---
# ExternalSecret
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata: { name: db-pass }
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: vault-backend
  target:
    name: db-pass         # 生成的 K8s Secret 名
  data:
  - secretKey: password
    remoteRef:
      key: secret/data/myapp/db
      property: password
```

ESO 会**定时从 Vault 拉取**,生成 K8s Secret。Pod 用法和普通 Secret 一样。

### Sealed Secrets(加密进 git)

```bash
# 安装 controller + kubeseal CLI
brew install kubeseal
kubectl apply -f https://github.com/bitnami-labs/sealed-secrets/releases/download/v0.27.0/controller.yaml

# 加密
echo -n mypassword | kubectl create secret generic db-pass --dry-run=client --from-file=password=/dev/stdin -o yaml | kubeseal -o yaml > db-pass-sealed.yaml
```

```yaml
# 推到 git
apiVersion: bitnami.com/v1alpha1
kind: SealedSecret
metadata: { name: db-pass }
spec:
  encryptedData:
    password: AgBqxh...   # 加密的,只有 cluster 能解
```

## 8.9 ConfigMap/Secret 实战:完整应用配置

```yaml
# 应用配置(非敏感)
apiVersion: v1
kind: ConfigMap
metadata: { name: app-config }
data:
  app.yaml: |
    server:
      port: 8080
      readTimeout: 30s
    database:
      host: postgres
      port: 5432
      name: myapp
      poolSize: 20
    log:
      level: info
      format: json
  nginx.conf: |
    upstream app {
      server 127.0.0.1:8080;
    }
    server {
      listen 80;
      location / {
        proxy_pass http://app;
      }
    }
---
# 敏感配置
apiVersion: v1
kind: Secret
metadata: { name: app-secrets }
stringData:
  database-password: "p@ssw0rd!"
  api-key: "sk-xxx"
---
# 应用部署
apiVersion: apps/v1
kind: Deployment
metadata: { name: app }
spec:
  replicas: 3
  selector:
    matchLabels: { app: myapp }
  template:
    metadata:
      labels: { app: myapp }
    spec:
      containers:
      - name: app
        image: myapp:1.0
        env:
        - name: DB_PASSWORD
          valueFrom:
            secretKeyRef:
              name: app-secrets
              key: database-password
        - name: API_KEY
          valueFrom:
            secretKeyRef:
              name: app-secrets
              key: api-key
        - name: CONFIG_PATH
          value: /etc/config
        volumeMounts:
        - name: config
          mountPath: /etc/config
        - name: nginx-config
          mountPath: /etc/nginx/conf.d/default.conf
          subPath: default.conf
        - name: cache
          mountPath: /var/cache/myapp
        resources:
          requests: { cpu: 200m, memory: 256Mi }
          limits:   { cpu: 1, memory: 512Mi }
        livenessProbe:
          httpGet: { path: /healthz, port: 8080 }
        readinessProbe:
          httpGet: { path: /ready, port: 8080 }
        startupProbe:
          httpGet: { path: /healthz, port: 8080 }
          failureThreshold: 30
          periodSeconds: 10
        securityContext:
          runAsNonRoot: true
          readOnlyRootFilesystem: true
      volumes:
      - name: config
        configMap:
          name: app-config
          items:
          - key: app.yaml
            path: app.yaml
      - name: nginx-config
        configMap:
          name: app-config
          items:
          - key: nginx.conf
            path: default.conf
      - name: cache
        emptyDir: {}
```

## 8.10 不可变 ConfigMap/Secret(K8s 1.21+)

```yaml
apiVersion: v1
kind: ConfigMap
metadata: { name: app-config }
immutable: true         # 不可变
data: { ... }
```

**优点**:
- 防止误改
- 减少 apiserver 负载(K8s 不再 watch 变化)
- 滚动升级时减少 cache 失效

**建议**:稳定配置(immutable),经常变的不要 immutable。

## 8.11 ConfigMap 限制

| 限制 | 数值 |
|------|------|
| 单个 ConfigMap 大小 | 1 MiB(etcd 1MB 限制) |
| 总 ConfigMap 数量 | 集群规模相关,大集群有 GC 压力 |
| key 数量 | 软限制,但 K8s 1.27+ 推荐 ≤50 |

**大配置方案**:
- 拆成多个 ConfigMap(按功能)
- 用文件存储(S3/OSS) + init container 拉取
- 用 CSI 卷挂载

## 8.12 Downward API(暴露 Pod 元数据)

让容器看到自己的 Pod 信息:

```yaml
env:
- name: POD_NAME
  valueFrom:
    fieldRef: { fieldPath: metadata.name }
- name: POD_NAMESPACE
  valueFrom:
    fieldRef: { fieldPath: metadata.namespace }
- name: POD_IP
  valueFrom:
    fieldRef: { fieldPath: status.podIP }
- name: NODE_NAME
  valueFrom:
    fieldRef: { fieldPath: spec.nodeName }
- name: MEM_LIMIT
  resourceFieldRef:
    containerName: app
    resource: limits.memory
```

**用途**:
- 写日志带 Pod 名(便于排查)
- 应用注册到服务发现时携带 Pod 名
- 动态配置(limit 自动同步)

## 8.13 故障排查

### ConfigMap 改了不生效

```bash
# 1. 确认改成功
kubectl get cm app-config -o yaml

# 2. Pod 里看文件
kubectl exec <pod> -- ls /etc/config
kubectl exec <pod> -- cat /etc/config/app.yaml

# 3. 文件更新了但应用不读 → 重启 Pod
kubectl rollout restart deploy/app

# 4. env 没更新(已知问题)
# envFrom 不会更新,只能重启
```

### Secret 挂载错

```bash
# 1. 查 secret 是否存在
kubectl get secret db-pass

# 2. 查 Pod 事件
kubectl describe pod <pod> | grep -A5 Events

# 3. 看挂载的目录
kubectl exec <pod> -- ls -la /etc/secrets
```

### SubPath 引起的 config 不更新

```yaml
# 用 subPath 后,文件整个被替换
# 但应用可能要 reload(nginx -s reload)
# 解决方案:sidecar 监听 + reload
```

## 8.14 专家级技巧

### 1. 用 `hash` annotation 触发滚动升级

```yaml
spec:
  template:
    metadata:
      annotations:
        # ConfigMap 变化时 hash 变 → annotation 变 → Pod 替换
        config-checksum: "b0e34f0c"
```

```bash
# 用 kustomize 或外部工具自动算
checksum=$(kubectl get cm app-config -o json | sha256sum | cut -c1-8)
# 替换到 yaml 里
```

### 2. ConfigMap Reloader

```bash
helm install reloader stakater/reloader
```

```yaml
metadata:
  annotations:
    reloader.stakater.com/auto: "true"
    # ConfigMap/Secret 变化自动 rollout restart
```

### 3. 12-factor 配置来源

```yaml
# 推荐:ConfigMap(非敏感)+ External Secret(敏感)
# 不要在镜像里 hardcode
# 不要在 yaml 里 hardcode
```

## 8.15 本章小结

- ConfigMap:非敏感配置;Secret:敏感配置
- 注入方式:`env`/`envFrom`/`volume mount`/image pull secret
- 热更新:`volume mount` 自动,`env` 不自动(需重启)
- Secret 默认存 etcd 明文,**生产必加密 + RBAC**
- 高级方案:External Secrets / Sealed Secrets / Vault / SOPS
- `immutable: true` 提高稳定性和性能
- ConfigMap 限 1 MiB,大配置走文件存储
- 配合 `checksum` annotation 触发升级
- 配合 Reloader 自动 restart
