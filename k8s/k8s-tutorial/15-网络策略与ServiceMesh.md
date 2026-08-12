# 15. 网络策略与 Service Mesh

## 15.1 K8s 网络基础要求

K8s 对网络的要求(任何 CNI 必须满足):

1. **所有 Pod 都有独立 IP**(不需 NAT)
2. **所有 Pod 都能直接和所有 Pod 通信**(no NAT)
3. **所有 Node 都能和所有 Pod 通信**(no NAT)
4. **Pod 看到的 IP 和别人看到的一致**

**结果**:**网络是平的**。问题是——**太平了**!谁都能访问谁。

## 15.2 K8s 网络栈

```text
┌────────────────────────┐
│  K8s Pod Network       │   集群内虚拟网络
│  (CNI: calico/cilium) │
└────────────┬───────────┘
             │
┌────────────┴───────────┐
│  Service Network       │   ClusterIP 虚拟 IP
│  (kube-proxy)         │
└────────────┬───────────┘
             │
┌────────────┴───────────┐
│  Ingress / LB          │   外部访问入口
└────────────────────────┘
```

| 组件 | 实现 | 作用 |
|------|------|------|
| **CNI** | calico / cilium / flannel | Pod 互联 |
| **kube-proxy** | iptables / IPVS | Service 转发 |
| **DNS** | CoreDNS | 名字解析 |
| **NetworkPolicy** | CNI 实现 | 网络策略 |
| **Service Mesh** | istio / linkerd | 高级流量管理 |

## 15.3 NetworkPolicy(网络策略)

**核心思想**:**白名单机制**——没匹配的流量全部拒绝。

**前提**:CNI 必须支持(Calico / Cilium / Weave 都支持,Flannel 早期不支持)。

### 第一个 NetworkPolicy

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: web-netpol
  namespace: prod
spec:
  podSelector:                  # 应用到哪些 Pod
    matchLabels:
      app: web
  policyTypes:
  - Ingress                     # 入站
  - Egress                      # 出站
  ingress:                      # 允许的入站
  - from:
    - podSelector:              # 同 namespace 的 pod
        matchLabels: { app: lb }
    - namespaceSelector:        # 指定 namespace 的所有 pod
        matchLabels: { name: ingress }
    - ipBlock:                  # IP 段
        cidr: 10.0.0.0/16
        except: [10.0.1.0/24]
    ports:
    - protocol: TCP
      port: 8080
  egress:                       # 允许的出站
  - to:
    - podSelector:
        matchLabels: { app: db }
    ports:
    - protocol: TCP
      port: 5432
  - to:
    - ipBlock:
        cidr: 0.0.0.0/0         # DNS
    ports:
    - protocol: UDP
      port: 53
```

**效果**:
- `app=web` 的 Pod 只能接收来自 `app=lb`、命名空间 `ingress`、或 `10.0.0.0/16` 的 8080 流量
- `app=web` 只能访问 `app=db` 的 5432 端口,以及 DNS(53)

### 默认拒绝所有

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny
  namespace: prod
spec:
  podSelector: {}                # 所有 Pod
  policyTypes:
  - Ingress
  - Egress
  # 没有 ingress/egress → 全部拒绝
```

**生产铁律**:**先 default-deny,再开白名单**。

## 15.4 实战:微服务隔离

```yaml
# 1. 全局默认拒绝
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all
  namespace: prod
spec:
  podSelector: {}
  policyTypes: [Ingress, Egress]
---
# 2. 允许 DNS
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-dns
  namespace: prod
spec:
  podSelector: {}
  policyTypes: [Egress]
  egress:
  - to:
    - namespaceSelector: {}     # 所有 namespace 的 kube-system
    - podSelector:
        matchLabels: { k8s-app: kube-dns }   # CoreDNS
    ports:
    - { protocol: UDP, port: 53 }
    - { protocol: TCP, port: 53 }
---
# 3. web 接受 lb 流量
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: web-ingress
  namespace: prod
spec:
  podSelector: { matchLabels: { app: web } }
  policyTypes: [Ingress]
  ingress:
  - from:
    - podSelector: { matchLabels: { app: nginx-ingress } }
    ports:
    - { protocol: TCP, port: 8080 }
---
# 4. api 接受 web 流量
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: api-ingress
  namespace: prod
spec:
  podSelector: { matchLabels: { app: api } }
  policyTypes: [Ingress]
  ingress:
  - from:
    - podSelector: { matchLabels: { app: web } }
    ports:
    - { protocol: TCP, port: 8080 }
---
# 5. db 接受 api 流量
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: db-ingress
  namespace: prod
spec:
  podSelector: { matchLabels: { app: db } }
  policyTypes: [Ingress]
  ingress:
  - from:
    - podSelector: { matchLabels: { app: api } }
    ports:
    - { protocol: TCP, port: 5432 }
```

## 15.5 CNI 选型

