# 07. Ingress 与外部访问

## 7.1 为什么需要 Ingress

**Service 的局限**:
- 只能四层转发(L4:L7 不行)
- 每个 LoadBalancer 服务一个 LB,**贵**
- URL 路径、Header、Cookie 路由?做不到

**Ingress**:**集群入口控制器**,提供:
- L7 路由(基于 Host / Path / Header)
- TLS 终止
- 一个 LB 服务多个应用
- 灰度发布(weight / header)

```text
Internet
   │
   ▼
[Cloud LoadBalancer]
   │
   ▼
[Ingress Controller :80/:443]
   │
   ├── app.example.com → service-a :80
   ├── api.example.com → service-b :8080
   ├── app.example.com/v2 → service-c :80 (header: canary)
   └── * → default-backend (404)
```

## 7.2 Ingress 工作原理

```mermaid
Internet
   ↓
[Cloud LB / NodePort]
   ↓
[Ingress Controller (nginx/traefik/...) ]
   ↓ watch Ingress 资源
[Cluster API] ← apply ingress.yaml
```

**Ingress = 资源声明**(spec 路由规则)
**Ingress Controller = 实际执行**(nginx/traefik/envoy 实现)

## 7.3 安装 Ingress Controller

### Nginx Ingress(主流)

```bash
# 方式 1:裸 yaml
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.11.2/deploy/static/provider/baremetal/deploy.yaml

# 方式 2:Helm
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx --create-namespace
```

### 验证

```bash
kubectl -n ingress-nginx get pods
kubectl -n ingress-nginx get svc
```

### 其他实现

| Controller | 特点 |
|-----------|------|
| **ingress-nginx** | 社区最流行,基于 nginx |
| **Traefik** | 动态配置,GUI |
| **HAProxy** | 高性能,小资源 |
| **Contour** | Envoy 数据面 |
| **APISIX** | Apache,高性能 |
| **Kong** | 企业级,插件多 |
| **GKE Ingress** | GCE 集成 |
| **AWS Load Balancer Controller** | ALB 集成 |

## 7.4 第一个 Ingress

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
spec:
  ingressClassName: nginx       # 1.18+ 推荐
  rules:
  - host: app.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: web
            port:
              number: 80
```

### 字段详解

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: multi
  annotations:
    # nginx-ingress 专用注解
    nginx.ingress.kubernetes.io/rewrite-target: /$2
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/force-ssl-redirect: "true"
    nginx.ingress.kubernetes.io/proxy-body-size: "50m"
    nginx.ingress.kubernetes.io/proxy-read-timeout: "60"
    nginx.ingress.kubernetes.io/configuration-snippet: |
      more_set_headers "X-Frame-Options: DENY";
spec:
  ingressClassName: nginx
  defaultBackend:                # 默认后端(404)
    service:
      name: default-backend
      port: { number: 80 }
  tls:                          # TLS
  - hosts:
    - app.example.com
    - api.example.com
    secretName: app-tls
  rules:
  - host: app.example.com
    http:
      paths:
      - path: /api
        pathType: Prefix
        backend:
          service:
            name: api
            port: { number: 8080 }
      - path: /
        pathType: Prefix
        backend:
          service:
            name: web
            port: { number: 80 }
  - host: api.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: api
            port: { number: 8080 }
```

## 7.5 pathType 三种取值

| 值 | 行为 |
|----|------|
| `Exact` | 精确匹配,区分大小写 |
| `Prefix` | 路径前缀匹配(以 `/` 分隔) |
| `ImplementationSpecific` | 依赖 Ingress Controller(nginx 是前缀 + regex) |

**示例**:
```text
Path /api, type Prefix:
  /api            ✅ 匹配
  /api/           ✅ 匹配
  /api/v1/users   ✅ 匹配
  /apifoo         ❌ 不匹配(路径段不完整)

Path /api/, type Prefix:
  /api/           ✅
  /api/v1         ✅
  /api            ❌(nginx 中要 /api/ 才能匹配)
```

**K8s 1.22+ 强制**:pathType 必填。

## 7.6 TLS/HTTPS 配置

### 创建证书 Secret

```bash
# 自签(测试)
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout tls.key -out tls.crt \
  -subj "/CN=app.example.com"
kubectl create secret tls app-tls --cert=tls.crt --key=tls.key
```

### 用 cert-manager 自动签发(推荐)

```bash
helm install cert-manager jetstack/cert-manager \
  --namespace cert-manager --create-namespace \
  --set installCRDs=true
```

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  ingressClassName: nginx
  tls:
  - hosts:
    - app.example.com
    secretName: app-tls
  rules:
  - host: app.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service: { name: web, port: { number: 80 } }
```

## 7.7 灰度发布(CANARY)

### 1. 基于 Weight(权重)

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web-stable
  annotations:
    nginx.ingress.kubernetes.io/canary: "true"
    nginx.ingress.kubernetes.io/canary-weight: "90"   # 90% 流量
spec:
  rules:
  - host: app.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend: { service: { name: web-stable, port: { number: 80 } } }
---
# 上面基础上叠加
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web-canary
  annotations:
    nginx.ingress.kubernetes.io/canary: "true"
    nginx.ingress.kubernetes.io/canary-weight: "10"   # 10% 流量
spec:
  rules:
  - host: app.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend: { service: { name: web-canary, port: { number: 80 } } }
```

