# 19. Troubleshooting 排错实战

## 19.1 排错方法论

**核心原则**:
1. **明确问题**:症状是什么?什么时间开始?影响范围?
2. **分层排查**:从外到内 / 从上到下
3. **看事件**:`kubectl describe / get events` 优先
4. **复现**:能复现就能定位
5. **保留现场**:不要急于重启/删除

**分层**:
```text
用户层(curl/浏览器)
    ↓
Ingress / Gateway
    ↓
Service
    ↓
Pod (Network/Ingress/Egress)
    ↓
Container (App/进程)
    ↓
Runtime / OS
    ↓
Node
    ↓
K8s 控制面
```

## 19.2 排错速查表

| 症状 | 第一步 |
|------|--------|
| 服务访问 5xx | `kubectl get pods` + `describe` + `logs` |
| 服务访问超时 | `kubectl get ep` + 网络测试 |
| Pod Pending | `describe pod` 看 Events |
| Pod CrashLoopBackOff | `logs --previous` + `describe` |
| Pod ImagePullBackOff | `describe pod` 看镜像 |
| Pod Evicted | `describe` 看 reason |
| 节点 NotReady | `kubectl describe node` |
| 集群操作慢 | `kubectl get --v=8` |

## 19.3 必备诊断工具

```bash
# 1. kubectl
# 2. kubectx + kubens
# 3. k9s (终端 UI)
# 4. stern (多 pod 日志)
brew install stern

# 5. netshoot(网络调试神器)
kubectl run netshoot --rm -it --image=nicolaka/netshoot --restart=Never -- bash
# 内置: dig, nslookup, ping, curl, nc, tcpdump, iperf, mtr, nmap, ss, netstat, etc.

# 6. kubectl-debug(注入调试容器,K8s 1.23+)
kubectl debug <pod> -it --image=nicolaka/netshoot --target=<container>

# 7. kubectl-trace(基于 BPF)
kubectl trace <pod> --ebpf
```

## 19.4 案例 1:Pod 一直 Pending

```bash
$ kubectl get pod web-xxx
NAME       READY   STATUS    RESTARTS   AGE
web-xxx    0/1     Pending   0          5m
```

**步骤**:

```bash
# 1. 查 events
kubectl describe pod web-xxx
# Events:
#   Type     Reason            Age   From               Message
#   ----     ------            ----  ----               -------
#   Warning  FailedScheduling  5m    default-scheduler  0/3 nodes are available:
#     1 node(s) had taint {dedicated: ml}, that the pod didn't tolerate
#     2 Insufficient cpu

# 2. 看资源
kubectl describe nodes
# Allocatable: cpu=8, memory=32Gi
# Allocated: cpu=7.5, memory=30Gi
# → 资源不够
```

**原因**:
1. 资源不够(Insufficient cpu/memory)
2. 节点污点没容忍(had taint)
3. 节点选择器不匹配(nodeSelector/affinity)
4. PVC 没绑定(volume waiting)

**解决**:
```bash
# 资源问题:加节点 / 减 replicas / 调小 request
# 污点:加 tolerations
# 亲和性:调整 nodeSelector/affinity
# PVC:看 PVC 状态
kubectl get pvc
```

## 19.5 案例 2:Pod CrashLoopBackOff

```bash
$ kubectl get pod web-xxx
NAME       READY   STATUS             RESTARTS   AGE
web-xxx    0/1     CrashLoopBackOff   5          3m
```

**步骤**:

```bash
# 1. 看上次容器日志(关键!)
kubectl logs web-xxx --previous

# 2. 看事件
kubectl describe pod web-xxx
# Events:
#   BackOff: restarting failed container

# 3. 看容器退出原因
kubectl get pod web-xxx -o jsonpath='{.status.containerStatuses[*].state}'
# {"waiting":{"reason":"CrashLoopBackOff"}}
# {"terminated":{"exitCode":1,"reason":"Error","message":"..."}}
```

**常见原因**:
1. **应用启动失败**(配置错、依赖缺失、bug)
2. **readinessProbe 失败**(配错路径/端口/超时)
3. **livenessProbe 失败**(误杀)
4. **资源不够**(OOMKilled)
5. **PVC 挂载失败**

**检查清单**:
```bash
# 配置
kubectl get cm
kubectl get secret
kubectl exec -it <pod> -- env
# 看看 ENV 变量对不对

# 资源
kubectl describe pod <pod> | grep -A5 "Last State"
# Reason: OOMKilled → 内存不够

# Probe
kubectl describe pod <pod> | grep -A20 Liveness
# 失败次数/阈值合理吗

# 依赖
kubectl exec -it <pod> -- nslookup db
kubectl exec -it <pod> -- curl -v http://db:5432
```