| CNI | NetworkPolicy | 性能 | 复杂度 | 适用 |
|-----|---------------|------|--------|------|
| **Calico** | ✅ 完整 | 高 | 中 | **生产首选** |
| **Cilium** | ✅(L3-L7) | 极高(eBPF) | 高 | 大规模、高性能 |
| **Flannel** | ❌ 不支持 | 中 | 低 | 仅开发 |
| **Weave** | ✅ | 中 | 中 | 老项目 |
| **Canal** | ✅ | 中 | 中 | Calico + Flannel |

**生产推荐**:
- 常规:**Calico**
- 性能敏感 / 高级(L7 策略):**Cilium**
- 多云/混合云:**Cilium ClusterMesh**

## 15.6 Calico 高级:GlobalNetworkPolicy

**Cluster 级策略**(跨 namespace):

```yaml
apiVersion: projectcalico.org/v3
kind: GlobalNetworkPolicy
metadata: { name: deny-all-ingress }
spec:
  selector: all()                 # 所有 Pod
  types: [Ingress]
  ingress:
  - action: Allow
    source:
      namespaceSelector: name == "ingress-nginx"
    destination: {}
```

**生产用法**:
- `default-deny`(集群级)
- 例外白名单(各 namespace 单独开)

## 15.7 Cilium 高级:L7 策略

```yaml
apiVersion: cilium.io/v2
kind: CiliumNetworkPolicy
metadata: { name: api-l7 }
spec:
  endpointSelector: { matchLabels: { app: api } }
  ingress:
  - fromEndpoints:
    - matchLabels: { app: web }
    toPorts:
    - ports:
      - { port: "8080", protocol: TCP }
      rules:
        http:
        - method: "GET"
          path: "/api/v1/.*"
        - method: "POST"
          path: "/api/v1/orders"
```

**强大能力**:
- HTTP method / path 限制
- gRPC service/method 限制
- Kafka topic 限制
- **应用层零信任**

## 15.8 Service Mesh 概念

**NetworkPolicy** 是 L3/L4 限制。**Service Mesh** 提供 L7 能力:

| 能力 | NetworkPolicy | Service Mesh |
|------|---------------|--------------|
| L3/L4 隔离 | ✅ | ✅ |
| L7 路由 | ❌ | ✅ |
| mTLS | ❌ | ✅ |
| 流量切分 | ❌ | ✅ |
| 可观测性(调用链) | ❌ | ✅ |
| 重试/熔断 | ❌ | ✅ |
| 故障注入 | ❌ | ✅ |

### Service Mesh 架构

```text
┌─────────────────────────────┐
│  Control Plane (istiod)     │
│  - 配置分发                  │
│  - 证书颁发                  │
└────────────┬────────────────┘
             │ xDS
             ▼
┌─────────────────────────────┐
│  Data Plane (envoy sidecar) │
│  - 流量拦截(iptables)        │
│  - mTLS                     │
│  - 路由 / 重试 / 熔断         │
│  - 指标上报                  │
└─────────────────────────────┘
```

## 15.9 Istio 实战

### 安装 Istio

```bash
curl -L https://istio.io/downloadIstio | sh -
cd istio-1.21.0
export PATH=$PWD/bin:$PATH

istioctl install --set profile=demo -y

# 启用 sidecar 自动注入
kubectl label namespace default istio-injection=enabled
```

### 流量切分(VirtualService)

```yaml
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata: { name: web }
spec:
  hosts: [web]
  http:
  - match:
    - headers:
        x-canary: { exact: "true" }
    route:
    - destination:
        host: web
        subset: v2
  - route:
    - destination: { host: web, subset: v1 }
      weight: 90
    - destination: { host: web, subset: v2 }
      weight: 10
---
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata: { name: web }
spec:
  host: web
  subsets:
  - name: v1
    labels: { version: v1 }
  - name: v2
    labels: { version: v2 }
```

**能力**:
- 基于 header/cookie/source IP 切流量
- 权重切流量
- 镜像流量(测试)
- 重试 / 超时
- 故障注入(返回 500/延迟)

### mTLS 强制

```yaml
apiVersion: security.istio.io/v1beta1
kind: PeerAuthentication
metadata: { name: default, namespace: prod }
spec:
  mtls:
    mode: STRICT                  # 必须 mTLS
```

### 授权策略(AuthorizationPolicy)

```yaml
apiVersion: security.istio.io/v1beta1
kind: AuthorizationPolicy
metadata: { name: api-authz, namespace: prod }
spec:
  selector:
    matchLabels: { app: api }
  action: ALLOW
  rules:
  - from:
    - source:
        principals: ["cluster.local/ns/prod/sa/web"]
    to:
    - operation:
        methods: ["GET", "POST"]
        paths: ["/api/v1/*"]
```

**能力**:
- 谁能访问(SA 级别)
- 什么方法 / 路径
- 什么 header

### 可观测性:可视化

```bash
# Kiali
istioctl dashboard kiali

# Jaeger(trace)
istioctl dashboard jaeger

# Prometheus
istioctl dashboard prometheus
```

**自动获得**:
- 实时服务拓扑图
- 详细 metrics(QPS, latency, error rate)
- 分布式追踪(trace)
- 访问日志

