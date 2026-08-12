# 21. 安全加固与 CIS Benchmark

## 21.1 K8s 安全模型

```text
4C 安全模型(Cloud Native Computing Foundation):

1. Cloud       → 基础设施安全(网络/IAM/存储)
2. Cluster     → 集群组件安全(kubelet/etcd/apiserver)
3. Container   → 容器镜像/运行时安全
4. Code        → 应用代码安全
```

**核心目标**:
- **零信任**:任何主体都要鉴权
- **最小权限**:不超范围
- **可审计**:所有操作有记录
- **纵深防御**:多层

## 21.2 威胁建模

```text
攻击面:
- API Server(公网暴露?)
- Kubelet(10250 端口暴露?)
- etcd(6381 端口暴露?)
- 容器逃逸(特权模式?)
- 镜像漏洞(CVE?)
- 网络策略缺失
- 凭证泄露
- 供应链攻击
```

**MITRE ATT&CK for Containers**:K8s 攻击矩阵。

## 21.3 镜像安全

### 1. 基础镜像

```dockerfile
# ❌ 用通用镜像
FROM ubuntu:latest
# 用 root,大,多 CVE

# ✅ 用 distroless / alpine
FROM gcr.io/distroless/java17-debian12:nonroot
# 极小,无 shell,无包管理器,非 root
```

**distroless 系列**:
```text
gcr.io/distroless/java17-debian12
gcr.io/distroless/python3-debian12
gcr.io/distroless/nodejs18-debian12
gcr.io/distroless/base-debian12
gcr.io/distroless/cc-debian12      # C/C++
gcr.io/distroless/static-debian12   # 静态二进制
```

**其他**:
- `alpine`(小巧,适合脚本)
- `bitnami/minideb`
- `chainguard/static`(零 CVE)
- `cgr.dev/chainguard/python`

### 2. 镜像扫描

```bash
# Trivy
trivy image myapp:1.0
trivy image --severity CRITICAL myapp:1.0
trivy image --exit-code 1 --severity CRITICAL myapp:1.0    # CI 集成

# Grype
grype myapp:1.0

# Snyk
snyk container test myapp:1.0
```

### 3. CI 集成

```yaml
# .github/workflows/cve.yml
- name: Trivy scan
  uses: aquasecurity/trivy-action@master
  with:
    image-ref: myapp:${{ github.sha }}
    severity: 'CRITICAL,HIGH'
    exit-code: '1'
```

### 4. 运行时扫描(Trivy Operator / Falco)

```bash
helm install trivy-operator aqua/trivy-operator \
  --namespace trivy-system --create-namespace
```

## 21.4 Pod Security Standards(K8s 1.23+)

**替代弃用的 PodSecurityPolicy(PSP)**。

三个级别:

| 级别 | 行为 |
|------|------|
| **Privileged** | 无限制(系统 Pod 用) |
| **Baseline** | 防止已知提权 |
| **Restricted** | 强加固(生产首选) |

```bash
# 启用(在 namespace label 上)
kubectl label namespace prod pod-security.kubernetes.io/enforce=restricted
kubectl label namespace prod pod-security.kubernetes.io/enforce-version=latest
kubectl label namespace prod pod-security.kubernetes.io/audit=restricted
kubectl label namespace prod pod-security.kubernetes.io/warn=restricted
```

**Restricted 要求**:
- `runAsNonRoot: true`
- `readOnlyRootFilesystem: true`
- `allowPrivilegeEscalation: false`
- `runAsUser != 0`
- `capabilities.drop: [ALL]`
- `seccompProfile.type: RuntimeDefault`

**完整 Pod 模板**:

```yaml
spec:
  securityContext:
    runAsNonRoot: true
    runAsUser: 1000
    runAsGroup: 1000
    fsGroup: 1000
    seccompProfile:
      type: RuntimeDefault
  containers:
  - name: app
    image: myapp:1.0
    securityContext:
      allowPrivilegeEscalation: false
      privileged: false
      readOnlyRootFilesystem: true
      capabilities:
        drop: ["ALL"]
    volumeMounts:
    - name: tmp
      mountPath: /tmp
    - name: cache
      mountPath: /var/cache/myapp
  volumes:
  - name: tmp
    emptyDir: {}
  - name: cache
    emptyDir: {}
```

## 21.5 RBAC 最小权限(回顾 14 章)

**原则**:
- **不**用 `cluster-admin` 给开发者
- **限定 namespace**(RoleBinding)
- **限定资源**(resourceNames)
- **限定动词**(verbs)
- **不用 default SA**