## 19.6 案例 3:ImagePullBackOff

```bash
$ kubectl get pod web-xxx
NAME       READY   STATUS             RESTARTS   AGE
web-xxx    0/1     ImagePullBackOff   0          1m
```

**原因**:
1. 镜像名错
2. tag 不存在
3. 私有仓库凭证错
4. 网络不通(无法拉)

**步骤**:
```bash
# 1. describe 看 events
kubectl describe pod web-xxx
# Events:
#   Failed to pull image "myreg.example.com/web:v1":
#     rpc error: code = Unknown desc = Error response from daemon:
#     pull access denied for myreg.example.com/web, repository does not exist
#     or may require 'docker login'

# 2. 测拉取(节点上)
docker pull myreg.example.com/web:v1
# 或
crictl pull myreg.example.com/web:v1

# 3. 凭证
kubectl get secret
# 用 imagePullSecrets

# 4. 仓库地址写对
# 5. tag 写对
```

## 19.7 案例 4:服务访问 502/503/504

```bash
# 用户访问返回 502 Bad Gateway

# 1. 看 Ingress
kubectl get ingress
kubectl describe ingress web
# 看 Address 有没有(没有说明 controller 没加载)

# 2. 看 Ingress Controller 日志
kubectl -n ingress-nginx logs -f deploy/ingress-nginx-controller

# 3. 看 Service
kubectl get svc web
kubectl get ep web
# ENDPOINTS <none> → Service 找不到 Pod

# 4. 看 Pod
kubectl get pods -l app=web
# 全 not ready?
kubectl describe pod -l app=web

# 5. 看 Pod 日志
kubectl logs -l app=web

# 6. 测连通
kubectl run debug --rm -it --image=nicolaka/netshoot --restart=Never -- bash
# 容器内
curl -v http://web:80
```

**502 vs 503 vs 504**:
- **502**:Ingress 收到请求,但后端无响应(Pod 全挂)
- **503**:Service 暂时不可用(无 Endpoints)
- **504**:Ingress 等后端超时(Gateway timeout 默认 60s)

## 19.8 案例 5:Pod 一直 ContainerCreating

```bash
$ kubectl get pod web-xxx
NAME       READY   STATUS              RESTARTS   AGE
web-xxx    0/1     ContainerCreating   0          5m
```

**步骤**:
```bash
kubectl describe pod web-xxx
# Events:
#   FailedMount: MountVolume.SetUp failed for volume "pvc-xxx":
#     mount failed: mount failed: exit status 32
#   Warning  FailedMount  1m  kubelet  Unable to attach or mount volumes

# 常见:
# 1. PVC 还在 Pending
# 2. PV 卷没就绪
# 3. CSI driver 异常
# 4. Secret 不存在(对应 imagePullSecrets)
```

## 19.9 案例 6:节点 NotReady

```bash
$ kubectl get nodes
NAME      STATUS     ROLES    AGE
node1     NotReady   worker   2h
```

**步骤**:
```bash
# 1. describe
kubectl describe node node1
# Conditions:
#   Type             Status    Reason
#   Ready            False     KubeletNotReady
#   MemoryPressure   False
#   DiskPressure     False
#   PIDPressure      False
# Messages:
#   kubelet stopped posting node status.

# 2. 登录节点
ssh node1
systemctl status kubelet
journalctl -u kubelet --since "10 minutes ago"

# 常见:
# 1. kubelet 死
# 2. 节点网络失联
# 3. 磁盘满
# 4. OOM(节点级)
```

## 19.10 案例 7:服务访问慢

```bash
# 用户: "API 响应慢"
```

**步骤**:
```bash
# 1. 在集群内测(排除 Ingress/LB)
kubectl run netshoot --rm -it --image=nicolaka/netshoot --restart=Never -- bash
# curl -w "%{time_total}\n" http://api:8080/healthz

# 2. 测从 Pod 直接连
kubectl exec -it <pod> -- time curl http://api:8080/

# 3. 看 latency(从 Prometheus)
# histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))

# 4. 看资源
kubectl top pods
kubectl top nodes

# 5. 看具体 Pod 慢
kubectl logs -l app=api --tail=100

# 6. 看 trace(Tempo/Jaeger)
# 找慢的 span
```

**常见原因**:
- DB 慢查询
- 下游服务慢
- 资源不足(CPU throttle)
- GC 频繁(Java)
- 锁竞争
- 网络丢包

## 19.11 案例 8:Evicted Pod