### 2. 基于 Header(更精细)

```yaml
metadata:
  annotations:
    nginx.ingress.kubernetes.io/canary: "true"
    nginx.ingress.kubernetes.io/canary-by-header: "X-Canary"
    nginx.ingress.kubernetes.io/canary-by-header-value: "always"
    # value: always -> 命中 canary
    # value: never  -> 命中 stable
    # 无此 header -> 按 weight
```

### 3. 基于 Cookie

```yaml
metadata:
  annotations:
    nginx.ingress.kubernetes.io/canary: "true"
    nginx.ingress.kubernetes.io/canary-by-cookie: "canary"
    # cookie 值为 always/never
```

### 4. 基于 IP 段

```yaml
metadata:
  annotations:
    nginx.ingress.kubernetes.io/canary: "true"
    nginx.ingress.kubernetes.io/canary-by-header: "X-Forwarded-For"
    nginx.ingress.kubernetes.io/canary-by-header-value: "10.0.0.0/24"
```

## 7.8 IngressClass(多 Controller 共存)

```yaml
apiVersion: networking.k8s.io/v1
kind: IngressClass
metadata:
  name: nginx-public
spec:
  controller: k8s.io/ingress-nginx
  parameters:
    spec:
      kind: ConfigMap
      apiGroup: v1
      name: ingress-nginx-public-config   # 单独 ConfigMap
```

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata: { name: web }
spec:
  ingressClassName: nginx-public    # 选 IngressClass
  rules: [...]
```

**用法**:
- 内网 controller 跑 `class=nginx-internal`(公司内网)
- 公网 controller 跑 `class=nginx-public`(公网 LB)
- 同一个服务,不同 IngressClass,各管各的

## 7.9 常用 Annotations 速查(Nginx)

### 后端

```yaml
nginx.ingress.kubernetes.io/proxy-body-size: 50m
nginx.ingress.kubernetes.io/proxy-read-timeout: "60"
nginx.ingress.kubernetes.io/proxy-send-timeout: "60"
nginx.ingress.kubernetes.io/proxy-connect-timeout: "5"
nginx.ingress.kubernetes.io/backend-protocol: HTTPS   # HTTPS backend
nginx.ingress.kubernetes.io/load-balance: round_robin  # 或 ewma
nginx.ingress.kubernetes.io/upstream-hash-by: "$request_uri"  # 一致性 hash
```

### 限流

```yaml
nginx.ingress.kubernetes.io/limit-rps: "100"
nginx.ingress.kubernetes.io/limit-rpm: "1000"
nginx.ingress.kubernetes.io/limit-connections: "50"
```

### CORS

```yaml
nginx.ingress.kubernetes.io/enable-cors: "true"
nginx.ingress.kubernetes.io/cors-allow-origin: "*"
nginx.ingress.kubernetes.io/cors-allow-methods: "GET, POST, OPTIONS"
nginx.ingress.kubernetes.io/cors-allow-headers: "DNT,Keep-Alive,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Authorization"
nginx.ingress.kubernetes.io/cors-max-age: "600"
```

### 重定向

```yaml
nginx.ingress.kubernetes.io/rewrite-target: /$2
nginx.ingress.kubernetes.io/redirect-from-to-www: "true"  # www 自动跳转
nginx.ingress.kubernetes.io/preserve-trailing-slash: "true"
```

### 鉴权

```yaml
nginx.ingress.kubernetes.io/auth-type: basic
nginx.ingress.kubernetes.io/auth-secret-type: secret
nginx.ingress.kubernetes.io/auth-secret: basic-auth
nginx.ingress.kubernetes.io/auth-realm: "Authentication Required"
```

### 会话保持

```yaml
nginx.ingress.kubernetes.io/affinity: "cookie"
nginx.ingress.kubernetes.io/affinity-mode: persistent
nginx.ingress.kubernetes.io/session-cookie-name: "route"
nginx.ingress.kubernetes.io/session-cookie-expires: "172800"
nginx.ingress.kubernetes.io/session-cookie-max-age: "172800"
```

## 7.10 Gateway API(下一代)

**Ingress 的局限**:
- 角色单一,没有权限隔离
- 多协议(TCP/UDP/gRPC)支持弱
- 跨 namespace 共享困难
- 厂商 Annotation 各不相同

**Gateway API** 是 K8s 1.22+ 引入的新一代 API:

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata: { name: my-gateway, namespace: default }
spec:
  gatewayClassName: nginx
  listeners:
  - name: http
    port: 80
    protocol: HTTP
    allowedRoutes:
      namespaces:
        from: All
---
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata: { name: web }
spec:
  parentRefs:
  - name: my-gateway
  hostnames: ["app.example.com"]
  rules:
  - matches:
    - path: { type: PathPrefix, value: /api }
    backendRefs:
    - name: api
      port: 8080
  - backendRefs:
    - name: web
      port: 80
```