## 21.6 NetworkPolicy(回顾 15 章)

- default-deny
- 显式 allow
- 用 Calico/Cilium

## 21.7 镜像仓库安全

```bash
# 1. 私有仓库
# 2. imagePullSecrets
# 3. 镜像签名(cosign)
# 4. 不变 tag(用 digest)

# cosign 签名
cosign sign --key cosign.key myreg.example.com/myapp:1.0
cosign verify --key cosign.pub myreg.example.com/myapp:1.0
```

**K8s 集成 cosign**(Sigstore Policy Controller):

```bash
# Kyverno 验证签名
helm install kyverno kyverno/kyverno -n kyverno --create-namespace
```

```yaml
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata: { name: verify-image }
spec:
  validationFailureAction: Enforce
  rules:
  - name: verify-signature
    match:
      resources:
        kinds: ["Pod"]
    verifyImages:
    - imageReferences: ["myreg.example.com/*"]
      attestors:
      - entries:
        - keys:
            publicKeys: |-
              -----BEGIN PUBLIC KEY-----
              ...
```

## 21.8 Secret 安全

**关键原则**:
- etcd 加密(KMS)
- RBAC 严格(get 而非 list)
- 用 Sealed Secrets / External Secrets
- 永不在环境变量打印
- 永不进 git

### etcd 加密

```yaml
# encryption-config.yaml
apiVersion: apiserver.config.k8s.io/v1
kind: EncryptionConfiguration
resources:
  - resources:
    - secrets
    providers:
    - aescbc:
        keys:
        - name: key1
          secret: <base64-32-byte>
    - identity: {}
```

```bash
# 启动 apiserver
--encryption-provider-config=/etc/kubernetes/encryption-config.yaml
```

## 21.9 API Server 加固

```bash
# 启动参数
--anonymous-auth=false                          # 禁匿名
--authorization-mode=Node,RBAC                  # 必须 RBAC
--enable-admission-plugins=NodeRestriction,PodSecurity,...  
--tls-cert-file=/etc/kubernetes/pki/apiserver.crt
--tls-private-key-file=/etc/kubernetes/pki/apiserver.key
--tls-min-version=VersionTLS12
--tls-cipher-suites=TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256,...
--audit-log-maxage=30
--audit-log-maxbackup=10
--audit-log-maxsize=100
--audit-log-path=/var/log/kubernetes/audit/audit.log
--audit-policy-file=/etc/kubernetes/audit-policy.yaml
--request-timeout=60s
--service-account-issuer=https://kubernetes.default.svc
--service-account-signing-key-file=/etc/kubernetes/pki/sa.key
--service-account-key-file=/etc/kubernetes/pki/sa.pub
--api-audiences=api
```

## 21.10 Kubelet 加固

```yaml
# /var/lib/kubelet/config.yaml
apiVersion: kubelet.config.k8s.io/v1beta1
kind: KubeletConfiguration
authentication:
  anonymous:
    enabled: false                                # 禁匿名
  webhook:
    enabled: true
  x509:
    clientCAFile: /etc/kubernetes/pki/ca.crt
authorization:
  mode: Webhook
readOnlyPort: 0                                  # 禁 10255 只读
port: 10250                                      # 10250 启用 + 鉴权
protectKernelDefaults: true
makeIPTablesUtilChains: true
seccompDefault: RuntimeDefault
```

## 21.11 etcd 加固

```bash
# 1. 独立节点(不跑工作负载)
# 2. TLS
--cert-file=/etc/etcd/server.crt
--key-file=/etc/etcd/server.key
--trusted-ca-file=/etc/etcd/ca.crt
--client-cert-auth=true

# 3. 不要暴露 2379/2380 到公网
# 4. 加密(用 KMS)
```

## 21.12 容器运行时加固

```yaml
# containerd 配置
# /etc/containerd/config.toml
[plugins."io.containerd.grpc.v1.cri"]
  enable_unprivileged_ports = false
  enable_unprivileged_icmp = false

[plugins."io.containerd.grpc.v1.cri".containerd]
  disable_apparmor = false
  disable_hugetlb_cgroup = false
  disable_cgroup = false
  restrict_oom_score_adj = true

[plugins."io.containerd.grpc.v1.cri".containerd.runtimes.runc]
  runtime_type = "io.containerd.runc.v2"
  [plugins."io.containerd.grpc.v1.cri".containerd.runtimes.runc.options]
    SystemdCgroup = true
    # 沙箱运行时(更安全)
    # runtime = "io.containerd.runsc.v1"   # gVisor
```

