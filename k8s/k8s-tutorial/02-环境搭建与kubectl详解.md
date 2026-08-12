# 02. 环境搭建与 kubectl 详解

## 2.1 集群搭建方案

### 选型决策树

```text
学习/本地 → minikube (单节点,功能全)
        → kind (Docker-in-Docker,多节点测试)
        → k3d (轻量级 k3s)

边缘/IoT → k3s / k3os / k0s

生产自建 → kubeadm (官方,主流)
        → kubespray (Ansible,更省事)
        → Rancher (RKE/RKE2)

生产托管 → EKS / AKS / GKE / ACK(国内)
        → OpenShift (企业)

测试/CI → kind (CI 首选,启动 10s)
        → k3d
```

## 2.2 minikube 快速上手

```bash
# 安装(macOS)
brew install minikube

# 启动(自动选 driver)
minikube start --driver=docker --cpus=4 --memory=8g

# 启用常用插件
minikube addons enable dashboard
minikube addons enable ingress
minikube addons enable metrics-server

# 进入节点
minikube ssh

# 状态
minikube status

# 暂停/恢复
minikube pause
minikube unpause

# 停止/删除
minikube stop
minikube delete
```

## 2.3 kind 多节点集群

```bash
brew install kind

# 单节点
kind create cluster

# 多节点(配置文件)
cat > kind-config.yaml <<EOF
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
- role: control-plane
- role: control-plane
- role: control-plane
- role: worker
- role: worker
EOF

kind create cluster --config kind-config.yaml --name prod

# 加载本地镜像(无需 push 到 registry)
kind load docker-image myapp:v1 --name prod

# 暴露端口
docker run -d --name kind-proxy ... # 端口映射到主机
```

## 2.4 kubeadm 自建生产集群(概览)

```bash
# 1. 所有节点:安装运行时
# containerd
apt install -y containerd
containerd config default | tee /etc/containerd/config.toml
# 改 SystemdCgroup = true
systemctl restart containerd

# 2. 所有节点:安装 kubeadm/kubelet/kubectl
apt install -y kubelet kubeadm kubectl
apt-mark hold kubelet kubeadm kubectl

# 3. 主节点:初始化
kubeadm init --control-plane-endpoint=lb.example.com:6443 \
  --pod-network-cidr=10.244.0.0/16 \
  --upload-certs

# 4. 配置 kubeconfig
mkdir -p $HOME/.kube
sudo cp -f /etc/kubernetes/admin.conf $HOME/.kube/config

# 5. 安装 CNI(任选一个)
kubectl apply -f https://raw.githubusercontent.com/projectcalico/calico/v3.27.0/manifests/calico.yaml
# 或者
kubectl apply -f https://raw.githubusercontent.com/flannel-io/flannel/master/Documentation/kube-flannel.yml

# 6. worker 加入
kubeadm join lb.example.com:6443 --token xxx --discovery-token-ca-cert-hash sha256:yyy
```

## 2.5 kubectl 安装

```bash
# macOS
brew install kubectl

# Linux
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
chmod +x kubectl && sudo mv kubectl /usr/local/bin/

# 验证
kubectl version --client
kubectl cluster-info
```

### 多集群 kubeconfig

```bash
# kubeconfig 路径
~/.kube/config

# 多集群示例
apiVersion: v1
kind: Config
clusters:
- name: prod
  cluster:
    server: https://prod.example.com:6443
    certificate-authority: /path/to/ca.crt
- name: staging
  cluster:
    server: https://staging.example.com:6443
contexts:
- name: prod-ctx
  context: { cluster: prod, user: prod-admin, namespace: app }
- name: staging-ctx
  context: { cluster: staging, user: staging-admin }
current-context: prod-ctx
users:
- name: prod-admin
  user: { token: ... }
```

推荐用 `kubectx` + `kubens` 切换:

```bash
brew install kubectx

kubectx                    # 列出所有 context
kubectx prod-ctx           # 切换
kubens kube-system         # 切换 namespace
```

## 2.6 kubectl 语法规则

```bash
kubectl [command] [TYPE] [NAME] [flags]

command: get / create / apply / delete / describe / edit / logs / exec / port-forward ...
TYPE:    pod / deploy / svc / ing / cm / secret / pv / pvc ...(可省略复数,单复数都行)
NAME:    资源名
flags:   -n / -A / -o / -l / -f / --dry-run
```

**资源简写**:

| 完整 | 简写 | 完整 | 简写 |
|------|------|------|------|
| pods | po | services | svc |
| deployments | deploy | endpoints | ep |
| replicasets | rs | ingresses | ing |
| statefulsets | sts | configmaps | cm |
| daemonsets | ds | namespaces | ns |
| jobs |  | persistentvolumes | pv |
| cronjobs | cj | persistentvolumeclaims | pvc |
| nodes | no | serviceaccounts | sa |
| events | ev |  |  |

