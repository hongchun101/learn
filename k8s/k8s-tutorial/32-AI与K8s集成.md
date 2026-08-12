# 32. AI 与 K8s 集成(K8sGPT / AIOps / AI 调度)

## 32.1 AI 浪潮下的 K8s

**AIOps(AI for IT Operations)** 在 K8s 领域 = 用 AI/LLM 辅助运维、诊断、调度。

```text
传统运维:
  工程师: 7x24 oncall
  工具: 监控 + 告警 + Runbook
  痛点: 凌晨 3 点, 告警疲劳, 排错慢

AIOps:
  AI 自动诊断 + 总结 + 建议
  工程师: 决策 + 修复
  价值: 减少 80% 排错时间
```

## 32.2 K8sGPT:AI 诊断 SRE 副驾驶

**K8sGPT** = 用 LLM 分析 K8s 资源,**自动诊断问题**并给出修复建议。

### 安装

```bash
# 1. Krew 装插件
kubectl krew install k8sgpt

# 2. 配 LLM provider
export OPENAI_API_KEY=sk-...

# 3. 扫描
k8sgpt analyze

# 输出
# 0: Pod default/web-7d4f8b9c-xyz
# - Error: Backoff restarting failed container
#   Explanation: 容器反复崩溃, 可能因 OOM 或启动错误
#   Solution: 检查 kubectl logs, 增加 memory limit
```

### 工作原理

```text
SRE/Dev
   ↓ kubectl + k8sgpt
K8sGPT Controller
   ↓ 拉集群状态
   ↓ 发送到 LLM(OpenAI/Claude/本地)
LLM 分析
   ↓ 返回诊断 + 建议
   ↓ 显示给用户
```

### Analyzer 插件

```bash
# 内置 analyzer
k8sgpt filters list
# - Pod
# - Deployment
# - StatefulSet
# - Service
# - NetworkPolicy
# - HPA
# - PVC
# - Node
# ...

# 自定义 filter
k8sgpt filters add Node
k8sgpt filters remove Service
```

### 集成到 Slack

```bash
# 启动 K8sGPT controller
k8sgpt serve

# 配合 slack bot
# 当 K8sGPT 发现问题时,自动通知 Slack
```

### K8sGPT Operator 模式

```yaml
apiVersion: core.k8sgpt.ai/v1alpha1
kind: K8sGPT
metadata:
  name: k8sgpt-operator
  namespace: k8sgpt-operator-system
spec:
  ai:
    enabled: true
    model: gpt-4
    backend: openai
    secret:
      name: k8sgpt-secret
      key: openai-api-key
  analyzers:
  - pod
  - pvc
  - service
  - deployment
  - hpa
  - statefulset
  - networkPolicy
  result:
    backend: redis
```

## 32.3 kubectl-ai:终端 AI 助手

```bash
# 安装
brew tap sozercan/kubectl-ai https://github.com/sozercan/kubectl-ai
brew install kubectl-ai

# 使用
kubectl-ai "找出命名空间 prod 中所有重启超过 5 次的 Pod"
kubectl-ai "为什么 web-7d4f8b9c-xyz 一直 CrashLoopBackOff"
kubectl-ai "把 prod namespace 所有 Pod 的内存 limit 加 20%"

# 生成 manifest
kubectl-ai "写一个 Deployment 部署 nginx 3 副本,配 HPA"
```

## 32.4 BotKube:Slack/Teams K8s 助手

```bash
# Helm 安装
helm repo add botkube https://charts.botkube.io
helm install botkube botkube/botkube \
  --namespace botkube --create-namespace \
  --set notifications.slack.enabled=true \
  --set notifications.slack.channel=alerts \
  --set config.executors.k8scli.defaultNamespace=default
```

```text
Slack 操作:
  @BotKube kubectl get pods
  @BotKube kubectl describe deployment web
  @BotKube k8sgpt analyze  # 调用 K8sGPT
```

## 32.5 自然语言运维(LLM Operator)

**LLM Operator** = 用 LLM 解读用户意图 + 执行 kubectl。

```python
from langchain.agents import create_k8s_agent
from langchain.llms import OpenAI

llm = OpenAI(model="gpt-4")
agent = create_k8s_agent(llm)

# 问问题
agent.run("查 prod namespace 错误日志")
agent.run("找 pod 中最近 1 小时重启的")
agent.run("分析为什么 web pod 启动失败")
```

## 32.6 AI 辅助故障诊断

### 实战:综合排错机器人