**沙箱运行时**:
- **gVisor**:拦截 syscall,内核安全
- **Kata Containers**:VM-based,完全隔离
- **Firecracker**:微 VM

## 21.13 CIS Benchmark 实施

**CIS Kubernetes Benchmark** = K8s 安全标准。

```bash
# kube-bench(CIS 检查)
docker run --pid host --net host -v /etc:/etc:ro \
  aquasec/kube-bench:latest run --targets=master,node,etcd
```

**常见项**:
- 1.1.x:API Server 启动参数
- 1.2.x:API Server 配置
- 2.x:etcd 配置
- 3.x:控制面配置
- 4.x:Worker 节点配置
- 5.x:K8s Policies

## 21.14 运行时安全(Falco)

**Falco** = 容器运行时异常检测。

```bash
helm install falco falcosecurity/falco \
  --namespace falco --create-namespace \
  --set falcoctl.artifact.install=true
```

**检测规则示例**:
```yaml
- rule: Unexpected K8s NodePort Service
  desc: Detect unexpected NodePort services
  condition: >
    kevt and
    k8s_audit and
    ka.req.service.type=NodePort
  output: NodePort service created
  priority: WARNING
```

**告警渠道**:Falco → Falcosidekick → Slack/钉钉/PagerDuty/SIEM

## 21.15 Service Mesh 安全(Istio mTLS)

```yaml
# 整个 mesh 强制 mTLS
apiVersion: security.istio.io/v1beta1
kind: PeerAuthentication
metadata: { name: default, namespace: istio-system }
spec:
  mtls: { mode: STRICT }
```

**特性**:
- 自动证书轮换
- 跨服务 mTLS 加密
- SA 级别授权
- 无需改应用代码

## 21.16 凭证与密钥管理

| 方案 | 特点 |
|------|------|
| **External Secrets Operator** | 同步外部(推荐) |
| **Sealed Secrets** | 加密进 git(简单) |
| **HashiCorp Vault** | 动态凭证,功能强 |
| **AWS Secrets Manager** | 云厂商托管 |
| **Azure Key Vault** | Azure 托管 |
| **GCP Secret Manager** | GCP 托管 |
| **SOPS** | YAML/JSON 加密(灵活) |

详见 8 章。

## 21.17 审计与合规

### 1. K8s Audit

```yaml
# audit-policy.yaml
apiVersion: audit.k8s.io/v1
kind: Policy
rules:
# 1. 完全不记录(噪音)
- level: None
  resources:
  - group: ""
    resources: ["events"]

# 2. metadata 级(关键操作)
- level: Metadata
  resources:
  - group: ""
    resources: ["secrets", "configmaps", "serviceaccounts"]

# 3. 详细记录(delete)
- level: RequestResponse
  verbs: ["delete", "create", "patch", "update"]

# 4. 登录
- level: RequestResponse
  userGroups: ["system:masters"]
```

### 2. 日志聚合到 SIEM

```bash
# Falco → Falcosidekick → Elasticsearch / Splunk / Datadog
```

### 3. 入侵检测

- **Falco**(运行时)
- **Tracee**(eBPF)
- **Tetragon**(Cilium 出品,更强)

## 21.18 真实安全事件案例

### 案例 1:Tesla K8s 挖矿(2018)

```text
# 攻击: 凭证泄露,Pod 未限制,跑 cryptominer
# 教训:
# 1. 凭证定期轮换
# 2. 限制 privileged
# 3. 网络策略限制外联
# 4. 监控异常进程
```

### 案例 2:CVE-2022-0492(containerd)

```text
# 攻击: containerd 漏洞允许容器逃逸
# 教训:
# 1. 及时升级 K8s/containerd
# 2. 用 PSS 限制特权
# 3. 监控异常
```

## 21.19 专家清单(完整)

### 镜像
- [ ] 用 distroless / alpine / chainguard
- [ ] Trivy/Snyk 扫描(构建时 + 运行时)
- [ ] 不变 tag(digest)
- [ ] 签名(cosign)
- [ ] 不放密钥进镜像

### Pod
- [ ] PSS restricted
- [ ] runAsNonRoot: true
- [ ] readOnlyRootFilesystem: true
- [ ] allowPrivilegeEscalation: false
- [ ] capabilities.drop: ALL
- [ ] seccompProfile: RuntimeDefault
- [ ] resources.requests/limits 都设

