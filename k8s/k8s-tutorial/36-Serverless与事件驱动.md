# 36. Serverless 与事件驱动架构

## 36.1 Serverless on K8s

**Serverless** = 应用不运行时**不占资源**,按需启动。

```text
传统:    Deployment + 3 副本(永远在跑) = 24/7 计费
Serverless: 0 副本(无人调用) → 调用 → 启动(0-3s) → 处理 → 0
```

**K8s 上的 Serverless 方案**:
- **Knative Serving** - 工业级,基于 K8s
- **KEDA + HTTP scale-to-zero** - 轻量
- **OpenFaaS** - 简单函数
- **Fission** - 快速冷启动(Wasm)
- **Nuclio** - 实时
- **Kubeless** - 已被 KEDA 取代

## 36.2 Knative Serving

**Knative** = Kubernetes 之上,提供 **Serving**(请求驱动)+ **Eventing**(事件驱动)。

### 安装

```bash
# 1. install CRDs
kubectl apply -f https://github.com/knative/serving/releases/latest/download/serving-crds.yaml

# 2. install core
kubectl apply -f https://github.com/knative/serving/releases/latest/download/serving-core.yaml

# 3. install Kourier(默认 ingress)
kubectl apply -f https://github.com/knative/net-kourier/releases/latest/download/kourier.yaml

# 4. configure DNS(magic DNS / nip.io / real domain)
kubectl patch configmap -n knative-serving config-domain -p '{"data":{"example.com":""}}'
# 然后 *.example.com 都能解析
```

### Knative Service(声明式)

```yaml
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: hello
  namespace: default
spec:
  template:
    metadata:
      annotations:
        autoscaling.knative.dev/min-scale: "0"      # 缩到 0
        autoscaling.knative.dev/max-scale: "10"
        autoscaling.knative.dev/target: "100"      # 并发目标
    spec:
      containers:
      - image: gcr.io/knative-samples/helloworld-go
        ports:
        - containerPort: 8080
        env:
        - name: TARGET
          value: "World"
        resources:
          requests:
            cpu: 100m
            memory: 128Mi
```

```bash
# 部署
kubectl apply -f service.yaml

# 访问 URL
kubectl get ksvc hello
# NAME    URL                              LATESTCREATED   LATESTREADY   READY   REASON
# hello   http://hello.default.example.com hello-00001     hello-00001   True

# 调用
curl http://hello.default.example.com
```

### Knative 流量切分

```yaml
apiVersion: serving.knative.dev/v1
kind: Service
metadata: { name: web }
spec:
  template:
    metadata: { name: web-v2 }
    spec:
      containers:
      - image: web:v2
  traffic:
  - revisionName: web-v1
    percent: 80
  - revisionName: web-v2
    percent: 20                       # 灰度
```

### 冷启动优化

```yaml
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  annotations:
    autoscaling.knative.dev/min-scale: "1"   # 至少 1,避免冷启动
spec:
  template:
    spec:
      containerConcurrency: 10
      timeoutSeconds: 300
      containers:
      - image: ...
```

### Knative 自定义域名

```yaml
# 在 Service 上
apiVersion: serving.knative.dev/v1
kind: Service
metadata: { name: myapp }
spec:
  urlTemplate: "{route}.{namespace}.apps.example.com"
```

## 36.3 KEDA 事件驱动

KEDA 已经讲过(13 章),这里深入。

### 40+ 个 Scaler

```text
数据库/消息:
  - Kafka
  - RabbitMQ
  - Pulsar
  - NATS
  - Redis Streams
  - AWS SQS
  - GCP PubSub
  - Azure Service Bus
  
云服务:
  - AWS CloudWatch
  - AWS DynamoDB
  - AWS Kinesis
  - Azure Event Hub
  - GCP Storage

HTTP:
  - HTTP requests(用 prometheus query)
  - Cron(定时)
  
CPU/Memory:
  - CPU
  - Memory
  - Prometheus
```

### KEDA + Knative(替代 Queue)

```yaml
# 用 KEDA HTTP Add-on
# 不需 Knative,直接 KEDA HTTP scaler
apiVersion: keda.sh/v1alpha1
kind: HTTPScaledObject
metadata: { name: web-http }
spec:
  scaleTargetRef:
    name: web                            # Deployment
  hosts:
  - name: example.com
    pathPrefixes: [/api]
  scalingMetric:
    name: requestRate
    backend: prometheus
    threshold: "100"
  replicas:
    min: 0                                # 缩到 0
    max: 50
```

