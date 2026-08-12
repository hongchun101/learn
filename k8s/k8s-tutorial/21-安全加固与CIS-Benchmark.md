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
