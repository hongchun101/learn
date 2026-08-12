# 06. Service 与负载均衡

## 6.1 Service 解决什么问题

**核心问题**:Pod 是"牛郎星"——会死、会扩缩、IP 会变。客户端怎么稳定地访问一组动态 Pod?

**Service 的角色**:**虚拟 IP + 负载均衡器**,给一组 Pod 固定的访问入口。

```text
        ┌──────────────────┐
        │  Service web     │  ClusterIP: 10.96.0.10 (稳定)
        │  selector: app=web│
        └──────┬───────────┘
               │ 持续同步
               ▼
        ┌──────────────────┐
        │   Endpoints      │  web-1:10.244.1.5
        │   (自动维护)     │  web-2:10.244.1.6
        └──────────────────┘  web-3:10.244.1.7
               ▲
               │ 来自 Pod 标签匹配
        ┌──────┴───────────┬──────────────┐
        │   Pod web-1     │   Pod web-2  │   Pod web-3
        │   10.244.1.5    │   10.244.1.6 │   10.244.1.7
        └─────────────────┴──────────────┘
```

## 6.2 Service 三种类型

| 类型 | 暴露范围 | 典型场景 |
|------|----------|----------|
| **ClusterIP**(默认) | 集群内部 | 内部微服务互调 |
| **NodePort** | 集群节点:NodePort | 调试、临时外部访问 |
| **LoadBalancer** | 云厂商 LB | 生产对外服务 |
| **ExternalName** | DNS CNAME | 跨集群、外部服务 |
| **Headless**(ClusterIP: None) | 直连 Pod IP | StatefulSet、有状态服务 |

## 6.3 ClusterIP

```yaml
apiVersion: v1
kind: Service
metadata: { name: web }
spec:
  type: ClusterIP
  selector:
    app: web
  ports:
  - name: http
    port: 80            # Service 端口(集群内访问)
    targetPort: 8080    # Pod 端口
    protocol: TCP
```

```bash
# 集群内访问
curl http://web.default.svc.cluster.local
# 或简写
curl http://web
curl http://web:80
```

**DNS 命名规则**:
```text
<service-name>.<namespace>.svc.cluster.local
web.default.svc.cluster.local
api.prod.svc.cluster.local
```

**特点**:
- 只有 ClusterIP 虚拟 IP(从 Service CIDR 分配,默认 `10.96.0.0/12`)
- 不占用节点端口
- 由 kube-proxy 用 iptables/IPVS 规则实现

## 6.4 NodePort

```yaml
apiVersion: v1
kind: Service
metadata: { name: web }
spec:
  type: NodePort
  selector:
    app: web
  ports:
  - port: 80               # ClusterIP 端口
    targetPort: 8080
    nodePort: 30080        # 节点端口(30000-32767)
    protocol: TCP
```

**访问方式**:
```text
<任意节点IP>:<NodePort>
http://node1:30080
```

**特点**:
- 在每个节点上开 30000-32767 端口
- 外部流量 → 节点:NodePort → Service → Pod
- 适用:开发测试、临时公网入口(不推荐生产直用)
- 缺点:端口范围小、安全暴露节点、需自己加 LB

## 6.5 LoadBalancer

```yaml
apiVersion: v1
kind: Service
metadata: { name: web, annotations: { } }
spec:
  type: LoadBalancer
  selector: { app: web }
  ports:
  - { port: 80, targetPort: 8080 }
  # loadBalancerSourceRanges: ["1.2.3.0/24"]  # 白名单
```

**特点**:
- 自动创建云厂商 LB(AWS ELB / GCP LB / 阿里 SLB)
- `EXTERNAL-IP` 会从 pending 变成真实 IP
- 公有云首选,内部 LB 也支持(用 annotation)

**常用 Annotation**:

| Annotation | 用途 |
|-----------|------|
| `service.beta.kubernetes.io/aws-load-balancer-type: nlb` | AWS NLB |
| `service.beta.kubernetes.io/aws-load-balancer-internal: "true"` | 内网 LB |
| `service.beta.kubernetes.io/alibaba-cloud-loadbalancer-id: lb-xxx` | 阿里云指定 LB |
| `service.beta.kubernetes.io/azure-load-balancer-health-probe-request-path: /healthz` | Azure 探针路径 |
| `service.kubernetes.io/traefik-load-balancer-type: internal` | Traefik |
| `metallb.universe.tf/loadBalancerIPs: 192.168.1.100` | MetalLB |

## 6.6 ExternalName

```yaml
apiVersion: v1
kind: Service
metadata: { name: my-db }
spec:
  type: ExternalName
  externalName: actual-db.example.com
```

**特点**:
- 创建一条 CNAME 记录
- `my-db.default.svc.cluster.local` → `actual-db.example.com`
- 不做负载均衡,纯 DNS 转发
- **不需要 selector**

## 6.7 Headless Service

```yaml
apiVersion: v1
kind: Service
metadata: { name: mysql }
spec:
  clusterIP: None         # 关键:None 表示 headless
  selector:
    app: mysql
  ports:
  - { port: 3306, targetPort: 3306 }
```

**特点**:
- **不分配 ClusterIP**
- DNS 直接解析到**所有 Pod IP**(有多个 A 记录)
- StatefulSet 必备(见 10 章)
- 自己负责负载均衡(由应用层或客户端驱动)

```bash
# 解析
nslookup mysql.default.svc.cluster.local
# 看到多个 A 记录,每个 Pod IP 一个
```

## 6.8 Endpoints 机制

Service 创建后,**Endpoints 控制器**自动维护 `Endpoints` 对象:

```bash
kubectl get endpoints web
NAME   ENDPOINTS                          AGE
web    10.244.1.5:8080,10.244.1.6:8080    5m
```

**没 selector 的 Service** → 不会自动生成 Endpoints,需要手动建:

```yaml
apiVersion: v1
kind: Endpoints
metadata: { name: external-db }
subsets:
- addresses:
  - ip: 192.168.1.10
  ports:
  - { port: 3306 }
```

或用 `EndpointSlices`(K8s 1.21+ 默认):

```bash
kubectl get endpointslice
```

## 6.9 kube-proxy 三种模式

Service 的"魔法"由 kube-proxy 实现:

### 1. iptables(默认,K8s 1.0+)

- 在每个节点 iptables 写规则
- 随机选择后端 Pod
- **大规模集群性能差**(规则链长)

### 2. IPVS(推荐,大规模集群)

- 用 Linux Virtual Server(LVS)
- 多种负载均衡算法:rr, lc, dh, sh, sed, nq
- 性能高(哈希表)

```bash
# 启动参数改
--proxy-mode=ipvs
--ipvs-scheduler=rr    # 算法
```

### 3. userspace(已废弃)

K8s 1.0 前的方案,慢,已弃用。

## 6.10 端口和协议

```yaml
spec:
  ports:
  - name: http           # 必填,K8s 1.9+ 要求(尤其多端口)
    port: 80             # Service 端口
    targetPort: 8080     # Pod 端口(可以是名字,见下)
    protocol: TCP        # TCP / UDP / SCTP
    nodePort: 30080      # NodePort/LoadBalancer 时
    appProtocol: http    # K8s 1.20+,告诉应用层协议(http/grpc/h2c)

  - name: metrics
    port: 9090
    targetPort: metrics  # 用 containerPort 名字
    protocol: TCP
```

```yaml
# Pod containerPorts
containers:
- name: app
  ports:
  - { name: http, containerPort: 8080 }
  - { name: metrics, containerPort: 9090 }
```

## 6.11 sessionAffinity(会话保持)

```yaml
spec:
  sessionAffinity: ClientIP
  sessionAffinityConfig:
    clientIP:
      timeoutSeconds: 10800    # 3 小时,默认就是这个
```