### 实战:基于 RabbitMQ 队列的 Worker

```yaml
apiVersion: keda.sh/v1alpha1
kind: TriggerAuthentication
metadata: { name: rabbit-auth, namespace: default }
spec:
  secretTargetRef:
  - parameter: host
    name: rabbitmq-secret
    key: host
  - parameter: username
    name: rabbitmq-secret
    key: username
  - parameter: password
    name: rabbitmq-secret
    key: password
---
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata: { name: worker-scaler }
spec:
  scaleTargetRef:
    name: worker
  pollingInterval: 10
  cooldownPeriod: 60
  minReplicaCount: 0                       # 队列空时 0 副本
  maxReplicaCount: 100
  triggers:
  - type: rabbitmq
    metadata:
      protocol: amqp
      queueName: tasks
      mode: QueueLength
      value: "30"                          # 每 30 条消息 1 个 worker
    authenticationRef:
      name: rabbit-auth
```

### KEDA + Cron(定时任务)

```yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata: { name: nightly-cron }
spec:
  scaleTargetRef:
    name: batch-job
  minReplicaCount: 0
  maxReplicaCount: 1
  triggers:
  - type: cron
    metadata:
      timezone: Asia/Shanghai
      start: 0 2 * * *                     # 2:00 启动
      end: 0 4 * * *                       # 4:00 关闭
      desiredReplicas: "1"
```

### KEDA External Scaler(自定义)

```go
// 自定义 Scaler:基于 ML 预测
type PredictionScaler struct{}

func (s *PredictionScaler) GetMetrics(ctx context.Context, 
    metricName string, metricType v1alpha1.MetricType) ([]v1alpha1.Metric, error) {
    // 调 ML 服务,返回预测负载
    load := predictLoad()  // AI 预测
    return []v1alpha1.Metric{{
        MetricName: metricName,
        MetricValue: load,
    }}, nil
}
```

## 36.4 Argo Events 事件驱动

**Argo Events** = K8s 原生事件总线,触发 Workflow。

### 组件

```text
EventSource       监听外部源(GitHub/S3/Webhook/Kafka)
   ↓
EventBus          事件总线(NATS)
   ↓
Sensor             根据事件触发 trigger(Workflow/Function)
```

### 实战:GitHub Webhook 触发 CI

```yaml
# 1. EventBus
apiVersion: argoproj.io/v1alpha1
kind: EventBus
metadata: { name: default, namespace: argo-events }
spec: {}
---
# 2. EventSource(GitHub webhook)
apiVersion: argoproj.io/v1alpha1
kind: EventSource
metadata: { name: github, namespace: argo-events }
spec:
  service:
    ports:
    - port: 12000
      targetPort: 12000
  github:
    example:
      owner: myorg
      repository: myrepo
      events:
      - push
      webhook:
        endpoint: /push
        port: "12000"
        method: POST
      # secretToken 从 secret 引用
---
# 3. Sensor(触发 Workflow)
apiVersion: argoproj.io/v1alpha1
kind: Sensor
metadata: { name: ci-sensor, namespace: argo-events }
spec:
  template:
    serviceAccountName: operate-workflow
  dependencies:
  - name: push-event
    eventSourceName: github
    eventName: example
    filters:
      data:
      - path: body.action
        type: string
        comparator: "="
        value:
        - "opened"
  triggers:
  - template:
      name: run-build
      k8s:
        operation: create
        source:
          resource:
            apiVersion: argoproj.io/v1alpha1
            kind: Workflow
            metadata:
              generateName: build-
            spec:
              entrypoint: build
              templates:
              - name: build
                container:
                  image: builder:v1
                  command: [sh, -c, "echo 'Build from PR'"]
```

### S3 EventSource

```yaml
apiVersion: argoproj.io/v1alpha1
kind: EventSource
metadata: { name: s3-events }
spec:
  s3:
    example:
      region: us-east-1
      bucket: my-bucket
      filter:
        prefix: data/
        suffix: .csv
      eventBridgeRouter:
        region: us-east-1
        roleARN: arn:aws:iam::123456789:role/argo-events
```

