# 02. Chart 目录结构与 Chart.yaml

## 2.1 标准目录结构

```bash
mychart/
├── Chart.yaml              # [必需] Chart 元数据
├── Chart.lock              # [自动生成] 依赖锁定文件
├── values.yaml             # [必需] 默认配置
├── values.schema.json      # [可选] values 强类型校验
├── charts/                 # [自动生成] 下载的依赖
│   └── postgresql-12.x.tgz
├── crds/                   # [可选] CRD 资源(v2)
├── templates/              # [必需] 模板目录
│   ├── _helpers.tpl        # [约定] 命名模板
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── ingress.yaml
│   ├── configmap.yaml
│   ├── secret.yaml
│   ├── serviceaccount.yaml
│   ├── hpa.yaml
│   ├── pdb.yaml
│   ├── NOTES.txt           # 安装后的提示
│   └── tests/              # helm test 资源
│       └── test-connection.yaml
├── .helmignore             # 类似 .gitignore
└── LICENSE                 # 可选
```

### 用 `helm create` 快速生成

```bash
helm create mychart
tree mychart
# mychart
# ├── .helmignore
# ├── Chart.yaml
# ├── charts
# ├── templates
# │   ├── _helpers.tpl
# │   ├── deployment.yaml
# │   ├── hpa.yaml
# │   ├── ingress.yaml
# │   ├── service.yaml
# │   ├── serviceaccount.yaml
# │   └── tests
# │       └── test-connection.yaml
# └── values.yaml
```

## 2.2 Chart.yaml 完整字段解析

```yaml
apiVersion: v2                    # [必需] v1 或 v2,推荐 v2
name: my-app                      # [必需] Chart 名(必须匹配目录名)
version: 1.2.3                    # [必需] Chart 版本(SemVer)
appVersion: "2.1.0"               # [可选] 应用版本(应用本身版本)
description: My awesome app       # [推荐] 一句话描述
type: application                 # [可选] application 或 library
kubeVersion: ">=1.24.0-0"         # [可选] 限制 K8s 版本
home: https://example.com         # [可选] 项目主页
icon: https://example.com/logo.png  # [可选] 图标 URL
sources:                          # [可选] 源码 URL 列表
  - https://github.com/example/myapp
maintainers:                      # [可选] 维护者
  - name: Alice
    email: alice@example.com
    url: https://alice.example.com
keywords:                         # [可选] 搜索关键词
  - web
  - api
annotations:                      # [可选] 自定义注解
  category: Database
  licenses: Apache-2.0
dependencies:                     # [可选] Chart 依赖(v2)
  - name: postgresql
    version: 12.x.x
    repository: https://charts.bitnami.com/bitnami
    condition: postgresql.enabled
    tags:
      - database
    import-values:                # 导入子 chart 的 values 到父 chart
      - child
    alias: db
```

### 关键字段详解

#### apiVersion: v1 vs v2

- **v1**:Helm 2 时代格式,只有 name/version/description 等基础字段,依赖在 `requirements.yaml`
- **v2**:Helm 3 推荐,依赖写在 Chart.yaml `dependencies`,功能更完整

**新 Chart 一律用 v2**。

#### version 与 appVersion 的区别

- `version`:Chart 自身的版本,改了模板/默认值就要升
- `appVersion`:被部署应用的版本(比如 nginx:1.25.1)

```yaml
# Chart 版本:1.0.0 → 1.0.1
#   改动:把 replicas 默认值从 2 改成 3
# App 版本:1.25.0 → 1.25.1
#   改动:nginx 镜像 tag 从 1.25.0 升到 1.25.1
```

`appVersion` 在模板中可以用 `{{ .Chart.AppVersion }}` 引用,常用于打 image tag。

#### type: library

Library Chart **没有可部署的模板**,只提供命名模板,被 application chart 复用。

```yaml
apiVersion: v2
name: common-lib
type: library
version: 0.1.0
```

在 application chart 中:

```yaml
dependencies:
  - name: common-lib
    version: 0.1.0
    repository: file://../common-lib
```

然后 `{{ include "common-lib.labels" . }}`。详见 09 高级模式。

#### kubeVersion 约束

```yaml
kubeVersion: ">=1.24.0-0 <1.29.0-0"
```

支持 SemVer 范围。Helm 安装时如果集群版本不在范围内会警告(不强制)。

## 2.3 NOTES.txt

`templates/NOTES.txt` 是 `helm install` 完成后打印给用户的信息。**用纯文本 + 模板语法**。

```
Thank you for installing {{ .Chart.Name }}.

Your release is named: {{ .Release.Name }}.

To learn more about the release, try:
  $ helm status {{ .Release.Name }}
  $ helm get all {{ .Release.Name }}

To get the application URL:
{{- if contains "NodePort" .Values.service.type }}
  export NODE_PORT=$(kubectl get -o jsonpath="{.spec.ports[0].nodePort}" services {{ include "myapp.fullname" . }})
  export NODE_IP=$(kubectl get nodes -o jsonpath="{.items[0].status.addresses[0].address}")
  echo http://$NODE_IP:$NODE_PORT
{{- else if contains "LoadBalancer" .Values.service.type }}
  NOTE: It may take a few minutes for the LoadBalancer IP to be available.
        You can watch the status of by running 'kubectl get svc -w {{ include "myapp.fullname" . }}'
  export SERVICE_IP=$(kubectl get svc {{ include "myapp.fullname" . }} -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
  echo http://$SERVICE_IP:{{ .Values.service.port }}
{{- end }}
```

## 2.4 .helmignore

类似 `.gitignore`,`helm package` 时排除文件:

```
# 默认内容
.DS_Store
.git/
.gitignore
.bzr/
.hg/
.svn
*.tmproj
*.swp
*.bak
*.tgz
.idea/
.vscode/
README.md  # 源码 README,不是 chart 文档
```

## 2.5 CRDs 目录(Helm 3 新特性)

```yaml
# Chart.yaml
apiVersion: v2
```

CRD 资源放 `crds/` 目录:

```text
crds/
└── myapp.example.com_foos.yaml
```

**特殊规则**:
- `crds/` 下的文件 `helm install/upgrade` 时**总是**会被应用,且跳过模板渲染
- 卸载时**不会**自动删除 CRD(避免误删集群级资源)
- CRD 更新由用户手动管理

## 2.6 templates/tests/

```yaml
# templates/tests/test-connection.yaml
apiVersion: v1
kind: Pod
metadata:
  name: "{{ include "myapp.fullname" . }}-test-connection"
  labels:
    {{- include "myapp.labels" . | nindent 4 }}
  annotations:
    "helm.sh/hook": test
spec:
  containers:
    - name: wget
      image: busybox
      command: ['wget']
      args: ['{{ include "myapp.fullname" . }}:{{ .Values.service.port }}']
  restartPolicy: Never
```

```bash
helm test my-release
```

## 2.7 Chart 验证

```bash
# 静态检查
helm lint ./mychart

# 元数据
helm show chart ./mychart

# 所有元数据 + values
helm show all ./mychart
```

`helm lint` 会检查:
- Chart.yaml 字段合法性
- 模板语法错误
- values 必需字段缺失
- 标签命名规范
- API 对象结构(via kubeconform 可选)

## 2.8 本章小结

| 文件 | 必需 | 说明 |
|------|------|------|
| Chart.yaml | ✅ | 元数据,推荐 v2 |
| values.yaml | ✅ | 默认配置 |
| templates/ | ✅ | 模板目录 |
| charts/ | 自动 | 依赖缓存 |
| crds/ | 可选 | CRD 资源(Helm 3+) |
| values.schema.json | 可选 | 强类型校验 |
| NOTES.txt | 推荐 | 安装后提示 |
| .helmignore | 推荐 | 打包排除 |
| templates/tests/ | 可选 | helm test 用例 |