```python
# 整合 K8sGPT + Grafana + Slack
from openai import OpenAI
import requests

def diagnose_alert(alert_name, namespace):
    # 1. 抓集群状态
    pods = subprocess.getoutput(f"kubectl get pods -n {namespace} -o yaml")
    events = subprocess.getoutput(f"kubectl get events -n {namespace}")
    logs = subprocess.getoutput(f"kubectl logs -n {namespace} -l app={alert_name} --tail=100")
    
    # 2. 调 LLM 诊断
    client = OpenAI()
    response = client.chat.completions.create(
        model="gpt-4",
        messages=[
            {"role": "system", "content": "你是 K8s 专家,分析告警"},
            {"role": "user", "content": f"""
                Pod 状态: {pods}
                事件: {events}
                日志: {logs}
                
                分析根因,给出修复步骤。
            """}
        ]
    )
    
    diagnosis = response.choices[0].message.content
    
    # 3. 发到 Slack
    requests.post(SLACK_WEBHOOK, json={"text": diagnosis})
    
    return diagnosis
```

## 32.7 AI 驱动的弹性伸缩

### KEDA + LLM 预测

```yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata: { name: ai-forecast }
spec:
  scaleTargetRef:
    name: web
  triggers:
  - type: prometheus
    metadata:
      serverAddress: http://prometheus:9090
      query: |
        predict_linear(
          http_requests_total[1h],
          3600  # 预测 1 小时后
        )
      threshold: "1000"
```

**AI 预测扩容**:
```text
基于历史流量,预测未来负载,提前扩容
传统 HPA: 流量上升 → 扩容(滞后)
AI 预测: 预测上升 → 提前扩容(零滞后)
```

### 自定义 AI 扩缩

```python
# AI 预测服务
import mlflow.sklearn

def predict_load():
    model = mlflow.sklearn.load_model("models:/load-forecast/production")
    history = get_metrics_history()
    prediction = model.predict(history)
    return prediction

# 暴露给 KEDA 的 scaler
# keda external scaler 模式
```

## 32.8 AI 资源调度(Kueue + ML)

**Kueue** = 批处理作业的队列管理,支持**公平调度**和**资源配额**。

```yaml
apiVersion: kueue.x-k8s.io/v1alpha1
kind: ResourceFlavor
metadata: { name: gpu-a100 }
spec:
  nodeLabels:
    - key: nvidia.com/gpu.product
      value: A100
```

### AI 训练任务的资源感知调度

```yaml
apiVersion: kueue.x-k8s.io/v1alpha1
kind: LocalQueue
metadata:
  namespace: ml-team
  name: ml-queue
spec:
  clusterQueue: ml-cluster-queue
---
apiVersion: batch/v1
kind: Job
metadata:
  name: train-llm
  namespace: ml-team
  labels:
    kueue.x-k8s.io/queue-name: ml-queue
spec:
  template:
    spec:
      containers:
      - name: trainer
        resources:
          limits:
            nvidia.com/gpu: 8
            cpu: 64
            memory: 512Gi
```

## 32.9 GPU 调度与共享

### GPU Operator

```bash
helm install nvidia-gpu-operator nvidia/gpu-operator --namespace gpu-operator --create-namespace
```

```yaml
apiVersion: v1
kind: Pod
metadata: { name: gpu-pod }
spec:
  containers:
  - name: trainer
    resources:
      limits:
        nvidia.com/gpu: 2  # 用 2 块 GPU
```

### MIG(Multi-Instance GPU)

```bash
# 把 1 张 A100 切成 7 个独立实例
nvidia-smi mig -cgi 0,9
```

```yaml
# Pod 用 MIG slice
resources:
  limits:
    nvidia.com/mig-1g.5gb: 1
```

### Time-Slicing(GPU 共享)

```bash
# nvidia-device-plugin 配置
config:
  sharing:
    timeSlicing:
      renameByDefault: true
      resources:
      - name: nvidia.com/gpu
        replicas: 4  # 1 块 GPU 共享给 4 个 Pod
```

## 32.10 Kubeflow(ML 平台)

**Kubeflow** = K8s 上的机器学习平台。

```bash
# 安装
kubectl apply -k "github.com/kubeflow/manifests?ref=v1.9-branch"
```

**组件**:
- **Notebook**:JupyterHub
- **Pipelines**:ML 工作流(Argo Workflows)
- **Training**:Operator(TF/PyTorch/XGBoost)
- **Serving**:KServe/Seldon
- **Katib**:AutoML 超参调优
- **Metadata**:实验追踪

### Kubeflow Pipelines(ML 工作流)

```python
import kfp
from kfp import dsl

@dsl.component
def preprocess():
    return dsl.ContainerOp(
        name='preprocess',
        image='myorg/preprocess:v1',
        command=['python', 'preprocess.py'],
    )

@dsl.component
def train():
    return dsl.ContainerOp(
        name='train',
        image='myorg/train:v1',
        command=['python', 'train.py'],
        resource_requests={'cpu': '4', 'memory': '16Gi', 'nvidia.com/gpu': '1'}
    )

@dsl.pipeline
def ml_pipeline():
    p = preprocess()
    t = train().after(p)
```

## 32.11 vLLM/LLM 推理服务