### Kafka EventSource

```yaml
apiVersion: argoproj.io/v1alpha1
kind: EventSource
metadata: { name: kafka }
spec:
  kafka:
    example:
      url: kafka.default.svc:9092
      topic: orders
      partition: "0"
      consumerGroup: argo-events
```

## 36.5 CloudEvents 标准

**CloudEvents** = CNCF 事件标准(屏蔽底层协议差异)。

```json
{
  "specversion": "1.0",
  "type": "com.example.order.created",
  "source": "/orders",
  "id": "A234-1234-1234",
  "time": "2024-01-15T10:00:00Z",
  "datacontenttype": "application/json",
  "data": {
    "orderId": "12345",
    "amount": 100
  }
}
```

```python
# Python 发送 CloudEvent
from cloudevents.http import CloudEvent
import requests

event = CloudEvent(
    type="com.example.order.created",
    source="/orders",
    id="1234",
    data={"orderId": "12345", "amount": 100}
)

requests.post(
    "http://broker.argo-events.svc:12000/push",
    headers={"Ce-Id": event["id"], "Ce-Type": event["type"]},
    data=event.data
)
```

## 36.6 OpenFaaS(轻量函数)

```bash
helm install openfaas openfaas/openfaas --namespace openfaas --create-namespace
```

```bash
# CLI
curl -sSL https://cli.openfaas.com | sh
faas-cli login

# 部署函数
faas-cli new myfunc --lang python3
faas-cli up -f myfunc.yml
```

## 36.7 Kafka on K8s(深入)

### Strimzi Operator 完整实战

```bash
# 装 Operator
helm install strimzi strimzi/strimzi-kafka-operator \
  -n kafka --create-namespace
```

```yaml
# 1. Kafka 集群
apiVersion: kafka.strimzi.io/v1beta2
kind: Kafka
metadata: { name: prod-kafka, namespace: kafka }
spec:
  kafka:
    version: 3.6.0
    replicas: 3                            # 3 broker
    listeners:
    - name: plain
      port: 9092
      type: internal
      tls: false
    - name: tls
      port: 9093
      type: internal
      tls: true
    - name: external
      port: 9094
      type: loadbalancer
      tls: false
    config:
      offsets.topic.replication.factor: 3
      transaction.state.log.replication.factor: 3
      transaction.state.log.min.isr: 2
      default.replication.factor: 3
      min.insync.replicas: 2
      inter.broker.listener.name: plain
    storage:
      type: persistent-claim
      size: 1Ti
      class: gp3
  zookeeper:
    replicas: 3
    storage:
      type: persistent-claim
      size: 100Gi
  entityOperator:
    topicOperator: {}
    userOperator: {}
---
# 2. Topic
apiVersion: kafka.strimzi.io/v1beta2
kind: KafkaTopic
metadata: { name: orders, namespace: kafka }
spec:
  partitions: 12
  replicas: 3
  config:
    retention.ms: 604800000                 # 7 天
    cleanup.policy: delete
```

### Kafka Connect(数据集成)

```yaml
apiVersion: kafka.strimzi.io/v1beta2
kind: KafkaConnect
metadata: { name: prod-connect, namespace: kafka }
spec:
  replicas: 2
  bootstrapServers: prod-kafka-kafka-bootstrap:9092
  config:
    config.providers: file
    config.providers.file.class: org.apache.kafka.common.config.provider.FileConfigProvider
  build:
    output:
      type: docker
      image: myreg/kafka-connect-custom:1.0
    plugins:
    - name: debezium-postgres
      artifacts:
      - type: jar
        url: https://repo1.maven.org/maven2/io/debezium/debezium-connector-postgres/2.4.0.Final/debezium-connector-postgres-2.4.0.Final-plugin.jar
```

### Kafka MirrorMaker 2(跨集群)

```yaml
apiVersion: kafka.strimzi.io/v1beta2
kind: KafkaMirrorMaker2
metadata: { name: mm2, namespace: kafka }
spec:
  replicas: 1
  connectCluster: target
  clusters:
  - alias: source
    bootstrapServers: source-kafka:9092
  - alias: target
    bootstrapServers: target-kafka:9092
  mirrors:
  - sourceCluster: source
    targetCluster: target
    topicsPattern: ".*"
    replicationFactor: 3
```