**特点**:
- 同一 ClientIP 的请求始终打到同一 Pod
- 适合:WebSocket、长连接、本地缓存
- **不替代 Redis 等分布式 session**!

## 6.12 流量分配策略(internalTrafficPolicy / externalTrafficPolicy)

```yaml
spec:
  externalTrafficPolicy: Local    # 关键!避免 SNAT,保留客户端 IP
  internalTrafficPolicy: Local    # K8s 1.21+
```

### externalTrafficPolicy

| 值 | 行为 | 保留客户端 IP | 健康检查 |
|----|------|---------------|---------|
| `Cluster`(默认) | 任意 NodePort 接收 → 转发到任意 Pod | ❌ 客户端 IP 被 SNAT 改 | 简单 |
| `Local` | 只有运行 Pod 的节点才接 | ✅ 保留 | 需 LB 健康检查配合 |

**Local 模式的坑**:节点没 Pod 时该节点的 NodePort **不通**,必须配 LB 的健康检查。

## 6.13 健康检查 readiness

**关键**:`readinessProbe` 失败时,Pod **从 Endpoints 移除**!

```yaml
readinessProbe:
  httpGet: { path: /health, port: 8080 }
  initialDelaySeconds: 5
  periodSeconds: 5
  failureThreshold: 3
```

**作用**:
- 启动时不接流量(等就绪)
- 运行时故障摘流(不杀,只摘)
- **滚动升级的"零停机"基础**

## 6.14 DNS 解析细节

K8s 内置 **CoreDNS**(以前是 kube-dns):

```yaml
# Pod 默认 DNS 配置(/etc/resolv.conf)
nameserver 10.96.0.10           # CoreDNS Service IP
search default.svc.cluster.local svc.cluster.local cluster.local
options ndots:5
```

**Service 域名**:
```text
web.default.svc.cluster.local
```

**Pod 域名**:
```text
<pod-ip>.<namespace>.pod.cluster.local
10-244-1-5.default.pod.cluster.local
```

**StatefulSet Pod**:
```text
<statefulset-name>-<ordinal>.<service-name>.<namespace>.svc.cluster.local
mysql-0.mysql.default.svc.cluster.local
```

### Pod DNS Policy

```yaml
spec:
  dnsPolicy: ClusterFirst       # 默认
  # ClusterFirstWithHostNet     # 用了 hostNetwork 又想用 K8s DNS
  # Default                     # 用节点 DNS
  # None                        # 完全自定义 dnsConfig
```

## 6.15 高级主题:ExternalTrafficPolicy + 健康检查

```yaml
apiVersion: v1
kind: Service
metadata:
  name: web
  annotations:
    # AWS NLB 健康检查
    service.beta.kubernetes.io/aws-load-balancer-healthcheck-path: /healthz
    service.beta.kubernetes.io/aws-load-balancer-healthcheck-port: "8080"
    service.beta.kubernetes.io/aws-load-balancer-cross-zone-load-balancing-enabled: "true"
spec:
  type: LoadBalancer
  externalTrafficPolicy: Local
  selector: { app: web }
  ports:
  - { port: 80, targetPort: 8080 }
```

## 6.16 MetalLB(裸金属的 LoadBalancer)

K8s 默认只支持云厂商 LB,自建集群用 MetalLB:

```bash
kubectl apply -f https://raw.githubusercontent.com/metallb/metallb/v0.14/config/manifests/metallb-native.yaml
```

```yaml
# IP pool
apiVersion: metallb.io/v1beta1
kind: IPAddressPool
metadata: { name: first-pool }
spec:
  addresses:
  - 192.168.1.200-192.168.1.250
---
apiVersion: metallb.io/v1beta1
kind: L2Advertisement
metadata: { name: l2 }
spec:
  ipAddressPools: [first-pool]
```

## 6.17 故障排查

### 案例 1:Service 没 Endpoints