## 2.7 必须会的 30 个命令

### 信息查看

```bash
# 集群
kubectl cluster-info
kubectl get componentstatuses
kubectl version

# 节点
kubectl get nodes -o wide
kubectl describe node <name>
kubectl top node                     # 资源使用,需 metrics-server

# 资源
kubectl get all -A                   # 所有常见资源
kubectl get pods -A -o wide
kubectl get pod <name> -o yaml
kubectl get pod <name> -o jsonpath='{.status.podIP}'
kubectl get pods --sort-by=.status.containerStatuses[0].restartCount

# 事件(排错神器)
kubectl get events --sort-by=.lastTimestamp -A
kubectl get events --field-selector type=Warning -A
```

### 资源操作

```bash
# 创建
kubectl apply -f app.yaml
kubectl apply -f ./dir/             # 应用整个目录
kubectl apply -k ./kustomize/        # Kustomize

# 预览
kubectl diff -f app.yaml
kubectl apply -f app.yaml --dry-run=client

# 编辑
kubectl edit deploy nginx           # 改完自动 apply
kubectl patch deploy nginx -p '{"spec":{"replicas":5}}'
kubectl set image deploy/nginx nginx=nginx:1.26

# 扩缩
kubectl scale deploy nginx --replicas=5

# 滚动升级
kubectl rollout status deploy/nginx
kubectl rollout history deploy/nginx
kubectl rollout undo deploy/nginx    # 回滚到上一版
kubectl rollout undo deploy/nginx --to-revision=2

# 删除
kubectl delete -f app.yaml
kubectl delete pod nginx --grace-period=0 --force
```

### 调试

```bash
# 日志
kubectl logs <pod>
kubectl logs <pod> -c <container>    # 多容器
kubectl logs <pod> --previous        # 上次容器(崩了之后)
kubectl logs -f <pod> --tail=100     # 跟踪
kubectl logs -l app=nginx            # 所有匹配 pod
# stern 更强大
stern -l app=nginx

# 进入
kubectl exec -it <pod> -- /bin/sh
kubectl exec <pod> -- ls /            # 一次性执行
kubectl cp <pod>:/path ./local

# 端口转发
kubectl port-forward <pod> 8080:80
kubectl port-forward svc/nginx 8080:80
kubectl port-forward deploy/nginx 8080:80

# 临时调试容器
kubectl run debug --rm -it --image=alpine --restart=Never -- sh
kubectl debug <pod> -it --image=nicolaka/netshoot --target=<container>  # 1.23+
```

## 2.8 输出格式

```bash
-o wide              # 额外列(NODE, IP)
-o yaml              # 完整 YAML
-o json              # 完整 JSON
-o jsonpath='{.spec.nodeName}'  # 自定义字段
-o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{end}'  # 列表
-o custom-columns=NAME:.metadata.name,STATUS:.status.phase
-o name              # 只输出名字
```

### 实例:统计所有节点 pod 数量

```bash
kubectl get pods -A -o jsonpath='{range .items[*]}{.spec.nodeName}{"\n"}{end}' | sort | uniq -c
```

### 实例:获取所有 service 的 ClusterIP

```bash
kubectl get svc -A -o custom-columns=NAMESPACE:.metadata.namespace,NAME:.metadata.name,IP:.spec.clusterIP
```

## 2.9 Label & 字段选择器

```bash
# label 选择
kubectl get pods -l app=nginx
kubectl get pods -l 'app in (nginx,redis)'
kubectl get pods -l 'app=nginx,env=prod'
kubectl get pods -l '!app'            # 没有 app label

# 字段选择
kubectl get pods --field-selector=status.phase=Running
kubectl get events --field-selector type=Warning,involvedObject.kind=Pod
kubectl get pods -A --field-selector=status.phase!=Running
```

## 2.10 必备插件

```bash
# 插件管理(krew)
brew install krew

# 必备插件
kubectl krew install ctx ns
kubectl krew install tree
kubectl krew install neat
kubectl krew install stern
kubectl krew install images
kubectl krew install outdated
kubectl krew install get-all
kubectl krew install whoami
kubectl krew install resource-capacity

# 经典三方插件
brew install derailed/k9s/k9s       # 终端 UI
brew install stern/tap/stern        # 多 pod 日志
brew install kubectx                # 上下文切换
brew install fluxcd/tap/flux        # GitOps
```

### k9s 简介