```bash
$ kubectl get pod web-xxx
NAME       READY   STATUS    RESTARTS   AGE
web-xxx    0/1     Evicted   0          10m
```

**原因**:
1. 节点磁盘/内存/PID 压力
2. 节点 NotReady(超过 tolerationSeconds)

**步骤**:
```bash
# 1. describe
kubectl describe pod web-xxx
# Status: Evicted
# Reason: The node had condition: [DiskPressure]

# 2. 节点状态
kubectl describe node node1 | grep -A5 Conditions

# 3. 解决
# - 扩节点
# - 调小 request
# - 清理节点磁盘
# - 加 tolerationSeconds
```

## 19.12 案例 9:网络问题

```bash
# Pod A 连 Pod B 失败
```

**步骤**:
```bash
# 1. Pod A 测
kubectl exec -it podA -- curl -v http://podB:8080

# 2. DNS
kubectl exec -it podA -- nslookup podB
# → Server can't find podB: NXDOMAIN
# Service 名字错?namespace 错?

# 3. 网络连通
kubectl exec -it podA -- ping podB-IP
# 通 → 端口问题
# 不通 → CNI 问题

# 4. Service → Pod
kubectl get ep podB
# 空 → selector 不匹配

# 5. NetworkPolicy
kubectl get netpol
# 可能是 NetworkPolicy 阻止了

# 6. 测端口
kubectl exec -it podA -- nc -zv podB 8080
```

## 19.13 案例 10:Job 一直 Running

```bash
$ kubectl get job data-etl
NAME       COMPLETIONS   DURATION   AGE
data-etl   0/1           30m        30m
```

**步骤**:
```bash
# 1. 看 Pod
kubectl get pods -l job-name=data-etl

# 2. 看日志
kubectl logs -l job-name=data-etl -f

# 3. 看资源
kubectl describe job
# Events / Conditions

# 常见:
# 1. Job 卡死 → 看应用日志
# 2. 重试太多 → 调 backoffLimit
# 3. activeDeadlineSeconds 没设 → 永远跑
```

## 19.14 案例 11:证书过期

```bash
# kubelet 报 x509: certificate has expired or is not yet valid
```

**步骤**:
```bash
# 1. 看证书过期时间
kubeadm certs check-expiration

# 2. 续期
kubeadm certs renew all

# 3. 重启组件
systemctl restart kubelet
# 或
kubectl -n kube-system rollout restart deploy

# 4. 强制 1 年内不再过期
# 配合监控
```

## 19.15 案例 12:etcd 异常

```bash
# kubectl get all 报 The connection to the server <ip>:6443 was refused
```

**步骤**:
```bash
# 1. 看 etcd Pod
kubectl get pods -n kube-system | grep etcd

# 2. 看 etcd 日志
kubectl -n kube-system logs etcd-master --tail=200

# 3. 看 etcd 状态
ETCDCTL_API=3 etcdctl \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key \
  endpoint status

# 4. 看磁盘
df -h /var/lib/etcd
```

## 19.16 排错大师:把诊断做成流程

```bash
# 通用诊断脚本
#!/bin/bash
NS=${1:-default}
POD=${2}
echo "=== Pod Info ==="
kubectl get pod $POD -n $NS -o wide
echo "=== Describe ==="
kubectl describe pod $POD -n $NS
echo "=== Events ==="
kubectl get events -n $NS --field-selector involvedObject.name=$POD
echo "=== Logs ==="
kubectl logs $POD -n $NS --tail=100
echo "=== Previous Logs ==="
kubectl logs $POD -n $NS --previous --tail=100
echo "=== Endpoints ==="
kubectl get ep -n $NS
echo "=== Service ==="
kubectl get svc -n $NS
echo "=== Resources ==="
kubectl top pod $POD -n $NS
echo "=== NetworkPolicy ==="
kubectl get netpol -n $NS
```

## 19.17 集群紧急情况

### apiserver 不可用

```bash
# 1. 静态 Pod 模式(直接登录 master)
ssh master
# 静态 Pod 路径
ls /etc/kubernetes/manifests/
# 编辑 kube-apiserver.yaml(不要 edit,会触发重启)
# 用 crictl 看容器
crictl ps | grep apiserver
crictl logs <container-id>

# 2. 如果是证书过期
kubeadm certs renew apiserver
# 重启 kubelet 或 apiserver Pod
```

### 节点全部 NotReady

```bash
# 1. 网络层问题(整个集群瘫痪)
# 2. 共享存储问题(CNI 用到)
# 3. 控制面问题

# 步骤:
# 1. ssh 到一个 master 看日志
# 2. 看 etcd 健康
# 3. 看网络(CNI)
# 4. 节点磁盘/内存
```