```bash
kubectl get ep web
# ENDPOINTS <none>

# 1. 看 Pod 是否 ready
kubectl get pods -l app=web

# 2. 看 Service selector
kubectl get svc web -o yaml | grep -A5 selector

# 3. 看 Pod label
kubectl get pods -l app=web --show-labels

# 4. 命名空间不匹配?
```

### 案例 2:能解析但访问超时

```bash
# 1. 检查 Pod 网络
kubectl exec -it <pod> -- curl http://<target-pod-ip>:<port>

# 2. 检查 Service 路由
iptables -t nat -L KUBE-SERVICES  # 节点上

# 3. 检查 kube-proxy
kubectl -n kube-system logs kube-proxy-<node>
```

### 案例 3:流量不均

```bash
# 1. 改用 IPVS
kubectl -n kube-system edit cm kube-proxy
# mode: ipvs
kubectl -n kube-system rollout restart ds kube-proxy

# 2. 检查 Endpoints
kubectl get ep web -o yaml

# 3. 用 sessionAffinity
# 4. 调 application 连接池
```

## 6.18 专家级技巧

### 1. 一个 Service 多个端口

```yaml
spec:
  ports:
  - { name: http, port: 80, targetPort: 8080 }
  - { name: https, port: 443, targetPort: 8443 }
  - { name: metrics, port: 9090, targetPort: 9090 }
```

### 2. Headless + StatefulSet 用于有状态

详见 10 章。

### 3. 跨 namespace 服务

```text
# Pod 只能用 Service 名访问(短名只在同 namespace)
# 跨 namespace 必须用 FQDN
api.prod.svc.cluster.local
```

### 4. 限制负载均衡源 IP

```yaml
spec:
  loadBalancerSourceRanges:
  - 10.0.0.0/24
  - 192.168.1.0/24
```

### 5. 保留客户端 IP

```yaml
# LoadBalancer 模式
spec:
  externalTrafficPolicy: Local    # 节点有 Pod 才接,保留 IP
```

### 6.19 常见 Annotations 速查

| Annotation | 用途 |
|-----------|------|
| `service.beta.kubernetes.io/aws-load-balancer-type` | AWS LB 类型(nlb/alb) |
| `service.beta.kubernetes.io/aws-load-balancer-internal` | 内网 LB |
| `service.beta.kubernetes.io/aws-load-balancer-ssl-cert` | ACM cert ARN |
| `service.beta.kubernetes.io/aws-load-balancer-backend-protocol` | 后端协议 |
| `service.beta.kubernetes.io/azure-load-balancer-health-probe-request-path` | Azure 探针 |
| `service.beta.kubernetes.io/gcp-cloud-load-balancer-type` | GCP 类型 |
| `service.beta.kubernetes.io/qcloud-loadbalancer-internal-subnetid` | 腾讯云 |
| `service.beta.kubernetes.io/alibaba-cloud-loadbalancer-address-type` | 阿里云 internet/intranet |
| `metallb.universe.tf/loadBalancerIPs` | MetalLB 固定 IP |
| `service.kubernetes.io/topology-mode` | "auto" / "Proxy" |

## 6.20 本章小结

- Service = 虚拟 IP + 负载均衡,给动态 Pod 群组稳定入口
- 类型:ClusterIP(内部)/ NodePort(节点)/ LoadBalancer(云)/ ExternalName(CNAME)/ Headless(无 VIP)
- 工作机制:selector → 自动 Endpoints → kube-proxy(iptables/IPVS)转发
- 关键参数:`sessionAffinity`、`externalTrafficPolicy`、`sessionAffinityConfig`
- 客户端 IP 保留:用 `externalTrafficPolicy: Local` + 配 LB 健康检查
- 大规模集群改 `proxy-mode=ipvs` 性能更好
- Headless Service 给 StatefulSet 用,DNS 直接解析 Pod IP
- CoreDNS 提供集群内 DNS 解析
- 故障排查:Endpoints → Selector → Pod label → kube-proxy 日志