## 15.10 Linkerd 简介(更轻量)

```bash
curl -fsL https://run.linkerd.io/install | sh
linkerd install | kubectl apply -f -
```

**特点**:
- 比 Istio 轻量(用 Rust 写的 micro-proxy)
- mTLS 默认开
- 简单易上手
- **生产比 Istio 简单**——没那么多 knobs

## 15.11 Mesh vs NetworkPolicy 选型

| 场景 | 用 |
|------|-----|
| 简单 namespace 隔离 | NetworkPolicy |
| 高级 L7 策略 | Service Mesh |
| mTLS | Service Mesh |
| 多语言微服务统一管控 | Service Mesh |
| 资源极敏感 | NetworkPolicy + 简单 Mesh |
| 多集群 | Cilium ClusterMesh / Istio Multi-cluster |

**生产组合**:
- **Cilium CNI** + **Cilium NetworkPolicy**(L3/L4)
- **Istio/Linkerd** 跑关键服务(L7 + mTLS)
- **非关键服务**只用 Cilium

## 15.12 Ingress 与 Service Mesh 集成

```yaml
# Istio Gateway(替代 Ingress)
apiVersion: networking.istio.io/v1beta1
kind: Gateway
metadata: { name: web-gw }
spec:
  selector:
    istio: ingressgateway
  servers:
  - port:
      number: 443
      protocol: HTTPS
      tls:
        mode: SIMPLE
        credentialName: app-tls
    hosts:
    - app.example.com
```

## 15.13 实战:微服务完整隔离方案

```text
层级防御:
1. NetworkPolicy(L3/L4 namespace 隔离)
2. Service Mesh(L7 + mTLS)
3. API 网关(对外限流 + 鉴权)
4. WAF(L7 防攻击)
```

```yaml
# 1. namespace 隔离
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata: { name: default-deny, namespace: prod }
spec:
  podSelector: {}
  policyTypes: [Ingress, Egress]
---
# 2. 关键服务互访
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata: { name: web-api, namespace: prod }
spec:
  podSelector: { matchLabels: { app: api } }
  policyTypes: [Ingress]
  ingress:
  - from:
    - podSelector: { matchLabels: { app: web } }
    ports: [{ port: 8080, protocol: TCP }]
---
# 3. mTLS(Istio)
apiVersion: security.istio.io/v1beta1
kind: PeerAuthentication
metadata: { name: default, namespace: prod }
spec: { mtls: { mode: STRICT } }
---
# 4. 应用级授权
apiVersion: security.istio.io/v1beta1
kind: AuthorizationPolicy
metadata: { name: api-only-web, namespace: prod }
spec:
  selector: { matchLabels: { app: api } }
  action: ALLOW
  rules:
  - from:
    - source:
        principals: ["cluster.local/ns/prod/sa/web"]
```

## 15.14 故障排查

### NetworkPolicy 不生效

```bash
# 1. 查 CNI
kubectl get pods -n kube-system -l k8s-app=calico-node
# 或 cilium
kubectl get pods -n kube-system -l k8s-app=cilium

# 2. 查策略
kubectl get netpol -A
kubectl describe netpol <name>

# 3. 模拟测试(calico)
calicoctl node run
# 在容器内测连通性

# 4. 看 Pod log
# Calico felix 日志
kubectl -n kube-system logs calico-node-xxx
```

### Service Mesh 问题

```bash
# 1. sidecar 是否注入?
istioctl proxy-config routes <pod>.<ns>

# 2. 流量是否走 sidecar?
istioctl proxy-config endpoints <pod>.<ns>

# 3. mTLS 状态?
istioctl authn tls-check <pod>.<ns>

# 4. 配置调试
istioctl analyze

# 5. Envoy 日志
kubectl logs <pod> -c istio-proxy
```

## 15.15 专家清单

- [ ] CNI 用 Calico 或 Cilium(支持 NetworkPolicy)
- [ ] 命名空间启用 default-deny NetworkPolicy
- [ ] 明确允许入站(白名单)
- [ ] 允许 DNS(UDP/TCP 53)
- [ ] 关键服务用 Service Mesh(可选)
- [ ] 启用 mTLS(STRICT)
- [ ] 用 AuthorizationPolicy 限定 SA 互访
- [ ] 监控网络流量(Kiali/Hubble)
- [ ] 定期 review 策略(权限过大及时回收)
- [ ] 测试 NetworkPolicy 策略(K8s 无内置测试,用 cilium/calico 工具)

## 15.16 本章小结

- K8s 网络"太平"——必须用 NetworkPolicy 隔离
- NetworkPolicy:L3/L4 白名单,默认拒绝
- CNI 必须支持(Calico/Cilium)
- 实战:default-deny + 显式 allow
- Calico 全局策略 + Cilium L7 策略
- Service Mesh(L7/mTLS/可观测):Istio / Linkerd
- Istio 用 VirtualService 切流量、AuthorizationPolicy 授权
- mTLS + SA 级别的零信任
- 多层防御:NetworkPolicy + Mesh + API Gateway + WAF