```bash
k9s
# 快捷键:
# :po     切到 pod 视图
# /      过滤
# d      describe
# l      logs
# e      exec
# y      yaml
# ctrl-d delete
# :q     退出
```

## 2.11 自动补全与 alias

```bash
# bash 补全
source <(kubectl completion bash)
echo "source <(kubectl completion bash)" >> ~/.bashrc

# zsh 补全
source <(kubectl completion zsh)

# alias(强烈推荐)
alias k=kubectl
alias kg='kubectl get'
alias kgp='kubectl get pods'
alias kgs='kubectl get svc'
alias kga='kubectl get all'
alias kd='kubectl describe'
alias kl='kubectl logs'
alias kex='kubectl exec -it'
alias kaf='kubectl apply -f'
alias kdf='kubectl delete -f'
alias ktx='kubectx'
alias kns='kubens'
```

## 2.12 kubectl 内部机制

理解 kubectl 工作原理,出问题才能快速定位:

```text
kubectl 命令
    ↓
解析命令行参数 / kubeconfig → context
    ↓
构造 HTTP 请求 → kube-apiserver
    ↓
apiserver 认证(authn) → 鉴权(authz) → 准入(admission) → 持久化(etcd)
    ↓
返回响应
    ↓
kubectl 解析 + 格式化输出
```

**关键点**:
- 所有命令最终都是 HTTP 请求
- 可以用 `--v=8` 看详细日志
- 可以用 curl 模拟(debug 利器)

```bash
# 查看真实 HTTP 请求
kubectl get pod nginx -v=8

# 模拟
APISERVER=https://$(kubectl config view --minify -o jsonpath='{.clusters[0].cluster.server}')
TOKEN=$(kubectl get secret $(kubectl get sa default -o jsonpath='{.secrets[0].name}') -o jsonpath='{.data.token}' | base64 -d)
curl -k -H "Authorization: Bearer $TOKEN" $APISERVER/api/v1/namespaces/default/pods
```

## 2.13 认证与权限快速检查

```bash
# 我是谁?
kubectl auth whoami

# 我能做什么?
kubectl auth can-i create pods
kubectl auth can-i create pods --as=system:serviceaccount:default:my-sa
kubectl auth can-i list deployments -n kube-system

# 所有权限清单
kubectl auth can-i --list -n default
```

## 2.14 kubectl 性能调优

集群大了 `kubectl get pods -A` 会慢,优化:

```bash
# 1. 加宽 page size
kubectl get pods -A --chunk-size=500

# 2. 用 label 过滤减少数据
kubectl get pods -A -l app=nginx -o wide

# 3. 客户端 cache(kubectx 自带)
# 4. 减少输出(-o jsonpath 比 -o yaml 快)
```

服务端优化:调整 `--request-timeout` / apiserver `--max-requests-inflight` / etcd 性能。

## 2.15 专家技巧

### 快速批量操作

```bash
# 删除所有 Evicted pod
kubectl get pods -A --field-selector=status.phase=Failed -o json | \
  kubectl delete -f -

# 重启所有匹配 deployment(通过 patch)
kubectl patch deploy <name> -p '{"spec":{"template":{"metadata":{"annotations":{"date":"'$(date +%s)'"}}}}}}'

# 一键清空 namespace
kubectl delete ns test
# 卡住时强制清(常见于 admission webhook)
kubectl get ns test -o json | \
  jq '.spec.finalizers = []' | \
  kubectl replace --raw "/api/v1/namespaces/test/finalize" -f -
```

### 用 jsonpath 提取关键信息

```bash
# 所有 pod 的镜像
kubectl get pods -A -o jsonpath='{range .items[*]}{.spec.containers[*].image}{"\n"}{end}' | sort -u

# 所有 node 标签
kubectl get nodes --show-labels

# 节点上 pod 数量
kubectl get pods -A -o jsonpath='{range .items[*]}{.spec.nodeName}{"\n"}{end}' | sort | uniq -c | sort -rn
```

### 在线 API 文档

```bash
# 列出所有 CRD
kubectl get crds

# 看某个 CRD 的字段
kubectl explain pod.spec.containers
kubectl explain deployment.spec.strategy
# 递归到叶子
kubectl explain deployment.spec --recursive
```

## 2.16 本章小结

- 本地学习:`minikube` 或 `kind`;生产托管:EKS/AKS/GKE;自建:`kubeadm`
- kubectl 是日常核心,**30+ 命令必须熟**
- 输出格式 `-o yaml/json/jsonpath/custom-columns` 用好能省大量时间
- label + field-selector 是过滤利器
- krew + k9s + stern + kubectx 是必备插件
- 所有命令底层都是 HTTPS 请求,排错时用 `-v=8`