### 网络
- [ ] NetworkPolicy default-deny
- [ ] 白名单允许
- [ ] mTLS(Istio)
- [ ] 节点不开 10250/2379 等端口对外
- [ ] API Server 不公网暴露

### 凭证
- [ ] 定期轮换
- [ ] etcd 加密
- [ ] External Secrets
- [ ] 不进 git
- [ ] 不用 default SA

### 控制面
- [ ] 启 audit
- [ ] 启 RBAC
- [ ] 禁匿名
- [ ] TLS 1.2+
- [ ] 限 API server 访问

### 运行时
- [ ] Falco 检测
- [ ] kube-bench CIS
- [ ] 定期扫描 CVE
- [ ] 升级 K8s/CNI/containerd
- [ ] 安全演练

### 监控
- [ ] 异常进程告警
- [ ] 异常网络连接告警
- [ ] 权限变更告警
- [ ] 镜像推送告警
- [ ] 日志集中(Falco + SIEM)

## 21.20 本章小结

- 4C 安全模型:Cloud/Cluster/Container/Code
- 镜像:distroless + 扫描 + 签名
- PSS 替代 PSP,restricted 级别生产首选
- Pod 安全:non-root / readOnly / no privilege escalation
- NetworkPolicy default-deny + 白名单
- 凭证:etcd 加密 + External Secrets + 轮换
- API Server:K8s 1.28+ 启动参数加固
- 运行时:Falco / Tetragon / Tracee
- CIS Benchmark 用 kube-bench 检查
- 完整专家清单覆盖各层
- 安全是持续过程,定期演练
## 21.21 Falco 深入实战

### Falco 架构

```text
Syscall Events → kernel module / eBPF probe → Falco userspace
                                              ↓
                                         规则匹配
                                              ↓
                                         告警输出
                                              ↓
                              stdout / falcosidekick → Slack/ELK/SIEM
```

### 安装(现代 eBPF 模式)

```bash
helm repo add falcosecurity https://falcosecurity.github.io/charts
helm install falco falcosecurity/falco \
  --namespace falco --create-namespace \
  --set driver.kind=modern_ebpf \
  --set tty=true \
  --set falco.json_output=true \
  --set falco.http_output.enabled=true \
  --set falco.http_output.url="http://falcosidekick.falco.svc:2801"

# Sidekick(分发告警)
helm install falcosidekick falcosecurity/falcosidekick \
  --namespace falco \
  --set config.slack.channel="#security" \
  --set config.slack.webhookurl="https://hooks.slack.com/xxx" \
  --set config.elasticsearch.enabled=true
```

### 规则详解

```yaml
# /etc/falco/falco_rules.local.yaml
- rule: Container Drift Detection
  desc: 检测容器内二进制/库变化
  condition: >
    open_write and container and 
    fd.name startswith /usr/bin or
    fd.name startswith /usr/sbin or
    fd.name startswith /bin or
    fd.name startswith /sbin or
    fd.name startswith /lib
  output: >
    容器内写二进制(可能已被攻陷)
    user=%user.name command=%proc.cmdline 
    file=%fd.name container=%container.name
  priority: CRITICAL
  tags: [filesystem, drift]

- rule: Crypto Mining Detection
  desc: 检测加密挖矿
  condition: >
    spawned_process and container and 
    (proc.name in (xmrig, minerd, minergate, cryptonight) or
     proc.cmdline contains "stratum+tcp" or
     proc.cmdline contains "cryptonight")
  output: >
    检测到加密挖矿
    user=%user.name command=%proc.cmdline 
    container=%container.name
  priority: CRITICAL
  tags: [cryptomining]

- rule: Reverse Shell
  desc: 检测反弹 shell
  condition: >
    spawned_process and container and 
    (proc.name in (bash, sh, zsh) and 
     (proc.cmdline contains "/dev/tcp" or
      proc.cmdline contains "nc -" or
      proc.cmdline contains "ncat" or
      proc.cmdline contains "bash -i"))
  output: >
    检测到反弹 shell
    command=%proc.cmdline container=%container.name
  priority: CRITICAL
  tags: [shell]
```

### Falco 进阶:Macros + Lists

```yaml
# lists
- list: shell_binaries
  items: [bash, sh, zsh, csh, ksh, fish]

- list: sensitive_files
  items: [/etc/shadow, /etc/passwd, /etc/sudoers, /root/.ssh, /root/.aws/credentials]

# macros(规则复用)
- macro: container
  condition: container.id != host

- macro: spawned_process
  condition: evt.type = execve and evt.dir = <

- macro: sensitive_file_access
  condition: >
    open_read and 
    fd.name in (sensitive_files) and
    container
```

