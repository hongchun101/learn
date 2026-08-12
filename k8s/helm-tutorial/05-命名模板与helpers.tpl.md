# 05. 命名模板与 helpers.tpl

## 5.1 为什么需要命名模板

随着 Chart 变复杂,你会发现 labels、annotations、selector 在 Deployment、Service、Ingress 里**重复出现**。命名模板(类似编程语言的"函数")让你抽离复用逻辑。

```yaml
# 没有命名模板:每处都写
metadata:
  labels:
    app.kubernetes.io/name: myapp
    app.kubernetes.io/instance: my-release
    app.kubernetes.io/managed-by: Helm
    helm.sh/chart: myapp-1.2.3
# 复制 5 次,改一处忘一处

# 用了命名模板
metadata:
  labels:
    {{- include "myapp.labels" . | nindent 4 }}
# DRY,改一处全局生效
```

## 5.2 三种定义与调用方式

### 方式 1:在同文件 define + template

```yaml
{{- define "mychart.labels" -}}
app.kubernetes.io/name: {{ .Chart.Name }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}
apiVersion: v1
kind: ConfigMap
metadata:
  name: {{ .Release.Name }}-cm
  labels:
    {{- template "mychart.labels" . }}
```

### 方式 2:`_helpers.tpl` 集中管理(社区惯例)

```yaml
{{/* templates/_helpers.tpl */}}
{{/*
Expand the name of the chart.
*/}}
{{- define "myapp.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some K8s name fields are limited.
If release name contains chart name it will be used as a full name.
*/}}
{{- define "myapp.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{/*
Common labels
*/}}
{{- define "myapp.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{ include "myapp.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: {{ .Chart.Name }}
{{- end -}}

{{/*
Selector labels(只用于 selector,label 必须子集)
*/}}
{{- define "myapp.selectorLabels" -}}
app.kubernetes.io/name: {{ include "myapp.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{/*
ServiceAccount name
*/}}
{{- define "myapp.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{- default (include "myapp.fullname" .) .Values.serviceAccount.name -}}
{{- else -}}
{{- default "default" .Values.serviceAccount.name -}}
{{- end -}}
{{- end -}}
```

### 方式 3:`include`(推荐)

```yaml
# templates/deployment.yaml
metadata:
  name: {{ include "myapp.fullname" . }}
  labels:
    {{- include "myapp.labels" . | nindent 4 }}
```

**`template` vs `include`**:

| 特性 | `template` | `include` |
|------|-----------|-----------|
| 输出 | 直接渲染 | 返回字符串(可管道) |
| 可被 `nindent` | ❌ | ✅ |
| 推荐 | 已不推荐 | ✅ 一律用 include |

## 5.3 命名模板的"参数"和"返回值"

Go template 的命名模板**只接受一个参数**(点 `.`),但 `.` 可以是任何对象。

```yaml
# 接受对象
{{- define "myapp.image" -}}
{{- $image := .image -}}
{{- $registry := .registry -}}
{{- printf "%s/%s:%s" $registry $image.repository ($image.tag | default $.tag) -}}
{{- end -}}

# 调用:传 dict
image: {{ include "myapp.image" (dict "image" .Values.image "registry" "docker.io" "tag" .Chart.AppVersion) }}
```

**专家模式:用 `dict` 函数模拟多参数**:

```go
// 类似函数调用:
// image(repo, tag, registry)
// 实际是:
// include "myapp.image" (dict "repo" $repo "tag" $tag ...)
```

```yaml
{{- define "myapp.combine" -}}
{{- $a := .a -}}
{{- $b := .b -}}
{{- $sep := default "-" .sep -}}
{{- printf "%s%s%s" $a $sep $b -}}
{{- end -}}

# 调用
{{- include "myapp.combine" (dict "a" "foo" "b" "bar") -}}  → "foo-bar"
{{- include "myapp.combine" (dict "a" "foo" "b" "bar" "sep" "_") -}}  → "foo_bar"
```

## 5.4 模板组织:多文件 vs _helpers.tpl

### _helpers.tpl 放什么

- `name` / `fullname`
- `labels` / `selectorLabels`
- `serviceAccountName`
- 通用 annotations
- chart-wide 的字符串处理(资源名生成、tag 拼接)

### templates/ 放什么

- 具体的 K8s 资源(Deployment/Service/...)
- 业务相关的命名模板(多个资源共享的复杂逻辑)

```text
templates/
├── _helpers.tpl          # chart-wide helpers
├── app-helpers.tpl       # application-specific
├── deployment.yaml       # 资源
├── service.yaml
├── ingress.yaml
├── configmap.yaml
├── hpa.yaml
├── NOTES.txt
└── tests/
    └── test-connection.yaml
```

## 5.5 命名规范

| 模式 | 用途 |
|------|------|
| `<chart>.name` | chart 名 |
| `<chart>.fullname` | 完整资源名 |
| `<chart>.labels` | 通用 labels |
| `<chart>.selectorLabels` | selector 用的 labels |
| `<chart>.serviceAccountName` | SA 名 |
| `<chart>.<resource>` | 某资源的 helper |

## 5.6 实战:RBAC 资源命名模板

```yaml
{{- /* templates/_role-helpers.tpl */ -}}

{{/* Role name */}}
{{- define "myapp.roleName" -}}
{{- include "myapp.fullname" . -}}
{{- end -}}

{{/* ClusterRole name (独立于 release) */}}
{{- define "myapp.clusterRoleName" -}}
{{- default (printf "%s-%s" .Release.Namespace (include "myapp.fullname" .)) .Values.rbac.clusterRole.name -}}
{{- end -}}
```

## 5.7 include 的高级用法

### 字符串拼接后输出

```yaml
# 用 indent / nindent 控制缩进
{{- include "myapp.labels" . | nindent 4 }}
```

### 列表拼接

```yaml
{{- $all := list -}}
{{- range .Values.pods }}
{{- $all = append $all (include "myapp.pod" .) -}}
{{- end }}
spec:
  items:
    {{- range $all }}
    - {{ . }}
    {{- end }}
```

### 列表包含

```yaml
{{- $allowedEnvs := list "dev" "staging" "prod" -}}
{{- if has .Values.env $allowedEnvs }}
...部署...
{{- end }}
```

## 5.8 常见模式:可空字段的合并

```yaml
{{- /* 合并所有 labels 源 */ -}}
{{- define "myapp.mergedLabels" -}}
{{- $merged := dict -}}
{{- range $source := list (include "myapp.commonLabels" . | fromYaml) .Values.extraLabels -}}
{{- $merged = merge $merged $source -}}
{{- end -}}
{{- $merged | toYaml -}}
{{- end -}}
```

## 5.9 本章小结

- `include > template`,因为可以接管道
- `_helpers.tpl` 是社区约定,集中放 chart-wide 命名模板
- 命名模板只接受一个 `.`,用 `dict` 模拟多参数
- 命名规范:`<chart>.<purpose>`
- 缩进问题:用 `include ... | nindent N` 一键解决