**优势**:
- 多个角色:GatewayClass(基础设施)/ Gateway(集群操作)/ HTTPRoute(应用开发)
- 多协议:HTTP / HTTPS / TCP / UDP / gRPC
- 跨 namespace 路由原生支持
- 标准化的跨实现规范

## 7.11 故障排查

### Ingress 不生效

```bash
# 1. 查 controller
kubectl -n ingress-nginx get pods
kubectl -n ingress-nginx logs deploy/ingress-nginx-controller

# 2. 查 ingress 状态
kubectl describe ingress web
# 看 Events 和 Address(Address 有值说明 controller 已加载)

# 3. 查 Service 后端
kubectl get svc web
kubectl get ep web

# 4. 测流量
curl -H "Host: app.example.com" http://<ingress-ip>/

# 5. 注解错误看 controller 日志
kubectl -n ingress-nginx logs -f deploy/ingress-nginx-controller
```

### 502 Bad Gateway

```bash
# 后端服务不通
# 1. 查 Endpoints
kubectl get ep web
# 2. 查 Pod ready
kubectl get pods -l app=web
# 3. 查 service name 和 port 对不对
```

### TLS 不工作

```bash
# 1. 查 secret
kubectl get secret app-tls -o yaml
# 2. 查 cert 内容
kubectl get secret app-tls -o jsonpath='{.data.tls\.crt}' | base64 -d | openssl x509 -text -noout
# 3. 查 ingress tls 段
kubectl get ingress web -o yaml
```

## 7.12 性能与调优

### Controller 资源

```yaml
# Helm values
controller:
  resources:
    requests: { cpu: 500m, memory: 512Mi }
    limits:   { cpu: 2000m, memory: 2Gi }
  replicas: 2                # 高可用
  affinity:
    podAntiAffinity:
      preferredDuringSchedulingIgnoredDuringExecution:
      - weight: 100
        podAffinityTerm:
          labelSelector:
            matchLabels:
              app.kubernetes.io/name: ingress-nginx
          topologyKey: kubernetes.io/hostname
```

### ConfigMap 调优

```yaml
# nginx-ingress controller configmap
data:
  use-gzip: "true"
  worker-processes: "4"
  max-worker-connections: "16384"
  keep-alive: "75"
  keep-alive-requests: "1000"
  proxy-real-ip-cidr: "0.0.0.0/0"
  use-real-ip: "true"
  ssl-protocols: "TLSv1.2 TLSv1.3"
  ssl-ciphers: "EECDH+AESGCM:EDH+AESGCM"
  ssl-session-cache-size: "100m"
  enable-brotli: "true"
  brotli-types: "application/json text/css application/javascript"
```

## 7.13 生产清单

部署 Ingress 前确认:

- [ ] 用 Helm 装,版本明确(锁定 Chart 版本)
- [ ] Pod 反亲和,2+ 副本跨节点
- [ ] HPA(高峰期自动扩)
- [ ] PodDisruptionBudget(1 个副本,rollingUpdate 不停)
- [ ] 资源 limits 设定,避免节点被吃满
- [ ] Prometheus 抓取注解已加
- [ ] cert-manager 集成(自动证书)
- [ ] ConfigMap 调优(keep-alive、ssl-session-cache)
- [ ] 关键路径有 default-backend
- [ ] HTTPS 重定向(`ssl-redirect: "true"`)
- [ ] HSTS(`server-snippet` 加)
- [ ] WAF / 限流(防爬虫、防 DDoS)
- [ ] 监控告警(5xx 率、QPS、延迟)

## 7.14 实战:多应用 Ingress

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: shop
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/proxy-body-size: 50m
    nginx.ingress.kubernetes.io/limit-rps: "200"
spec:
  ingressClassName: nginx
  tls:
  - hosts: [shop.example.com, api.shop.example.com]
    secretName: shop-tls
  rules:
  - host: api.shop.example.com
    http:
      paths:
      - path: /v1
        pathType: Prefix
        backend: { service: { name: api-v1, port: { number: 8080 } } }
      - path: /v2
        pathType: Prefix
        backend: { service: { name: api-v2, port: { number: 8080 } } }
      - path: /
        pathType: Prefix
        backend: { service: { name: api, port: { number: 8080 } } }
  - host: shop.example.com
    http:
      paths:
      - path: /admin
        pathType: Prefix
        backend: { service: { name: admin, port: { number: 80 } } }
      - path: /
        pathType: Prefix
        backend: { service: { name: web, port: { number: 80 } } }
```

## 7.15 本章小结

- Ingress = L7 入口(nginx/traefik 实现),一个 LB 多个应用
- `pathType`:Exact / Prefix / ImplementationSpecific(K8s 1.22+ 必填)
- TLS:用 cert-manager 自动签发 + 续签
- 灰度发布:weight / header / cookie / IP
- `IngressClass` 支持多 controller 并存
- Gateway API 是下一代,角色分离、多协议
- 调优:keep-alive、worker-processes、SSL session cache
- 故障排查:Controller 日志 + Ingress 状态 + 后端 Service