```yaml
apiVersion: serving.kserve.io/v1beta1
kind: InferenceService
metadata: { name: llm-server }
spec:
  predictor:
    model:
      modelFormat:
        name: vllm
      runtime: vllm
      storage:
        path: s3://models/llama-3-70b
      resources:
        limits:
          nvidia.com/gpu: 2
    containerConcurrency: 100
```

**优势**:
- 动态扩缩(GPU 节点)
- 蓝绿/金丝雀(KServe)
- 自动批处理
- 流量管理

## 32.12 智能告警去噪

### 传统告警疲劳

```text
凌晨 3 点:
  - 3 个告警
  - 1 个真问题
  - 2 个噪音(开发环境)

AIOps 方案:
  - 告警去重(同源合并)
  - 告警分级(真问题 vs 噪音)
  - 上下文关联(同时段相关告警)
```

### AlertManager + ML 评分

```python
# AI 评分告警
def score_alert(alert):
    features = {
        "severity": alert.severity,
        "frequency": count_recent(alert.name),
        "correlated": find_correlated(alert),
        "blast_radius": calc_impact(alert),
        "time_of_day": alert.timestamp.hour
    }
    score = ml_model.predict(features)  # 0-1
    return score
```

## 32.13 AI 安全(检测异常)

### Falco + ML 异常检测

```yaml
# Falco rule
- rule: Anomalous Process in Container
  expr: |
    evt.type=execve and container and not proc.name in (allowed_processes)
  output: "异常进程: %proc.name in container %container.name"
  priority: WARNING
```

**AI 增强**:
- 训练"正常进程"模型
- 偏离 = 异常 → 告警
- 比白名单更灵活

## 32.14 MLOps 完整链路

```mermaid
graph LR
    A[数据] --> B[训练(Kubeflow)]
    B --> C[模型注册(MLflow)]
    C --> D[部署(KServe)]
    D --> E[监控(Evidently)]
    E -->|数据漂移| F[再训练]
    F --> B
```

## 32.15 AI 平台 K8s 资源规划

```text
1 节点 (8 A100):
  - A100 80GB × 8
  - 192 vCPU
  - 1.5 TiB RAM
  - 3.2 Tbps NVLink

用途分配:
  - 训练 80%
  - 推理 15%
  - 开发 5%
```

### GPU 共享策略

```text
开发/Jupyter: MIG 1g.5gb (1/7 卡片)
推理(低 QPS): MIG 3g.20gb
推理(中 QPS): 1 整卡
训练: 多卡 + NVLink
HPC/科学计算: 整节点
```

## 32.16 LLM Operator 实战

**LLM Operator**(OpenLLMetry) = 自动部署 LLM 推理服务。

```yaml
apiVersion: llmoperator.io/v1alpha1
kind: LLM
metadata: { name: chatbot }
spec:
  model:
    name: llama-3-70b-instruct
    engine: vllm
  replicas: 2
  resources:
    gpu: 2  # 每副本 2 卡
  autoscaling:
    minReplicas: 2
    maxReplicas: 10
    targetGPUUtilization: 70
```

## 32.17 实战案例

### 案例 1:K8sGPT 自动诊断 CI 失败

```text
场景: GitLab CI 中 K8s 部署失败
集成:
  - GitLab CI → K8sGPT analyze → 输出报告 → 注释到 PR

效果:
  错误从 "Pod Pending" → 自动给出 "PVC 一直 Pending, 可能缺 StorageClass"
  工程师 1 分钟修复,而不是 30 分钟排查
```

### 案例 2:AI 预测扩容应对大促

```text
场景: 双 11 流量预测
传统: HPA 看 CPU 滞后扩容 → 流量过载
AI 方案:
  1. 训练预测模型(历史 1 年数据)
  2. 预测明天流量曲线
  3. 提前 2 小时扩到目标副本
  4. 流量来时已就绪,无延迟

效果: 零超载,资源浪费减少 20%
```

## 32.18 专家清单

- [ ] 部署 K8sGPT,接入 Slack
- [ ] 用 kubectl-ai 提升排错效率
- [ ] 部署 GPU Operator,跑通 GPU 工作负载
- [ ] 部署 Kubeflow 或 KServe
- [ ] 用 Kueue 管理批处理
- [ ] 配置 vLLM 推理服务
- [ ] AI 预测扩容(Prometheus + predict_linear)
- [ ] 智能告警去噪
- [ ] GPU 共享(MIG/Time-Slicing)
- [ ] MLOps 完整链路打通

## 32.19 本章小结

- **K8sGPT**:AI 诊断 SRE 副驾驶,大幅提升排错效率
- **kubectl-ai/BotKube**:终端/Slack AI 助手
- **GPU Operator + MIG/Time-Slicing**:高效利用昂贵 GPU
- **Kubeflow/KServe**:ML 平台
- **Kueue**:批处理/ML 任务队列管理
- **AI 预测扩容**:提前应对流量,消除滞后
- **vLLM**:高性能 LLM 推理
- 实战:从 AI 诊断 → AI 调度 → AI 优化全链路