## 19.18 监控排错(自监控)

```bash
# Prometheus / Grafana 也可能挂

# 1. 重建监控
helm upgrade kube-prometheus-stack prometheus-community/kube-prometheus-stack -n monitoring

# 2. 抓不到 metrics
# - 看 prometheus 自身状态
# - 看 targets(http://prometheus:9090/targets)
# - 看 Pod log

# 3. Grafana 数据源错
# - 进 Grafana UI 配置
# - 用临时 admin 密码登录
```

## 19.19 专家级排错工具

### 1. krew plugins

```bash
kubectl krew install df-pv          # 看 PV 实际使用
kubectl krew install get-all        # 列出所有资源
kubectl krew install tree           # 看资源层级
kubectl krew install images         # 看镜像
kubectl krew install whoami         # 当前用户
kubectl krew install resource-capacity  # 容量
```

### 2. eBPF 工具(Cilium / Pixie)

```bash
# Cilium 工具
kubectl -n kube-system exec -it cilium-xxx -- cilium status
kubectl -n kube-system exec -it cilium-xxx -- cilium monitor
kubectl -n kube-system exec -it cilium-xxx -- hubble list flows

# Pixie(自动 trace)
kubectl apply -f https://px.dev/install.sh
# 跑 px
px live --pod my-pod
```

### 3. K8s audit

```bash
# 启用 audit(看谁动了什么)
# kube-apiserver
--audit-policy-file=/etc/kubernetes/audit-policy.yaml
--audit-log-path=/var/log/kubernetes/audit/audit.log
```

### 4. 现场保留(诊断时)

```bash
# 抓 dump
kubectl get all -A -o yaml > cluster-state.yaml
kubectl describe nodes > nodes.txt
kubectl get events -A --sort-by=.lastTimestamp > events.txt
kubectl logs -l app=app --previous > app-prev.log
```

## 19.20 实战:SRE 故障复盘模板

```markdown
# 故障复盘:[简述]

## 时间线
- 10:00 收到告警
- 10:05 介入
- 10:15 定位问题
- 10:30 恢复
- 总影响时间:30min

## 影响
- 用户:xxx 用户受影响
- 服务:api/web/db
- 损失:估算 N 元

## 根因
[具体技术原因]

## 时间线详情
- 09:55: 部署新版本
- 10:00: 监控告警错误率 > 5%
- 10:05: 收到 alert,开始处理
- 10:10: 怀疑镜像,回滚
- 10:15: 错误率没降
- 10:20: 看 Pod 日志,发现 DB 连接池满
- 10:25: 调大连接池
- 10:30: 恢复

## 5 Why
1. 为什么 5xx?DB 连接池满
2. 为什么满?新版本有连接泄漏
3. 为什么不告警?监控没覆盖
4. 为什么不立即回滚?新版本监控延迟
5. 为什么没冒烟测试?CI 没加

## 改进
- [ ] 加 DB 连接池监控
- [ ] 加冒烟测试
- [ ] 加快告警(< 1min)
- [ ] 文档化回滚 SOP
```

## 19.21 专家清单

- [ ] kubectl 排错命令熟(20+ 命令)
- [ ] netshoot 镜像常备
- [ ] 关键告警:Pod 重启 / OOM / 节点 / 错误率
- [ ] 排错流程化:症状 → 描述 → 日志 → 网络 → 资源
- [ ] 复盘模板(写进 wiki)
- [ ] 监控自监控(Prometheus 死了能发现)
- [ ] 应急手册(常见故障的处理 SOP)
- [ ] 现场保留(诊断时先抓 dump)
- [ ] 静默/告警分组(避免告警疲劳)
- [ ] 定期演练(故障演练)
- [ ] audit log(谁动了什么)
- [ ] 集成 BPF / eBPF 工具(高级排错)

## 19.22 本章小结

- 排错方法论:症状 → 描述 → 日志 → 网络 → 资源
- 必备工具:kubectl + k9s + stern + netshoot
- 12 大常见故障模式:
  1. Pending / CrashLoopBackOff / ImagePullBackOff
  2. ContainerCreating / Evicted
  3. 节点 NotReady / 5xx / 慢
  4. 网络 / Job 卡 / 证书过期
  5. etcd 异常
- 自监控是关键(Prometheus 也要被监控)
- 高级工具:eBPF / Cilium Hubble / Pixie
- 故障复盘 5 Why + 改进措施
- 应急 SOP + 演练 + 告警分级