### Falcosidekick 集成(50+ 输出)

```yaml
# 输出目标(可同时多个)
config:
  slack:
    channel: "#security"
    webhookurl: "https://hooks.slack.com/xxx"
    outputformat: "all"
  elasticsearch:
    host: "elasticsearch.logging.svc"
    port: 9200
    index: "falco"
  loki:
    endpoint: "http://loki.logging.svc:3100"
  prometheus:
    enabled: true
    port: 9095
  aws_s3:
    bucket: "security-logs"
    region: "us-east-1"
  opensearch:
    hostport: "opensearch.logging.svc:9200"
  webhook:
    address: "http://siem.company.com/falco"
```

### Falco 事件接入 SIEM

```bash
# Falco 输出 JSON
{
  "output": "...",
  "priority": "Critical",
  "rule": "Crypto Mining Detection",
  "time": "2024-01-15T10:00:00Z",
  "output_fields": {
    "container.name": "web-7d4f8b9c-xyz",
    "k8s.ns.name": "prod",
    "k8s.pod.name": "web-7d4f8b9c-xyz",
    "proc.cmdline": "xmrig --url stratum+tcp://..."
  }
}
```

## 21.22 镜像签名(cosign)实战

### 签名前准备

```bash
# 1. 生成密钥(生产用 KMS 替代)
cosign generate-key-pair
# → cosign.key(私钥,妥善保管)
# → cosign.pub(公钥,推到 K8s 或 registry)

# 2. 公钥打到 K8s Secret
kubectl create secret generic cosign-pub \
  --from-file=cosign.pub=./cosign.pub \
  -n prod
```

### 签名流程

```bash
# 1. CI 中签名(用 KMS)
cosign sign --key awskms://alias/cosign registry.company.com/web:v1.0.0

# 2. 无密钥签名(OIDC + 短期证书)
COSIGN_EXPERIMENTAL=1 cosign sign \
  registry.company.com/web:v1.0.0
# 浏览器 OIDC 登录(Google/GitHub/Microsoft)
# 自动短期证书,记录到 Rekor
```

### K8s 准入验证(Connaisseur)

```bash
# 装 Connaisseur
helm repo add connaisseur https://sigstore.github.io/connaisseur
helm install connaisseur connaisseur/connaisseur --namespace connaisseur --create-namespace
```

```yaml
# 配置信任的公钥
apiVersion: v1
kind: ConfigMap
metadata:
  name: connaisseur-config
  namespace: connaisseur
data:
  config.yaml: |
    policies:
      - name: "default"
        type: "cosign"
        selector: "registry.company.com/*"
        keys:
          - cosign.pub
      - name: "no-signature-required"
        type: "skip"
        selector: "k8s.gcr.io/*"
```

### Kyverno 验证(替代方案)

```yaml
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: verify-image-signature
spec:
  validationFailureAction: Enforce
  rules:
  - name: verify
    match:
      any:
      - resources:
          kinds: ["Pod"]
    verifyImages:
    - imageReferences: ["registry.company.com/*"]
      attestors:
      - entries:
        - keys:
            publicKeys: |-
              -----BEGIN PUBLIC KEY-----
              MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE...
              -----END PUBLIC KEY-----
```

### 应急:跳过验证

```yaml
# 例外 annotation
metadata:
  annotations:
    cosign.sigstore.dev/skip: "true"
```

## 21.23 镜像 SBOM + 漏洞实战

### Syft 生成 SBOM

```bash
# 安装
curl -sSfL https://raw.githubusercontent.com/anchore/syft/main/install.sh | sh -s -- -b /usr/local/bin

# 生成
syft registry.company.com/web:v1.0.0 -o spdx-json > sbom.spdx.json
syft registry.company.com/web:v1.0.0 -o cyclonedx-json

# 附加到镜像
cosign attach sbom --key cosign.key registry.company.com/web:v1.0.0 sbom.spdx.json
```

### Trivy Operator(运行中扫描)

```bash
helm repo add trivy-operator https://aquasecurity.github.io/trivy-operator
helm install trivy-operator trivy-operator/trivy-operator \
  --namespace trivy-system --create-namespace
```