### Debezium(CDC)

```yaml
apiVersion: kafka.strimzi.io/v1beta2
kind: KafkaConnector
metadata: { name: postgres-connector, namespace: kafka }
spec:
  class: io.debezium.connector.postgresql.PostgresConnector
  tasksMax: 1
  config:
    database.hostname: postgres
    database.port: 5432
    database.user: debezium
    database.password: secret
    database.dbname: orders
    plugin.name: pgoutput
    table.include.list: public.orders
    topic.prefix: cdc
```

## 36.8 实战:Serverless 数据流水线

```text
Git push → GitHub Webhook
   ↓
Argo Events
   ↓
Trigger Argo Workflow:
  1. 拉代码
  2. Build 镜像 (kaniko)
  3. Trivy 扫描
  4. 推 registry
  5. Trigger Knative Service 部署
  6. KEDA 监听 Kafka lag
  7. Worker 按需扩展
```

## 36.9 Eventing Mesh(跨服务事件)

```text
Knative Eventing + Kafka/MQTT broker
  ↓
CloudEvents 标准
  ↓
解耦服务(发布/订阅)
```

### Knative Eventing + Kafka

```bash
# 装 Kafka Broker
kubectl apply -f https://github.com/knative/eventing/releases/latest/download/eventing-crds.yaml
kubectl apply -f https://github.com/knative/eventing/releases/latest/download/eventing-core.yaml
kubectl apply -f https://github.com/knative-sandbox/eventing-kafka-broker/releases/latest/download/eventing-kafka-controller.yaml
kubectl apply -f https://github.com/knative-sandbox/eventing-kafka-broker/releases/latest/download/eventing-kafka-broker.yaml
```

```yaml
# Broker(基于 Kafka)
apiVersion: eventing.knative.dev/v1
kind: Broker
metadata: { name: default, namespace: default }
spec:
  config:
    apiVersion: v1
    kind: ConfigMap
    name: kafka-broker-config
    namespace: knative-eventing
---
# Trigger(订阅)
apiVersion: eventing.knative.dev/v1
kind: Trigger
metadata: { name: order-handler, namespace: default }
spec:
  broker: default
  filter:
    attributes:
      type: com.example.order.created
  subscriber:
    ref:
      apiVersion: serving.knative.dev/v1
      kind: Service
      name: order-processor
```

## 36.10 实战:事件驱动 AI 推理

```text
订单创建 → Kafka topic: orders.created
   ↓
Knative Broker 订阅
   ↓
KEDA 触发 InferenceService(LLM 推理)
   ↓
0 → N 副本按需
   ↓
处理完结果推回 Kafka
```

## 36.11 专家清单

### Knative
- [ ] 部署 Knative Serving
- [ ] 写 Knative Service(0 副本)
- [ ] 灰度发布(流量切分)
- [ ] 自定义域名
- [ ] 冷启动优化(min-scale=1)

### KEDA 深入
- [ ] 部署 KEDA
- [ ] 用 5+ 种 scaler
- [ ] HTTP Add-on
- [ ] External Scaler(自定义)

### Argo Events
- [ ] 部署 Argo Events
- [ ] EventSource(S3/GitHub/Kafka)
- [ ] Sensor 触发 Workflow
- [ ] CloudEvents 标准

### Kafka 深入
- [ ] 部署 Strimzi
- [ ] 多 broker + ZK 或 KRaft
- [ ] Topic 自动创建
- [ ] MirrorMaker 2 跨集群
- [ ] Kafka Connect + Debezium CDC

### Eventing
- [ ] Knative Eventing + Kafka
- [ ] CloudEvents 标准
- [ ] Pub/Sub 模式

## 36.12 本章小结

- **Knative** = 工业级 Serverless on K8s
- **KEDA** = 40+ 种事件源扩缩,事实标准
- **Argo Events** = K8s 原生事件总线
- **CloudEvents** = CNCF 事件标准
- **Strimzi Kafka** = 生产 Kafka 部署
- **Debezium CDC** = 数据库变更捕获
- 事件驱动:Webhook → EventBus → Trigger → Workflow
- 适合:流量波动大、定时任务、CI/CD、跨服务集成