```bash
# 自动生成报告
kubectl get vulnerabilityreports -A
# NAMESPACE  NAME                    CRITICAL  HIGH  MEDIUM
# prod       web-7d4f8b9c-xyz-pod   0         2     5

# 详细
kubectl describe vulnerabilityreport web-7d4f8b9c-xyz-pod -n prod
```

### CI 阻断策略

```yaml
# GitHub Actions
- name: Trivy Scan
  run: |
    trivy image --exit-code 1 \
      --severity CRITICAL,HIGH \
      registry.company.com/web:${{ github.sha }}
```

## 21.24 Secrets 高级管理

### External Secrets Operator(ESO)

```bash
helm install external-secrets external-secrets/external-secrets \
  --namespace external-secrets --create-namespace
```

```yaml
# 1. SecretStore(连接 Vault/AWS Secrets Manager)
apiVersion: external-secrets.io/v1beta1
kind: SecretStore
metadata:
  name: vault-backend
  namespace: prod
spec:
  provider:
    vault:
      server: "https://vault.company.com"
      path: "secret"
      version: "v2"
      auth:
        kubernetes:
          mountPath: "kubernetes"
          role: "prod-role"
          serviceAccountRef:
            name: eso-sa
---
# 2. ExternalSecret(拉取并同步为 K8s Secret)
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: db-credentials
  namespace: prod
spec:
  refreshInterval: 1m
  secretStoreRef:
    name: vault-backend
    kind: SecretStore
  target:
    name: db-secret
    creationPolicy: Owner
  data:
  - secretKey: DB_PASSWORD
    remoteRef:
      key: prod/db
      property: password
```

### Vault Secrets Operator

```bash
helm install vault-secrets-operator hashicorp/vault-secrets-operator \
  --namespace vault-secrets-operator-system --create-namespace
```

```yaml
apiVersion: secrets.hashicorp.com/v1beta1
kind: VaultStaticSecret
metadata:
  name: db-credentials
spec:
  vaultAuthRef: default
  mount: kubernetes
  path: secret/data/prod/db
  type: kv-v2
  refreshAfter: 60s
  destination:
    create: true
    name: db-secret
```

## 21.25 K8s 1.30+ 新安全特性

```text
1. Pod 沙箱(Sandboxed Pods):
   - gVisor / Kata Containers
   - 隔离 syscall,减少攻击面
   
2. 用户命名空间(userns):
   - Pod 用独立 UID 范围
   - 容器逃逸不影响主机
   
3. Pod Resources Subresource GA:
   - /status 子资源分离
   - 防止竞态
   
4. AppArmor GA:
   - 配置文件级权限
   
5. 安全上下文默认化(PSA):
   - 命名空间默认限制
```

### 用户命名空间(userns)实战

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: userns-pod
spec:
  hostUsers: false  # K8s 1.28+ 启用用户命名空间
  securityContext:
    sysctls:
    - name: kernel.unprivileged_userns_clone
      value: "1"
  containers:
  - name: app
    image: nginx
    securityContext:
      runAsUser: 1000
      runAsGroup: 1000
```

### gVisor 沙箱

```yaml
apiVersion: node.k8s.io/v1
kind: RuntimeClass
metadata:
  name: gvisor
handler: runsc
---
apiVersion: v1
kind: Pod
metadata:
  name: sandboxed
spec:
  runtimeClassName: gvisor
  containers:
  - name: app
    image: nginx
```

## 21.26 专家清单(终极版)

### 镜像层
- [ ] 镜像用 distroless/chainguard
- [ ] CI 中 Trivy 扫描,CRITICAL 阻断
- [ ] cosign 签名所有生产镜像
- [ ] SBOM 生成 + 签名 + 验证
- [ ] K8s 准入验证签名

### 运行时
- [ ] Falco(eBPF)+ Falcosidekick
- [ ] Tetragon(可选,Falco 替代)
- [ ] 沙箱(gVisor/Kata)用于不可信工作负载
- [ ] 用户命名空间(K8s 1.28+)

### 凭证/加密
- [ ] etcd KMS 加密
- [ ] External Secrets + Vault
- [ ] 自动轮换

### 监控/响应
- [ ] Falco → SIEM/告警
- [ ] 异常进程/网络/文件
- [ ] 战时响应 Runbook
- [ ] 红蓝对抗演练

## 21.27 本章小结(终极版)

- 4C 安全模型贯穿始终
- **Falco** = 运行时安全(规则驱动)
- **cosign** = 镜像签名(供应链)
- **External Secrets** = 凭证管理
- **沙箱** = 终极防御(gVisor/Kata)
- 安全 = 持续过程,需演练
